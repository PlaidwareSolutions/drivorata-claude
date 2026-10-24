import type { Payment } from "@shared/schema";
import { storage } from "../storage";
import { loadEnrollmentContext } from "../enrollment-context";
import { refundStripePayment } from "./stripe-adapter";
import { getTransaction, isSettled, refundTransaction, voidTransaction } from "./authorizenet-adapter";
import { authnetCredentials } from "./card-checkout";

// Refund one enrollment: money back through the processor first, then the
// records (payment REFUNDED, enrollment refunded, class credits reversed).
// Authorize.net: void while unsettled (same day, nothing reaches the card),
// refund once settled. A cart payment that also paid for other enrollments is
// refunded only this enrollment's share — which Authorize.net can do only
// after settlement (a void is all or nothing).

export class RefundError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface RefundOutcome {
  paymentId: number;
  provider: string;
  method: "void" | "refund" | "record_only";
  amountCents: number;
  providerRefId: string | null;
}

export async function refundEnrollment(o: {
  tenantId: number;
  enrollmentId: number;
  actorUserId: string;
  /** Money already returned outside Drivorata: update the records only. */
  recordOnly?: boolean;
}): Promise<{ outcomes: RefundOutcome[] }> {
  const ctx = await loadEnrollmentContext(o.enrollmentId, o.tenantId);
  if (!ctx) throw new RefundError("Enrollment not found", 404);
  if (ctx.enrollment.status === "refunded") throw new RefundError("This enrollment is already refunded");
  const paid = ctx.payments.filter((p) => p.status === "COMPLETED");

  const outcomes: RefundOutcome[] = [];
  for (const p of paid) {
    outcomes.push(await refundPayment(p, ctx.enrollment.amountPaid ?? ctx.enrollment.priceSnapshotCents ?? null, !!o.recordOnly));
  }

  // Records, only after every processor call succeeded.
  await storage.updateEnrollment(o.enrollmentId, o.tenantId, { status: "refunded" } as any);
  for (const out of outcomes) {
    const p = paid.find((x) => x.id === out.paymentId)!;
    const full = out.amountCents >= p.amountCents;
    await storage.mergePaymentMetadata(
      p.id,
      { append: { refunds: [{ at: new Date().toISOString(), by: o.actorUserId, enrollmentId: o.enrollmentId, ...out }] } },
      full ? { status: "REFUNDED" } : {},
    );
  }

  const credits = await storage.getCreditsByEnrollment(o.enrollmentId);
  const reversals = credits
    .filter((c) => c.reason === "PACKAGE_GRANT" && c.delta > 0)
    .map((c) => ({
      tenantId: o.tenantId,
      enrollmentId: o.enrollmentId,
      type: c.type,
      delta: -c.delta,
      reason: "REFUND_REVERSAL" as const,
      refId: `refund-${o.enrollmentId}`,
    }));
  if (reversals.length) await storage.createCreditLedgerEntries(reversals);

  await storage.createAuditEvent({
    tenantId: o.tenantId,
    actorUserId: o.actorUserId,
    action: "enrollment.refund",
    targetType: "ENROLLMENT",
    targetId: o.enrollmentId,
    details: { outcomes, recordOnly: !!o.recordOnly },
  });
  return { outcomes };
}

async function refundPayment(p: Payment, enrollmentShareCents: number | null, recordOnly: boolean): Promise<RefundOutcome> {
  // A cart payment may cover other enrollments too: refund only this share.
  const othersOnPayment = p.cartId ? (await storage.getEnrollmentsByCart(p.cartId)).length > 1 : false;
  const amountCents = othersOnPayment && enrollmentShareCents ? Math.min(enrollmentShareCents, p.amountCents) : p.amountCents;
  const base = { paymentId: p.id, provider: p.provider, amountCents };

  if (recordOnly || (p.provider !== "STRIPE" && p.provider !== "AUTHORIZE_NET")) {
    return { ...base, method: "record_only", providerRefId: null };
  }
  if (!p.providerPaymentId) {
    throw new RefundError(`Payment ${p.reference ?? p.id} has no processor transaction id; refund it in the processor's dashboard and use "record only"`);
  }
  const settings = await storage.getTenantPaymentSettings(p.tenantId);

  if (p.provider === "STRIPE") {
    if (!settings?.stripeSecretKey) throw new RefundError("Stripe is not configured for this school");
    try {
      const id = await refundStripePayment(settings.stripeSecretKey, p.providerPaymentId, amountCents < p.amountCents ? amountCents : undefined);
      return { ...base, method: "refund", providerRefId: id };
    } catch (err: any) {
      throw new RefundError(`Stripe refused the refund: ${err?.message || err}`);
    }
  }

  const creds = authnetCredentials(settings);
  if (!creds) throw new RefundError("Authorize.net is not configured for this school");
  try {
    const tx = await getTransaction(creds, p.providerPaymentId);
    if (!isSettled(tx)) {
      if (amountCents < p.amountCents) {
        throw new RefundError(
          "This payment also covers other enrollments and hasn't settled yet. A partial refund is possible after tonight's settlement — try again tomorrow.",
        );
      }
      return { ...base, method: "void", providerRefId: await voidTransaction(creds, tx.transId) };
    }
    if (!tx.cardLast4) throw new RefundError("Authorize.net didn't return the card's last four digits; refund it in the Authorize.net dashboard");
    return { ...base, method: "refund", providerRefId: await refundTransaction(creds, { transId: tx.transId, amountCents, cardLast4: tx.cardLast4 }) };
  } catch (err: any) {
    if (err instanceof RefundError) throw err;
    throw new RefundError(`Authorize.net refused the refund: ${err?.message || err}`);
  }
}
