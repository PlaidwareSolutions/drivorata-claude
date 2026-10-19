import { storage } from "../storage";
import type { Payment } from "@shared/schema";
import { retrieveStripeCheckoutSession } from "./stripe-adapter";
import { activateCart, activateEnrollment } from "./activation-service";

// Recovery for card payments the provider took but Drivorata never confirmed
// (before 2026-10-18 the Stripe webhook processed nothing). The provider is
// always asked first — nothing is marked paid on the admin's word alone — and
// the side effects a live checkout would have had (emails, seat booking) are
// opt-in, because by now the class may have run and the customer may already
// have been looked after by phone.

export interface ProviderCheck {
  checkedAt: string;
  paid: boolean;
  sessionStatus: string | null;
  paymentStatus: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  amountCents: number | null;
  customerEmail: string | null;
  paidAt: string | null;
}

export class RecoveryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const RECOVERABLE = new Set(["PENDING", "EXPIRED", "FAILED"]);

export async function checkProviderPayment(payment: Payment): Promise<ProviderCheck> {
  if (payment.provider !== "STRIPE") throw new RecoveryError(`Cannot check ${payment.provider} payments`);
  if (!payment.providerOrderId) throw new RecoveryError("Payment never reached Stripe (no checkout session)");
  const settings = await storage.getTenantPaymentSettings(payment.tenantId);
  if (!settings?.stripeSecretKey) throw new RecoveryError("Stripe is not configured for this school");

  const s = await retrieveStripeCheckoutSession(settings.stripeSecretKey, payment.providerOrderId);
  const check: ProviderCheck = {
    checkedAt: new Date().toISOString(),
    paid: s.paymentStatus === "paid",
    sessionStatus: s.status,
    paymentStatus: s.paymentStatus,
    paymentIntentId: s.paymentIntentId,
    chargeId: s.chargeId,
    amountCents: s.amountTotalCents,
    customerEmail: s.customerEmail,
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
  };

  const patch: Partial<Payment> = {
    metadataJson: { ...((payment.metadataJson as Record<string, unknown>) || {}), providerCheck: check },
  } as Partial<Payment>;
  // An unpaid session Stripe has expired can never be paid; record that.
  if (!check.paid && s.status === "expired" && payment.status === "PENDING") {
    (patch as any).status = "EXPIRED";
  }
  await storage.updatePayment(payment.id, patch as any);
  return check;
}

export async function checkUnconfirmedPayments(
  tenantId: number,
  opts: { onlyUnchecked?: boolean } = {},
): Promise<{ checked: number; paid: number; unpaid: number; errors: Array<{ paymentId: number; error: string }> }> {
  const list = await storage.listUnconfirmedCardPayments(tenantId);
  const todo = opts.onlyUnchecked
    ? list.filter((p) => !(p.metadataJson as any)?.providerCheck)
    : list;
  const summary = { checked: 0, paid: 0, unpaid: 0, errors: [] as Array<{ paymentId: number; error: string }> };

  // Small fixed concurrency keeps a few hundred lookups well inside Stripe's
  // rate limit while finishing in seconds.
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const p = todo[next++];
      try {
        const c = await checkProviderPayment(p);
        summary.checked++;
        if (c.paid) summary.paid++;
        else summary.unpaid++;
      } catch (err: any) {
        summary.errors.push({ paymentId: p.id, error: err?.message || String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  return summary;
}

export interface RecoverOptions {
  tenantId: number;
  paymentId: number;
  actorUserId: string;
  notifyCustomer?: boolean;
  notifyAdmin?: boolean;
  /** Book seats on the selected class. Defaults to true only if it hasn't started. */
  bookSeat?: boolean;
  note?: string;
}

export interface RecoverResult {
  ok: boolean;
  alreadyCompleted?: boolean;
  enrollmentIds: number[];
  bookedSeat: boolean;
  errors?: string[];
}

export async function recoverPayment(o: RecoverOptions): Promise<RecoverResult> {
  const payment = await storage.getPayment(o.paymentId);
  if (!payment || payment.tenantId !== o.tenantId) throw new RecoveryError("Payment not found", 404);
  if (payment.status === "COMPLETED") {
    return { ok: true, alreadyCompleted: true, enrollmentIds: [], bookedSeat: false };
  }
  if (!RECOVERABLE.has(payment.status)) {
    throw new RecoveryError(`Cannot recover a ${payment.status} payment`);
  }

  const check = await checkProviderPayment(payment);
  if (!check.paid) {
    throw new RecoveryError(
      `Stripe reports this checkout was not paid (session ${check.sessionStatus ?? "unknown"}, payment ${check.paymentStatus})`,
    );
  }
  if (check.amountCents != null && check.amountCents !== payment.amountCents) {
    throw new RecoveryError(
      `Stripe charged ${check.amountCents} cents but the checkout was for ${payment.amountCents}; resolve by hand`,
    );
  }

  const bookSeat = payment.cartId ? (o.bookSeat ?? (await cartClassesAllUpcoming(payment.cartId))) : false;

  // The expiry job may have expired an express enrollment while it waited.
  if (payment.enrollmentId) {
    const enr = await storage.getEnrollmentById(payment.enrollmentId, payment.tenantId);
    if (!enr) throw new RecoveryError("Enrollment for this payment no longer exists");
    if (enr.status === "expired") {
      await storage.updateEnrollment(enr.id, enr.tenantId, { status: "pending_payment" } as any);
    }
  }

  await storage.updatePayment(payment.id, {
    status: "COMPLETED",
    completedAt: check.paidAt ? new Date(check.paidAt) : new Date(),
    providerPaymentId: check.paymentIntentId,
    metadataJson: {
      ...((payment.metadataJson as Record<string, unknown>) || {}),
      providerCheck: check,
      recovery: {
        by: o.actorUserId,
        at: new Date().toISOString(),
        note: o.note || null,
        notifyCustomer: !!o.notifyCustomer,
        notifyAdmin: !!o.notifyAdmin,
        bookSeat,
      },
    },
  } as any);

  const activationOpts = {
    notifyCustomer: !!o.notifyCustomer,
    notifyAdmin: !!o.notifyAdmin,
    bookOfferings: bookSeat,
  };
  let enrollmentIds: number[] = [];
  let errors: string[] | undefined;
  if (payment.cartId) {
    const r = await activateCart(payment.id, activationOpts);
    enrollmentIds = r.enrollmentIds;
    errors = r.errors;
  } else if (payment.enrollmentId) {
    const r = await activateEnrollment(payment.enrollmentId, payment.id, activationOpts);
    enrollmentIds = r.ok ? [r.enrollmentId] : [];
    if (!r.ok) errors = [r.error || "Activation failed"];
  }

  try {
    await storage.createAuditEvent({
      tenantId: o.tenantId,
      actorUserId: o.actorUserId,
      action: "payment.recover",
      targetType: "PAYMENT",
      targetId: payment.id,
      details: {
        stripePaymentIntent: check.paymentIntentId,
        stripeCharge: check.chargeId,
        enrollmentIds,
        bookSeat,
        notifyCustomer: !!o.notifyCustomer,
        notifyAdmin: !!o.notifyAdmin,
        errors: errors || null,
      },
    });
  } catch {}

  return { ok: !errors?.length, enrollmentIds, bookedSeat: bookSeat, errors };
}

async function cartClassesAllUpcoming(cartId: string): Promise<boolean> {
  const items = (await storage.listCartItems(cartId)).filter((i) => i.offeringId);
  if (items.length === 0) return false;
  const now = Date.now();
  return items.every((i) => i.offering && new Date(i.offering.startsAt).getTime() > now);
}
