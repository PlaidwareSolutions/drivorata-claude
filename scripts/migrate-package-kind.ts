/**
 * Migration & backfill: package_kind / sellable_standalone /
 * available_as_upsell / package_upsell_dependencies.
 *
 * Idempotent DDL + backfill so existing tenant DBs gain the new
 * columns/table required by the Simple Packages & Upsell Dependencies
 * feature without losing data.
 *
 * Steps (each guarded by an existence check):
 *   1. Create `package_kind` enum if missing.
 *   2. Add `packages.kind` (default COHORT_BASED, NOT NULL) if missing.
 *   3. Add `packages.sellable_standalone` (default true, NOT NULL).
 *   4. Add `packages.available_as_upsell` (default false, NOT NULL).
 *   5. Create `package_upsell_dependencies` table + indexes if missing.
 *   6. Backfill values from legacy heuristics:
 *        - kind = COHORT_BASED if any classroom/drive hours; else SIMPLE.
 *        - sellable_standalone = NOT is_add_on
 *        - available_as_upsell = is_add_on
 *      Only rows whose values would actually change are touched.
 *
 * Run with:  npx tsx scripts/migrate-package-kind.ts
 * Dry-run:   DRY_RUN=1 npx tsx scripts/migrate-package-kind.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { packages } from "@shared/schema";
import { eq } from "drizzle-orm";

const DRY_RUN = process.env.DRY_RUN === "1";

async function exec(label: string, q: any) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${label}`);
    return null;
  }
  console.log(`[run] ${label}`);
  return db.execute(q);
}

async function main() {
  console.log(`Starting package_kind migration (dry_run=${DRY_RUN})`);

  // 1. Enum
  const enumExists = await db.execute(sql`
    SELECT 1 FROM pg_type WHERE typname = 'package_kind'
  `);
  if (!(enumExists as any).rows?.length) {
    await exec(
      "CREATE TYPE package_kind",
      sql`CREATE TYPE package_kind AS ENUM ('COHORT_BASED', 'SIMPLE')`,
    );
  } else {
    console.log("[skip] package_kind enum already exists");
  }

  // 2-4. Columns
  async function ensureColumn(col: string, ddl: string) {
    const r = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'packages' AND column_name = ${col}
    `);
    if ((r as any).rows?.length) {
      console.log(`[skip] packages.${col} already exists`);
      return;
    }
    await exec(`ALTER TABLE packages ADD COLUMN ${col}`, sql.raw(ddl));
  }
  await ensureColumn(
    "kind",
    `ALTER TABLE packages ADD COLUMN kind package_kind NOT NULL DEFAULT 'COHORT_BASED'`,
  );
  await ensureColumn(
    "sellable_standalone",
    `ALTER TABLE packages ADD COLUMN sellable_standalone boolean NOT NULL DEFAULT true`,
  );
  await ensureColumn(
    "available_as_upsell",
    `ALTER TABLE packages ADD COLUMN available_as_upsell boolean NOT NULL DEFAULT false`,
  );

  // 5. Junction table
  const tblExists = await db.execute(sql`
    SELECT to_regclass('public.package_upsell_dependencies') AS t
  `);
  const hasTbl = !!(tblExists as any).rows?.[0]?.t;
  if (!hasTbl) {
    await exec(
      "CREATE TABLE package_upsell_dependencies",
      sql`
        CREATE TABLE package_upsell_dependencies (
          id serial PRIMARY KEY,
          tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          upsell_package_id integer NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
          parent_package_id integer NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
          created_at timestamp DEFAULT now()
        )
      `,
    );
    await exec(
      "CREATE UNIQUE INDEX package_upsell_dep_pair_unique",
      sql`CREATE UNIQUE INDEX package_upsell_dep_pair_unique ON package_upsell_dependencies (upsell_package_id, parent_package_id)`,
    );
    await exec(
      "CREATE INDEX package_upsell_dep_tenant",
      sql`CREATE INDEX package_upsell_dep_tenant ON package_upsell_dependencies (tenant_id)`,
    );
    await exec(
      "CREATE INDEX package_upsell_dep_parent",
      sql`CREATE INDEX package_upsell_dep_parent ON package_upsell_dependencies (parent_package_id)`,
    );
  } else {
    console.log("[skip] package_upsell_dependencies table already exists");
  }

  // 6. Backfill values (only when running for real and only where needed)
  const all = await db.select().from(packages);
  let cohort = 0;
  let simple = 0;
  let updated = 0;
  for (const p of all) {
    const looksLikeCohort =
      (p.classroomHoursRequired ?? 0) > 0 ||
      (p.driveHoursRequired ?? 0) > 0;
    const kind: "COHORT_BASED" | "SIMPLE" = looksLikeCohort ? "COHORT_BASED" : "SIMPLE";
    const sellableStandalone = !p.isAddOn;
    const availableAsUpsell = !!p.isAddOn;
    if (kind === "COHORT_BASED") cohort++;
    else simple++;
    const needsChange =
      p.kind !== kind ||
      p.sellableStandalone !== sellableStandalone ||
      p.availableAsUpsell !== availableAsUpsell;
    if (!needsChange) continue;
    updated++;
    console.log(
      `pkg #${p.id} "${p.name}" → kind=${kind} sellable=${sellableStandalone} upsell=${availableAsUpsell}`,
    );
    if (!DRY_RUN) {
      await db
        .update(packages)
        .set({ kind, sellableStandalone, availableAsUpsell })
        .where(eq(packages.id, p.id));
    }
  }
  console.log(
    `Done. total=${all.length} cohort=${cohort} simple=${simple} updated=${updated}${DRY_RUN ? " (dry-run)" : ""}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
