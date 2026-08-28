import { pool } from "../db";
import { storage } from "../storage";
import { runStaleCreditRemindersAllTenants } from "../stale-credit-reminders";
import { runCartRemindersAllTenants } from "../cart-reminders";

/**
 * In-process background jobs.
 *
 * Each tick takes a Postgres advisory lock named after the job, so when more
 * than one replica runs, only one of them performs the work (the others log
 * a skip). The lock, the work and the unlock all run on the same pooled
 * connection — advisory locks are session-scoped.
 *
 * Disabled entirely with BACKGROUND_JOBS_ENABLED=0 (tests, CI, one-off
 * containers such as the pre-deploy migration).
 */

const timers: NodeJS.Timeout[] = [];

export function backgroundJobsEnabled(): boolean {
  const raw = process.env.BACKGROUND_JOBS_ENABLED?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

async function withJobLock(name: string, fn: () => Promise<void>): Promise<boolean> {
  const lockKey = `job:${name}`;
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockKey],
    );
    if (!rows[0]?.locked) return false;
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    }
    return true;
  } finally {
    client.release();
  }
}

function schedule(name: string, intervalMs: number, fn: () => Promise<void>): void {
  const timer = setInterval(async () => {
    try {
      const ran = await withJobLock(name, fn);
      if (!ran) console.log(`[Jobs] ${name}: skipped, another instance holds the lock`);
    } catch (error) {
      console.error(`[Jobs] ${name}: failed:`, error);
    }
  }, intervalMs);
  timer.unref();
  timers.push(timer);
}

function cadenceMinutes(envVar: string, fallback: number): number {
  const n = Number.parseInt(process.env[envVar] ?? String(fallback), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Expire stale pending enrollments and abandoned carts for every tenant. */
export async function runExpiryCleanupAllTenants(): Promise<void> {
  const allTenants = await storage.getAllTenants();
  for (const tenant of allTenants) {
    const settings = await storage.getTenantPaymentSettings(tenant.id);
    const autoExpireEnabled = settings?.autoExpireEnabled ?? true;
    if (!autoExpireEnabled) continue;
    const hours = settings?.expireAfterHours ?? 2;
    const stale = await storage.getExpiredPendingEnrollmentsByTenant(tenant.id, hours);
    for (const enrollment of stale) {
      await storage.expireEnrollment(enrollment.id, tenant.id);
    }
    const abandonedCarts = await storage.expireAbandonedCarts(tenant.id, hours);
    // Auto-cleanup runs without an actor; the audit table requires actorUserId,
    // so this path logs to stdout. Manual cleanup (admin route) emits audit events.
    if (abandonedCarts.length > 0) {
      console.log(`[Cleanup] Auto: cart.abandoned events:`, abandonedCarts.map((a) => a.cartId));
    }
    if (stale.length > 0 || abandonedCarts.length > 0) {
      console.log(`[Cleanup] Auto: Expired ${stale.length} pending enrollments, ${abandonedCarts.length} carts for tenant ${tenant.id}`);
    }
  }
}

export function startBackgroundJobs(): void {
  if (!backgroundJobsEnabled()) {
    console.log("[Jobs] Background jobs disabled (BACKGROUND_JOBS_ENABLED=0)");
    return;
  }

  // Hourly enrollment/cart expiry sweep.
  schedule("expiry-cleanup", 60 * 60 * 1000, runExpiryCleanupAllTenants);

  // Stale-credit reminders. STALE_CREDIT_REMINDER_INTERVAL_MINUTES (default 60; <=0 disables).
  const staleCreditMinutes = cadenceMinutes("STALE_CREDIT_REMINDER_INTERVAL_MINUTES", 60);
  if (staleCreditMinutes > 0) {
    console.log(`[StaleCreditReminders] Scheduler enabled, interval=${staleCreditMinutes} minute(s)`);
    schedule("stale-credit-reminders", staleCreditMinutes * 60 * 1000, async () => {
      const result = await runStaleCreditRemindersAllTenants();
      if (result.totalEmailSent > 0 || result.totalInAppSent > 0 || result.totalFailed > 0) {
        console.log(`[StaleCreditReminders] Background: tenants=${result.tenantsProcessed} email_sent=${result.totalEmailSent} in_app=${result.totalInAppSent} failed=${result.totalFailed}`);
      }
    });
  } else {
    console.log("[StaleCreditReminders] Scheduler disabled (STALE_CREDIT_REMINDER_INTERVAL_MINUTES <= 0)");
  }

  // Cart reminders. CART_REMINDER_INTERVAL_MINUTES (default 60; <=0 disables).
  const cartReminderMinutes = cadenceMinutes("CART_REMINDER_INTERVAL_MINUTES", 60);
  if (cartReminderMinutes > 0) {
    console.log(`[CartReminders] Scheduler enabled, interval=${cartReminderMinutes} minute(s)`);
    schedule("cart-reminders", cartReminderMinutes * 60 * 1000, async () => {
      const r = await runCartRemindersAllTenants();
      if (r.totalAbandoned > 0 || r.totalPendingCash > 0 || r.totalFailed > 0) {
        console.log(`[CartReminders] Background: tenants=${r.tenantsProcessed} abandoned=${r.totalAbandoned} pending_cash=${r.totalPendingCash} failed=${r.totalFailed}`);
      }
    });
  } else {
    console.log("[CartReminders] Scheduler disabled (CART_REMINDER_INTERVAL_MINUTES <= 0)");
  }
}

export function stopBackgroundJobs(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
