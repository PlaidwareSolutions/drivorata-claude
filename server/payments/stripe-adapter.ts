import Stripe from "stripe";

export interface StripeStartInput {
  secretKey: string;
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export interface StripeStartOutput {
  sessionId: string;
  redirectUrl: string;
}

async function realCreateStripeCheckoutSession(input: StripeStartInput): Promise<StripeStartOutput> {
  const stripe = new Stripe(input.secretKey, { apiVersion: "2025-01-27.acacia" as any });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: input.currency.toLowerCase(),
          product_data: {
            name: input.description,
          },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: input.metadata,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return {
    sessionId: session.id,
    redirectUrl: session.url!,
  };
}

// Indirection seam so tests can stub the network call without monkey-patching
// the export. Runtime callers go through `createStripeCheckoutSession`, which
// always delegates to whatever impl is currently installed (real by default).
let stripeCheckoutSessionImpl: (input: StripeStartInput) => Promise<StripeStartOutput> =
  realCreateStripeCheckoutSession;

export async function createStripeCheckoutSession(input: StripeStartInput): Promise<StripeStartOutput> {
  return stripeCheckoutSessionImpl(input);
}

export function __setStripeCheckoutSessionForTests(
  fn: (input: StripeStartInput) => Promise<StripeStartOutput>,
): void {
  stripeCheckoutSessionImpl = fn;
}

export function __resetStripeCheckoutSessionForTests(): void {
  stripeCheckoutSessionImpl = realCreateStripeCheckoutSession;
}

export interface StripeSessionStatus {
  sessionId: string;
  /** Checkout Session status: open | complete | expired. */
  status: string | null;
  /** paid | unpaid | no_payment_required */
  paymentStatus: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  amountTotalCents: number | null;
  customerEmail: string | null;
  /** When the charge was made (falls back to session creation time). */
  paidAt: Date | null;
}

async function realRetrieveStripeCheckoutSession(secretKey: string, sessionId: string): Promise<StripeSessionStatus> {
  const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.latest_charge"],
  });
  const pi = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return {
    sessionId: session.id,
    status: session.status ?? null,
    paymentStatus: session.payment_status,
    paymentIntentId: pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null),
    chargeId: charge?.id ?? (typeof pi?.latest_charge === "string" ? pi.latest_charge : null),
    amountTotalCents: session.amount_total ?? null,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    paidAt: charge?.created ? new Date(charge.created * 1000) : session.payment_status === "paid" ? new Date(session.created * 1000) : null,
  };
}

let retrieveStripeCheckoutSessionImpl: (secretKey: string, sessionId: string) => Promise<StripeSessionStatus> =
  realRetrieveStripeCheckoutSession;

/** Ask Stripe what actually happened to a Checkout Session (paid or not). */
export async function retrieveStripeCheckoutSession(secretKey: string, sessionId: string): Promise<StripeSessionStatus> {
  return retrieveStripeCheckoutSessionImpl(secretKey, sessionId);
}

export function __setRetrieveStripeCheckoutSessionForTests(
  fn: (secretKey: string, sessionId: string) => Promise<StripeSessionStatus>,
): void {
  retrieveStripeCheckoutSessionImpl = fn;
}

export function __resetRetrieveStripeCheckoutSessionForTests(): void {
  retrieveStripeCheckoutSessionImpl = realRetrieveStripeCheckoutSession;
}

export async function verifyStripeWebhook(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Promise<Stripe.Event> {
  const stripe = new Stripe("unused", { apiVersion: "2025-01-27.acacia" as any });
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export async function testStripeConnection(secretKey: string): Promise<{ ok: boolean; accountName?: string; error?: string }> {
  try {
    const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
    const account = await stripe.accounts.retrieve();
    return {
      ok: true,
      accountName: account.business_profile?.name || account.settings?.dashboard?.display_name || "Connected",
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Invalid Stripe secret key" };
  }
}
