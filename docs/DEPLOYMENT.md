# Deployment — Railway + Cloudflare

```
Browser / storefront ──► Cloudflare DNS (proxied, SSL/TLS = Full)
   drivorata.com, www ─────────────────► Railway service  ──► Railway Postgres
   portal.<school>.com (SaaS hostname) ─► portal-proxy Worker ─► Railway service
Railway service ──► R2 (uploads)  ──► Cloudflare API (custom hostnames)  ──► Resend / Stripe / PayPal
Railway pre-deploy: node dist/migrate.cjs
```

## 1. Railway

1. Create a project; add **PostgreSQL** and a service **drivorata** from this GitHub repo (`main`). Builder: **Dockerfile**.
2. Service settings:
   - Pre-deploy command: `node dist/migrate.cjs` (runs migrations before the new version takes traffic; a failure aborts the deploy).
   - Healthcheck path: `/api/health` (200 when the DB answers, 503 otherwise).
   - Replicas: 1 (background jobs are lock-guarded, so more is safe later).
3. Variables — see the table below. `VITE_PLATFORM_DOMAIN` is consumed at **build time** (Docker `ARG`), so set it before the first build.
4. Public networking: add custom domains `drivorata.com` and `www.drivorata.com`; create the CNAME + `_railway-verify` TXT records Railway shows (in Cloudflare, **proxied** on). Note the Railway-provided `*.up.railway.app` hostname — the Worker uses it as `ORIGIN_HOST`.
5. Optional: manage build/deploy settings and variables from `.railway/railway.ts` with `railway config plan` / `railway config apply` (secrets stay in the dashboard).

> **Two constraints learned the hard way — always run `railway config plan` and read it before `apply`:**
> - **Custom domains cannot be declared in the config file.** Railway rejects them (`Custom-domain registration is not supported by Railway configuration`). Add them with `railway domain <name>` or the dashboard.
> - **Resource names in the config must match Railway exactly, including case.** The CLI creates the database service as `Postgres`; a config declaring `postgres("postgres")` plans to *destroy and recreate the database*. The plan says `1 to destroy` — never apply that.

> **Postgres version:** Railway provisions **PG 18**. Dump/restore between the old database and Railway must use client tools at least as new as the newer server, so install PG 18 client tools (`brew install postgresql@18`) before the rehearsal rather than relying on an older local `pg_dump`/`pg_restore`.

### Environment variables

| Variable | Value / notes |
|---|---|
| `DATABASE_URL` | Railway Postgres reference (`${{Postgres.DATABASE_URL}}`) |
| `SESSION_SECRET` | **Same value as on Replit** — also signs unsubscribe/reply tokens |
| `UNSUBSCRIBE_SECRET` | carry over (falls back to `SESSION_SECRET`) |
| `APP_BASE_URL` | `https://drivorata.com` |
| `VITE_PLATFORM_DOMAIN` | `drivorata.com` (build-time) |
| `TRUST_PROXY` | `1` |
| `CLIENT_IP_HEADER` | `x-real-ip` (Railway's edge sets it to the real client / `CF-Connecting-IP`) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from §2.2 |
| `R2_PUBLIC_BASE_URL` | optional, only if the bucket has a public custom domain |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `PORTAL_CNAME_TARGET` | from §2.3 (`saas.drivorata.com`) |
| `PORTAL_PROXY_SECRET` | random string; also `wrangler secret put` on the Worker |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INBOUND_WEBHOOK_SECRET`, `INBOUND_REPLY_DOMAIN`, `SESSION_EMAIL_FROM` | carry over |
| `BACKGROUND_JOBS_ENABLED`, `STALE_CREDIT_REMINDER_INTERVAL_MINUTES`, `CART_REMINDER_INTERVAL_MINUTES` | optional (defaults on / 60 / 60) |
| `BOOT_SEED_TENANT_IDS` | optional, e.g. `1,28` to re-run the idempotent promotion/online-course seeds at boot |
| `LOGO_FETCH_ALLOWED_HOSTS` | optional extra hosts allowed for pasted logo URLs in PDFs |

## 2. Cloudflare

### 2.1 Zone `drivorata.com`
- DNS: `@` and `www` → CNAME to the Railway domain target (proxied). Add the `_railway-verify` TXT records.
- **SSL/TLS → Full** (not Flexible, not Full-strict — Railway requirement).
- Cache Rule (optional but recommended): cache `/objects/*` and `/assets/*` (both are immutable, long `Cache-Control`).

### 2.2 R2 bucket `drivorata-uploads`
- Create the bucket; apply CORS from `infra/cloudflare/r2-cors.json` (Settings → CORS policy, or `wrangler r2 bucket cors put drivorata-uploads --file infra/cloudflare/r2-cors.json`). Add your dev origin if you upload from localhost.
- Create an **R2 API token** (Object Read & Write, scoped to the bucket) → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`; the account id → `R2_ACCOUNT_ID`.
- Uploads are served through the app at `/objects/uploads/<uuid>` (no public bucket needed). Optionally connect a custom domain to the bucket and set `R2_PUBLIC_BASE_URL`.

### 2.3 Cloudflare for SaaS (tenant staff portals)
1. SSL/TLS → **Custom Hostnames** → enable Cloudflare for SaaS (100 hostnames free, then $0.10/mo each).
2. Fallback origin: DNS record `saas.drivorata.com  AAAA  100::` (**proxied**, originless) → set as fallback origin. This is what schools CNAME `portal` to (`PORTAL_CNAME_TARGET`).
3. Deploy the Worker (`infra/cloudflare/portal-proxy/README.md`): it re-addresses custom-hostname traffic to the Railway host. After deploy, add **Worker: None** routes for `drivorata.com/*` and `www.drivorata.com/*`.
4. API token: **Zone → SSL and Certificates → Edit** on this zone → `CLOUDFLARE_API_TOKEN`; zone id → `CLOUDFLARE_ZONE_ID`.

When a school verifies its domain in **Admin → Custom Domain**, the app creates `portal.<domain>` as a custom hostname and the page shows the CNAME to add plus live hostname/SSL status.

## 3. Third parties (no change if the hostname stays `drivorata.com`)
- Stripe webhooks per tenant → `https://drivorata.com/api/webhooks/stripe`
- PayPal return → `https://drivorata.com/api/payments/paypal/return`
- Resend webhooks → `/api/webhooks/resend`, inbound → `/api/webhooks/inbound-email`

## 4. Day-2
- Schema change: edit `shared/schema.ts` → `npm run db:generate` → commit `migrations/*` → deploy (pre-deploy applies it).
- Logs: Railway service logs (request lines include response bodies — see follow-ups in the runbook).
- Rollback: redeploy the previous Railway deployment; migrations are forward-only, so keep them additive.
