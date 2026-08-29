# Drivorata Headless API — Package & Cart Reference

This document is for integrators building a custom (headless) storefront on
top of a Drivorata tenant. It focuses on the package-model fields that
control how a package may be sold, how the cart picks up upsells, and how
per-location pricing is applied. All endpoints below require a tenant API
key (`Authorization: Bearer <api-key>`) and are mounted under
`/api/public/...`.

---

## 0. Bootstrapping your storefront

**Never hardcode the tenant slug.** School admins can rename their slug at
any time from the Settings page. If your storefront has the slug hardcoded,
it will immediately start returning `403 "API key does not belong to this
school"` after a rename.

Instead, call `GET /api/public/me` once at startup to **resolve the current
slug dynamically** from your API key. Cache the result for the page session
and use the returned `slug` in all subsequent `/api/public/tenant/:slug/…`
calls.

### `GET /api/public/me`

Requires only a valid API key — no slug in the path. Returns the tenant's
current identity.

**Request**

```http
GET /api/public/me
Authorization: Bearer drv_live_your-api-key-here
```

**Response `200 OK`**

```jsonc
{
  "id": 7,
  "slug": "austin-driving-school",
  "name": "Austin Driving School",
  "logoUrl": "https://cdn.example.com/logo.png"   // null when not set
}
```

**Error responses**

| Status | When |
|--------|------|
| `401`  | No API key supplied (or same-origin request without a key) |
| `401`  | API key is invalid or revoked |
| `404`  | Tenant account is inactive |

**Recommended startup pattern (JavaScript)**

```ts
const API_KEY = import.meta.env.VITE_DRIVORATA_API_KEY; // store in env, never commit

async function bootstrap() {
  const meRes = await fetch("https://api.drivorata.com/api/public/me", {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!meRes.ok) throw new Error("Invalid API key or inactive school");

  const { slug } = await meRes.json();

  // Now use the live slug for all subsequent calls
  const [tenant, packages] = await Promise.all([
    fetch(`https://api.drivorata.com/api/public/tenant/${slug}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`https://api.drivorata.com/api/public/tenant/${slug}/packages`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);

  return { slug, tenant, packages };
}
```

> **Slug rename safety:** when the school admin renames their slug,
> storefronts using the `GET /api/public/me` pattern pick up the new slug
> automatically on next load — no config change needed. Storefronts with a
> hardcoded slug will break until the config is updated manually.

---

> **Versioning note**: this reference reflects the current package model
> after the introduction of `kind`, `sellableStandalone`,
> `availableAsUpsell`, `upsellParentPackageIds`, `requiresCohortSelection`
> and `locationScopeMode`. Older integrations that ignore these fields will
> keep working — the defaults are back-compatible — but you'll miss out on
> SIMPLE-package express checkout and upsell gating.

---

## 1. Package fields reference

Every package returned by the public API now carries the following fields
in addition to the legacy ones (`id`, `name`, `description`, `price`,
`classroomHoursRequired`, `driveHoursRequired`,
`features`, `active`, `isAddOn`, `sortOrder`, …):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `kind` | `"COHORT_BASED" \| "SIMPLE"` | `"COHORT_BASED"` | `COHORT_BASED` packages have a class schedule the buyer must pick before checkout (Teen Drivers Ed, Adult Drivers Ed, etc.). `SIMPLE` packages are one-off services with no schedule (Road Test, School Car, extra BTW hours, …). |
| `requiresCohortSelection` | `boolean` | derived | Convenience mirror of `kind === "COHORT_BASED"`. Use this to decide whether the buyer must pick an offering. |
| `sellableStandalone` | `boolean` | `true` | When `true` the package appears in the storefront catalog and can be checked out on its own. When `false` the package is upsell-only — hide it from the catalog and never send it through `/checkout/start`. |
| `availableAsUpsell` | `boolean` | `false` | When `true` the package is eligible to appear in the cart's upsell list (`/cart/:cartId/upsells`). A package can be both standalone and an upsell. |
| `upsellParentPackageIds` | `number[]` | `[]` | If non-empty, the upsell only shows when the cart already contains at least one of the listed parent package ids (e.g. School Car requires Road Test). With an empty array the upsell falls back to legacy generic add-on behaviour (any non-empty cart). |
| `locationScopeMode` | `"ALL_LOCATIONS" \| "SPECIFIC_LOCATIONS"` | `"ALL_LOCATIONS"` | `ALL_LOCATIONS` packages are sold at every location. `SPECIFIC_LOCATIONS` packages are restricted to an explicit allow-list and **require a `locationId` at checkout**. |
| `availableLocationIds` *(when present in your snapshot)* | `number[]` | — | Allow-list for `SPECIFIC_LOCATIONS` packages. Use it to render a location picker before showing the buy button. |
| `locationPrices` | `Array<{ locationId: number; priceCents: number }>` | `[]` | Per-location price overrides for this package. Only locations with an override row are included — locations without an explicit override fall back to the package's `price` field. Use this to render a price range (e.g. `$375.00 – $410.00`) on storefront tiles before the buyer has picked a location. Precedence: per-location override → base `price`. |
| `language` | `"ENGLISH" \| "SPANISH"` | `"ENGLISH"` | Primary language of instruction for marketing/admin display. Independent of any locale-aware UI; use to badge the package on storefront tiles or filter listings. |
| `imageUrl` | `string \| null` | `null` | Optional hero/listing image URL (object storage). Use as the package tile thumbnail when present. |
| `tier` | `"PRIMARY" \| "AUXILIARY"` | `"PRIMARY"` | Marketing classification for storefront ordering. `PRIMARY` packages are the school's main offerings (Drivers Ed, BTW, etc.) and should render at the top of the catalog. `AUXILIARY` packages are secondary services (Road Test, School Car, extra-hour add-ons) and should render in their own section at the bottom (or under a "More services" heading). Independent of `kind`/`audience`/`sellableStandalone`. **The `/packages` list response is already pre-sorted PRIMARY → AUXILIARY** (stable within each tier by `sortOrder`), so a naive `.map()` already produces the right order; the field is exposed so you can split into two visual groups if you want. |
| `audience` | `"TEENS" \| "ADULTS" \| "BOTH"` | `"BOTH"` | Marketing audience label. Independent of the hard `ageMin`/`ageMax` gating — use for tile badges and catalog filters (e.g. an "Adults" tab). |

Per-location pricing is applied automatically when the relevant call
knows the location at the moment the cart item / payment is priced:
* Express `POST /checkout/start` resolves the per-location override from
  the `locationId` in the request body before creating the payment.
* The cart flow resolves the override on `POST /cart/:id/items` using
  the `locationId` you pass on that call (or, if omitted, the location
  already pinned on the cart). Subsequent cart-level price changes are
  not retroactive to items already added — set `locationId` on the
  first add-item call (or pre-pin it via the cart) so every item is
  priced for that location.
* `POST /cart-checkout/headless` builds the cart server-side and adds
  items first, then resolves location at checkout. To get per-location
  pricing in this one-shot flow, ensure each requested package is
  priced uniformly across the cart's effective location — packages with
  per-location overrides are best added through the standard cart flow
  where you can pin `locationId` at the first add-item call.

The advertised `price` on the package is always the school-wide default;
the actual amount charged is the value the relevant checkout/cart
endpoint computes and what the payment provider session is created for.

---

## 2. Choosing the right checkout flow

Use the table below to map a package's flags to the recommended UI flow.

| Scenario | Conditions on the package | Recommended flow |
|---|---|---|
| Express single-package checkout | `kind === "SIMPLE"` **and** `sellableStandalone === true` | `POST /api/public/tenant/:slug/checkout/start` with `{ packageId, provider, student, locationId? }`. No offering pick. |
| Class enrollment with schedule pick | `kind === "COHORT_BASED"` **and** `sellableStandalone === true` | Multi-item cart flow: `POST /cart` → `GET /packages/:pkgId/offerings` → `POST /cart/:cartId/items` with `{ packageId, offeringId, locationId? }` → `POST /cart-checkout/start` (or one-shot `POST /cart-checkout/headless`). Sending a COHORT_BASED package straight to `/checkout/start` returns 400. |
| Upsell-only add-on | `sellableStandalone === false` (and usually `availableAsUpsell === true`) | Hide from the catalog. Surface only via `/cart/:cartId/upsells`. Never POST to `/checkout/start` — the server will return 400. |
| Generic catalog add-on (legacy) | `availableAsUpsell === true` and `upsellParentPackageIds === []` | Shown for any non-empty cart in `/cart/:cartId/upsells`. |
| Conditional add-on | `availableAsUpsell === true` and `upsellParentPackageIds.length > 0` | Shown only when the cart already contains at least one listed parent. The server enforces the same rule on `POST /cart/:cartId/items`. |
| Location-restricted package | `locationScopeMode === "SPECIFIC_LOCATIONS"` | Force the buyer to pick a location first. Pass that `locationId` to **every** subsequent call (`/packages?locationId=…` for filtering, `/cart/:id/items`, `/checkout/start`, `/cart-checkout/start`). The server rejects null/disallowed locations with 400. |

Headless integrators that want a one-call flow for express purchases can
use `POST /api/public/tenant/:slug/cart-checkout/headless` — it builds the
cart, adds the items and starts payment in a single round trip.

---

## 3. Endpoint reference

All examples below assume a tenant slug of `austin-driving-school`. Replace
`Authorization: Bearer pk_live_…` with your tenant API key.

### 3.1 List storefront packages

`GET /api/public/tenant/:slug/packages?locationId=<id>`

`locationId` is optional. When supplied, packages restricted to other
locations are filtered out; school-wide packages are always included.
Packages with `sellableStandalone === false` are **never** returned by this
endpoint — they are only exposed through the cart upsells endpoint.

```jsonc
[
  {
    "id": 42,
    "tenantId": 7,
    "name": "Teen Drivers Ed",
    "description": "Texas TDLR-approved 32hr classroom + 14hr BTW",
    "price": 59900,
    "classroomHoursRequired": 32,
    "driveHoursRequired": 14,
    "kind": "COHORT_BASED",
    "requiresCohortSelection": true,
    "sellableStandalone": true,
    "availableAsUpsell": false,
    "upsellParentPackageIds": [],
    "locationScopeMode": "ALL_LOCATIONS",
    "locationPrices": [
      { "locationId": 3, "priceCents": 57500 },
      { "locationId": 5, "priceCents": 62500 }
    ],
    "tier": "PRIMARY",
    "audience": "TEENS",
    "active": true,
    "isAddOn": false,
    "sortOrder": 0
  },
  {
    "id": 51,
    "name": "Road Test (Drivorata Examiner)",
    "price": 12500,
    "kind": "SIMPLE",
    "requiresCohortSelection": false,
    "sellableStandalone": true,
    "availableAsUpsell": true,
    "upsellParentPackageIds": [],
    "locationScopeMode": "SPECIFIC_LOCATIONS",
    "tier": "AUXILIARY",
    "audience": "BOTH"
  }
]
```

UI mapping:
* Show package #42 (tier=PRIMARY) at the top of the catalog with a
  **"Choose class"** CTA → cart flow.
* Show package #51 (tier=AUXILIARY) in a "More services" section below
  with a **"Buy now"** CTA → express checkout. Because it is
  `SPECIFIC_LOCATIONS`, render a location picker first.

> **Tier rendering — recommended pattern.** The response is already
> pre-sorted PRIMARY → AUXILIARY, so the simplest integration is
> `packages.map(renderTile)`. To render two distinct visual groups (the
> recommended UX), partition into two arrays and render each under its
> own heading:
>
> ```ts
> const primary   = packages.filter(p => p.tier === "PRIMARY");
> const auxiliary = packages.filter(p => p.tier === "AUXILIARY");
> // …render <Section title="Programs">{primary}</Section>
> // followed by <Section title="Add-on services">{auxiliary}</Section>
> ```
>
> Treat any unknown `tier` value as PRIMARY (defensive default) so a
> future tier introduced server-side never disappears from the catalog.

### 3.2 List offerings for a cohort-based package

`GET /api/public/tenant/:slug/packages/:pkgId/offerings`

Returned offerings are limited to those whose `status` is either
`PUBLISHED` (seats remaining) or `FULL` (seats exhausted but the buyer
can still join the waitlist). `DRAFT`, `CANCELLED` and `COMPLETED`
offerings are filtered out. Each row includes a derived `remainingSeats`
field (`max(0, capacity - enrolledCount)`). When the tenant has the
pending interest indicator enabled, each offering also carries a capped
`pendingInterestCount` (0..9). Used to populate the cohort picker for
COHORT_BASED packages — you do **not** need to call this for SIMPLE
packages.

```jsonc
[
  {
    "id": 187,
    "tenantId": 7,
    "packageId": 42,
    "name": "Spring 2026 — Evenings",
    "status": "PUBLISHED",
    "startsAt": "2026-03-01T00:00:00.000Z",
    "endsAt":   "2026-04-12T00:00:00.000Z",
    "capacity": 24,
    "enrolledCount": 11,
    "remainingSeats": 13,
    "locationId": 3,
    "instructorId": "u_8a…",
    "pendingInterestCount": 4
  }
]
```

UI hints:
* Treat `status === "FULL"` (or `remainingSeats === 0`) as a
  "Join waitlist" state instead of "Enroll".

### 3.3 List storefront add-ons

`GET /api/public/tenant/:slug/add-ons?locationId=<id>&parentPackageId=<id>`

Returns packages where `availableAsUpsell === true` (the authoritative
add-on / upsell channel flag). Legacy `isAddOn === true` rows are
migrated to `availableAsUpsell = true` by the one-time backfill, and
admin POST/PATCH keep the two flags in sync, so callers should treat
`availableAsUpsell` as the source of truth and only consult `isAddOn`
for backward-compatibility / display purposes. Both `locationId` and
`parentPackageId` are optional filters; when `parentPackageId` is
supplied, only add-ons whose `upsellParentPackageIds` is empty or
contains that parent are returned.

```jsonc
[
  {
    "id": 73,
    "name": "School Car for Road Test",
    "price": 9900,
    "kind": "SIMPLE",
    "requiresCohortSelection": false,
    "sellableStandalone": false,
    "availableAsUpsell": true,
    "upsellParentPackageIds": [51],
    "locationScopeMode": "ALL_LOCATIONS"
  }
]
```

### 3.4 Create / load a cart

```
POST /api/public/tenant/:slug/cart    →  { id, tenantId, status, ... }
GET  /api/public/cart/:cartId         →  { id, tenantId, status, locationId, items, ... }
```

The cart's `locationId` is `null` until the first `POST /cart/:id/items`
sends one — at which point it is pinned for the remainder of the cart.
Subsequent add-item and checkout calls must agree with that location.

### 3.5 Add an item to the cart

`POST /api/public/cart/:cartId/items`

Request body:

```json
{
  "packageId": 42,
  "offeringId": 187,
  "locationId": 3
}
```

Rules:
* `offeringId` is required when the package's `requiresCohortSelection` is
  true; SIMPLE packages may omit it (or send `null`).
* `locationId` is required if the package is `SPECIFIC_LOCATIONS` **and**
  the cart has no pinned location yet. Once pinned it can be omitted on
  later calls.
* If the package's `sellableStandalone === false`, the cart must already
  contain one of its `upsellParentPackageIds` (or — when that list is
  empty — at least one other item).

Response: the created cart-item row, including `priceCents` reflecting any
per-location override.

```jsonc
{
  "id": 9921,
  "cartId": "c_8f2c…",
  "tenantId": 7,
  "packageId": 42,
  "offeringId": 187,
  "priceCents": 54900,
  "createdAt": "2026-05-12T18:42:11.000Z"
}
```

### 3.6 List eligible upsells for a cart

`GET /api/public/cart/:cartId/upsells`

Returns packages with `availableAsUpsell === true` whose dependency rules
are satisfied by the cart's current items. Each entry includes the same
derived fields as `/packages` — `requiresCohortSelection`,
`upsellParentPackageIds` — so you can decide whether to ask the buyer for
a cohort before adding the upsell.

```jsonc
[
  {
    "id": 73,
    "name": "School Car for Road Test",
    "price": 9900,
    "kind": "SIMPLE",
    "requiresCohortSelection": false,
    "sellableStandalone": false,
    "availableAsUpsell": true,
    "upsellParentPackageIds": [51]
  }
]
```

### 3.6b Online courses

`GET /api/public/tenant/:slug/online-courses?locationId=<id>`

Returns the tenant's reseller catalog of third-party online courses.
`locationId` is optional and follows the same allow-list rules as
packages: `ALL_LOCATIONS` courses are always returned; `SPECIFIC_LOCATIONS`
courses are filtered to those allowed at the given location.

Each row includes (in addition to `id`, `name`, `description`, `price`,
`providerName`, `providerUrl`, `active`, `sortOrder`, `locationScopeMode`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `language` | `"ENGLISH" \| "SPANISH"` | `"ENGLISH"` | Primary language of instruction for marketing/admin display. Independent of any locale-aware UI; use to badge the course on storefront tiles or filter listings. |
| `imageUrl` | `string \| null` | `null` | Optional hero/listing image URL (object storage). Use as the course tile thumbnail when present. |

### 3.7 Express single-package checkout

`POST /api/public/tenant/:slug/checkout/start`

Use this only for packages where `requiresCohortSelection === false` **and**
`sellableStandalone === true`. The endpoint creates a pending enrollment
plus a payment session in one call.

```json
{
  "provider": "STRIPE",
  "packageId": 51,
  "locationId": 3,
  "student": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "email": "ada@example.com",
    "phone": "+15125551234",
    "dateOfBirth": "2008-12-10"
  },
  "parent": {
    "name": "Augusta Lovelace",
    "email": "augusta@example.com",
    "phone": "+15125559999"
  },
  "externalSuccessUrl": "https://your-site.example/checkout/success",
  "externalCancelUrl": "https://your-site.example/checkout/cancel"
}
```

Response (Stripe/PayPal):

```json
{
  "redirectUrl": "https://checkout.stripe.com/c/pay/...",
  "enrollmentId": 9011,
  "paymentId": 5523,
  "subtotalCents": 12500,
  "serviceFeeCents": 875,
  "serviceFeeBps": 300,
  "serviceFeeFlatCents": 500,
  "totalCents": 13375
}
```

The fee fields let you reconcile what the provider will charge before
redirecting the buyer. `subtotalCents` is the package price (after any
per-location override), `serviceFeeCents` is the combined surcharge
(percentage component + flat admin fee), and `totalCents = subtotal +
serviceFeeCents` is the gross amount sent to Stripe/PayPal. See section
3.9 for how to preview the fee before the buyer reaches the checkout
step. The `serviceFeeBps` / `serviceFeeFlatCents` fields are echoed so
you can render an itemised receipt locally without re-fetching settings.

Response (CASH provider):

```json
{ "cashPayment": true, "enrollmentId": 9011, "paymentId": 5523 }
```

> CASH and external/headless redirect flows **never** carry a service
> or admin fee — even when the tenant has configured one. Don't apply
> the fee client-side for those providers; show the buyer the
> subtotal unchanged.

### 3.8 Cart checkout

```
POST /api/public/tenant/:slug/cart-checkout/start          (uses an existing cartId)
POST /api/public/tenant/:slug/cart-checkout/headless       (one-shot: builds cart server-side)
```

Both use the same body shape (the headless variant additionally accepts an
`items: [{ packageId, offeringId? }]` array):

```json
{
  "cartId": "c_8f2c…",
  "provider": "STRIPE",
  "locationId": 3,
  "student": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "email": "ada@example.com"
  },
  "externalSuccessUrl": "https://your-site.example/checkout/success",
  "externalCancelUrl":  "https://your-site.example/checkout/cancel"
}
```

Response (Stripe / PayPal):

```json
{
  "redirectUrl": "https://checkout.stripe.com/c/pay/...",
  "cartId": "c_8f2c…",
  "paymentId": 5524,
  "subtotalCents": 72400,
  "serviceFeeCents": 2672,
  "serviceFeeBps": 300,
  "serviceFeeFlatCents": 500,
  "totalCents": 75072
}
```

Same fee semantics as section 3.7 — `subtotalCents` is the sum of all
cart line items (already priced for the effective `locationId`),
`serviceFeeCents` is the combined surcharge, and `totalCents` is what
the payment provider session is opened for.

Response (CASH provider):

```json
{ "cashPayment": true, "cartId": "c_8f2c…", "paymentId": 5524 }
```

The server re-validates every cart item against the effective `locationId`
before talking to the payment provider, so a buyer cannot bypass a
SPECIFIC_LOCATIONS restriction by swapping locations at checkout.

### 3.9 Payment methods & fee preview

`GET /api/public/tenant/:slug/payment-methods`

Returns the enabled providers plus the tenant's optional service-fee
configuration so the storefront can render the buyer-facing fee
breakdown *before* they hit the checkout button.

```jsonc
{
  "methods": ["STRIPE", "PAYPAL", "CASH"],
  "paypalClientId": "ATestId-…",          // null when PayPal is disabled
  "cashRequireSignature": false,
  "serviceFeeBps": 300,                    // percentage component (basis points; 300 = 3.00%)
  "serviceFeeFlatCents": 500               // flat admin fee component (cents; 500 = $5.00)
}
```

#### Fee model

The tenant can configure two independent, additive fee components, and
**both apply only to STRIPE and PAYPAL** (CASH and external/headless
redirect flows never carry them):

| Field | Unit | Range | Meaning |
|---|---|---|---|
| `serviceFeeBps` | Integer basis points | `0`–`1000` (0%–10%) | Percentage of the subtotal. `0` disables. |
| `serviceFeeFlatCents` | Integer cents | `0`–`10000` (`$0`–`$100`) | Flat per-transaction admin fee. `0` disables. |

Either, both, or neither may be set. The server uses the same rule for
the live charge:

```ts
function previewServiceFee(
  subtotalCents: number,
  bps: number,
  flatCents: number,
  provider: "STRIPE" | "PAYPAL" | "CASH" | "EXTERNAL",
): number {
  if (provider !== "STRIPE" && provider !== "PAYPAL") return 0;
  if (subtotalCents <= 0) return 0;
  const pct  = bps === 0 ? 0 : Math.round((subtotalCents * bps) / 10000);
  const flat = Math.max(0, Math.min(10000, flatCents | 0));
  return pct + flat;
}
```

> Rounding rule: the percentage component rounds **half-up** to the
> nearest cent (`Math.round`). The flat component is added as-is. This
> matches `computeServiceFeeCents` server-side, so your preview will
> always equal `serviceFeeCents` in the checkout response.

#### Recommended UI flow

1. On mount, call `/payment-methods` once per tenant slug and cache the
   response for the page lifetime.
2. While the buyer picks a provider, render the fee breakdown live:
   * Provider is CASH or external redirect → show subtotal only, no fee
     row.
   * Provider is STRIPE/PAYPAL and **both** components are `0` → show
     subtotal only, no fee row.
   * Provider is STRIPE/PAYPAL and at least one component is non-zero
     → show an itemised summary, for example:
     ```
     Subtotal                   $125.00
     Service fee (3%)             $3.75
     Admin fee                    $5.00
     ─────────────────────────
     Total                      $133.75
     ```
     Hide the row whose value is `0` (don't show "Service fee 0%" or
     "Admin fee $0.00"). When both are non-zero, render two separate
     rows so the buyer understands the breakdown.
3. When the buyer submits, call `/checkout/start` or `/cart-checkout/start`
   as usual. The response's `serviceFeeCents` / `totalCents` is the
   authoritative number; assert it equals your preview before the
   redirect (and surface a "Fee changed, please review" message if it
   doesn't — e.g. the tenant updated the rate mid-session).

#### Labels & terminology

The buyer-facing label is your choice, but to stay consistent with the
admin UI we recommend:
* `serviceFeeBps > 0` → **"Service fee"** (rendered as `"X%"` or
  `"X.XX%"` — derive from `serviceFeeBps / 100`).
* `serviceFeeFlatCents > 0` → **"Admin fee"** (rendered as
  `"$Y.YY"` — derive from `serviceFeeFlatCents / 100`).

Localise as needed, but keep them as two distinct line items — combining
them into a single "Processing fee" line hides the breakdown the tenant
configured and can look misleading to the buyer.

---

## 4. Error codes

All cart and checkout error responses return HTTP 400 with a stable JSON
body of the shape:

```jsonc
{
  "code": "COHORT_SELECTION_REQUIRED",   // machine-readable enum (see table below)
  "message": "This package requires picking a class schedule. …",
  "details": { /* optional, code-specific context */ }
}
```

**Always branch on `response.body.code`, never on `message`.** The
`message` field is human-readable English that the server may localize,
shorten or re-word between releases (and individual routes are allowed
to override it with package-name-aware wording). The `code` enum is
contractual — the canonical list lives in `shared/api-errors.ts` and is
mirrored in the OpenAPI `Error` schema (`server/openapi.ts`).

`details` is optional. When present its shape depends on the code — for
example `PAYMENT_PROVIDER_NOT_CONFIGURED` includes `{ "provider":
"STRIPE" | "PAYPAL" | "CASH" }` so you can tell the buyer which
provider failed; `INVALID_DATA` includes the Zod `errors` array. Treat
unknown `details` keys as forward-compatible additions and ignore them.

> **Note:** other endpoints outside the cart/checkout family (e.g.
> `GET /packages?locationId=abc` returning "Invalid locationId", a 404
> for a missing `:slug` or `:cartId`, or a 403 when an API key loads a
> cart from a different tenant) still return their own message-only
> bodies. Branch on the HTTP status for those.

### 4.1 Code reference

| Code | HTTP | When it fires | What to show the buyer | How to recover |
|---|---|---|---|---|
| `INVALID_DATA` | 400 | Request body fails Zod validation on any cart/checkout POST. `details.errors` carries the Zod issues. | "We couldn't read your request — please check the highlighted fields." | Inspect `details.errors` (path + message) and re-render field-level errors. Do not retry blindly. |
| `INVALID_PACKAGE` | 400 | `packageId` doesn't resolve to an active package on this tenant (`POST /checkout/start`, `POST /cart-checkout/headless` items). | "This package isn't available anymore." | Re-fetch `GET /packages` and remove the stale package from the UI. |
| `INVALID_LOCATION` | 400 | `locationId` is not a valid active location for this tenant (any cart/checkout endpoint). | "That location isn't available." | Re-fetch `GET /locations` and let the buyer re-pick. |
| `PACKAGE_INACTIVE` | 400 | The package exists but `active === false`. | "This package isn't on sale right now." | Hide from the catalog and re-fetch `GET /packages`. |
| `COHORT_SELECTION_REQUIRED` | 400 | A `kind === "COHORT_BASED"` package was sent to `POST /checkout/start` (express flow) without an offering pick. | "This class needs you to pick a schedule." | Switch to the cart flow: `POST /cart` → `GET /packages/:pkgId/offerings` → let the buyer pick → `POST /cart/:cartId/items` with `offeringId`. |
| `OFFERING_NOT_FOUND` | 400 | `offeringId` doesn't exist (or is not visible) for this tenant/package. | "That class schedule isn't available." | Re-fetch `GET /packages/:pkgId/offerings` and let the buyer re-pick. |
| `OFFERING_NOT_BOOKABLE` | 400 | The offering exists but is `DRAFT`, `CANCELLED`, `COMPLETED`, or otherwise not bookable. | "That class schedule isn't open for enrollment." | Re-fetch offerings and surface only `PUBLISHED`/`FULL` rows. For `FULL`, surface a waitlist CTA instead of "Enroll". |
| `OFFERING_PACKAGE_MISMATCH` | 400 | The supplied `offeringId` belongs to a different package than `packageId`. | "That class schedule doesn't match the selected package." | Reset both selections and re-render the package → offering picker. |
| `PACKAGE_NOT_STANDALONE` | 400 | A package with `sellableStandalone === false` was sent to `POST /checkout/start`. | "This add-on can only be purchased with another package." | Don't surface this package as a standalone CTA. Add the parent package to a cart first, then offer this one through `GET /cart/:cartId/upsells`. |
| `PACKAGE_NOT_AVAILABLE` | 400 | The package is not available for purchase through the requested channel (e.g. inactive, removed from catalog). | "This package isn't available." | Refresh the catalog and remove the option. |
| `UPSELL_PARENT_MISSING` | 400 | An upsell with a non-empty `upsellParentPackageIds` was added to a cart that contains none of those parents. | "Add the required parent package to your cart first." | Inspect the package's `upsellParentPackageIds` and prompt the buyer to add a qualifying parent before retrying `POST /cart/:cartId/items`. |
| `LOCATION_REQUIRED` | 400 | A `SPECIFIC_LOCATIONS` package was added/checkout'd without a `locationId` and the cart has no pinned location. | "Pick a location to continue." | Render a location picker (use the package's `availableLocationIds` allow-list) and re-submit with `locationId`. |
| `LOCATION_NOT_ALLOWED` | 400 | `locationId` is valid for the tenant but is not on the package's `availableLocationIds` allow-list. | "This package isn't sold at that location." | Show the allowed locations (`availableLocationIds`) and let the buyer re-pick. |
| `CART_LOCATION_MISMATCH` | 400 | The supplied `locationId` differs from the cart's already-pinned location. | "Your cart is set to a different location." | Either drop the `locationId` from the call (the cart's location wins), start a new cart, or empty the existing cart and re-add with the new location. |
| `CART_NOT_FOUND` | 400 | `cartId` doesn't exist on this tenant. (Note: a hard 404 is returned when loading the cart directly via `GET /cart/:cartId`.) | "We lost your cart — let's start over." | Create a new cart via `POST /cart` and re-add the items. |
| `CART_NOT_EDITABLE` | 400 | Cart status is no longer `open` (e.g. it has moved to `pending_payment` or `completed`) on `POST/DELETE /cart/:id/items`. | "This cart has already been submitted." | Start a fresh cart via `POST /cart`. |
| `CART_EMPTY` | 400 | `POST /cart-checkout/start` (or `/cart-checkout/headless`) on a cart with zero items. | "Add at least one item before checking out." | Send the buyer back to the catalog. |
| `CART_ALREADY_PROCESSED` | 400 | The cart has already gone through checkout and cannot be re-submitted. | "This cart has already been paid." | Start a fresh cart; check `GET /enrollments/:id/status` if you need the existing payment outcome. |
| `CART_ID_REQUIRED` | 400 | `POST /cart-checkout/start` was called without a `cartId` in the body. | (Developer error — should never reach the buyer.) | Pass the `cartId` returned by `POST /cart`. |
| `PAYMENT_PROVIDER_NOT_CONFIGURED` | 400 | The selected `provider` is not enabled for the tenant. `details.provider` identifies which one (`"STRIPE"`, `"PAYPAL"`, or `"CASH"`). | "<Provider> isn't accepted at this school yet." | Hide that payment option and re-render with the providers from `GET /payment-methods`. |

### 4.2 Branching on `code` (recommended pattern)

```ts
// shared/api-errors.ts is published to integrators as part of the OpenAPI
// schema — mirror the enum on your side or import it directly if you're
// on the same monorepo.
type CartCheckoutErrorCode =
  | "INVALID_DATA"
  | "INVALID_PACKAGE"
  | "INVALID_LOCATION"
  | "PACKAGE_INACTIVE"
  | "COHORT_SELECTION_REQUIRED"
  | "OFFERING_NOT_FOUND"
  | "OFFERING_NOT_BOOKABLE"
  | "OFFERING_PACKAGE_MISMATCH"
  | "PACKAGE_NOT_STANDALONE"
  | "PACKAGE_NOT_AVAILABLE"
  | "UPSELL_PARENT_MISSING"
  | "LOCATION_REQUIRED"
  | "LOCATION_NOT_ALLOWED"
  | "CART_LOCATION_MISMATCH"
  | "CART_NOT_FOUND"
  | "CART_NOT_EDITABLE"
  | "CART_EMPTY"
  | "CART_ALREADY_PROCESSED"
  | "CART_ID_REQUIRED"
  | "PAYMENT_PROVIDER_NOT_CONFIGURED";

type CartCheckoutErrorBody = {
  code: CartCheckoutErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

async function addToCart(cartId: string, packageId: number, offeringId?: number, locationId?: number) {
  const res = await fetch(`/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ packageId, offeringId, locationId }),
  });

  if (res.ok) return res.json();

  // ❌ DON'T: match on res.statusText or body.message — both can change.
  // ✅ DO:    branch on body.code.
  const err = (await res.json()) as CartCheckoutErrorBody;

  switch (err.code) {
    case "COHORT_SELECTION_REQUIRED":
      // Send the buyer to the cohort picker for this package.
      return openCohortPicker(packageId);

    case "UPSELL_PARENT_MISSING":
      // The package is an add-on; explain which parent is needed.
      return showAddParentToast(packageId);

    case "LOCATION_REQUIRED":
    case "LOCATION_NOT_ALLOWED":
    case "CART_LOCATION_MISMATCH":
      // Re-open the location picker. Use err.details if present.
      return openLocationPicker(packageId, err.details);

    case "OFFERING_NOT_FOUND":
    case "OFFERING_NOT_BOOKABLE":
    case "OFFERING_PACKAGE_MISMATCH":
      // The cohort selection is stale; refresh and re-pick.
      await refetchOfferings(packageId);
      return openCohortPicker(packageId);

    case "PACKAGE_INACTIVE":
    case "PACKAGE_NOT_AVAILABLE":
    case "PACKAGE_NOT_STANDALONE":
    case "INVALID_PACKAGE":
      // Refresh the catalog — the package is no longer purchasable.
      await refetchPackages();
      return showStaleCatalogToast();

    case "CART_NOT_FOUND":
    case "CART_NOT_EDITABLE":
    case "CART_ALREADY_PROCESSED":
      // Start a fresh cart and replay the buyer's intent.
      return startNewCartAndRetry(packageId, offeringId, locationId);

    case "CART_EMPTY":
      return navigateTo("/catalog");

    case "PAYMENT_PROVIDER_NOT_CONFIGURED":
      // err.details.provider tells you which one is disabled.
      return hidePaymentProvider(err.details?.provider as string | undefined);

    case "INVALID_DATA":
      // err.details.errors is a Zod issue list — render field-level errors.
      return renderFieldErrors(err.details);

    case "INVALID_LOCATION":
    case "CART_ID_REQUIRED":
    default:
      // Fall back to the server-supplied message for anything we don't recognize.
      return showGenericError(err.message);
  }
}
```

### 4.3 Quick recovery cheat-sheet

| If you see… | …do this |
|---|---|
| `COHORT_SELECTION_REQUIRED` | The package needs a class schedule pick — call `GET /packages/:pkgId/offerings` and let the buyer choose, then use the cart flow instead of `/checkout/start`. |
| `PACKAGE_NOT_STANDALONE` | Hide the package from the standalone catalog. Add its parent first, then offer this package through `GET /cart/:cartId/upsells`. |
| `UPSELL_PARENT_MISSING` | Read the package's `upsellParentPackageIds`; prompt the buyer to add a qualifying parent before retrying. |
| `LOCATION_REQUIRED` / `LOCATION_NOT_ALLOWED` | Render a location picker scoped to `availableLocationIds`; resubmit with `locationId`. |
| `CART_LOCATION_MISMATCH` | The cart is pinned to a different location — drop `locationId` from the call, or start a new cart. |
| `CART_NOT_EDITABLE` / `CART_ALREADY_PROCESSED` / `CART_NOT_FOUND` | Start a fresh cart via `POST /cart` and replay the items. |
| `OFFERING_NOT_FOUND` / `OFFERING_NOT_BOOKABLE` / `OFFERING_PACKAGE_MISMATCH` | Refetch offerings; the buyer's pick is stale or full. |
| `PAYMENT_PROVIDER_NOT_CONFIGURED` | Hide that provider; refresh `GET /payment-methods` to learn which are enabled (`details.provider` identifies the failing one). |
| `INVALID_DATA` | Render field-level errors from `details.errors` (Zod issues). Don't retry blindly. |
| `PACKAGE_INACTIVE` / `PACKAGE_NOT_AVAILABLE` / `INVALID_PACKAGE` | Refetch the catalog and remove the stale package from the UI. |
