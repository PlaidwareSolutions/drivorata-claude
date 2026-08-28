/**
 * One-off loader for All Ages Driving School (tenant 28) Pasadena + Cypress
 * Summer 2026 - Feb 2027 schedule. Idempotent: dedupes by package name and by
 * (location, package, offering name).
 *
 * Usage:
 *   DATABASE_URL=<prod-url> npx tsx server/load-all-ages-summer-2026.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { buildOccurrences, type Occurrence } from "@shared/recurrence";
import crypto from "crypto";
import { db } from "./db";
import {
  locations,
  packages,
  packageLocations,
  scheduleOfferings,
  scheduleSessions,
  tenants,
  type InsertPackage,
  type InsertScheduleOffering,
  type InsertScheduleSession,
} from "@shared/schema";

const TENANT_ID = 28;
const LOC_PASADENA = 27;
const LOC_CYPRESS = 26;

type Counter = { created: number; existed: number };
const stats: Record<string, Counter> = {};
const bump = (k: string, c: boolean) => {
  const s = (stats[k] ??= { created: 0, existed: 0 });
  if (c) s.created++; else s.existed++;
};

async function preflight() {
  const t = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, TENANT_ID));
  if (t.length === 0) throw new Error(`Tenant ${TENANT_ID} not found`);
  if (!/all ages/i.test(t[0].name)) {
    throw new Error(`Tenant ${TENANT_ID} name "${t[0].name}" does not look like "All Ages Driving School" — refusing to write.`);
  }
  const locs = await db.select({ id: locations.id, name: locations.name, address: locations.address, city: locations.city })
    .from(locations).where(eq(locations.tenantId, TENANT_ID));
  const pas = locs.find(l => l.id === LOC_PASADENA);
  const cyp = locs.find(l => l.id === LOC_CYPRESS);
  if (!pas) throw new Error(`Pasadena location ${LOC_PASADENA} missing`);
  if (!cyp) throw new Error(`Cypress location ${LOC_CYPRESS} missing`);
  if (!/pasadena/i.test(pas.city ?? "") && !/pasadena/i.test(pas.name)) {
    throw new Error(`Location ${LOC_PASADENA} ("${pas.name}", city="${pas.city}") does not look like Pasadena — refusing to write.`);
  }
  if (!/cypress/i.test(cyp.city ?? "") && !/cypress/i.test(cyp.name)) {
    throw new Error(`Location ${LOC_CYPRESS} ("${cyp.name}", city="${cyp.city}") does not look like Cypress — refusing to write.`);
  }
  console.log(`  Tenant: ${t[0].name}`);
  console.log(`  Pasadena: ${pas.name} (${pas.address})`);
  console.log(`  Cypress:  ${cyp.name} (${cyp.address})`);
}

// ---------- Packages ----------

type PackageSeed = Omit<InsertPackage, "tenantId"> & {
  scopeLocationIds?: number[]; // for SPECIFIC_LOCATIONS
};

const PKG_TEEN_PASADENA = "Teen Drivers Ed — Pasadena (Summer 2026)";
const PKG_TEEN_CYPRESS = "Teen Drivers Ed — Cypress (Summer 2026)";
const PKG_ROAD_TEST = "Road Test (Available Daily)";
const PKG_ADDON_RT = "Road Test Add-On";
const PKG_ADDON_SCHOOLCAR_PASADENA = "School Car — Pasadena";
const PKG_ADDON_SCHOOLCAR_CYPRESS = "School Car — Cypress";

const PACKAGE_SEEDS: PackageSeed[] = [
  {
    name: PKG_TEEN_PASADENA,
    description: "Teen (14-17) Texas TDLR Approved Drivers Ed at our Pasadena location. 24 hrs classroom, 14 hrs in car (7 driving / 7 observation), 3x permit exam.",
    price: 41000,
    classroomHoursRequired: 24,
    driveHoursRequired: 14,
    requiresPermit: true,
    ageMin: 14,
    ageMax: 17,
    creditClassroom: 24,
    creditDrive: 7,
    features: ["Texas TDLR Approved", "24 classroom hours", "14 in-car hours", "3x permit exam"],
    active: true,
    isAddOn: false,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    sortOrder: 200,
    scopeLocationIds: [LOC_PASADENA],
  },
  {
    name: PKG_TEEN_CYPRESS,
    description: "Teen (14-17) Texas TDLR Approved Drivers Ed at our Cypress location. 24 hrs classroom, 14 hrs in car (7 driving / 7 observation), 3x permit exam.",
    price: 37500,
    classroomHoursRequired: 24,
    driveHoursRequired: 14,
    requiresPermit: true,
    ageMin: 14,
    ageMax: 17,
    creditClassroom: 24,
    creditDrive: 7,
    features: ["Texas TDLR Approved", "24 classroom hours", "14 in-car hours", "3x permit exam"],
    active: true,
    isAddOn: false,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    sortOrder: 210,
    scopeLocationIds: [LOC_CYPRESS],
  },
  {
    name: PKG_ROAD_TEST,
    description: "DPS-authorized Texas TDLR Approved road test. Available daily at both locations.",
    price: 12500,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 16,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 1,
    features: ["DPS Road Test Authorized Center", "Available daily", "Texas TDLR Approved"],
    active: true,
    isAddOn: false,
    locationScopeMode: "ALL_LOCATIONS",
    sortOrder: 220,
  },
  {
    name: PKG_ADDON_RT,
    description: "Add a Texas TDLR Approved road test to your Teen Drivers Ed package.",
    price: 9000,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 14,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 0,
    features: ["Texas TDLR Approved road test"],
    active: true,
    isAddOn: true,
    locationScopeMode: "ALL_LOCATIONS",
    sortOrder: 230,
  },
  {
    name: PKG_ADDON_SCHOOLCAR_PASADENA,
    description: "Use one of our school cars for your road test (Pasadena).",
    price: 4500,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 14,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 0,
    features: ["School car at Pasadena"],
    active: true,
    isAddOn: true,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    sortOrder: 240,
    scopeLocationIds: [LOC_PASADENA],
  },
  {
    name: PKG_ADDON_SCHOOLCAR_CYPRESS,
    description: "Use one of our school cars for your road test (Cypress).",
    price: 3500,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 14,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 0,
    features: ["School car at Cypress"],
    active: true,
    isAddOn: true,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    sortOrder: 250,
    scopeLocationIds: [LOC_CYPRESS],
  },
];

async function seedPackages(): Promise<Map<string, number>> {
  const existing = await db.select({ id: packages.id, name: packages.name })
    .from(packages).where(eq(packages.tenantId, TENANT_ID));
  const byName = new Map(existing.map(p => [p.name, p.id]));
  for (const seed of PACKAGE_SEEDS) {
    const { scopeLocationIds, ...pkg } = seed;
    let pkgId: number;
    if (byName.has(seed.name)) {
      pkgId = byName.get(seed.name)!;
      bump("packages", false);
    } else {
      const [created] = await db.insert(packages).values({ ...pkg, tenantId: TENANT_ID })
        .returning({ id: packages.id });
      pkgId = created.id;
      byName.set(seed.name, pkgId);
      bump("packages", true);
    }
    if (scopeLocationIds && scopeLocationIds.length > 0) {
      const links = scopeLocationIds.map(lid => ({ tenantId: TENANT_ID, packageId: pkgId, locationId: lid }));
      await db.insert(packageLocations).values(links).onConflictDoNothing();
    }
  }
  return byName;
}

// ---------- Offerings + classroom sessions ----------

type CohortRow = {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  startTime: string; // HH:MM 24h
  endTime: string;
  pattern: "MON-THUR" | "M-F" | "7 DAYS";
  comment?: string;
};

const PASADENA_ROWS: CohortRow[] = [
  { startDate: "2026-05-04", endDate: "2026-05-21", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR" },
  { startDate: "2026-05-25", endDate: "2026-06-09", startTime: "12:00", endTime: "14:00", pattern: "M-F" },
  { startDate: "2026-06-01", endDate: "2026-06-16", startTime: "18:00", endTime: "20:00", pattern: "M-F" },
  { startDate: "2026-06-15", endDate: "2026-06-30", startTime: "16:00", endTime: "18:00", pattern: "M-F" },
  { startDate: "2026-06-15", endDate: "2026-06-30", startTime: "12:00", endTime: "14:00", pattern: "M-F" },
  { startDate: "2026-06-22", endDate: "2026-07-07", startTime: "18:00", endTime: "20:00", pattern: "M-F" },
  { startDate: "2026-07-06", endDate: "2026-07-21", startTime: "16:00", endTime: "18:00", pattern: "M-F" },
  { startDate: "2026-07-13", endDate: "2026-07-28", startTime: "12:00", endTime: "14:00", pattern: "M-F" },
  { startDate: "2026-07-13", endDate: "2026-07-28", startTime: "18:00", endTime: "20:00", pattern: "M-F" },
  { startDate: "2026-07-27", endDate: "2026-08-11", startTime: "16:00", endTime: "18:00", pattern: "M-F" },
  { startDate: "2026-07-29", endDate: "2026-08-09", startTime: "12:00", endTime: "14:00", pattern: "7 DAYS" },
  { startDate: "2026-08-03", endDate: "2026-08-20", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR" },
  { startDate: "2026-09-07", endDate: "2026-09-24", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR" },
  { startDate: "2026-10-05", endDate: "2026-10-22", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR" },
  { startDate: "2026-11-02", endDate: "2026-11-19", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR" },
  { startDate: "2026-12-07", endDate: "2026-12-23", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR", comment: "1- FRIDAY CLASS (12/18)" },
  { startDate: "2026-12-19", endDate: "2026-12-31", startTime: "13:00", endTime: "15:00", pattern: "7 DAYS", comment: "WINTER BREAK — 12/25 NO CLASS" },
  { startDate: "2027-01-04", endDate: "2027-01-21", startTime: "18:00", endTime: "20:00", pattern: "MON-THUR" },
];

const CYPRESS_ROWS: CohortRow[] = [
  { startDate: "2026-05-04", endDate: "2026-05-21", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
  { startDate: "2026-05-25", endDate: "2026-06-09", startTime: "10:00", endTime: "12:00", pattern: "M-F" },
  { startDate: "2026-06-01", endDate: "2026-06-16", startTime: "18:00", endTime: "20:00", pattern: "M-F" },
  { startDate: "2026-06-15", endDate: "2026-06-30", startTime: "16:00", endTime: "18:00", pattern: "M-F" },
  { startDate: "2026-06-15", endDate: "2026-06-30", startTime: "10:00", endTime: "12:00", pattern: "M-F" },
  { startDate: "2026-06-22", endDate: "2026-07-07", startTime: "18:00", endTime: "20:00", pattern: "M-F" },
  { startDate: "2026-07-06", endDate: "2026-07-21", startTime: "16:00", endTime: "18:00", pattern: "M-F" },
  { startDate: "2026-07-13", endDate: "2026-07-28", startTime: "10:00", endTime: "12:00", pattern: "M-F" },
  { startDate: "2026-07-13", endDate: "2026-07-28", startTime: "18:00", endTime: "20:00", pattern: "M-F" },
  { startDate: "2026-07-27", endDate: "2026-08-11", startTime: "16:00", endTime: "18:00", pattern: "M-F" },
  { startDate: "2026-07-29", endDate: "2026-08-09", startTime: "10:00", endTime: "12:00", pattern: "7 DAYS" },
  { startDate: "2026-08-03", endDate: "2026-08-20", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
  { startDate: "2026-09-07", endDate: "2026-09-24", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
  { startDate: "2026-10-05", endDate: "2026-10-22", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
  { startDate: "2026-11-02", endDate: "2026-11-19", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
  { startDate: "2026-12-07", endDate: "2026-12-23", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR", comment: "1- FRIDAY CLASS (12/18)" },
  { startDate: "2026-12-19", endDate: "2026-12-31", startTime: "13:00", endTime: "15:00", pattern: "7 DAYS", comment: "WINTER BREAK — 12/25 NO CLASS" },
  { startDate: "2027-01-04", endDate: "2027-01-21", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
  { startDate: "2027-02-01", endDate: "2027-02-18", startTime: "19:00", endTime: "21:00", pattern: "MON-THUR" },
];

function patternDays(p: CohortRow["pattern"]): number[] {
  if (p === "MON-THUR") return [1, 2, 3, 4];
  if (p === "M-F") return [1, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4, 5, 6];
}

function buildOccurrencesForRow(row: CohortRow): Occurrence[] {
  return buildOccurrences({
    daysOfWeek: patternDays(row.pattern),
    startTime: row.startTime,
    endTime: row.endTime,
    startDate: row.startDate,
    endDate: row.endDate,
  });
}

function applySpecialCases(row: CohortRow, occs: { startAt: Date; endAt: Date }[]): { startAt: Date; endAt: Date }[] {
  // Pasadena/Cypress 12/19-12/31 7 DAYS: skip 12/25.
  if (row.startDate === "2026-12-19" && row.endDate === "2026-12-31") {
    return occs.filter(o => !(o.startAt.getMonth() === 11 && o.startAt.getDate() === 25));
  }
  // Pasadena/Cypress 12/7-12/23 MON-THUR + 1 Friday (12/18).
  if (row.startDate === "2026-12-07" && row.endDate === "2026-12-23") {
    const [sh, sm] = row.startTime.split(":").map(Number);
    const [eh, em] = row.endTime.split(":").map(Number);
    const friday = {
      startAt: new Date(2026, 11, 18, sh, sm),
      endAt: new Date(2026, 11, 18, eh, em),
    };
    const next = [...occs, friday].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    return next;
  }
  return occs;
}

function offeringName(row: CohortRow): string {
  const d = new Date(`${row.startDate}T00:00:00`);
  const monthDay = d.toLocaleString("en-US", { month: "short", day: "numeric" });
  const year = d.getFullYear();
  const fmtT = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
  };
  return `Teen Classroom — ${monthDay} ${year}, ${fmtT(row.startTime)}–${fmtT(row.endTime)} (${row.pattern})`;
}

async function seedOfferings(
  rows: CohortRow[],
  locationId: number,
  packageId: number,
  packageName: string,
) {
  const existing = await db
    .select({ id: scheduleOfferings.id, name: scheduleOfferings.name, locationId: scheduleOfferings.locationId })
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.tenantId, TENANT_ID));
  const existingByKey = new Map(existing.map(o => [`${o.locationId}::${o.name}`, o.id]));

  for (const row of rows) {
    const name = offeringName(row);
    const key = `${locationId}::${name}`;
    let offeringId: number;
    let occs = buildOccurrencesForRow(row);
    occs = applySpecialCases(row, occs);
    if (occs.length === 0) {
      console.warn(`  ⚠ ${name}: 0 occurrences, skipped`);
      continue;
    }
    const startsAt = occs[0].startAt;
    const endsAt = occs[occs.length - 1].endAt;

    if (existingByKey.has(key)) {
      offeringId = existingByKey.get(key)!;
      bump("offerings", false);
    } else {
      const insert: InsertScheduleOffering = {
        tenantId: TENANT_ID,
        packageId,
        locationId,
        instructorId: null,
        name,
        description: row.comment ?? null,
        capacity: 10,
        startsAt,
        endsAt,
        status: "PUBLISHED",
        notes: null,
      };
      const [created] = await db.insert(scheduleOfferings).values(insert).returning({ id: scheduleOfferings.id });
      offeringId = created.id;
      bump("offerings", true);
      if (occs.length !== 12) {
        console.warn(`  ⚠ ${name}: produced ${occs.length} sessions (expected 12)`);
      }
    }

    // Sessions: per-slot dedup via notes signature.
    const tagPrefix = `seed:allages2026:${offeringId}:`;
    const existingSessions = await db
      .select({ notes: scheduleSessions.notes })
      .from(scheduleSessions)
      .where(and(eq(scheduleSessions.tenantId, TENANT_ID), eq(scheduleSessions.offeringId, offeringId)));
    const existingTags = new Set(existingSessions.map(s => s.notes).filter((n): n is string => !!n));

    const groupId = `cls-${offeringId}`;
    const newRows: InsertScheduleSession[] = [];
    for (const o of occs) {
      const tag = `${tagPrefix}${o.startAt.toISOString()}`;
      if (existingTags.has(tag)) {
        bump("sessions", false);
        continue;
      }
      newRows.push({
        tenantId: TENANT_ID,
        type: "CLASSROOM",
        instructorId: null,
        locationId,
        vehicleId: null,
        startAt: o.startAt,
        endAt: o.endAt,
        capacity: 10,
        status: "SCHEDULED",
        notes: tag,
        recurrenceGroupId: groupId,
        offeringId,
        componentType: "IN_CLASS",
        enrollmentId: null,
        rescheduledFromSessionId: null,
      });
    }
    if (newRows.length > 0) {
      await db.insert(scheduleSessions).values(newRows);
      for (const _ of newRows) bump("sessions", true);
    }
  }
}

// ---------- Main ----------

async function main() {
  console.log(`Loading All Ages Driving School Summer 2026 schedule into tenant ${TENANT_ID}…`);
  await preflight();
  const pkgByName = await seedPackages();
  const teenPasadena = pkgByName.get(PKG_TEEN_PASADENA);
  const teenCypress = pkgByName.get(PKG_TEEN_CYPRESS);
  if (!teenPasadena || !teenCypress) throw new Error("Failed to resolve Teen package ids");

  console.log(`\nPasadena: ${PASADENA_ROWS.length} cohorts`);
  await seedOfferings(PASADENA_ROWS, LOC_PASADENA, teenPasadena, PKG_TEEN_PASADENA);
  console.log(`Cypress: ${CYPRESS_ROWS.length} cohorts`);
  await seedOfferings(CYPRESS_ROWS, LOC_CYPRESS, teenCypress, PKG_TEEN_CYPRESS);

  console.log("\nSummary:");
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(22)} created=${v.created}  existed=${v.existed}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error("Load failed:", err);
  process.exit(1);
});
