# All Ages Driving School — joint work plan & status

Shared between the **backend** (`drivorata-claude`, "B") and **storefront**
(`drivorata-tenant-claude`, "T") agents. B maintains this file; T reads it.
Status as of **2026-10-19 18:30 UTC**. Supersedes the per-repo plans where they differ.

## Where things stand

| Owner issue | Status |
|---|---|
| #3 owner misses enrollment emails | **Fixed (B, live).** Root cause: the Stripe webhook never processed an event (Buffer bug) *and* no Stripe webhook destination existed. 0 card payments were ever confirmed. Fixed, plus a 15-min reconcile job asks Stripe directly. |
| #4 payment ↔ class/date not connected | **Fixed (B, live).** Every checkout has a reference (`AA-7K3F9Q`) and a frozen class snapshot; Stripe description shows class/location/date/ref; admin **Payments** page with search + CSV. |
| #5 confusing payment-status emails | **Fixed (B, live).** No email at card-checkout start; owner subjects `PAID —` / `CASH DUE —` / `NOT PAID —`; one customer confirmation after payment. |
| #6 email troubleshooting | **Done (B, live).** Email history with delivery badges + resend in the admin; Resend delivery events confirmed arriving. `docs/ENROLLMENT-TROUBLESHOOTING.md`. |
| #1 phones by location | **Done, awaiting storefront cutover.** Data verified live; emails use the location's phone; storefront shows all three labeled numbers (T PR #2, merged) — customers see it after Wave 2. |
| #2 simple schedule → enroll → pay | **B endpoints live** (C1, C2, C6). T page is Wave 3. Live schedule today: 4 classes, all Pasadena — none published for Cypress or Sugar Land (ask the owner). |
| #7/#8 Chase via Authorize.net | **Blocked** on the owner's sandbox account. |
| #9 traffic | **Campaign capture done** (T sends UTM/gclid, B stores them). `www` still broken until Wave 2. Analytics/SEO is Wave 6. |
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
| **2 — storefront cutover (now)** | T Wave 1 merged ✔ + verified on the Railway host (W2-0); your window | Watch backend logs/API errors from the new storefront | Run its runbook: NS flip, apex + `www` CNAMEs, content-type checks, mail test; keep Replit stopped-not-deleted | Do the GoDaddy NS change (needs your login) |
| **3 — schedule & thank-you** | C1 + C2 live ✔ **and** Wave 2 done (T may build on a branch now; merge only after Wave 2) | Support; adjust C1 fields on request | `/schedule` table + filters, Enroll Now deep link, "You're enrolling in" card, thank-you polls C2, home "next classes", nav CTA | Owner: fill in each class's description ("details") in admin |
| **4 — Authorize.net** | Sandbox credentials exist | Provider interface; `AUTHORIZE_NET` adapter (Accept Hosted, `invoiceNumber = reference`), webhook + reconcile, encrypted keys, void/refund | Card label/icon for `AUTHORIZE_NET`; no flow change | Owner: production API Login ID / Transaction Key / Signature Key (no owner login); confirm with Chase nothing else uses the current key |
| **5 — Stripe off** | 3–5 clean days on Authorize.net | Disable Stripe for the tenant (instant rollback) | Remove Stripe-only bits | Owner OK |
| **6 — traffic** | Wave 3 live | — (C6 already records campaigns) | GA4 + Google Ads conversion (`purchase` only when C2 says `paid`), titles/meta, JSON-LD per location, sitemap/robots | Owner: 3 Google Business Profiles with the right phones; Search Console; ads |

### Wave 1 result

- T PR #2 merged 2026-10-19 18:07 UTC: three labeled phones, cents price helper, honest thank-you copy, UTM/gclid capture forwarded by the proxy.
- B verified T's test checkout: payment 325 `AA-MJK22L`, $364 incl. $15 fee, shows as *Checkout started* on the Payments page; the NOT PAID email went at 17:12 UTC to the three current admins and Resend reports all three **delivered**. (`kfnawaz+aads-wave1-test@gmail.com` got nothing — it isn't configured as an extra inbox; that's fine.)
- Admins changed on request: `contact@teslamodcenter.com` disabled, `owner@tesladrivingcenter.com` admin role removed (instructor role kept, pending a decision).

### T — current instructions (Wave 2 now; Wave 3 on a branch)

1. **W2-0 now:** confirm the merged build on the Railway host, as your runbook says.
2. **W2-1 — re-add both Railway custom domains, don't just confirm them.** They were registered on 2026-09-02. B hit this exact case on `drivorata.com` (registered 2026-08-29, DNS pointed 2026-10-18): Railway's certificate sat in *issuing* and never completed, and `railway domain certificate retry` refuses until an attempt has *failed*. With dns-only records and the apex's 2-year HSTS, a stuck certificate would be a hard, unclickable TLS error for returning visitors. So delete and re-add `allagesdrivingschool.com` and `www.allagesdrivingschool.com` in Railway right before the flip, and use the **new** targets and `_railway-verify` tokens in W2-2 and W2-5/6.
3. **W2-2 now** (the Cloudflare zone isn't authoritative, so it's invisible to the public): add both `_railway-verify` TXT records; check every record is grey-cloud; also confirm the zone's **SSL/TLS mode is Full** (needed for plan B below).
4. **W2-3 waits for you** (GoDaddy login). Then W2-4 with the mail test.
5. **W2-5 is the certificate test.** If `www`'s Railway certificate isn't *valid* within ~15 minutes, stop and apply **plan B**: switch that record to **proxied (orange cloud)**; Cloudflare's certificate serves visitors and Full mode accepts Railway's. That's how `drivorata.com` runs today; Railway still sees the real visitor IP. Use the same for the apex in W2-6 if needed. Report which way it went.
6. **Wave 3 — build now on a branch, don't merge until W2-6 is verified:** `/schedule` from C1 (filters: location, Teen/Adult; columns: Class · Dates (`dateRange`) · Time (`scheduleSummary`) · Location + phone · Details · Price · Seats/Full · **Enroll Now** using `enroll`), the "You're enrolling in" card, thank-you polling C2 every 3 s for up to 2 min using `ref` (`paid` → enrolled; `pending` → processing + location phone; `cash_due` → reserved, pay at office; `not_completed` → try again / call), home "next classes", nav CTA. Keep the cutover build small; merge Wave 3 after.
7. Report back after W2-2 (with the new targets) and again after W2-6.

Decisions already made: Accept Hosted; Stripe and Authorize.net run side by side, then Stripe off; header/footer list all three phones.

## Open items for you

1. **Pick the cutover window** for W2-3 (GoDaddy nameservers → `hassan`/`sureena.ns.cloudflare.com`). Quiet hours are best; the switch itself is traffic-neutral and reversible.
2. **`owner@tesladrivingcenter.com` instructor role** at this school: keep or remove?
3. **Ask the owner** why only Pasadena has published classes, and to fill in each class's description (it becomes the schedule's "Details" column).
4. **Tell the owner** about Oct 18's $90 customer: three tries, NOT PAID emails for each; the third was in fact paid and is now confirmed (PAID email + customer confirmation sent 2026-10-19).
5. **Rotate** the Railway Postgres and Neon passwords that appeared in a session transcript, and the provisioning credentials per the runbooks.
6. Owner: start the Authorize.net sandbox (Wave 4); keep working through Unconfirmed card payments.
