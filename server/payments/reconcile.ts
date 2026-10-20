import { and, eq, gt, inArray, isNotNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import { payments, type Payment } from "@shared/schema";
import { checkProviderPayment, type ProviderCheck } from "./payment-recovery";
import { completeProviderPayment } from "./complete-payment";

// Safety net behind the Stripe webhook: ask Stripe directly about recent card
// checkouts that are still not COMPLETED, and complete the ones that were
// paid — with the usual confirmation and owner emails — exactly as the
// webhook would have. A missed or misconfigured webhook can then delay an
// enrollment by one interval instead of losing it (as happened until
// 2026-10-18, when the webhook processed nothing).

const MIN_AGE_MS = 10 * 60_000; // give the webhook first go
const MAX_AGE_MS = 48 * 3600_000; // Stripe sessions are payable for 24h
const RECHECK_AFTER_MS = 10 * 60_000;

export interface ReconcileSummary {
  checked: number;
  completed: number;
  errors: number;
}

/** Ask the provider about one payment; complete it if it was paid. */
export async function reconcilePayment(payment: Payment): Promise<{ check: ProviderCheck; completed: boolean }> {
  const check = await checkProviderPayment(payment);
  if (!check.paid) return { check, completed: false };
  const r = await completeProviderPayment(payment.id, {
    providerPaymentId: check.paymentIntentId,
    completedAt: check.paidAt ? new Date(check.paidAt) : new Date(),
  });
  return { check, completed: r.completed };
}

export async function reconcilePendingCardPayments(now = Date.now()): Promise<ReconcileSummary> {
  const candidates = await db.select().from(payments).where(and(
    or(
      and(eq(payments.provider, "STRIPE"), isNotNull(payments.providerOrderId)),
      and(eq(payments.provider, "AUTHORIZE_NET"), isNotNull(payments.reference)),
    ),
    inArray(payments.status, ["PENDING", "EXPIRED"]),
    lt(payments.createdAt, new Date(now - MIN_AGE_MS)),
    gt(payments.createdAt, new Date(now - MAX_AGE_MS)),
  ));

  const summary: ReconcileSummary = { checked: 0, completed: 0, errors: 0 };
  for (const p of candidates) {
    const last = (p.metadataJson as any)?.providerCheck?.checkedAt;
    if (last && now - new Date(last).getTime() < RECHECK_AFTER_MS) continue;
    // A recovered payment is handled by an admin; leave it alone.
    if ((p.metadataJson as any)?.recovery) continue;
    try {
      const r = await reconcilePayment(p);
      summary.checked++;
      if (r.completed) {
        summary.completed++;
        console.log(`[Reconcile] payment ${p.id} (${p.reference ?? "no ref"}) was paid at Stripe but not confirmed — completed`);
      }
    } catch (err) {
      summary.errors++;
      console.error(`[Reconcile] payment ${p.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return summary;
}
