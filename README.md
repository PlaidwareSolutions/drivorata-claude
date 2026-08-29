# Drivorata

Multi-tenant SaaS backend + admin dashboard for Texas driving schools (enrollment, scheduling, payments, TDLR compliance). Schools' public storefronts live in a separate repo and talk to this service through the headless API (`docs/headless-api.md`).

**Stack:** Express 5 · React/Vite · Drizzle ORM · PostgreSQL · Node 22
**Hosting:** Railway (web service + Postgres) · Cloudflare (DNS, R2 uploads, Cloudflare for SaaS portal hostnames)

## Local development

```sh
npm ci
cp .env.example .env                       # fill in DATABASE_URL + SESSION_SECRET at minimum
createdb drivorata_dev
DATABASE_URL=postgresql://localhost:5432/drivorata_dev npm run db:migrate
npm run dev                                # http://localhost:5000
```

Uploads need R2 credentials (`R2_*`); without them the upload endpoints answer 503 and everything else works.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with Vite HMR |
| `npm run check` | TypeScript type-check |
| `npm run build` | Client → `dist/public`; server → `dist/index.cjs`, `dist/migrate.cjs` |
| `npm start` | Run the production bundle |
| `npm test` / `npm run test:unit` | Node test runner (`server/__tests__`); the full suite needs a scratch `DATABASE_URL` |
| `npm run db:generate` | Generate a SQL migration from `shared/schema.ts` |
| `npm run db:migrate` | Apply pending migrations (also the Railway pre-deploy command) |
| `npm run db:push` | Dev-only: push schema without a migration file |

## Deployment & operations

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Railway service, Cloudflare zone, R2 bucket, portal-proxy Worker, environment variables
- [docs/MIGRATION-RUNBOOK.md](docs/MIGRATION-RUNBOOK.md) — one-time cutover from Replit (database, uploads, DNS)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — features and design decisions
- [.railway/railway.ts](.railway/railway.ts) — Railway Infrastructure as Code (`railway config plan` / `apply`)
- [infra/cloudflare/](infra/cloudflare/) — Worker source and R2 CORS policy
