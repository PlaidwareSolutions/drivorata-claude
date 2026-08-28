/**
 * Marks migrations as already applied WITHOUT running them.
 *
 * Use once on a database whose schema pre-dates the migration files — i.e.
 * the production database restored from Replit/Neon, which was built with
 * `drizzle-kit push`. After this, `npm run db:migrate` (the Railway
 * pre-deploy command) only applies migrations newer than the baseline.
 *
 * Safety: refuses to run unless the database already contains the `tenants`
 * table (so it can't be pointed at an empty DB by mistake), and is idempotent.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/mark-baseline-applied.ts            # marks 0000 only
 *   DATABASE_URL=... npx tsx scripts/mark-baseline-applied.ts --through 0001_x  # marks up to a tag
 *   DRY_RUN=1 ...                                                         # report only
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { pool } from "../server/db";

const DRY_RUN = process.env.DRY_RUN === "1";
const throughIdx = process.argv.indexOf("--through");
const THROUGH_TAG = throughIdx >= 0 ? process.argv[throughIdx + 1] : null;

interface JournalEntry { idx: number; version: string; when: number; tag: string; breakpoints: boolean }

async function main(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const journal = JSON.parse(readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8")) as { entries: JournalEntry[] };
  const entries = journal.entries.sort((a, b) => a.idx - b.idx);
  const selected = THROUGH_TAG
    ? entries.slice(0, entries.findIndex((e) => e.tag === THROUGH_TAG) + 1)
    : entries.slice(0, 1);
  if (selected.length === 0) throw new Error(`No journal entries selected (through=${THROUGH_TAG ?? "baseline"})`);

  const client = await pool.connect();
  try {
    const guard = await client.query("SELECT to_regclass('public.tenants') AS t");
    if (!guard.rows[0]?.t) {
      throw new Error("Refusing: database has no 'tenants' table. Use `npm run db:migrate` on an empty database instead.");
    }
    if (!DRY_RUN) {
      await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
      await client.query(
        "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
      );
    }
    for (const entry of selected) {
      const sqlText = readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
      const hash = createHash("sha256").update(sqlText).digest("hex");
      const existing = DRY_RUN
        ? { rowCount: 0 }
        : await client.query("SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = $1 OR hash = $2", [entry.when, hash]);
      if ((existing.rowCount ?? 0) > 0) {
        console.log(`[skip] ${entry.tag} already recorded`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`[dry-run] would record ${entry.tag} (created_at=${entry.when}, hash=${hash.slice(0, 12)}…)`);
        continue;
      }
      await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [hash, entry.when]);
      console.log(`[recorded] ${entry.tag} (created_at=${entry.when})`);
    }
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("mark-baseline-applied failed:", err);
    process.exit(1);
  });
