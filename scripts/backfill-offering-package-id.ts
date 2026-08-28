/**
 * Migration & backfill: schedule_offerings.package_id 1:N
 *
 * Safely migrates existing data from the legacy `offering_packages` junction
 * table to the new required `schedule_offerings.package_id` foreign key.
 *
 * Steps (idempotent):
 *   1. Add nullable `schedule_offerings.package_id` column (if missing).
 *   2. Backfill from `offering_packages`:
 *        - Single linked package      -> use it.
 *        - Multi-linked anomaly       -> deterministic: lowest package_id wins,
 *                                       and a report row is logged.
 *        - No link                    -> reported; left NULL (manual fix).
 *   3. Verify zero offerings with NULL package_id; abort otherwise.
 *   4. Set NOT NULL + add FK (ON DELETE RESTRICT) + index (if missing).
 *   5. Drop `offering_packages` table.
 *
 * Run with: npx tsx scripts/backfill-offering-package-id.ts
 * Dry-run:  DRY_RUN=1 npx tsx scripts/backfill-offering-package-id.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

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
  console.log(`Starting offering->package backfill (dry_run=${DRY_RUN})`);

  // Pre-check: junction table exists?
  const junctionExists = await db.execute(sql`
    SELECT to_regclass('public.offering_packages') AS t
  `);
  const hasJunction = !!(junctionExists as any).rows?.[0]?.t;

  // Pre-check: package_id column exists?
  const colCheck = await db.execute(sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'schedule_offerings' AND column_name = 'package_id'
  `);
  const colRow = (colCheck as any).rows?.[0];
  const colExists = !!colRow;
  const colNullable = colRow?.is_nullable === "YES";

  // Step 1: add nullable column
  if (!colExists) {
    await exec(
      "ALTER TABLE schedule_offerings ADD COLUMN package_id INTEGER",
      sql`ALTER TABLE schedule_offerings ADD COLUMN package_id INTEGER`,
    );
  } else {
    console.log("schedule_offerings.package_id column already exists");
  }

  // Step 2: backfill (only if junction still exists)
  if (hasJunction) {
    const linkRows = await db.execute(sql`
      SELECT offering_id, MIN(package_id) AS package_id, COUNT(*) AS n
      FROM offering_packages
      GROUP BY offering_id
    `);
    const rows = (linkRows as any).rows as { offering_id: number; package_id: number; n: number }[];
    const multiLinks = rows.filter((r) => Number(r.n) > 1);
    if (multiLinks.length > 0) {
      console.warn(
        `WARN: ${multiLinks.length} offering(s) had multiple package links — using lowest package_id deterministically:`,
      );
      for (const r of multiLinks) {
        console.warn(`  offering_id=${r.offering_id} chosen package_id=${r.package_id}`);
      }
    }

    for (const r of rows) {
      await exec(
        `backfill offering_id=${r.offering_id} -> package_id=${r.package_id}`,
        sql`
          UPDATE schedule_offerings
             SET package_id = ${r.package_id}
           WHERE id = ${r.offering_id}
             AND package_id IS NULL
        `,
      );
    }
  } else {
    console.log("offering_packages junction table not present — skipping backfill");
  }

  // Step 3: verify zero NULLs
  const nullsCheck = await db.execute(sql`
    SELECT id, tenant_id, name FROM schedule_offerings WHERE package_id IS NULL
  `);
  const orphans = (nullsCheck as any).rows as { id: number; tenant_id: number; name: string }[];
  if (orphans.length > 0) {
    console.error(`ABORT: ${orphans.length} offering(s) have no package link. Resolve manually:`);
    for (const o of orphans) {
      console.error(`  id=${o.id} tenant_id=${o.tenant_id} name=${o.name}`);
    }
    if (!DRY_RUN) process.exit(1);
  } else {
    console.log("Verified: all offerings have a package_id");
  }

  // Step 4: NOT NULL + FK + index
  if (colNullable || !colExists) {
    await exec(
      "ALTER TABLE schedule_offerings ALTER COLUMN package_id SET NOT NULL",
      sql`ALTER TABLE schedule_offerings ALTER COLUMN package_id SET NOT NULL`,
    );
  }

  // Add FK if not present
  const fkCheck = await db.execute(sql`
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'schedule_offerings'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'schedule_offerings_package_id_fk'
  `);
  if (((fkCheck as any).rows ?? []).length === 0) {
    await exec(
      "ADD CONSTRAINT schedule_offerings_package_id_fk",
      sql`
        ALTER TABLE schedule_offerings
        ADD CONSTRAINT schedule_offerings_package_id_fk
        FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT
      `,
    );
  }

  await exec(
    "CREATE INDEX IF NOT EXISTS schedule_offerings_package_id_idx",
    sql`CREATE INDEX IF NOT EXISTS schedule_offerings_package_id_idx ON schedule_offerings(package_id)`,
  );

  // Step 5: drop junction
  if (hasJunction) {
    await exec("DROP TABLE offering_packages", sql`DROP TABLE offering_packages`);
  }

  console.log("Backfill + migration complete.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("Migration failed:", err);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
