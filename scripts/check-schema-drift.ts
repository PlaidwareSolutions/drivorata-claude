/**
 * Schema drift gate for the cutover.
 *
 * Answers one question: *after* migrations have been applied to it, does the
 * target database's schema match what `migrations/` produces from scratch?
 *
 * Compares SEMANTICS, not `pg_dump` text. A text diff is unusable here for two
 * reasons, both hit during the real rehearsal:
 *   - The production schema grew column-by-column via `drizzle-kit push`, so its
 *     physical column order differs from a schema created in one shot. That
 *     changes which column carries the trailing comma, and a line diff reports
 *     unchanged columns as differences.
 *   - Postgres renders an identical default two ways depending on how it was
 *     written: `'{recurring}'::text[]` vs `ARRAY['recurring'::text]`.
 *
 * Neither is drift. This compares order-independent sets of tables, columns
 * (type / nullability / normalised default), indexes, constraints and enum
 * values, so it stays silent on cosmetics and speaks up on anything real.
 *
 * `drizzle-kit push` is also unusable as a gate: it reports two
 * `ALTER COLUMN ... SET DEFAULT` statements on EVERY run for the two `.array()`
 * columns, for the same rendering reason — a false positive that can never be
 * satisfied.
 *
 * Usage:
 *   DATABASE_URL=<target> npx tsx scripts/check-schema-drift.ts
 * Exit 0 = no drift, exit 1 = drift (differences printed).
 */
import { execFileSync } from "child_process";
import { Client } from "pg";

const TARGET = process.env.DATABASE_URL;
const REF_DB = process.env.DRIFT_REF_DB || "drivorata_drift_ref";

/** Collapse equivalent renderings of the same value so cosmetics are not drift. */
function normaliseDefault(d: string | null): string {
  if (!d) return "-";
  let s = d.trim();
  // ARRAY['a'::text, 'b'::text]  ->  {a,b}
  const arr = s.match(/^ARRAY\[(.*)\]$/s);
  if (arr) {
    const items = arr[1]
      .split(",")
      .map((x) => x.trim().replace(/::[a-z_ ]+$/i, "").replace(/^'(.*)'$/s, "$1"))
      .filter((x) => x.length > 0);
    return `{${items.join(",")}}`;
  }
  // '{a,b}'::text[]  ->  {a,b}
  const lit = s.match(/^'(\{.*\})'(::.*)?$/s);
  if (lit) return lit[1];
  return s.replace(/::[a-z_ \[\]]+$/i, "").replace(/^'(.*)'$/s, "$1");
}

const QUERIES: Record<string, string> = {
  columns: `
    SELECT table_name || '.' || column_name || ' :: ' || data_type
           || ' null=' || is_nullable AS k, COALESCE(column_default, '') AS d
      FROM information_schema.columns WHERE table_schema = 'public'`,
  indexes: `
    SELECT schemaname || '.' || indexname AS k, indexdef AS d
      FROM pg_indexes WHERE schemaname = 'public'`,
  constraints: `
    SELECT c.conrelid::regclass::text || '.' || c.conname AS k,
           pg_get_constraintdef(c.oid) AS d
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public'`,
  enums: `
    SELECT t.typname AS k, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS d
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' GROUP BY t.typname`,
};

async function snapshot(url: string): Promise<Map<string, Map<string, string>>> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const out = new Map<string, Map<string, string>>();
    for (const [kind, q] of Object.entries(QUERIES)) {
      const { rows } = await client.query<{ k: string; d: string }>(q);
      const m = new Map<string, string>();
      for (const r of rows) m.set(r.k, kind === "columns" ? normaliseDefault(r.d || null) : r.d);
      out.set(kind, m);
    }
    return out;
  } finally {
    await client.end();
  }
}

function urlFor(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function main(): Promise<void> {
  if (!TARGET) throw new Error("DATABASE_URL (the target database) must be set");
  const maintenance = urlFor(TARGET, "postgres");

  const admin = new Client({ connectionString: maintenance });
  await admin.connect();
  try {
    console.log(`[drift] building reference database "${REF_DB}" from migrations/`);
    await admin.query(`DROP DATABASE IF EXISTS "${REF_DB}"`);
    await admin.query(`CREATE DATABASE "${REF_DB}"`);
  } finally {
    await admin.end();
  }

  const refUrl = urlFor(TARGET, REF_DB);
  const problems: string[] = [];
  try {
    execFileSync("npx", ["tsx", "server/migrate.ts"], {
      env: { ...process.env, DATABASE_URL: refUrl },
      stdio: "inherit",
    });

    console.log("[drift] comparing schemas");
    const target = await snapshot(TARGET);
    const reference = await snapshot(refUrl);

    for (const kind of Object.keys(QUERIES)) {
      const t = target.get(kind)!;
      const r = reference.get(kind)!;
      for (const [k, v] of r) {
        if (!t.has(k)) problems.push(`${kind}: MISSING from target — ${k}`);
        else if (t.get(k) !== v) problems.push(`${kind}: DIFFERS — ${k}\n    target:     ${t.get(k)}\n    migrations: ${v}`);
      }
      for (const k of t.keys()) {
        if (!r.has(k)) problems.push(`${kind}: EXTRA in target (not created by migrations) — ${k}`);
      }
    }

    if (problems.length === 0) {
      const counts = Object.keys(QUERIES).map((k) => `${k}=${target.get(k)!.size}`).join(" ");
      console.log(`[drift] OK — target schema matches migrations/ (${counts})`);
      return;
    }
    console.error(`[drift] DRIFT DETECTED — ${problems.length} difference(s):`);
    for (const p of problems.slice(0, 60)) console.error(`  ${p}`);
    if (problems.length > 60) console.error(`  ... and ${problems.length - 60} more`);
    process.exitCode = 1;
  } finally {
    const cleanup = new Client({ connectionString: maintenance });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS "${REF_DB}"`);
    } finally {
      await cleanup.end();
    }
  }
}

main().catch((err) => {
  console.error("[drift] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
