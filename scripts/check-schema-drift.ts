/**
 * Schema drift gate for the cutover.
 *
 * Answers one question: *after* migrations have been applied to it, does the
 * target database's schema match exactly what `migrations/` produces from
 * scratch?
 *
 * Why not `drizzle-kit push`: push reports two ALTER COLUMN ... SET DEFAULT
 * statements on EVERY run, forever, for the two `.array()` columns
 * (marketing_program_settings.enabled_models, platform_plans.features).
 * Postgres normalises `ARRAY['recurring']::text[]` to `ARRAY['recurring'::text]`
 * and drizzle's differ never treats those as equal. The defaults are present
 * and correct in 0000_baseline.sql, so that output is a false positive — which
 * makes "push proposes nothing" an impossible pass condition.
 *
 * Instead this builds a reference database from migrations/ *on the same
 * server* (so there are no cross-version pg_dump artefacts), dumps both
 * schemas, normalises, and diffs.
 *
 * Usage:
 *   DATABASE_URL=<target> npx tsx scripts/check-schema-drift.ts
 * Exit 0 = no drift, exit 1 = drift (diff printed).
 */
import { execFileSync } from "child_process";
import { Client } from "pg";

const PGBIN = process.env.PGBIN || "/usr/local/opt/postgresql@18/bin";
const TARGET = process.env.DATABASE_URL;
const REF_DB = process.env.DRIFT_REF_DB || "drivorata_drift_ref";

function pgDumpSchema(url: string): string {
  const out = execFileSync(`${PGBIN}/pg_dump`, [
    "--schema-only", "--no-owner", "--no-privileges",
    "--exclude-schema=drizzle", url,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out
    .split("\n")
    // strip comments, blank lines, session GUCs, and the \restrict/\unrestrict
    // guards whose token is randomised on every dump
    .filter((l) => {
      const t = l.trim();
      if (!t || t.startsWith("--")) return false;
      if (/^(SET|SELECT pg_catalog\.set_config)/.test(t)) return false;
      if (/^\\(un)?restrict/.test(t)) return false;
      return true;
    })
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n");
}

function adminUrlFor(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function main(): Promise<void> {
  if (!TARGET) throw new Error("DATABASE_URL (the target database) must be set");

  const maintenance = adminUrlFor(TARGET, "postgres");
  const admin = new Client({ connectionString: maintenance });
  await admin.connect();
  try {
    console.log(`[drift] building reference database "${REF_DB}" from migrations/`);
    await admin.query(`DROP DATABASE IF EXISTS "${REF_DB}"`);
    await admin.query(`CREATE DATABASE "${REF_DB}"`);
  } finally {
    await admin.end();
  }

  const refUrl = adminUrlFor(TARGET, REF_DB);
  try {
    execFileSync("npx", ["tsx", "server/migrate.ts"], {
      env: { ...process.env, DATABASE_URL: refUrl },
      stdio: "inherit",
    });

    console.log("[drift] dumping both schemas");
    const target = pgDumpSchema(TARGET);
    const reference = pgDumpSchema(refUrl);

    if (target === reference) {
      console.log("[drift] OK — target schema matches migrations/ exactly");
      return;
    }

    console.error("[drift] DRIFT DETECTED — target differs from migrations/");
    const t = target.split("\n");
    const r = reference.split("\n");
    const onlyTarget = t.filter((l) => !r.includes(l));
    const onlyRef = r.filter((l) => !t.includes(l));
    for (const l of onlyTarget.slice(0, 60)) console.error(`  target-only: ${l}`);
    for (const l of onlyRef.slice(0, 60)) console.error(`  migrations-only: ${l}`);
    if (onlyTarget.length > 60 || onlyRef.length > 60) {
      console.error(`  ... (${onlyTarget.length} target-only, ${onlyRef.length} migrations-only lines total)`);
    }
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
  console.error("[drift] failed:", err);
  process.exit(1);
});
