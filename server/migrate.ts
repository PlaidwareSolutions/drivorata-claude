/**
 * Applies pending Drizzle SQL migrations from ./migrations, then verifies that
 * the live schema actually contains everything the ORM expects.
 *
 * Runs as the Railway pre-deploy command (`node dist/migrate.cjs`) and locally
 * via `npm run db:migrate`. Exits non-zero on failure so the deploy is aborted
 * and the previous version keeps serving.
 *
 * Why the verification step exists
 * -------------------------------
 * The migrator decides what to apply by comparing journal timestamps against
 * the newest row in `drizzle.__drizzle_migrations`. That ledger lives in the
 * database, so a restore can desynchronise it from the actual schema:
 * `pg_restore --clean` only drops objects present in the dump, and a dump taken
 * from a `drizzle-kit push`-built database contains no `drizzle` schema. The
 * ledger therefore survives the restore claiming migrations are applied, while
 * the restored `public` schema predates them. The migrator then logs
 * "up to date" and exits 0, the healthcheck (a bare SELECT 1) stays green, and
 * the deploy goes live on a schema that is missing columns — producing a 500 on
 * every route that touches the affected table.
 *
 * Comparing the ORM's expected tables/columns against information_schema turns
 * that silent, post-deploy failure into a loud, pre-deploy one.
 */
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "@shared/schema";
import { db, pool } from "./db";

interface MissingItem {
  table: string;
  column?: string;
}

async function verifySchemaMatchesOrm(): Promise<MissingItem[]> {
  const expected = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    const cols = new Set(cfg.columns.map((c) => c.name));
    expected.set(cfg.name, cols);
  }

  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );
  const actual = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
    actual.get(r.table_name)!.add(r.column_name);
  }

  const missing: MissingItem[] = [];
  for (const [table, cols] of expected) {
    const live = actual.get(table);
    if (!live) {
      missing.push({ table });
      continue;
    }
    for (const col of cols) {
      if (!live.has(col)) missing.push({ table, column: col });
    }
  }
  return missing;
}

async function main(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), "migrations");
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] migrations up to date");

  console.log("[migrate] verifying live schema against shared/schema.ts");
  const missing = await verifySchemaMatchesOrm();
  if (missing.length > 0) {
    console.error(
      `[migrate] SCHEMA MISMATCH — ${missing.length} object(s) the application expects are absent:`,
    );
    for (const m of missing.slice(0, 40)) {
      console.error(m.column ? `  - ${m.table}.${m.column}` : `  - table ${m.table} (missing entirely)`);
    }
    if (missing.length > 40) console.error(`  ... and ${missing.length - 40} more`);
    console.error(
      "[migrate] The migration ledger claims these migrations are applied but the schema disagrees.\n" +
        "[migrate] This usually means a pg_restore reset the schema without resetting the ledger.\n" +
        "[migrate] Fix: DROP SCHEMA IF EXISTS drizzle CASCADE; then re-run mark-baseline-applied and redeploy.\n" +
        "[migrate] See docs/MIGRATION-RUNBOOK.md.",
    );
    throw new Error("schema verification failed");
  }
  console.log(`[migrate] schema OK (${missing.length === 0 ? "all expected tables and columns present" : ""})`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate] failed:", err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
