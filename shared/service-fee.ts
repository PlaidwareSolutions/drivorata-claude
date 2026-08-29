// Per-tenant processing surcharge (labelled "service fee" to the buyer).
// Stored as basis points so all math stays in integers — 300 = 3.00%.
//
// Apply ONLY to STRIPE / PAYPAL provider charges. CASH and EXTERNAL payment
// flows never carry the fee — the tenant collects those off-platform.

export const SERVICE_FEE_PROVIDERS = ["STRIPE", "PAYPAL"] as const;
export type ServiceFeeProvider = (typeof SERVICE_FEE_PROVIDERS)[number];

export const MAX_SERVICE_FEE_BPS = 1000; // 10.00% hard cap
export const MAX_SERVICE_FEE_FLAT_CENTS = 10000; // $100.00 hard cap on the flat admin fee

export function isServiceFeeProvider(provider: string | null | undefined): provider is ServiceFeeProvider {
  return provider === "STRIPE" || provider === "PAYPAL";
}

/**
 * Compute the total surcharge in cents for a subtotal. Combines a percentage
 * component (basis points) with a flat per-transaction admin fee — either or
 * both may be configured per-tenant. Returns 0 when the provider is not a card
 * processor or when the subtotal is non-positive. Rounding is half-up to the
 * nearest cent on the percentage component; the flat component is added as-is.
 */
export function computeServiceFeeCents(
  subtotalCents: number,
  bps: number | null | undefined,
  provider: string | null | undefined,
  flatCents: number | null | undefined = 0,
): number {
  if (!isServiceFeeProvider(provider)) return 0;
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  const rate = Math.max(0, Math.min(MAX_SERVICE_FEE_BPS, Math.trunc(bps ?? 0)));
  const flat = Math.max(
    0,
    Math.min(MAX_SERVICE_FEE_FLAT_CENTS, Math.trunc(flatCents ?? 0)),
  );
  const pctComponent = rate === 0 ? 0 : Math.round((subtotalCents * rate) / 10000);
  return pctComponent + flat;
}

export function formatServiceFeePct(bps: number | null | undefined): string {
  const rate = Math.max(0, Math.min(MAX_SERVICE_FEE_BPS, Math.trunc(bps ?? 0)));
  return (rate / 100).toFixed(rate % 100 === 0 ? 0 : 2);
}
