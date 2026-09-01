# Cutover runbook — Replit → Railway

Goal: move the production database, uploaded files and traffic with a short write-freeze, keeping `drivorata.com` (so Stripe/PayPal/Resend webhook URLs don't change).

## Provisioned state (as of 2026-08-29)

| Thing | Value |
|---|---|
| Railway project / service | `drivorata` / `drivorata` (Postgres 18) |
| Railway service host | `drivorata-production.up.railway.app` |
| Apex CNAME target | `90brfa2x.up.railway.app` (+ TXT `_railway-verify`) — **not yet pointed** |
| www CNAME target | `ikyeiib2.up.railway.app` — **live, dns-only** |
| Cloudflare zone | `drivorata.com` / `0c07c6a20968957922b46307700e6fd8`, SSL/TLS = **Full** |
| R2 bucket | `drivorata-uploads` (WNAM), CORS applied |
| SaaS fallback origin | `saas.drivorata.com` (proxied AAAA `100::`) — needs the SaaS entitlement |
| Worker | `drivorata-portal-proxy`, secret set; currently routed on `portal-test.drivorata.com/*` |
| PG 18 client tools | `/usr/local/opt/postgresql@18/bin/` (installed unlinked — use the full path) |

**Use the PG 18 binaries for every dump/restore.** The system `psql`/`pg_dump` is 16,
which is older than the Railway server; restoring an 18 server with a 16 client is
the unsupported direction.

```sh
export PGBIN=/usr/local/opt/postgresql@18/bin
```

## Strategy: rehearse on `www`, cut over the apex

`www.drivorata.com` had **no DNS record** before this migration, so it was pointed at
Railway immediately with zero risk. It now serves the migrated app on a real
`drivorata.com` hostname with a valid certificate, while the apex still serves Replit.

That means the entire rehearsal — restored data, uploads, login, checkout — can be
validated on a production hostname *before* any customer-facing change. The cutover
then reduces to a single record: repoint the apex.

## 0. Prerequisites (done once, no downtime)
- [ ] Railway project, service and Postgres exist; variables set (docs/DEPLOYMENT.md §1). `SESSION_SECRET` is the exact Replit value.
- [ ] Cloudflare: R2 bucket + CORS + token; **Cloudflare for SaaS enabled** (until it is,
      the `custom_hostnames` API returns `1404 No quota has been allocated` and the
      Worker's `*/*` route is rejected — same root cause, two symptoms); fallback origin
      `saas.drivorata.com`; Worker deployed with `ORIGIN_HOST` and `PORTAL_PROXY_SECRET`;
      SSL mode Full.
- [ ] `psql`, `pg_dump`/`pg_restore` (v16+) and `npx tsx` available on the operator machine; repo checked out at the release commit; `npm ci` done.
- [ ] Env files on the operator machine: `NEON_URL` (current prod), `RAILWAY_URL` (Postgres public URL), R2 vars.

## Connecting to Railway Postgres

Railway Postgres has **no public endpoint** (correct — keep it that way). Open an
SSH tunnel instead; it prints a local `postgresql://…@127.0.0.1:<port>/railway` URL
and holds it open until Ctrl+C:

```sh
railway connect Postgres --tunnel-only --port 55432
```

Use that URL as `$RAILWAY_URL` below. **Use the PG 18 binaries** — the system
`pg_dump`/`pg_restore` is 16, older than the Railway server:

```sh
export PGBIN=/usr/local/opt/postgresql@18/bin
```

## ⚠️ The restore desynchronises the migration ledger — always reset it

`pg_restore --clean` only drops objects that exist **in the dump**. The production
database was built with `drizzle-kit push` and therefore has **no `drizzle` schema**,
so `drizzle.__drizzle_migrations` on the Railway side is *not* dropped: it survives
the restore still claiming every migration is applied, while `public` has been
replaced by a schema that predates them.

The migrator compares journal timestamps against that ledger, concludes there is
nothing to do, logs `up to date` and exits 0. `/api/health` is a bare `SELECT 1`,
so the healthcheck passes and the deploy goes live on a schema missing
`tenants.portal_hostname_*` → **HTTP 500 on every route that resolves a tenant.**

**Therefore: `DROP SCHEMA IF EXISTS drizzle CASCADE` after every restore, before
`mark-baseline-applied`.** This is in the commands below; do not skip it.

`server/migrate.ts` also verifies the live schema against `shared/schema.ts` after
migrating and exits non-zero on a mismatch, so the pre-deploy aborts rather than
shipping. That is a backstop, not a substitute for the DROP SCHEMA.

## 1. Rehearsal (repeatable, no downtime)

```sh
export PGBIN=/usr/local/opt/postgresql@18/bin
# $NEON_URL   = current production database
# $RAILWAY_URL = tunnel URL from `railway connect Postgres --tunnel-only`

# 0. Do NOT let restored production data drive real emails during the rehearsal.
#    The restored rows carry live customer addresses, and the reminder jobs would
#    email them for real. The final restore then wipes the dedupe markers, so they
#    would be emailed a SECOND time after cutover.
railway variables --service drivorata --set BACKGROUND_JOBS_ENABLED=0

# 1. Snapshot current prod
$PGBIN/pg_dump --format=custom --no-owner --no-privileges "$NEON_URL" -f prod.dump

# 2. Restore into Railway Postgres
$PGBIN/pg_restore --no-owner --no-privileges --clean --if-exists -d "$RAILWAY_URL" prod.dump

# 3. Reset the migration ledger (see the warning above — REQUIRED), and drop the
#    Replit bookkeeping schema the dump carries with it (_system.replit_database_
#    migrations_v1 — Replit deployment tooling, unreferenced by the app).
$PGBIN/psql "$RAILWAY_URL" -c 'DROP SCHEMA IF EXISTS drizzle CASCADE'
$PGBIN/psql "$RAILWAY_URL" -c 'DROP SCHEMA IF EXISTS _system CASCADE'

# 4. Record the baseline so the migrator starts at 0001
DATABASE_URL="$RAILWAY_URL" npx tsx scripts/mark-baseline-applied.ts

# 5. Deploy. Pre-deploy runs `node dist/migrate.cjs`, which applies 0001 and then
#    verifies the schema against shared/schema.ts. A mismatch aborts the deploy.

# 6. Drift gate — AFTER migrating. Builds a reference database from migrations/ on
#    the same server and diffs normalised pg_dump output. Exit 0 = no drift.
DATABASE_URL="$RAILWAY_URL" npm run db:drift
#    Do NOT use `drizzle-kit push` as the gate: it reports two
#    `ALTER COLUMN ... SET DEFAULT` statements on EVERY run for the two `.array()`
#    columns, because Postgres normalises ARRAY['recurring']::text[] to
#    ARRAY['recurring'::text] and drizzle's differ never matches them. The defaults
#    are correct in the baseline — it is a false positive, so "push proposes
#    nothing" can never be satisfied.

# 7. Copy uploads (idempotent; re-run for deltas)
set -a; . ./.env.provisioning; set +a
DATABASE_URL="$RAILWAY_URL" SOURCE_OBJECTS_BASE_URL=https://drivorata.com \
  DRY_RUN=1 npx tsx scripts/migrate-objects-to-r2.ts           # report first
DATABASE_URL="$RAILWAY_URL" SOURCE_OBJECTS_BASE_URL=https://drivorata.com \
  npx tsx scripts/migrate-objects-to-r2.ts --rewrite-absolute  # copy + rewrite legacy URLs
```

**Verify on `https://www.drivorata.com`** (already pointed at Railway, while the apex
still serves Replit): login with a real account, admin dashboard, package images and
logos render, a fresh upload round-trips, a PDF with a logo renders, and
`GET /api/public/me` + `/tenant/:slug/packages` with a real API key match a
pre-cutover capture byte for byte.

## 2. Cutover (write freeze ~15–30 min)

> **BLOCKING PRE-FLIGHT — `SESSION_SECRET`.** The service is provisioned with a
> placeholder value (`PLACEHOLDER-REPLACE-WITH-REPLIT-SESSION_SECRET-BEFORE-CUTOVER-…`)
> so the pipeline could be validated before the real secret was available.
> Replace it with the exact Replit value **before** the DNS flip. If you don't:
> every signed-in staff session is invalidated, and every previously emailed
> unsubscribe link and contact-reply token stops validating.
> Check with: `railway variables --service drivorata --kv | grep '^SESSION_SECRET='`
> — if it still starts with `PLACEHOLDER-`, stop.

1. Announce the freeze; on Replit, stop the deployment (or set
   `CART_REMINDER_INTERVAL_MINUTES=0` / `STALE_CREDIT_REMINDER_INTERVAL_MINUTES=0`
   and leave it read-only).
2. **Copy upload deltas BEFORE stopping Replit** — `migrate-objects-to-r2.ts` fetches
   objects from the running Replit deployment, so it cannot run once that is down.
   Run it last thing before the freeze, and again only if Replit is still serving.
3. Final `pg_dump` → `pg_restore --clean --if-exists` →
   **`psql -c 'DROP SCHEMA IF EXISTS drizzle CASCADE'`** and
   **`psql -c 'DROP SCHEMA IF EXISTS _system CASCADE'`** → `mark-baseline-applied`
   → redeploy (pre-deploy migrates and verifies) → `npm run db:drift` → smoke test.
4. Re-enable background jobs: `railway variables --service drivorata --set BACKGROUND_JOBS_ENABLED=1`.
5. Cloudflare DNS — **the actual cutover step**: replace the apex `A 34.111.179.208`
   (Replit) with `CNAME @ -> 90brfa2x.up.railway.app`. Cloudflare flattens the root
   CNAME automatically. Leave it **dns-only (grey)** so Railway terminates TLS: no
   dependency on the zone SSL mode, and platform traffic never enters the Worker
   (which matters on the Free Workers quota). Switching to proxied later is one API
   call and independently revertible.
   The `_railway-verify` TXT record is already in place, so Railway verifies immediately.
6. Verify on `https://drivorata.com`: `/api/health`, login (existing sessions survive
   because `SESSION_SECRET` is unchanged), admin dashboard, upload, storefront API with
   a real key, Stripe test checkout, one email send, job log lines (`[Jobs]`).
7. Lift the freeze.

## 3. After cutover
- Keep the Replit deployment stopped but intact for a rollback window (repoint DNS back to roll back).
- Re-run `migrate-objects-to-r2.ts` once more after a day (catches anything uploaded during the freeze window).
- For each school with a verified custom domain: open Admin → Custom Domain, confirm the portal hostname shows **active**, and send them the new `CNAME portal → saas.drivorata.com` record (replaces the old A record).
- Delete the temporary `portal-test.drivorata.com` record and restore the Worker's `*/*` route.
- **Rotate the Cloudflare provisioning API token** and delete `.env.provisioning`.
- Decommission Replit: object storage bucket, database, secrets.

## Rollback
DNS back to Replit; restart the Replit deployment. Data written on Railway after the freeze would need to be replayed by hand, which is why the freeze exists.

## Known follow-ups (not part of the migration)
- Request logger prints full JSON response bodies (PII) — trim in `server/index.ts`.
- `POST /api/auth/forgot-password` returns the reset token in the response body instead of emailing it.
- `GET /api/public/resolve` is unauthenticated; `express.json` has no explicit body-size limit.
- Per-tenant Stripe/PayPal secrets are plaintext columns.
