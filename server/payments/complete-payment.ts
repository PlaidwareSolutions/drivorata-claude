import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { payments } from "@shared/schema";
import { storage } from "../storage";
import { activateCart, activateEnrollment, type ActivationOptions } from "./activation-service";

// The one way a provider payment becomes COMPLETED: the Stripe webhook, the
// reconciliation job and admin recovery all come through here. The status
// change is a single conditional UPDATE, so when the webhook and the job see
// the same payment at once only one of them activates it.

export interface CompletionDetails {
  providerPaymentId: string | null;
  completedAt?: Date | null;
  raw?: unknown;
}

export interface CompletionResult {
  completed: boolean;
  alreadyCompleted?: boolean;
  enrollmentIds: number[];
  errors?: string[];
}

export async function completeProviderPayment(
  paymentId: number,
  details: CompletionDetails,
  opts: ActivationOptions = {},
): Promise<CompletionResult> {
  const [won] = await db
    .update(payments)
    .set({
      status: "COMPLETED",
      providerPaymentId: details.providerPaymentId,
      completedAt: details.completedAt ?? new Date(),
      updatedAt: new Date(),
      ...(details.raw !== undefined ? { rawProviderJson: details.raw } : {}),
    } as any)
    .where(and(eq(payments.id, paymentId), ne(payments.status, "COMPLETED")))
    .returning();
  if (!won) return { completed: false, alreadyCompleted: true, enrollmentIds: [] };

  // A Stripe Checkout page stays payable for 24h, but the expiry job gives up
  // on a single-package enrollment after expireAfterHours. Paying late must
  // still enrol the customer, so bring the enrollment back first.
  if (won.enrollmentId) {
    const enrollment = await storage.getEnrollmentById(won.enrollmentId, won.tenantId);
    if (enrollment?.status === "expired") {
      await storage.updateEnrollment(enrollment.id, enrollment.tenantId, { status: "pending_payment" } as any);
    }
  }

  if (won.cartId) {
    const r = await activateCart(won.id, opts);
    if (!r.ok) console.error(`[Payments] cart activation errors for payment ${won.id}:`, r.errors);
    return { completed: true, enrollmentIds: r.enrollmentIds, errors: r.errors };
  }
  if (won.enrollmentId) {
    const r = await activateEnrollment(won.enrollmentId, won.id, opts);
    if (!r.ok) console.error(`[Payments] enrollment activation failed for payment ${won.id}:`, r.error);
    return { completed: true, enrollmentIds: r.ok ? [r.enrollmentId] : [], errors: r.ok ? undefined : [r.error || "Activation failed"] };
  }
  console.error(`[Payments] payment ${won.id} has neither cartId nor enrollmentId`);
  return { completed: true, enrollmentIds: [], errors: ["Payment has no cart or enrollment"] };
}
