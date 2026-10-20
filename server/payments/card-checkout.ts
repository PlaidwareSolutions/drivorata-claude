import type { Payment, TenantPaymentSettings } from "@shared/schema";
import { storage } from "../storage";
import { platformBaseUrl } from "../lib/request";
import { createStripeCheckoutSession } from "./stripe-adapter";
import { authnetMode, getHostedPaymentToken, type AuthnetCredentials } from "./authorizenet-adapter";

// Card checkout start for every card processor. The routes call this instead
// of a provider directly; Stripe returns its Checkout URL, Authorize.net our
// own /pay/:reference page (its hosted page needs a form POST).

export type CardProvider = "STRIPE" | "AUTHORIZE_NET";

export function isCardProvider(p: string): p is CardProvider {
  return p === "STRIPE" || p === "AUTHORIZE_NET";
}

export function authnetCredentials(s: TenantPaymentSettings | null | undefined): AuthnetCredentials | null {
  if (!s?.authnetApiLoginId || !s.authnetTransactionKey) return null;
  return { apiLoginId: s.authnetApiLoginId, transactionKey: s.authnetTransactionKey, mode: authnetMode(s.authnetMode) };
}

export function cardProviderReady(s: TenantPaymentSettings | null | undefined, provider: CardProvider): boolean {
  if (!s) return false;
  if (provider === "STRIPE") return !!(s.stripeEnabled && s.stripeSecretKey);
  return !!(s.authnetEnabled && authnetCredentials(s) && s.authnetSignatureKey);
}

/** The processor the storefront offers for cards, falling back to whichever is ready. */
export function preferredCardProvider(s: TenantPaymentSettings | null | undefined): CardProvider | null {
  const want: CardProvider = s?.cardProvider === "AUTHORIZE_NET" ? "AUTHORIZE_NET" : "STRIPE";
  if (cardProviderReady(s, want)) return want;
  const other: CardProvider = want === "STRIPE" ? "AUTHORIZE_NET" : "STRIPE";
  return cardProviderReady(s, other) ? other : null;
}

export interface CardCheckoutInput {
  amountCents: number;
  currency: string;
  description: string;
  reference: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  customerEmail?: string | null;
}

export interface CardCheckoutResult {
  providerOrderId: string | null;
  redirectUrl: string;
}

export const AUTHNET_TOKEN_TTL_MS = 14 * 60_000; // Authorize.net: 15 minutes

export async function startCardCheckout(
  provider: CardProvider,
  settings: TenantPaymentSettings,
  payment: Payment,
  input: CardCheckoutInput,
): Promise<CardCheckoutResult> {
  if (provider === "STRIPE") {
    const r = await createStripeCheckoutSession({ secretKey: settings.stripeSecretKey!, ...input });
    return { providerOrderId: r.sessionId, redirectUrl: r.redirectUrl };
  }

  const creds = authnetCredentials(settings);
  if (!creds || !payment.reference) throw new Error("Authorize.net is not configured for this school");
  // Fetch the first token now so a bad configuration fails the checkout start
  // (the cart stays editable), not the customer's payment page.
  const authnet = {
    returnUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    description: input.description,
    customerEmail: input.customerEmail ?? null,
    token: await getHostedPaymentToken(creds, {
      amountCents: input.amountCents,
      invoiceNumber: payment.reference,
      description: input.description,
      customerEmail: input.customerEmail,
      returnUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    }),
    tokenIssuedAt: new Date().toISOString(),
  };
  await storage.updatePayment(payment.id, {
    metadataJson: { ...((payment.metadataJson as Record<string, unknown>) || {}), authnet },
  } as any);
  return { providerOrderId: null, redirectUrl: `${platformBaseUrl()}/pay/${encodeURIComponent(payment.reference)}` };
}
