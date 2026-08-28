import { storage } from "./storage";
import { sendEmail } from "./email-service";
import type { Tenant } from "@shared/schema";

export const DEFAULT_INTERVAL_DAYS = 30;

export interface SendReminderResult {
  enrollmentId: number;
  email: string;
  emailStatus: "sent" | "skipped_no_provider" | "failed";
  inAppCreated: boolean;
  errorMsg?: string;
}

function buildSubject(tenantName: string) {
  return `${tenantName}: You still have unused driving credits`;
}

function buildBody(opts: { firstName: string; tenantName: string; classroom: number; drive: number }) {
  const { firstName, tenantName, classroom, drive } = opts;
  const lines: string[] = [];
  lines.push(`Hi ${firstName || "there"},`);
  lines.push("");
  const parts: string[] = [];
  if (classroom > 0) parts.push(`${classroom} classroom hour${classroom === 1 ? "" : "s"}`);
  if (drive > 0) parts.push(`${drive} drive hour${drive === 1 ? "" : "s"}`);
  lines.push(
    `Our records show you still have ${parts.join(" and ")} remaining with ${tenantName}, and you don't have any upcoming sessions scheduled.`
  );
  lines.push("");
  lines.push("Log in to your student portal to book your next session and finish your course.");
  lines.push("");
  lines.push(`— The team at ${tenantName}`);
  return lines.join("\n");
}

async function sendOne(opts: {
  tenant: Tenant;
  enrollmentId: number;
  userId: string | null;
  firstName: string;
  email: string;
  classroom: number;
  drive: number;
  triggeredBy: "cron" | "manual";
  actorUserId: string | null;
}): Promise<SendReminderResult> {
  const subject = buildSubject(opts.tenant.name);
  const body = buildBody({
    firstName: opts.firstName,
    tenantName: opts.tenant.name,
    classroom: opts.classroom,
    drive: opts.drive,
  });

  const emailRes = await sendEmail({
    tenantId: opts.tenant.id,
    to: opts.email,
    recipientUserId: opts.userId,
    subject,
    body,
  });

  let inAppCreated = false;
  if (opts.userId) {
    try {
      await storage.createNotification({
        userId: opts.userId,
        type: "stale_credit_reminder",
        title: "Don't forget to book your next session",
        message: body,
        link: "/student/dashboard",
      });
      inAppCreated = true;
    } catch (err) {
      console.error("[StaleCreditReminders] Failed to create in-app notification:", err);
    }
  }

  await storage.recordStaleCreditReminder({
    tenantId: opts.tenant.id,
    enrollmentId: opts.enrollmentId,
    recipientUserId: opts.userId,
    recipientEmail: opts.email,
    classroomCredits: opts.classroom,
    driveCredits: opts.drive,
    channel: opts.userId ? "email+in_app" : "email",
    emailStatus: emailRes.status,
    inAppStatus: opts.userId ? (inAppCreated ? "created" : "failed") : "skipped_no_user",
    errorMsg: emailRes.errorMsg ?? null,
    triggeredBy: opts.triggeredBy,
    actorUserId: opts.actorUserId,
  });

  return {
    enrollmentId: opts.enrollmentId,
    email: opts.email,
    emailStatus: emailRes.status,
    inAppCreated,
    errorMsg: emailRes.errorMsg,
  };
}

export async function runStaleCreditRemindersForTenant(
  tenant: Tenant,
  opts?: { force?: boolean; triggeredBy?: "cron" | "manual"; actorUserId?: string | null }
): Promise<{ tenantId: number; processed: number; emailSent: number; inAppSent: number; failed: number; results: SendReminderResult[] }> {
  const enabled = opts?.force ? true : !!tenant.staleCreditReminderEnabled;
  if (!enabled) return { tenantId: tenant.id, processed: 0, emailSent: 0, inAppSent: 0, failed: 0, results: [] };
  const intervalDays = tenant.staleCreditReminderDays ?? DEFAULT_INTERVAL_DAYS;
  const candidates = await storage.getStaleCreditReminderCandidates(tenant.id, intervalDays);
  const triggeredBy = opts?.triggeredBy ?? "cron";
  const results: SendReminderResult[] = [];
  let exceptionFailures = 0;
  for (const c of candidates) {
    try {
      const res = await sendOne({
        tenant,
        enrollmentId: c.enrollmentId,
        userId: c.userId,
        firstName: c.firstName,
        email: c.email,
        classroom: c.classroom,
        drive: c.drive,
        triggeredBy,
        actorUserId: opts?.actorUserId ?? null,
      });
      results.push(res);
    } catch (err) {
      exceptionFailures++;
      console.error(`[StaleCreditReminders] enrollment ${c.enrollmentId} failed:`, err);
    }
  }
  const emailSent = results.filter(r => r.emailStatus === "sent").length;
  const inAppSent = results.filter(r => r.inAppCreated).length;
  const failed = results.filter(r => r.emailStatus === "failed").length + exceptionFailures;
  return { tenantId: tenant.id, processed: candidates.length, emailSent, inAppSent, failed, results };
}

export async function runStaleCreditRemindersAllTenants(): Promise<{ tenantsProcessed: number; totalEmailSent: number; totalInAppSent: number; totalFailed: number }> {
  const tenants = await storage.getAllTenants();
  let totalEmailSent = 0;
  let totalInAppSent = 0;
  let totalFailed = 0;
  let processed = 0;
  for (const t of tenants) {
    if (!t.staleCreditReminderEnabled) continue;
    processed++;
    const res = await runStaleCreditRemindersForTenant(t);
    totalEmailSent += res.emailSent;
    totalInAppSent += res.inAppSent;
    totalFailed += res.failed;
    if (res.processed > 0) {
      console.log(`[StaleCreditReminders] Tenant ${t.id} (${t.name}): processed=${res.processed} email_sent=${res.emailSent} in_app=${res.inAppSent} failed=${res.failed}`);
    }
  }
  return { tenantsProcessed: processed, totalEmailSent, totalInAppSent, totalFailed };
}

export async function sendStaleCreditReminderForEnrollment(params: {
  tenantId: number;
  enrollmentId: number;
  actorUserId: string;
  force?: boolean;
}): Promise<{ ok: true; result: SendReminderResult } | { ok: false; reason: string; lastReminderAt?: Date }> {
  const tenant = await storage.getTenant(params.tenantId);
  if (!tenant) return { ok: false, reason: "tenant_not_found" };
  const enrollment = await storage.getEnrollmentById(params.enrollmentId, params.tenantId);
  if (!enrollment) return { ok: false, reason: "enrollment_not_found" };
  if (!enrollment.email) return { ok: false, reason: "no_email" };
  const classroom = await storage.getCreditBalance(enrollment.id, "CLASSROOM");
  const drive = await storage.getCreditBalance(enrollment.id, "DRIVE");
  if (classroom <= 0 && drive <= 0) return { ok: false, reason: "no_unused_credits" };
  if (!params.force) {
    const STALE_AGE_DAYS = 30;
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000);
    if (!enrollment.createdAt || enrollment.createdAt > staleCutoff) {
      return { ok: false, reason: "not_stale_enough" };
    }
    const upcoming = await storage.getBookings(params.tenantId, { enrollmentId: enrollment.id, status: "BOOKED" });
    if (upcoming.length > 0) {
      const sessions = await Promise.all(
        upcoming.map(b => storage.getScheduleSession(b.sessionId, params.tenantId)),
      );
      const hasUpcoming = sessions.some(s => !!s && !!s.startAt && new Date(s.startAt) >= now);
      if (hasUpcoming) return { ok: false, reason: "has_upcoming_session" };
    }
    const intervalDays = tenant.staleCreditReminderDays ?? DEFAULT_INTERVAL_DAYS;
    const cadenceCutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000);
    const lastReminderAt = await storage.getLastStaleCreditReminderAtForStudent(
      params.tenantId,
      enrollment.userId,
      enrollment.email,
    );
    if (lastReminderAt && lastReminderAt.getTime() > cadenceCutoff.getTime()) {
      return { ok: false, reason: "cooldown_active", lastReminderAt };
    }
  }
  const result = await sendOne({
    tenant,
    enrollmentId: enrollment.id,
    userId: enrollment.userId,
    firstName: enrollment.firstName,
    email: enrollment.email,
    classroom,
    drive,
    triggeredBy: "manual",
    actorUserId: params.actorUserId,
  });
  return { ok: true, result };
}
