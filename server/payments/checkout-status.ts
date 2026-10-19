import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { payments, type Payment } from "@shared/schema";
import { storage } from "../storage";
import { reconcilePayment } from "./reconcile";
import type { PurchaseItem } from "./checkout-reference";

// What the storefront's thank-you page shows (contract C2):
// GET /api/public/checkout/:reference/status. While a card payment is still
// pending it asks Stripe itself (at most every 15 s per payment), so the page
// can say "confirmed" as soon as the money lands even if the webhook is slow.

export type CheckoutState = "paid" | "pending" | "cash_due" | "not_completed" | "refunded";

export interface CheckoutStatus {
  reference: string;
  state: CheckoutState;
  provider: string;
  amountCents: number;
  currency: string;
  paidAt: string | null;
  items: Array<{
    name: string;
    className: string | null;
    startsAt: string | null;
    locationName: string | null;
    locationPhone: string | null;
  }>;
  enrollments: Array<{ id: number; status: string }>;
}

const LIVE_CHECK_EVERY_MS = 15_000;

function stateOf(p: Payment): CheckoutState {
  switch (p.status) {
    case "COMPLETED":
      return "paid";
    case "REFUNDED":
      return "refunded";
    case "CREATED":
    case "PENDING":
      return p.provider === "CASH" ? "cash_due" : "pending";
    default:
      return "not_completed";
  }
}

async function findByReference(tenantId: number, reference: string): Promise<Payment | undefined> {
  const [p] = await db.select().from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.reference, reference)));
  return p;
}

export async function getCheckoutStatus(tenantId: number, reference: string): Promise<CheckoutStatus | null> {
  let payment = await findByReference(tenantId, reference.trim().toUpperCase());
  if (!payment) return null;

  if (payment.provider === "STRIPE" && payment.status === "PENDING" && payment.providerOrderId) {
    const last = (payment.metadataJson as any)?.providerCheck?.checkedAt;
    if (!last || Date.now() - new Date(last).getTime() > LIVE_CHECK_EVERY_MS) {
      try {
        await reconcilePayment(payment);
        payment = (await storage.getPayment(payment.id)) ?? payment;
      } catch (err) {
        console.error(`[CheckoutStatus] live check failed for ${reference}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const purchase = (((payment.metadataJson as any)?.purchase) || []) as PurchaseItem[];
  const phoneByLocation = new Map<number, string | null>();
  for (const id of new Set(purchase.map((i) => i.locationId).filter((x): x is number => x != null))) {
    phoneByLocation.set(id, (await storage.getLocation(id))?.phone ?? null);
  }

  const enrollmentRows = payment.cartId
    ? await storage.getEnrollmentsByCart(payment.cartId)
    : payment.enrollmentId
      ? [await storage.getEnrollmentById(payment.enrollmentId, tenantId)].filter((e): e is NonNullable<typeof e> => !!e)
      : [];

  return {
    reference: payment.reference!,
    state: stateOf(payment),
    provider: payment.provider,
    amountCents: payment.amountCents,
    currency: payment.currency || "USD",
    paidAt: payment.status === "COMPLETED" && payment.completedAt ? new Date(payment.completedAt).toISOString() : null,
    items: purchase.map((i) => ({
      name: i.name,
      className: i.className ?? null,
      startsAt: i.startsAt ?? null,
      locationName: i.locationName ?? null,
      locationPhone: i.locationId != null ? phoneByLocation.get(i.locationId) ?? null : null,
    })),
    enrollments: enrollmentRows.map((e) => ({ id: e.id, status: e.status })),
  };
}
