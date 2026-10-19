# All Ages Driving School — joint work plan & status

Shared between the **backend** (`drivorata-claude`, "B") and **storefront**
(`drivorata-tenant-claude`, "T") agents. B maintains this file; T reads it.
Status as of **2026-10-19**. Supersedes the per-repo plans where they differ.

## Where things stand

| Owner issue | Status |
|---|---|
| #3 owner misses enrollment emails | **Fixed (B, live).** Root cause: the Stripe webhook never processed an event (Buffer bug) *and* no Stripe webhook destination existed. 0 card payments were ever confirmed. Fixed, plus a 15-min reconcile job asks Stripe directly. |
| #4 payment ↔ class/date not connected | **Fixed (B, live).** Every checkout has a reference (`AA-7K3F9Q`) and a frozen class snapshot; Stripe description shows class/location/date/ref; admin **Payments** page with search + CSV. |
| #5 confusing payment-status emails | **Fixed (B, live).** No email at card-checkout start; owner subjects `PAID —` / `CASH DUE —` / `NOT PAID —`; one customer confirmation after payment. |
| #6 email troubleshooting | **Done (B, live).** Email history with delivery badges + resend in the admin; Resend delivery events confirmed arriving. `docs/ENROLLMENT-TROUBLESHOOTING.md`. |
| #1 phones by location | **Data done** (verified live: Cypress 281-859-3100, Pasadena 713-947-7322, Sugar Land 281-948-3800). Emails use the location's phone. **Storefront display to do (T).** |
| #2 simple schedule → enroll → pay | **Not started.** B endpoints first, then T page. |
| #7/#8 Chase via Authorize.net | **Blocked** on the owner's sandbox account. |
| #9 traffic | **Not started (T + owner).** `www.allagesdrivingschool.com` is broken (still CNAME to Replit, TLS fails). |
| Recovery of past paid payments | **Tool live; owner working through it** (Enrollments → Unconfirmed card payments). 96 charges / $20,573.50 since May. |

Hosting: `drivorata.com` (backend) is on Railway since 2026-10-18, Cloudflare-proxied.
The storefront `allagesdrivingschool.com` is still on Replit; its move is T's (NS flip pending).

## What T's plan assumed that is already built (don't rebuild)

T plan Phase 0 and Phase 1 (1a–1d) are done in B, with these differences — T should code against these:

- Owner subjects use `PAID — …`, `CASH DUE — …`, `NOT PAID — …` (not `[PAID]`).
- One **reference** per checkout, returned by every checkout start response as `reference`, appended to the success URL as `&ref=…`, and on `GET /api/public/enrollments/:id/status`. Use the reference (works for cart and single-package) instead of a cart-status endpoint — see C2.
- Card customers get **no email until payment completes**. Thank-you copy: "Your confirmation email will arrive once your payment is complete."
- Not built from T's list: "alert when a PAID email isn't sent within 15 min" (covered instead by release-on-failure + resend button + reconcile job). Can add if wanted.

## Contract (B delivers → T consumes). All additive; nothing removed or renamed.

| # | Backend | Status | Storefront use |
|---|---|---|---|
| C1 | `GET /api/public/tenant/:slug/class-schedule?locationId&packageId&audience&from&to` — rows below; `headless-api.md` §3.10 | **built, PR open** | schedule page, home "next classes" |
| C2 | `GET /api/public/tenant/:slug/checkout/:reference/status` → `{ reference, state: paid \| pending \| cash_due \| not_completed \| refunded, provider, amountCents, currency, paidAt, items:[{name, className, startsAt, locationName, locationPhone}], enrollments:[{id,status}] }`; asks Stripe itself while pending; §3.11 | **built, PR open** | thank-you page polling (`ref` from success URL) |
| C3 | `locations[].phone` populated | **done** | header/footer/contact/schedule |
| C4 | `AUTHORIZE_NET` in `/payment-methods`; same `redirectUrl` contract (B-hosted auto-submit page) | after sandbox | card option label only |
| C5 | No pre-payment card emails; status-prefixed owner subjects | **done** | thank-you copy |
| C6 | Checkout bodies accept `utm_source`, `utm_medium`, `utm_campaign`, `gclid` (stored, shown in Payments/CSV); §3.12 | **built, PR open** | capture from landing URL, send at checkout |

**C1 row shape** (one row per published, upcoming class; sorted by start):

```jsonc
{
  "offeringId": 812, "packageId": 41,
  "packageName": "Teen Driver Ed", "audience": "TEENS",        // TEENS | ADULTS | BOTH
  "className": "Cypress Evening Class",                         // de-emphasize in UI
  "details": "Bring your learner permit…",                     // offering.description (admin-editable); internal notes never exposed
  "location": { "id": 26, "name": "Cypress,TX", "city": "Cypress", "phone": "281-859-3100" },
  "startsAt": "2026-11-03T23:00:00.000Z", "endsAt": "2026-11-21T02:00:00.000Z",
  "timezone": "America/Chicago",
  "scheduleSummary": "Mon–Thu, 6:00–9:00 PM",                 // derived from sessions
  "sessions": [{ "startAt": "…", "endAt": "…" }],
  "priceCents": 42500,                                          // location override applied, before card fee
  "dateRange": "Nov 3 – Nov 20, 2026",
  "remainingSeats": 7, "availability": "OPEN",                  // OPEN | FEW_LEFT (≤3) | FULL
  "enroll": { "packageId": 41, "offeringId": 812, "locationId": 26 }
}
```

`enroll` is exactly what T's existing wizard deep link / cart flow needs
(`/{teen|adult}/enroll?packageId&locationId&offeringId&step=4`, then cart → `cart-checkout/start`).

## Execution sequence (B directs; each wave starts only when its gate is met)

Key constraint: the live storefront is still the **old Replit app**. Nothing T builds in
`drivorata-tenant-claude` reaches customers until the storefront cutover (Wave 2). So the cutover
comes before the schedule work, and it also fixes `www`.

| Wave | Gate to start | Backend (B) | Storefront (T) | You / owner |
|---|---|---|---|---|
| **1 — now** | — | Build **C1, C2, C6** + `headless-api.md`; deploy to `drivorata.com` | See "T — Wave 1 instructions" below | Approve a storefront cutover window (GoDaddy NS → Cloudflare); owner: start Authorize.net sandbox; owner: keep recovering payments |
| **2 — storefront cutover** | T Wave 1 merged + verified on the Railway host; your approval | Watch backend logs/API errors from the new storefront | Run its runbook: NS flip, apex + `www` CNAMEs, content-type checks, mail test; keep Replit stopped-not-deleted | Do the GoDaddy NS change (needs your login) |
| **3 — schedule & thank-you** | C1 + C2 live (B reports) **and** Wave 2 done | Support; adjust C1 fields on request | `/schedule` table + filters, Enroll Now deep link, "You're enrolling in" card, thank-you polls C2, home "next classes", nav CTA | Owner: fill in each class's description ("details") in admin |
| **4 — Authorize.net** | Sandbox credentials exist | Provider interface; `AUTHORIZE_NET` adapter (Accept Hosted, `invoiceNumber = reference`), webhook + reconcile, encrypted keys, void/refund | Card label/icon for `AUTHORIZE_NET`; no flow change | Owner: production API Login ID / Transaction Key / Signature Key (no owner login); confirm with Chase nothing else uses the current key |
| **5 — Stripe off** | 3–5 clean days on Authorize.net | Disable Stripe for the tenant (instant rollback) | Remove Stripe-only bits | Owner OK |
| **6 — traffic** | Wave 3 live | — (C6 already records campaigns) | GA4 + Google Ads conversion (`purchase` only when C2 says `paid`), titles/meta, JSON-LD per location, sitemap/robots | Owner: 3 Google Business Profiles with the right phones; Search Console; ads |

### T — Wave 1 instructions (start now)

1. **Phones (your Phase 2):** header, footer, contact page and empty/error states list **all three** locations with labeled `tel:` links (Cypress 281-859-3100 · Pasadena 713-947-7322 · Sugar Land 281-948-3800), sourced from the locations API — never the single school phone (it is Sugar Land's). Mobile: one "Call" button opening the three. Remove `FALLBACK_PHONE` except as a last resort when locations fail to load; stop the announcement bar swapping in one number.
2. **Price double-divide** in the three places you found — one helper that takes cents.
3. **Thank-you copy** for card payments: "Payment received? Your confirmation email arrives once the payment completes." Don't claim "confirmed" from sessionStorage. (Real status comes with C2 in Wave 3.)
4. **Campaign capture (for C6):** on first landing, keep `utm_source`, `utm_medium`, `utm_campaign`, `gclid` from the URL (sessionStorage) and send them in the enroll/checkout request body as those exact keys. Safe now: the backend ignores unknown fields until C6 is live.
5. **Cutover readiness (no DNS changes):** point the Railway storefront at `https://drivorata.com` (now on Railway), finish the pre-cutover checklist in your runbook on `storefront-production-956c.up.railway.app`, including one checkout walked through to the Stripe payment page **without paying** (keys are live; use student name "TEST — do not contact", and expect one NOT PAID owner email about an hour later), and write the exact GoDaddy/Cloudflare steps for Wave 2.
6. One PR, CI green. Report back: PR link, what you verified on the Railway host, and anything you need from B.

Decisions already made: Accept Hosted; Stripe and Authorize.net run side by side, then Stripe off; header/footer list all three phones.

## Open items for you

1. **Tell the owner about Oct 18's $90 customer**: three checkouts (payments 322–324) produced 3 NOT PAID emails ×5 admins; the third had in fact been paid at Stripe (pre-fix). The reconcile job confirmed it on 2026-10-19 13:41 UTC, so a PAID email and the customer's confirmation followed. The first two attempts really were unpaid. New checkouts are checked by the reconcile job long before the 1-hour NOT PAID threshold, so this can't recur.
2. **Admins of the school** who receive every enrollment email (customer PII): `ajh0786@yahoo.com`, `kfnawaz@gmail.com`, `solutions@plaidware.com`, `contact@teslamodcenter.com`, `owner@tesladrivingcenter.com`. Confirm the last two belong here.
3. **Rotate** the Railway Postgres and Neon passwords that appeared in a session transcript, and the provisioning credentials per the runbook.
4. **First new card checkout** since the fix hasn't happened yet (none since cutover); the reconcile job has proven the completion path on a real payment, the next live checkout proves the webhook end to end.
