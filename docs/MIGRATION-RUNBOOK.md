# Cutover runbook — Replit → Railway

Goal: move the production database, uploaded files and traffic with a short write-freeze, keeping `drivorata.com` (so Stripe/PayPal/Resend webhook URLs don't change).

## 0. Prerequisites (done once, no downtime)
- [ ] Railway project, service and Postgres exist; variables set (docs/DEPLOYMENT.md §1). `SESSION_SECRET` is the exact Replit value.
- [ ] Cloudflare: R2 bucket + CORS + token; Cloudflare for SaaS enabled; fallback origin `saas.drivorata.com`; Worker deployed with `ORIGIN_HOST` and `PORTAL_PROXY_SECRET`; SSL mode Full.
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
1. Announce the freeze; on Replit, stop the deployment (or set `CART_REMINDER_INTERVAL_MINUTES=0` / `STALE_CREDIT_REMINDER_INTERVAL_MINUTES=0` and leave it read-only).
2. Final `pg_dump` → `pg_restore --clean --if-exists` into Railway → `mark-baseline-applied` → trigger a Railway redeploy (migrations apply) → smoke test.
3. Re-run `migrate-objects-to-r2.ts` for deltas.
4. Cloudflare DNS: point `@`/`www` at the Railway domain target (proxied). Railway's custom-domain check must show verified (TXT present).
5. Verify on `https://drivorata.com`: `/api/health`, login (existing sessions survive because `SESSION_SECRET` is unchanged), admin dashboard, upload, storefront API with a real key (`GET /api/public/me`, `/tenant/:slug/packages` — compare JSON to a pre-cutover capture), Stripe test checkout, one email send, job log lines (`[Jobs]`).
6. Lift the freeze.

## 3. After cutover
- Keep the Replit deployment stopped but intact for a rollback window (repoint DNS back to roll back).
- Re-run `migrate-objects-to-r2.ts` once more after a day (catches anything uploaded during the freeze window).
- For each school with a verified custom domain: open Admin → Custom Domain, confirm the portal hostname shows **active**, and send them the new `CNAME portal → saas.drivorata.com` record (replaces the old A record).
- Decommission Replit: object storage bucket, database, secrets.

## Rollback
DNS back to Replit; restart the Replit deployment. Data written on Railway after the freeze would need to be replayed by hand, which is why the freeze exists.

## Known follow-ups (not part of the migration)
- Request logger prints full JSON response bodies (PII) — trim in `server/index.ts`.
- `POST /api/auth/forgot-password` returns the reset token in the response body instead of emailing it.
- `GET /api/public/resolve` is unauthenticated; `express.json` has no explicit body-size limit.
- Per-tenant Stripe/PayPal secrets are plaintext columns.
