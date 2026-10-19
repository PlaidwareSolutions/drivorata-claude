# All Ages Driving School — joint work plan & status

Shared between the **backend** (`drivorata-claude`, "B") and **storefront**
(`drivorata-tenant-claude`, "T") agents. B maintains this file; T reads it.
Status as of **2026-10-20 00:15 UTC**. Supersedes the per-repo plans where they differ.

## Where things stand

| Owner issue | Status |
|---|---|
| #3 owner misses enrollment emails | **Fixed (B, live).** Root cause: the Stripe webhook never processed an event (Buffer bug) *and* no Stripe webhook destination existed. 0 card payments were ever confirmed. Fixed, plus a 15-min reconcile job asks Stripe directly. |
| #4 payment ↔ class/date not connected | **Fixed (B, live).** Every checkout has a reference (`AA-7K3F9Q`) and a frozen class snapshot; Stripe description shows class/location/date/ref; admin **Payments** page with search + CSV. |
| #5 confusing payment-status emails | **Fixed (B, live).** No email at card-checkout start; owner subjects `PAID —` / `CASH DUE —` / `NOT PAID —`; one customer confirmation after payment. |
| #6 email troubleshooting | **Done (B, live).** Email history with delivery badges + resend in the admin; Resend delivery events confirmed arriving. `docs/ENROLLMENT-TROUBLESHOOTING.md`. |
| #1 phones by location | **Done, live.** All three labeled numbers on the site; emails use the location's phone. |
| #2 simple schedule → enroll → pay | **Done, live** (`/schedule`, Enroll Now → pay step, honest thank-you page). Only Pasadena has published classes (ask the owner). |
| #7/#8 Chase via Authorize.net | **Blocked** on the owner's sandbox account. |
| #9 traffic | **Campaign capture live; `www` fixed.** Analytics/SEO is Wave 6 (now). |
| Recovery of past paid payments | **Tool live; owner working through it** (Enrollments → Unconfirmed card payments). 96 charges / $20,573.50 since May. |

Hosting: `drivorata.com` (backend) is on Railway since 2026-10-18, Cloudflare-proxied.
The storefront `allagesdrivingschool.com` and `www` are on Railway since **2026-10-19 22:13–22:29 UTC** (Wave 2). Both Replit deployments are kept intact (backend stopped, storefront still running) as the rollback until the watch window ends.

## What T's plan assumed that is already built (don't rebuild)

T plan Phase 0 and Phase 1 (1a–1d) are done in B, with these differences — T should code against these:

- Owner subjects use `PAID — …`, `CASH DUE — …`, `NOT PAID — …` (not `[PAID]`).
- One **reference** per checkout, returned by every checkout start response as `reference`, appended to the success URL as `&ref=…`, and on `GET /api/public/enrollments/:id/status`. Use the reference (works for cart and single-package) instead of a cart-status endpoint — see C2.
- Card customers get **no email until payment completes**. Thank-you copy: "Your confirmation email will arrive once your payment is complete."
- Not built from T's list: "alert when a PAID email isn't sent within 15 min" (covered instead by release-on-failure + resend button + reconcile job). Can add if wanted.

## Contract (B delivers → T consumes). All additive; nothing removed or renamed.

| # | Backend | Status | Storefront use |
|---|---|---|---|
| C1 | `GET /api/public/tenant/:slug/class-schedule?locationId&packageId&audience&from&to` — rows below; `headless-api.md` §3.10 | **live** | schedule page, home "next classes" |
| C2 | `GET /api/public/tenant/:slug/checkout/:reference/status` → `{ reference, state: paid \| pending \| cash_due \| not_completed \| refunded, provider, amountCents, currency, paidAt, items:[{name, className, startsAt, locationName, locationPhone}], enrollments:[{id,status}] }`; asks Stripe itself while pending; §3.11 | **live** | thank-you page polling (`ref` from success URL) |
| C3 | `locations[].phone` populated | **done** | header/footer/contact/schedule |
| C4 | `AUTHORIZE_NET` in `/payment-methods`; same `redirectUrl` contract (B-hosted auto-submit page) | after sandbox | card option label only |
| C5 | No pre-payment card emails; status-prefixed owner subjects | **done** | thank-you copy |
| C6 | Checkout bodies accept `utm_source`, `utm_medium`, `utm_campaign`, `gclid` (stored, shown in Payments/CSV); §3.12 | **live** | capture from landing URL, send at checkout |

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
  "scheduleSummary": "Mon–Thu, 6:00–9:00 PM",                 // derived from sessions; "Daily, …" for every-day classes; "" if no sessions
  "sessions": [{ "startAt": "…", "endAt": "…" }],
  "priceCents": 42500,                                          // location override applied, before card fee
  "dateRange": "Nov 3 – Nov 20, 2026",
  "remainingSeats": 7, "availability": "OPEN",                  // OPEN | FEW_LEFT (≤3) | FULL
  "enroll": { "packageId": 41, "offeringId": 812, "locationId": 26 }
}
```

`enroll` is exactly what T's existing wizard deep link / cart flow needs
(`/{teen|adult}/enroll?packageId&locationId&offeringId&step=4`, then cart → `cart-checkout/start`).

**Success URL and `ref` (answer to T):** the backend always appends the reference, and starts the
query string itself when your URL has none:
- single-package / online course: `<externalSuccessUrl>?enrollment=<id>&ref=<REF>`
- cart (classes): `<externalSuccessUrl>?cart=<cartId>&ref=<REF>`
- if your URL already has a `?`, both are appended with `&`.
So `/thank-you` becomes `/thank-you?cart=…&ref=AA-XXXXXX`. Read `ref`; C2 lookups are case-insensitive.

## Execution sequence (B directs; each wave starts only when its gate is met)

Key constraint: the live storefront is still the **old Replit app**. Nothing T builds in
`drivorata-tenant-claude` reaches customers until the storefront cutover (Wave 2). So the cutover
comes before the schedule work, and it also fixes `www`.

| Wave | Gate to start | Backend (B) | Storefront (T) | You / owner |
|---|---|---|---|---|
| **1 — done** | — | Build **C1, C2, C6** + `headless-api.md`; deploy to `drivorata.com` | See "T — Wave 1 instructions" below | Approve a storefront cutover window (GoDaddy NS → Cloudflare); owner: start Authorize.net sandbox; owner: keep recovering payments |
| **2 — storefront cutover: done** | ✔ | Watch backend logs/API errors from the new storefront | Run its runbook: NS flip, apex + `www` CNAMEs, content-type checks, mail test; keep Replit stopped-not-deleted | Do the GoDaddy NS change (needs your login) |
| **3 — schedule & thank-you: done** | ✔ | Support; adjust C1 fields on request | `/schedule` table + filters, Enroll Now deep link, "You're enrolling in" card, thank-you polls C2, home "next classes", nav CTA | Owner: fill in each class's description ("details") in admin |
| **4 — Authorize.net** | Sandbox credentials exist | Provider interface; `AUTHORIZE_NET` adapter (Accept Hosted, `invoiceNumber = reference`), webhook + reconcile, encrypted keys, void/refund | Card label/icon for `AUTHORIZE_NET`; no flow change | Owner: production API Login ID / Transaction Key / Signature Key (no owner login); confirm with Chase nothing else uses the current key |
| **5 — Stripe off** | 3–5 clean days on Authorize.net | Disable Stripe for the tenant (instant rollback) | Remove Stripe-only bits | Owner OK |
| **6 — traffic (now)** | Wave 3 live ✔ | — (C6 already records campaigns) | GA4 + Google Ads conversion (`purchase` only when C2 says `paid`), titles/meta, JSON-LD per location, sitemap/robots | Owner: 3 Google Business Profiles with the right phones; Search Console; ads |

### Wave 1 result

- T PR #2 merged 2026-10-19 18:07 UTC: three labeled phones, cents price helper, honest thank-you copy, UTM/gclid capture forwarded by the proxy.
- B verified T's test checkout: payment 325 `AA-MJK22L`, $364 incl. $15 fee, shows as *Checkout started* on the Payments page; the NOT PAID email went at 17:12 UTC to the three current admins and Resend reports all three **delivered**. (`kfnawaz+aads-wave1-test@gmail.com` got nothing — it isn't configured as an extra inbox; that's fine.)
- Admins changed on request: `contact@teslamodcenter.com` disabled, `owner@tesladrivingcenter.com` admin role removed (instructor role kept, pending a decision).

### Wave 2 result (2026-10-19)

- The Sept-2 Cloudflare zone had been **purged while pending** (Cloudflare NS answered REFUSED) — caught before the switch. Re-created in the Solutions@plaidware account (zone `397eb1b7…`), diffed against GoDaddy: 0 differences across 30 names × A/AAAA/CNAME/MX/TXT/SRV, all DNS-only, no DNSSEC.
- Nameservers moved to `hassan`/`sureena.ns.cloudflare.com` at 21:45 UTC; registry and 1.1.1.1/8.8.8.8/9.9.9.9 confirmed; MX/autodiscover/SPF unchanged.
- Railway domains re-added (new targets apex `7tz7dhxg`, www `u1tot9xa`); ownership verified 22:06 UTC.
- `www` on Railway 22:09, certificate valid 22:11. Apex CNAME (flattened) 22:13, certificate valid by 22:29 — **plan B not needed**. B verified independently: both hosts serve `railway-hikari` with their own Let's Encrypt certificates, `/api/nope` is a JSON 404 (new app), and the backend's public API calls now come from the Railway storefront (none from Replit).
- **Open:** the user's mail round-trip test.

### Wave 3 result (2026-10-19)

- T PR #3 (schedule, enrolling-in card, C2 polling, home "Upcoming Classes", nav) and PR #4 (phone wrap) merged and live.
- B verified test checkout `AA-A2JBR3`: pending, $425 incl. $15 fee, Nov 2 Pasadena class + phone, attribution `wave3test / test / live-verification`; live logs show class-schedule, checkout-status and cart-checkout calls.

### School email (2026-10-20)

The owner doesn't use `info@allagesdrivingschool.com`; his school email is `ajh0786@yahoo.com` (the tenant email). B cleared `info@` from all three locations (audited, reversible in Admin → Locations), so the site and customer emails fall back to the school email. Customer emails now **reply to the school email**; owner notifications reply to the student. Setting up a real school mailbox is a later item. The DNS mail test is therefore moot.

### T — current instructions (Wave 6)

1. Remove the hardcoded `FALLBACK_EMAIL` (`info@…`); show only the school email from the API; on load failure show the three phones and no email.
2. One PR:
   - GA4 + Google Ads conversion, IDs from env vars, inert when unset. Events `view_schedule`, `select_class`, `begin_checkout`, and `purchase` once per reference, only when C2 returns `paid`, with value.
   - Per-route titles + meta descriptions, rendered server-side for key routes.
   - `DrivingSchool` JSON-LD per location (address, the right phone).
   - `sitemap.xml` + `robots.txt`.
3. Report the PR; don't merge until the user has seen it. Leave Replit running.

Decisions already made: Accept Hosted; Stripe and Authorize.net run side by side, then Stripe off; header/footer list all three phones.

## Open items for you

1. **Watch window** — after 24–48 h of normal traffic, decide on stopping/decommissioning Replit (backend deployment is already stopped; the storefront deployment still runs).
2. **Ask the owner** why only Pasadena has published classes, and to fill in each class's description (the schedule's "Details" column).
3. **Tell the owner** about Oct 18's $90 customer (three tries; the third was paid and is now confirmed).
4. **Rotate** the Railway Postgres and Neon passwords that appeared in a session transcript; delete the Cloudflare tokens after the cutover (the new zone token expires on its own in about a week).
5. **GA4 / Google Ads IDs** for Wave 6 (owner's accounts, or create them).
6. Owner: start the Authorize.net sandbox (Wave 4); keep working through Unconfirmed card payments.
