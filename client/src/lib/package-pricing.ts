// Helpers for rendering per-location package prices in the admin UI.
//
// A package can declare per-location price overrides via the
// `package_locations` junction. Both the list page (`/admin/packages`)
// and the detail page (`/admin/packages/:id`) need to show a price
// range when overrides differ from the base price, so the rendering
// logic is centralized here.

export interface PriceRow {
  locationId: number;
  name: string;
  cents: number;
}

export interface LocationLite {
  id: number;
  name: string;
}

export interface PackageForPricing {
  id: number;
  price: number;
  locationScopeMode?: string | null;
}

// Compute the effective price at every location relevant to `pkg`:
//   - SPECIFIC_LOCATIONS → only the package's linked locations.
//   - ALL_LOCATIONS      → every tenant location.
// `overrides` is a `{ locationId: cents }` map (string or number keys both work);
// missing entries fall back to `pkg.price`.
export function getEffectivePricesByLocation(args: {
  pkg: PackageForPricing;
  locations: LocationLite[];
  packageLocationIds: number[];
  overrides: Record<string | number, number | null | undefined>;
}): PriceRow[] {
  const { pkg, locations, packageLocationIds, overrides } = args;
  const nameById = new Map<number, string>();
  for (const loc of locations) nameById.set(loc.id, loc.name);
  const relevantIds =
    pkg.locationScopeMode === "SPECIFIC_LOCATIONS"
      ? packageLocationIds
      : locations.map((l) => l.id);
  return relevantIds
    .map((id) => {
      const raw = overrides[id] ?? overrides[String(id)];
      const cents = raw == null ? pkg.price : Number(raw);
      return {
        locationId: id,
        name: nameById.get(id) ?? `Location ${id}`,
        cents: Number.isFinite(cents) ? cents : pkg.price,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function hasMixedPrices(rows: PriceRow[]): boolean {
  if (rows.length <= 1) return false;
  const first = rows[0].cents;
  return rows.some((r) => r.cents !== first);
}

export function priceRangeCents(rows: PriceRow[]): { minCents: number; maxCents: number } | null {
  if (rows.length === 0) return null;
  let min = rows[0].cents;
  let max = rows[0].cents;
  for (const r of rows) {
    if (r.cents < min) min = r.cents;
    if (r.cents > max) max = r.cents;
  }
  return { minCents: min, maxCents: max };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
