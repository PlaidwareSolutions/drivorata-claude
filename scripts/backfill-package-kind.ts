import { db } from "../server/db";
import { packages } from "@shared/schema";
import { eq } from "drizzle-orm";

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  const all = await db.select().from(packages);
  let cohort = 0;
  let simple = 0;
  let updated = 0;
  for (const p of all) {
    const looksLikeCohort =
      (p.classroomHoursRequired ?? 0) > 0 ||
      (p.driveHoursRequired ?? 0) > 0;
    const kind = looksLikeCohort ? "COHORT_BASED" : "SIMPLE";
    const sellableStandalone = !p.isAddOn;
    const availableAsUpsell = !!p.isAddOn;
    if (kind === "COHORT_BASED") cohort++; else simple++;
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
