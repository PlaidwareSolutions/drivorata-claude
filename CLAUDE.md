# Drivorata (backend engine + admin app)

Express 5 + Vite/React + Drizzle/Postgres monorepo. Hosted on Railway (Dockerfile, Node 22) with Cloudflare (DNS, R2 uploads, Cloudflare for SaaS portal hostnames). A separate storefront repo consumes `/api/public/*` with a Bearer API key — keep that contract stable (`docs/headless-api.md`).

## Commands
- `npm run dev` — dev server (Vite middleware) on `PORT` (5000)
- `npm run check` — tsc (must stay at 0 errors; CI gates on it)
- `npm run build` — `dist/public` (client) + `dist/index.cjs`, `dist/migrate.cjs`
- `npm test` — all `server/__tests__` (needs `DATABASE_URL` to a scratch Postgres); `npm run test:unit` — DB-less subset
- `npm run db:generate` — write a migration from `shared/schema.ts`; `npm run db:migrate` — apply; `db:push` is dev-only

## Layout
- `server/routes.ts` (monolith routes), `server/storage.ts` (all Drizzle queries), `server/platform-routes.ts`, `server/auth/` (sessions), `server/object-storage/` (R2), `server/cloudflare/` (custom hostnames), `server/jobs/` (scheduler), `server/lib/request.ts` (client IP / base URL behind proxies)
- `shared/schema.ts` — single source of truth for the DB; every change needs `npm run db:generate` and the SQL committed under `migrations/`
- `client/src` — admin/platform SPA (wouter + TanStack Query, API calls are relative `/api/...`)
- `infra/cloudflare/` — Worker + R2 CORS; `.railway/railway.ts` — Railway IaC

## Conventions
- Never read `x-forwarded-for` directly; use `getClientIp(req)`. Build visitor-facing absolute URLs with `getRequestBaseUrl(req)`; platform links with `platformBaseUrl()`.
- Uploads are addressed as `/objects/uploads/<uuid>`; that string is what gets stored.
- Docs: `docs/ARCHITECTURE.md` (features/decisions), `docs/DEPLOYMENT.md` (Railway + Cloudflare setup), `docs/MIGRATION-RUNBOOK.md` (Replit cutover).
