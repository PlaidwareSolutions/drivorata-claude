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

## 1. Rehearsal (repeatable, no downtime)
```sh
# 1. Snapshot current prod
pg_dump --format=custom --no-owner --no-privileges "$NEON_URL" -f prod.dump

# 2. Restore into Railway Postgres (drop/recreate first if re-running)
pg_restore --no-owner --no-privileges --clean --if-exists -d "$RAILWAY_URL" prod.dump

# 3. Drift gate: the restored schema must match shared/schema.ts (expect no proposed statements)
DATABASE_URL="$RAILWAY_URL" npx drizzle-kit push
#    → if it proposes changes, STOP: fold them into migrations/0000_baseline.sql and repeat.

# 4. Record the baseline so the migrator starts at 0001
DATABASE_URL="$RAILWAY_URL" npx tsx scripts/mark-baseline-applied.ts

# 5. Deploy (Railway pre-deploy runs node dist/migrate.cjs → applies 0001_portal_hostnames)
#    then smoke-test on the *.up.railway.app hostname: /api/health, login, admin pages.

# 6. Copy uploads (idempotent; re-run for deltas)
DATABASE_URL="$RAILWAY_URL" SOURCE_OBJECTS_BASE_URL=https://drivorata.com \
  R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=drivorata-uploads \
  DRY_RUN=1 npx tsx scripts/migrate-objects-to-r2.ts          # report
  npx tsx scripts/migrate-objects-to-r2.ts --rewrite-absolute  # copy + rewrite legacy GCS URLs
```
Verify on the Railway URL: package images and logos render; a fresh upload round-trips; a PDF with a logo renders.

## 2. Cutover (write freeze ~15–30 min)

> **BLOCKING PRE-FLIGHT — `SESSION_SECRET`.** The service is provisioned with a
> placeholder value (`PLACEHOLDER-REPLACE-WITH-REPLIT-SESSION_SECRET-BEFORE-CUTOVER-…`)
> so the pipeline could be validated before the real secret was available.
> Replace it with the exact Replit value **before** the DNS flip. If you don't:
> every signed-in staff session is invalidated, and every previously emailed
> unsubscribe link and contact-reply token stops validating.
> Check with: `railway variables --service drivorata --kv | grep '^SESSION_SECRET='`
> — if it still starts with `PLACEHOLDER-`, stop.

1. Announce the freeze; on Replit, stop the deployment (or set `CART_REMINDER_INTERVAL_MINUTES=0` / `STALE_CREDIT_REMINDER_INTERVAL_MINUTES=0` and leave it read-only).
2. Final `pg_dump` → `pg_restore --clean --if-exists` into Railway → `mark-baseline-applied` → trigger a Railway redeploy (migrations apply) → smoke test.
3. Re-run `migrate-objects-to-r2.ts` for deltas.
4. Cloudflare DNS — **the actual cutover step**: replace the apex `A 34.111.179.208`
   (Replit) with `CNAME @ -> 90brfa2x.up.railway.app`. Cloudflare flattens the root
   CNAME automatically. Leave it **dns-only (grey)** so Railway terminates TLS: no
   dependency on the zone SSL mode, and platform traffic never enters the Worker
   (which matters on the Free Workers quota). Switching to proxied later is one API
   call and independently revertible.
   The `_railway-verify` TXT record is already in place, so Railway verifies immediately.
5. Verify on `https://drivorata.com`: `/api/health`, login (existing sessions survive because `SESSION_SECRET` is unchanged), admin dashboard, upload, storefront API with a real key (`GET /api/public/me`, `/tenant/:slug/packages` — compare JSON to a pre-cutover capture), Stripe test checkout, one email send, job log lines (`[Jobs]`).
6. Lift the freeze.

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
