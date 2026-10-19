import type { Request, Response } from "express";
import type Stripe from "stripe";
import { storage } from "../storage";
import { verifyStripeWebhook } from "./stripe-adapter";
import { completeProviderPayment } from "./complete-payment";

// Stripe webhook secrets are per tenant, so the payment row named in the
// (still unverified) metadata is the only way to find which secret to verify
// with. Nothing from the payload is trusted or acted on until the signature
// over the exact raw bytes checks out; a forged paymentId pointing at another
// tenant fails verification because it selects that tenant's secret.

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

export async function handleStripeWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ message: "Missing Stripe signature" });
  }

  // express.json's verify hook (server/index.ts) keeps the original bytes;
  // re-serialising req.body would never match Stripe's signature.
  const rawBody = (req as any).rawBody;
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") {
    return res.status(400).json({ message: "Missing raw body" });
  }

  let unverified: any;
  try {
    unverified = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody);
  } catch {
    return res.status(400).json({ message: "Invalid JSON" });
  }

  if (!HANDLED_EVENTS.has(unverified?.type)) {
    return res.json({ received: true });
  }

  const paymentId = parseInt(unverified?.data?.object?.metadata?.paymentId);
  if (!paymentId) {
    console.error("[StripeWebhook] event has no paymentId metadata:", unverified?.id);
    return res.status(400).json({ message: "Missing metadata" });
  }

  const payment = await storage.getPayment(paymentId);
  if (!payment || payment.provider !== "STRIPE") {
    return res.status(404).json({ message: "Payment not found" });
  }

  const settings = await storage.getTenantPaymentSettings(payment.tenantId);
  if (!settings?.stripeWebhookSecret) {
    console.error(
      `[StripeWebhook] tenant ${payment.tenantId} has no Stripe webhook secret — ` +
        `event ${unverified?.id} for payment ${paymentId} was NOT processed. ` +
        `Set it in Admin → Payment Settings.`,
    );
    return res.status(400).json({ message: "Webhook secret not configured" });
  }

  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhook(rawBody, signature, settings.stripeWebhookSecret);
  } catch (err) {
    console.error("[StripeWebhook] signature verification failed:", err);
    return res.status(400).json({ message: "Invalid signature" });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (payment.providerOrderId && payment.providerOrderId !== session.id) {
    console.error(
      `[StripeWebhook] session ${session.id} does not match payment ${paymentId} (${payment.providerOrderId})`,
    );
    return res.status(400).json({ message: "Session does not match payment" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        // A completed session can still be unpaid for delayed payment
        // methods; async_payment_succeeded follows when the money arrives.
        if (session.payment_status === "unpaid") {
          return res.json({ received: true, awaitingPayment: true });
        }
        return res.json(await completePayment(payment, session));

      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        if (payment.status === "CREATED" || payment.status === "PENDING") {
          await storage.updatePayment(payment.id, {
            status: event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED",
            rawProviderJson: session,
          } as any);
        }
        return res.json({ received: true });
    }
    return res.json({ received: true });
  } catch (error) {
    console.error("[StripeWebhook] processing failed:", error);
    // A 5xx makes Stripe retry, which is what we want for transient failures.
    return res.status(500).json({ message: "Webhook processing failed" });
  }
}

async function completePayment(
  payment: NonNullable<Awaited<ReturnType<typeof storage.getPayment>>>,
  session: Stripe.Checkout.Session,
) {
  const r = await completeProviderPayment(payment.id, {
    providerPaymentId:
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    raw: session,
  });
  return r.alreadyCompleted ? { received: true, alreadyProcessed: true } : { received: true };
}
