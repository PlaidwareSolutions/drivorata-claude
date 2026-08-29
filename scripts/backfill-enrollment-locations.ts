/**
 * One-off backfill for task #86.
 *
 * Fixes enrollments that landed with location_id = NULL because the cart
 * carried no explicit locationId, even though the booked offering itself
 * was tied to a specific location. Going forward, this is prevented by the
 * inheritance logic in storage.createCartEnrollmentsAndBookAtomic; this
 * script repairs already-persisted rows so the admin Enrollments page no
 * longer shows "Not assigned" for them.
 *
 * The script intentionally repairs every qualifying historical row, not a
 * specific id, so any future-discovered rows that match the same shape are
 * also fixed if the script is re-run.
 *
 * Usage (one-time, against the target DB):
 *   DATABASE_URL=$PROD_DATABASE_URL npx tsx scripts/backfill-enrollment-locations.ts
 *
 * Idempotent: re-running it after all rows are repaired updates 0 rows.
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE enrollments e
       SET location_id = o.location_id, updated_at = NOW()
      FROM schedule_offerings o
     WHERE e.location_id IS NULL
       AND e.offering_id IS NOT NULL
       AND o.id = e.offering_id
       AND o.location_id IS NOT NULL
     RETURNING e.id, e.tenant_id, e.first_name, e.last_name, e.location_id
  `);
  // drizzle's `execute` returns a result whose row shape depends on the
  // underlying driver; print whatever we got so the operator can audit.
  const rows = (result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  const count = Array.isArray(rows) ? rows.length : 0;
  console.log(`Backfill complete. Rows updated: ${count}`);
  if (count > 0) {
    console.log(JSON.stringify(rows, null, 2));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
