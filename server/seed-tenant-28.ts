/**
 * Seed sample data for tenant 28 ("All Ages Driving School").
 *
 * Idempotent: dedupe key for every entity is `name + tenantId (+ locationId)`.
 * Re-running the script will report 0 new rows after the first successful pass.
 *
 * Usage:
 *   DATABASE_URL=<production-url> npx tsx server/seed-tenant-28.ts
 *
 * Scope is hard-coded to tenant 28 with locations 26 (Cypress, TX) and
 * 27 (Pasadena, TX). The script aborts if those rows are missing.
 */
import { and, eq, inArray, isNull, ne, notLike, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  locations,
  onlineCourses,
  packageComponents,
  packages,
  promotions,
  scheduleOfferings,
  scheduleSessions,
  tenantMembers,
  tenants,
  vehicles,
  type InsertPackage,
  type InsertPackageComponent,
  type InsertScheduleOffering,
  type InsertScheduleSession,
  type InsertVehicle,
  type InsertOnlineCourse,
  type InsertPromotion,
} from "@shared/schema";
import crypto from "crypto";

const TENANT_ID = 28;
const LOC_CYPRESS = 26;
const LOC_PASADENA = 27;
const SUGAR_LAND_LOCATION_NAME = "Sugar Land, TX";

type Counter = { created: number; existed: number };
const stats: Record<string, Counter> = {};
function bump(key: string, created: boolean) {
  const s = (stats[key] ??= { created: 0, existed: 0 });
  if (created) s.created++;
  else s.existed++;
}

async function preflight() {
  // Narrow column reads — production schema may lag dev for unrelated columns.
  const t = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, TENANT_ID));
  if (t.length === 0) throw new Error(`Tenant ${TENANT_ID} not found.`);
  const locs = await db.select({ id: locations.id }).from(locations).where(eq(locations.tenantId, TENANT_ID));
  const cyp = locs.find((l) => l.id === LOC_CYPRESS);
  const pas = locs.find((l) => l.id === LOC_PASADENA);
  if (!cyp || !pas) throw new Error(`Expected locations ${LOC_CYPRESS} (Cypress) and ${LOC_PASADENA} (Pasadena) on tenant ${TENANT_ID}.`);

  // Production baseline (per task plan): packages 52-60, vehicles 62-66,
  // Sarah Mitchell active, and at least 7 cohorts already exist.
  const pkgRows = await db.select({ id: packages.id }).from(packages).where(eq(packages.tenantId, TENANT_ID));
  const pkgIds = new Set(pkgRows.map((r) => r.id));
  const expectedPkgIds = [52, 53, 54, 55, 56, 57, 58, 59, 60];
  const missingPkgs = expectedPkgIds.filter((id) => !pkgIds.has(id));
  if (missingPkgs.length > 0) {
    throw new Error(`Expected packages [${expectedPkgIds.join(", ")}] on tenant ${TENANT_ID}; missing: [${missingPkgs.join(", ")}].`);
  }
  const vehRows = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.tenantId, TENANT_ID));
  const vehIds = new Set(vehRows.map((r) => r.id));
  const expectedVehIds = [62, 63, 64, 65, 66];
  const missingVehs = expectedVehIds.filter((id) => !vehIds.has(id));
  if (missingVehs.length > 0) {
    throw new Error(`Expected vehicles [${expectedVehIds.join(", ")}] on tenant ${TENANT_ID}; missing: [${missingVehs.join(", ")}].`);
  }
  const instructors = await db
    .select({
      userId: tenantMembers.userId,
      locationScope: tenantMembers.locationScope,
      active: tenantMembers.active,
      firstName: tenantMembers.firstName,
      lastName: tenantMembers.lastName,
    })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, TENANT_ID), eq(tenantMembers.role, "instructor")));
  const active = instructors.filter((i) => i.active && i.userId);
  if (active.length === 0) throw new Error(`No active instructor members on tenant ${TENANT_ID}.`);
  const sarah = active.find((i) => i.firstName === "Sarah" && i.lastName === "Mitchell");
  if (!sarah) {
    throw new Error(`Expected active instructor "Sarah Mitchell" on tenant ${TENANT_ID}.`);
  }
  // Offering count is allowed to grow as the seeder runs; just require the
  // pre-seed baseline of at least 7 to still be present.
  const offRows = await db.select({ id: scheduleOfferings.id }).from(scheduleOfferings).where(eq(scheduleOfferings.tenantId, TENANT_ID));
  if (offRows.length < 7) {
    throw new Error(`Expected at least 7 existing offerings on tenant ${TENANT_ID}; found ${offRows.length}.`);
  }
  return { tenantName: t[0].name, activeInstructors: active };
}

// If no active instructor's locationScope covers a location we'll seed for,
// fail fast with a clear instruction rather than silently attaching cohorts
// to an instructor without authority.
function ensureInstructorCoverage(
  active: Array<{ userId: string | null; locationScope: number[] | "ALL" | null }>,
  locationIds: number[],
) {
  for (const locId of locationIds) {
    const covered = active.find((m) =>
      m.locationScope === "ALL" || m.locationScope === null || (Array.isArray(m.locationScope) && m.locationScope.includes(locId)),
    );
    if (!covered) {
      throw new Error(
        `No active instructor on tenant ${TENANT_ID} has locationScope covering location ${locId}. ` +
          `Either set Sarah Mitchell's locationScope to "ALL" or add ${locId} to her scope array, then re-run.`,
      );
    }
  }
}

function pickInstructorByLocation(
  active: Array<{ userId: string | null; locationScope: number[] | "ALL" | null }>,
  locationIds: number[],
): Record<number, string> {
  // Map each location to its preferred instructor (locationScope match), falling back to the first active instructor.
  const fallback = active[0].userId as string;
  const matches = (m: typeof active[number], locId: number) =>
    m.locationScope === "ALL" || m.locationScope === null || (Array.isArray(m.locationScope) && m.locationScope.includes(locId));
  const result: Record<number, string> = {};
  for (const locId of locationIds) {
    result[locId] = active.find((m) => matches(m, locId))?.userId ?? fallback;
  }
  return result;
}

// ---------- Sugar Land location ----------

async function seedSugarLandLocation(): Promise<number> {
  const existing = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.tenantId, TENANT_ID));
  const found = existing.find((l) => l.name === SUGAR_LAND_LOCATION_NAME);
  if (found) {
    bump("locations", false);
    return found.id;
  }
  const [created] = await db
    .insert(locations)
    .values({
      tenantId: TENANT_ID,
      name: SUGAR_LAND_LOCATION_NAME,
      address: "15500 Voss Rd #224",
      city: "Sugar Land",
      state: "TX",
      zip: "77498",
      countryCode: "US",
      timezone: "America/Chicago",
      active: true,
    })
    .returning({ id: locations.id });
  bump("locations", true);
  return created.id;
}

async function seedSugarLandVehicles(sugarLandId: number, vehicleByName: Map<string, number>) {
  const seeds: Array<Omit<InsertVehicle, "tenantId">> = [
    { locationId: sugarLandId, name: "Sugar Land 1", make: "Toyota", model: "Corolla", year: 2024, plate: "TX-SUG-1A", color: "White", status: "ACTIVE" },
    { locationId: sugarLandId, name: "Sugar Land 2", make: "Honda", model: "Civic", year: 2025, plate: "TX-SUG-2B", color: "Silver", status: "ACTIVE" },
  ];
  for (const seed of seeds) {
    if (vehicleByName.has(seed.name)) {
      bump("vehicles", false);
      continue;
    }
    const [created] = await db
      .insert(vehicles)
      .values({ ...seed, tenantId: TENANT_ID })
      .returning({ id: vehicles.id });
    vehicleByName.set(seed.name, created.id);
    bump("vehicles", true);
  }
}

async function deleteStraySessions() {
  // Delete pre-existing CLASSROOM sessions on tenant 28 that are *unequivocally* stray:
  //   - offeringId IS NULL (not part of any cohort)
  //   - enrollmentId IS NULL (not booked by a student)
  //   - recurrenceGroupId IS NULL (not part of a generated batch)
  //   - bookedCount = 0
  //   - status = SCHEDULED
  //   - notes IS NULL OR notes does not start with 'seed:' (i.e. not seeded by us)
  // This deterministically catches the original orphan classroom row without
  // depending on a brittle hardcoded id, while refusing to touch any session
  // that has a student, an offering, or a seed signature.
  const candidates = await db
    .select({ id: scheduleSessions.id })
    .from(scheduleSessions)
    .where(
      and(
        eq(scheduleSessions.tenantId, TENANT_ID),
        eq(scheduleSessions.type, "CLASSROOM"),
        eq(scheduleSessions.status, "SCHEDULED"),
        eq(scheduleSessions.bookedCount, 0),
        isNull(scheduleSessions.offeringId),
        isNull(scheduleSessions.enrollmentId),
        isNull(scheduleSessions.recurrenceGroupId),
        or(isNull(scheduleSessions.notes), notLike(scheduleSessions.notes, "seed:%")),
      ),
    );
  if (candidates.length === 0) {
    bump("stray_session", false);
    return;
  }
  const ids = candidates.map((c) => c.id);
  await db.delete(scheduleSessions).where(inArray(scheduleSessions.id, ids));
  for (const _ of ids) bump("stray_session", true);
}

// ---------- Packages ----------

type PackageSeed = Omit<InsertPackage, "tenantId"> & { components?: Omit<InsertPackageComponent, "tenantId" | "packageId">[] };

const PACKAGE_SEEDS: PackageSeed[] = [
  {
    name: "Teen Drivers Ed (32-Hour TDLR Approved)",
    description: "Texas TDLR Approved 32-hour classroom + 14-hour behind-the-wheel course for teens ages 14-17. Includes parent-taught study guide and final road test.",
    price: 59500,
    classroomHoursRequired: 32,
    driveHoursRequired: 14,
    requiresPermit: true,
    ageMin: 14,
    ageMax: 17,
    creditClassroom: 32,
    creditDrive: 7,
    features: ["TDLR Approved", "Includes road test", "Permit prep included", "32 classroom hours", "14 drive hours"],
    active: true,
    isAddOn: false,
    sortOrder: 10,
    components: [
      { type: "ONLINE_PERMIT", label: "Online permit prep", hours: 4, quantity: 1, sortOrder: 0 },
      { type: "IN_CLASS", label: "In-class instruction", hours: 32, quantity: 1, sortOrder: 1 },
      { type: "BTW_OBSERVATION", label: "BTW observation", hours: 7, quantity: 7, sortOrder: 2 },
      { type: "BTW_PRACTICE", label: "BTW practice", hours: 7, quantity: 7, sortOrder: 3 },
      { type: "ROAD_TEST", label: "TDLR road test", hours: 1, quantity: 1, sortOrder: 4 },
      { type: "STUDY_GUIDE", label: "Parent-taught study guide", hours: 0, quantity: 1, sortOrder: 5 },
    ],
  },
  {
    name: "Adult Drivers Ed (6-Hour TDLR Approved)",
    description: "Texas TDLR Approved 6-hour classroom + 7-hour behind-the-wheel course for adults ages 18-24.",
    price: 29500,
    classroomHoursRequired: 6,
    driveHoursRequired: 7,
    requiresPermit: false,
    ageMin: 18,
    ageMax: 24,
    creditClassroom: 6,
    creditDrive: 4,
    features: ["TDLR Approved", "6 classroom hours", "7 drive hours", "Road test included"],
    active: true,
    isAddOn: false,
    sortOrder: 20,
    components: [
      { type: "IN_CLASS", label: "In-class instruction", hours: 6, quantity: 1, sortOrder: 0 },
      { type: "BTW_PRACTICE", label: "BTW practice", hours: 7, quantity: 4, sortOrder: 1 },
      { type: "ROAD_TEST", label: "Road test", hours: 1, quantity: 1, sortOrder: 2 },
    ],
  },
  {
    name: "Behind-the-Wheel Only (7-Hour)",
    description: "Drive hours only — for students who completed their classroom portion elsewhere. Includes 7 hours of in-car instruction.",
    price: 38500,
    classroomHoursRequired: 0,
    driveHoursRequired: 7,
    requiresPermit: true,
    ageMin: 16,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 4,
    features: ["7 drive hours", "Vehicle provided", "Flexible scheduling"],
    active: true,
    isAddOn: false,
    sortOrder: 30,
    components: [
      { type: "BTW_OBSERVATION", label: "BTW observation", hours: 3, quantity: 3, sortOrder: 0 },
      { type: "BTW_PRACTICE", label: "BTW practice", hours: 4, quantity: 4, sortOrder: 1 },
    ],
  },
  {
    name: "TDLR Road Test Only",
    description: "Texas TDLR Approved third-party road test. We administer and report your result to the DPS.",
    price: 9500,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 16,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 1,
    features: ["TDLR Approved third-party road test", "Same-day result", "DPS reporting"],
    active: true,
    isAddOn: false,
    sortOrder: 40,
    components: [
      { type: "ROAD_TEST", label: "Road test", hours: 1, quantity: 1, sortOrder: 0 },
    ],
  },
  {
    name: "Parent-Taught Drivers Ed Support",
    description: "Supplemental classroom + BTW package for families using the Texas Parent-Taught Drivers Ed (PTDE) program.",
    price: 24500,
    classroomHoursRequired: 6,
    driveHoursRequired: 4,
    requiresPermit: true,
    ageMin: 14,
    ageMax: 17,
    creditClassroom: 6,
    creditDrive: 2,
    features: ["PTDE-aligned", "Supplemental drive hours", "Parent guide included"],
    active: true,
    isAddOn: false,
    sortOrder: 50,
    components: [
      { type: "STUDY_GUIDE", label: "Parent-taught study guide", hours: 0, quantity: 1, sortOrder: 0 },
      { type: "IN_CLASS", label: "Supplemental classroom", hours: 6, quantity: 1, sortOrder: 1 },
      { type: "BTW_PRACTICE", label: "Supplemental BTW", hours: 4, quantity: 2, sortOrder: 2 },
    ],
  },
  // Add-ons
  {
    name: "Extra Drive Lesson (1 Hour)",
    description: "One additional 1-hour behind-the-wheel session with an instructor.",
    price: 8500,
    classroomHoursRequired: 0,
    driveHoursRequired: 1,
    requiresPermit: true,
    ageMin: 14,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 1,
    features: ["1 hour BTW", "Same instructor option"],
    active: true,
    isAddOn: true,
    sortOrder: 100,
  },
  {
    name: "Vehicle Rental for Road Test",
    description: "Rent one of our TDLR-approved vehicles for your DPS or third-party road test.",
    price: 6500,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 16,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 0,
    features: ["TDLR-approved vehicle", "Insurance included", "1-hour rental window"],
    active: true,
    isAddOn: true,
    sortOrder: 110,
  },
  {
    name: "Permit Practice Test Bundle",
    description: "Unlimited online practice tests covering Texas DPS permit material.",
    price: 3500,
    classroomHoursRequired: 0,
    driveHoursRequired: 0,
    requiresPermit: false,
    ageMin: 14,
    ageMax: 99,
    creditClassroom: 0,
    creditDrive: 0,
    features: ["Unlimited practice", "Mobile-friendly", "Texas DPS aligned"],
    active: true,
    isAddOn: true,
    sortOrder: 120,
  },
];

async function seedPackages(): Promise<Map<string, number>> {
  const existing = await db.select({ id: packages.id, name: packages.name }).from(packages).where(eq(packages.tenantId, TENANT_ID));
  const byName = new Map(existing.map((p) => [p.name, p.id]));
  for (const seed of PACKAGE_SEEDS) {
    if (byName.has(seed.name)) {
      bump("packages", false);
      continue;
    }
    const { components, ...pkgFields } = seed;
    const [created] = await db
      .insert(packages)
      .values({ ...pkgFields, tenantId: TENANT_ID })
      .returning({ id: packages.id });
    byName.set(seed.name, created.id);
    bump("packages", true);
    if (components && components.length > 0) {
      await db.insert(packageComponents).values(
        components.map((c) => ({ ...c, tenantId: TENANT_ID, packageId: created.id })),
      );
      for (const _ of components) bump("package_components", true);
    }
  }
  return byName;
}

// ---------- Vehicles ----------

const VEHICLE_SEEDS: Array<Omit<InsertVehicle, "tenantId">> = [
  { locationId: LOC_CYPRESS, name: "Cypress 1", make: "Toyota", model: "Corolla", year: 2023, plate: "TX-CYP-1A", color: "White", status: "ACTIVE" },
  { locationId: LOC_CYPRESS, name: "Cypress 2", make: "Honda", model: "Civic", year: 2024, plate: "TX-CYP-2B", color: "Silver", status: "ACTIVE" },
  { locationId: LOC_PASADENA, name: "Pasadena 1", make: "Nissan", model: "Sentra", year: 2023, plate: "TX-PAS-1A", color: "Blue", status: "ACTIVE" },
  { locationId: LOC_PASADENA, name: "Pasadena 2", make: "Toyota", model: "Camry", year: 2022, plate: "TX-PAS-2B", color: "Gray", status: "ACTIVE" },
  { locationId: LOC_PASADENA, name: "Pasadena 3", make: "Hyundai", model: "Elantra", year: 2024, plate: "TX-PAS-3C", color: "Black", status: "ACTIVE" },
];

async function seedVehicles(): Promise<Map<string, number>> {
  const existing = await db.select({ id: vehicles.id, name: vehicles.name }).from(vehicles).where(eq(vehicles.tenantId, TENANT_ID));
  const byName = new Map(existing.map((v) => [v.name, v.id]));
  for (const seed of VEHICLE_SEEDS) {
    if (byName.has(seed.name)) {
      bump("vehicles", false);
      continue;
    }
    const [created] = await db.insert(vehicles).values({ ...seed, tenantId: TENANT_ID }).returning({ id: vehicles.id });
    byName.set(seed.name, created.id);
    bump("vehicles", true);
  }
  return byName;
}

// ---------- Online courses ----------

const ONLINE_COURSE_SEEDS: Array<Omit<InsertOnlineCourse, "tenantId">> = [
  {
    name: "Texas Defensive Driving / Ticket Dismissal",
    description: "TDLR-approved 6-hour online defensive driving course. Dismiss a ticket or earn an insurance discount.",
    price: 3500,
    providerName: "myimprov.com",
    providerUrl: "https://www.myimprov.com/texas-defensive-driving/",
    imageUrl: null,
    active: true,
    sortOrder: 10,
  },
  {
    name: "Texas Adult Drivers Ed Online",
    description: "TDLR-approved adult drivers ed (ages 18-24) — fully online, complete at your own pace.",
    price: 8900,
    providerName: "Aceable",
    providerUrl: "https://www.aceable.com/drivers-ed/texas/adult/",
    imageUrl: null,
    active: true,
    sortOrder: 20,
  },
];

async function seedOnlineCourses() {
  const existing = await db.select({ name: onlineCourses.name }).from(onlineCourses).where(eq(onlineCourses.tenantId, TENANT_ID));
  const byName = new Set(existing.map((c) => c.name));
  for (const seed of ONLINE_COURSE_SEEDS) {
    if (byName.has(seed.name)) {
      bump("online_courses", false);
      continue;
    }
    await db.insert(onlineCourses).values({ ...seed, tenantId: TENANT_ID });
    bump("online_courses", true);
  }
}

// ---------- Offerings + sessions ----------

type DriveSlotPlan = {
  /** Which weekday the practice/observation/road-test slots run on (0=Sun..6=Sat). */
  daysOfWeek: number[];
  /** Local HH:MM start time of each generated drive block. */
  startTime: string;
  /** Hours per generated drive block (int). */
  blockHours: number;
  /** Component types to round-robin across the generated blocks. */
  componentTypes: Array<"BTW_OBSERVATION" | "BTW_PRACTICE" | "ROAD_TEST">;
  /** Vehicle names to round-robin across slots (must exist in vehicle seeds for this location). */
  vehicleNames: string[];
};

type OfferingSeed = {
  name: string;
  description: string;
  locationId: number;
  packageNames: string[];
  capacity: number;
  status: "PUBLISHED" | "FULL";
  startDate: string;
  endDate: string;
  daysOfWeek: number[]; // 0=Sun..6=Sat
  startTime: string; // HH:MM (local)
  endTime: string;
  /** If set, also generate behind-the-wheel / road-test sessions tied to this offering. */
  driveSlots?: DriveSlotPlan;
  /** If false, do not generate classroom sessions (e.g. BTW-only or road-test-only cohorts). */
  generateClassroom?: boolean;
};

const OFFERING_SEEDS: OfferingSeed[] = [
  {
    name: "Teen Summer 2026 — Cypress",
    description: "Six-week teen drivers ed cohort, evenings Mon/Wed/Fri.",
    locationId: LOC_CYPRESS,
    packageNames: ["Teen Drivers Ed (32-Hour TDLR Approved)"],
    capacity: 16,
    status: "PUBLISHED",
    startDate: "2026-05-18",
    endDate: "2026-06-26",
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
    driveSlots: {
      daysOfWeek: [6], // Saturdays
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
      vehicleNames: ["Cypress 1", "Cypress 2"],
    },
  },
  {
    name: "Adult Evening Course — Cypress",
    description: "Two-week adult drivers ed cohort, Tue/Thu evenings.",
    locationId: LOC_CYPRESS,
    packageNames: ["Adult Drivers Ed (6-Hour TDLR Approved)"],
    capacity: 12,
    status: "PUBLISHED",
    startDate: "2026-05-12",
    endDate: "2026-05-21",
    daysOfWeek: [2, 4],
    startTime: "18:30",
    endTime: "21:00",
    driveSlots: {
      daysOfWeek: [6],
      startTime: "10:00",
      blockHours: 2,
      componentTypes: ["BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
      vehicleNames: ["Cypress 1", "Cypress 2"],
    },
  },
  {
    name: "Teen Spring 2026 — Pasadena",
    description: "Six-week teen drivers ed cohort, evenings Mon/Wed/Fri.",
    locationId: LOC_PASADENA,
    packageNames: ["Teen Drivers Ed (32-Hour TDLR Approved)"],
    capacity: 18,
    status: "PUBLISHED",
    startDate: "2026-05-04",
    endDate: "2026-06-12",
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
    driveSlots: {
      daysOfWeek: [6, 0], // Sat + Sun
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
      vehicleNames: ["Pasadena 1", "Pasadena 2", "Pasadena 3"],
    },
  },
  {
    name: "Adult Weekend Intensive — Pasadena",
    description: "Two-Saturday adult drivers ed intensive.",
    locationId: LOC_PASADENA,
    packageNames: ["Adult Drivers Ed (6-Hour TDLR Approved)"],
    capacity: 14,
    status: "PUBLISHED",
    startDate: "2026-05-09",
    endDate: "2026-05-16",
    daysOfWeek: [6],
    startTime: "09:00",
    endTime: "15:00",
    driveSlots: {
      daysOfWeek: [0],
      startTime: "10:00",
      blockHours: 2,
      componentTypes: ["BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
      vehicleNames: ["Pasadena 1", "Pasadena 2"],
    },
  },
  {
    name: "Teen Summer Cohort — Pasadena (FULL)",
    description: "Waitlist-only summer cohort — capacity reached.",
    locationId: LOC_PASADENA,
    packageNames: ["Teen Drivers Ed (32-Hour TDLR Approved)"],
    capacity: 12,
    status: "FULL",
    startDate: "2026-07-06",
    endDate: "2026-08-14",
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
  },
  // Drive-only and road-test-only cohorts so each non-add-on package has at
  // least one published offering at one of the two locations.
  {
    name: "BTW-Only Open Slots — Cypress",
    description: "Open behind-the-wheel slots for students who completed classroom elsewhere or need additional drive hours.",
    locationId: LOC_CYPRESS,
    packageNames: ["Behind-the-Wheel Only (7-Hour)", "Parent-Taught Drivers Ed Support", "Extra Drive Lesson (1 Hour)"],
    capacity: 1,
    status: "PUBLISHED",
    startDate: "2026-05-04",
    endDate: "2026-06-13",
    daysOfWeek: [2, 4, 6], // Tue, Thu, Sat
    startTime: "09:00",
    endTime: "11:00",
    generateClassroom: false,
    driveSlots: {
      daysOfWeek: [2, 4, 6],
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE"],
      vehicleNames: ["Cypress 1", "Cypress 2"],
    },
  },
  {
    name: "TDLR Road Test — Pasadena",
    description: "Recurring TDLR road-test slots. Includes optional vehicle rental.",
    locationId: LOC_PASADENA,
    packageNames: ["TDLR Road Test Only", "Vehicle Rental for Road Test"],
    capacity: 1,
    status: "PUBLISHED",
    startDate: "2026-05-02",
    endDate: "2026-06-13",
    daysOfWeek: [6], // Saturdays
    startTime: "10:00",
    endTime: "11:00",
    generateClassroom: false,
    driveSlots: {
      daysOfWeek: [6],
      startTime: "10:00",
      blockHours: 1,
      componentTypes: ["ROAD_TEST"],
      vehicleNames: ["Pasadena 1", "Pasadena 2", "Pasadena 3"],
    },
  },
];

function buildOccurrences(spec: { startDate: string; endDate: string; daysOfWeek: number[]; startTime: string; endTime: string }) {
  const out: { startAt: Date; endAt: Date }[] = [];
  const [sY, sM, sD] = spec.startDate.split("-").map(Number);
  const [eY, eM, eD] = spec.endDate.split("-").map(Number);
  const [sh, sm] = spec.startTime.split(":").map(Number);
  const [eh, em] = spec.endTime.split(":").map(Number);
  const cur = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
  const last = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
  let safety = 0;
  while (cur <= last && safety < 1000) {
    if (spec.daysOfWeek.includes(cur.getDay())) {
      out.push({
        startAt: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), sh, sm, 0, 0),
        endAt: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), eh, em, 0, 0),
      });
    }
    cur.setDate(cur.getDate() + 1);
    safety++;
  }
  return out;
}

async function seedOfferingsAndSessions(
  offeringSeeds: OfferingSeed[],
  packageIdByName: Map<string, number>,
  vehicleByName: Map<string, number>,
  instructorByLoc: Record<number, string>,
) {
  // Composite dedup key: (tenantId scoped) + locationId + first packageId + name.
  // The package join is per-offering so we look it up after fetching offering rows.
  const existingRows = await db
    .select({
      id: scheduleOfferings.id,
      name: scheduleOfferings.name,
      locationId: scheduleOfferings.locationId,
      capacity: scheduleOfferings.capacity,
    })
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.tenantId, TENANT_ID));
  const existingPkgLinks = await db
    .select({ offeringId: scheduleOfferings.id, packageId: scheduleOfferings.packageId })
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.tenantId, TENANT_ID));
  const firstPkgByOffering = new Map<number, number>();
  for (const link of existingPkgLinks) {
    if (!firstPkgByOffering.has(link.offeringId)) firstPkgByOffering.set(link.offeringId, link.packageId);
  }
  const dedupKey = (locationId: number, packageId: number | null, name: string) =>
    `${locationId}::${packageId ?? "null"}::${name}`;
  const byKey = new Map<string, { id: number; capacity: number }>();
  for (const o of existingRows) {
    const pid = firstPkgByOffering.get(o.id) ?? null;
    if (o.locationId == null) continue;
    byKey.set(dedupKey(o.locationId, pid, o.name), { id: o.id, capacity: o.capacity });
  }

  // Pre-fetch all sessions tagged for any offering seed, so per-slot dedup
  // works even after partial runs.
  const seedTaggedSessions = await db
    .select({ notes: scheduleSessions.notes })
    .from(scheduleSessions)
    .where(and(eq(scheduleSessions.tenantId, TENANT_ID), sql`${scheduleSessions.notes} like 'seed:offering:%'`));
  const existingSlotKeys = new Set(seedTaggedSessions.map((r) => r.notes).filter((n): n is string => !!n));

  for (const seed of offeringSeeds) {
    let offeringId: number;
    const seedFirstPkgId = packageIdByName.get(seed.packageNames[0]) ?? null;
    const key = dedupKey(seed.locationId, seedFirstPkgId, seed.name);
    const existingOffering = byKey.get(key);
    if (existingOffering) {
      offeringId = existingOffering.id;
      bump("offerings", false);
      // Reconcile capacity if the seed value drifted (e.g. template bump from 1→12).
      if (existingOffering.capacity !== seed.capacity) {
        await db
          .update(scheduleOfferings)
          .set({ capacity: seed.capacity })
          .where(and(eq(scheduleOfferings.id, offeringId), eq(scheduleOfferings.tenantId, TENANT_ID)));
        bump("offering_capacity_reconciled", true);
      }
    } else {
      const occs = buildOccurrences(seed);
      if (occs.length === 0) {
        console.warn(`  ⚠ Offering "${seed.name}" produced 0 occurrences — skipped`);
        continue;
      }
      const startsAt = occs[0].startAt;
      const endsAt = occs[occs.length - 1].endAt;
      const instructorId = instructorByLoc[seed.locationId];
      if (seedFirstPkgId == null) {
        console.warn(`  ⚠ Offering "${seed.name}" has no resolvable package — skipped (packageId is now required)`);
        continue;
      }
      const offeringInsert: InsertScheduleOffering = {
        tenantId: TENANT_ID,
        packageId: seedFirstPkgId,
        locationId: seed.locationId,
        instructorId,
        name: seed.name,
        description: seed.description,
        capacity: seed.capacity,
        startsAt,
        endsAt,
        status: seed.status,
        notes: null,
      };
      const [created] = await db.insert(scheduleOfferings).values(offeringInsert).returning({ id: scheduleOfferings.id });
      offeringId = created.id;
      bump("offerings", true);
    }

    const instructorId = instructorByLoc[seed.locationId];

    // Classroom sessions (per-slot dedup via notes signature).
    if (seed.generateClassroom !== false) {
      const occs = buildOccurrences(seed);
      const classroomGroup = `cls-${offeringId}`;
      const newRows: InsertScheduleSession[] = [];
      for (const o of occs) {
        const slotKey = `seed:offering:${offeringId}:CLASSROOM:${o.startAt.toISOString()}`;
        if (existingSlotKeys.has(slotKey)) {
          bump("offering_classroom_sessions", false);
          continue;
        }
        existingSlotKeys.add(slotKey);
        newRows.push({
          tenantId: TENANT_ID,
          type: "CLASSROOM",
          instructorId,
          locationId: seed.locationId,
          vehicleId: null,
          startAt: o.startAt,
          endAt: o.endAt,
          capacity: seed.capacity,
          status: "SCHEDULED",
          notes: slotKey,
          recurrenceGroupId: classroomGroup,
          offeringId,
          componentType: "IN_CLASS",
          enrollmentId: null,
          rescheduledFromSessionId: null,
        });
      }
      if (newRows.length > 0) {
        await db.insert(scheduleSessions).values(newRows);
        for (const _ of newRows) bump("offering_classroom_sessions", true);
      }
    }

    // Component-aware drive / road-test sessions tied to the same offering.
    if (seed.driveSlots) {
      const ds = seed.driveSlots;
      const driveOccs = buildOccurrences({
        startDate: seed.startDate,
        endDate: seed.endDate,
        daysOfWeek: ds.daysOfWeek,
        startTime: ds.startTime,
        endTime: addHoursToHHMM(ds.startTime, ds.blockHours),
      });
      const driveGroup = `drv-${offeringId}`;
      const newRows: InsertScheduleSession[] = [];
      driveOccs.forEach((o, idx) => {
        const componentType = ds.componentTypes[idx % ds.componentTypes.length];
        const sessionType: "DRIVE" | "ROAD_TEST" = componentType === "ROAD_TEST" ? "ROAD_TEST" : "DRIVE";
        const vehicleName = ds.vehicleNames[idx % ds.vehicleNames.length];
        const vehicleId = vehicleByName.get(vehicleName) ?? null;
        const slotKey = `seed:offering:${offeringId}:${componentType}:${o.startAt.toISOString()}:v${vehicleId ?? "x"}`;
        if (existingSlotKeys.has(slotKey)) {
          bump("offering_drive_sessions", false);
          return;
        }
        existingSlotKeys.add(slotKey);
        newRows.push({
          tenantId: TENANT_ID,
          type: sessionType,
          instructorId,
          locationId: seed.locationId,
          vehicleId,
          startAt: o.startAt,
          endAt: o.endAt,
          capacity: 1,
          status: "SCHEDULED",
          notes: slotKey,
          recurrenceGroupId: driveGroup,
          offeringId,
          componentType,
          enrollmentId: null,
          rescheduledFromSessionId: null,
        });
      });
      if (newRows.length > 0) {
        await db.insert(scheduleSessions).values(newRows);
        for (const _ of newRows) bump("offering_drive_sessions", true);
      }
    }
  }
}

function addHoursToHHMM(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

// ---------- Standalone drive / road-test sessions ----------

async function seedStandaloneSessions(vehicleByName: Map<string, number>, instructorByLoc: Record<number, string>) {
  // Per-slot dedup: each planned slot has a stable signature stored in `notes`.
  // Skipping previously-seeded slots leaves room to add new slots later without
  // a one-shot "any exists → skip all" gate.
  const existing = await db
    .select({ notes: scheduleSessions.notes })
    .from(scheduleSessions)
    .where(and(eq(scheduleSessions.tenantId, TENANT_ID), sql`${scheduleSessions.notes} like 'seed:standalone:%'`));
  const existingKeys = new Set(existing.map((r) => r.notes).filter((n): n is string => !!n));
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  // Start 7 days from today
  base.setDate(base.getDate() + 7);

  type Plan = { locationId: number; vehicleName: string; type: "DRIVE" | "ROAD_TEST"; dayOffset: number; hour: number };
  const plans: Plan[] = [
    // Cypress
    { locationId: LOC_CYPRESS, vehicleName: "Cypress 1", type: "DRIVE", dayOffset: 0, hour: 9 },
    { locationId: LOC_CYPRESS, vehicleName: "Cypress 1", type: "DRIVE", dayOffset: 1, hour: 13 },
    { locationId: LOC_CYPRESS, vehicleName: "Cypress 2", type: "DRIVE", dayOffset: 2, hour: 9 },
    { locationId: LOC_CYPRESS, vehicleName: "Cypress 2", type: "DRIVE", dayOffset: 3, hour: 15 },
    { locationId: LOC_CYPRESS, vehicleName: "Cypress 1", type: "ROAD_TEST", dayOffset: 4, hour: 10 },
    { locationId: LOC_CYPRESS, vehicleName: "Cypress 2", type: "ROAD_TEST", dayOffset: 5, hour: 11 },
    // Pasadena
    { locationId: LOC_PASADENA, vehicleName: "Pasadena 1", type: "DRIVE", dayOffset: 0, hour: 10 },
    { locationId: LOC_PASADENA, vehicleName: "Pasadena 2", type: "DRIVE", dayOffset: 1, hour: 14 },
    { locationId: LOC_PASADENA, vehicleName: "Pasadena 3", type: "DRIVE", dayOffset: 2, hour: 10 },
    { locationId: LOC_PASADENA, vehicleName: "Pasadena 1", type: "DRIVE", dayOffset: 3, hour: 16 },
    { locationId: LOC_PASADENA, vehicleName: "Pasadena 2", type: "ROAD_TEST", dayOffset: 4, hour: 11 },
    { locationId: LOC_PASADENA, vehicleName: "Pasadena 3", type: "ROAD_TEST", dayOffset: 5, hour: 12 },
  ];

  const rows: InsertScheduleSession[] = [];
  for (const p of plans) {
    const slotKey = `seed:standalone:${p.locationId}:${p.vehicleName}:${p.dayOffset}:${p.hour}:${p.type}`;
    if (existingKeys.has(slotKey)) {
      bump("standalone_sessions", false);
      continue;
    }
    const startAt = new Date(base);
    startAt.setDate(base.getDate() + p.dayOffset);
    startAt.setHours(p.hour, 0, 0, 0);
    const endAt = new Date(startAt);
    endAt.setHours(startAt.getHours() + (p.type === "ROAD_TEST" ? 1 : 2));
    rows.push({
      tenantId: TENANT_ID,
      type: p.type,
      instructorId: instructorByLoc[p.locationId],
      locationId: p.locationId,
      vehicleId: vehicleByName.get(p.vehicleName) ?? null,
      startAt,
      endAt,
      capacity: 1,
      status: "SCHEDULED",
      notes: slotKey,
      recurrenceGroupId: null,
      offeringId: null,
      componentType: p.type === "ROAD_TEST" ? "ROAD_TEST" : "BTW_PRACTICE",
      enrollmentId: null,
      rescheduledFromSessionId: null,
    });
  }
  if (rows.length > 0) {
    await db.insert(scheduleSessions).values(rows);
    for (const _ of rows) bump("standalone_sessions", true);
  }
}

// ---------- Promotions ----------

async function seedPromotionsForTenant(packageIdByName: Map<string, number>) {
  const existing = await db.select({ headline: promotions.headline }).from(promotions).where(eq(promotions.tenantId, TENANT_ID));
  const byHeadline = new Set(existing.map((p) => p.headline));
  const now = new Date();
  const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const teen = packageIdByName.get("Teen Drivers Ed (32-Hour TDLR Approved)") ?? null;
  const adult = packageIdByName.get("Adult Drivers Ed (6-Hour TDLR Approved)") ?? null;
  const seeds: Array<Omit<InsertPromotion, "tenantId">> = [
    {
      locationId: LOC_CYPRESS,
      headline: "Cypress Teen Summer Special",
      description: "Save $50 on the Teen Summer 2026 cohort at our Cypress location. Limited seats.",
      badgeText: "$50 OFF",
      icon: "percent",
      ctaLabel: "Enroll Now",
      packageId: teen,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 0,
    },
    {
      locationId: LOC_CYPRESS,
      headline: "Free Permit Practice with Adult Course",
      description: "Get our Permit Practice Test bundle free when you enroll in any Adult Drivers Ed course at Cypress.",
      badgeText: "FREE BUNDLE",
      icon: "gift",
      ctaLabel: "Claim Offer",
      packageId: adult,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 1,
    },
    {
      locationId: LOC_CYPRESS,
      headline: "TDLR Road Test — Same-Week Slots",
      description: "Same-week TDLR road test slots at our Cypress location. Pass and drive home today.",
      badgeText: "OPEN SLOTS",
      icon: "zap",
      ctaLabel: "Book Road Test",
      packageId: null,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 2,
    },
    {
      locationId: LOC_PASADENA,
      headline: "Pasadena Weekend Intensive",
      description: "Finish your adult drivers ed in just two Saturdays at our Pasadena location.",
      badgeText: "2 WEEKENDS",
      icon: "star",
      ctaLabel: "Enroll Now",
      packageId: adult,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 3,
    },
    {
      locationId: LOC_PASADENA,
      headline: "Pasadena Sibling Discount",
      description: "Enroll two or more siblings at Pasadena and save 15% on each enrollment.",
      badgeText: "15% OFF",
      icon: "tag",
      ctaLabel: "Enroll Siblings",
      packageId: null,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 4,
    },
    {
      locationId: LOC_PASADENA,
      headline: "Teen Cohort Waitlist Bonus",
      description: "Join the Pasadena summer waitlist and lock in current pricing — even if a seat opens later.",
      badgeText: "WAITLIST",
      icon: "gift",
      ctaLabel: "Join Waitlist",
      packageId: teen,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 5,
    },
  ];
  for (const seed of seeds) {
    if (byHeadline.has(seed.headline)) {
      bump("promotions", false);
      continue;
    }
    await db.insert(promotions).values({ ...seed, tenantId: TENANT_ID });
    bump("promotions", true);
  }
}

// ---------- Dynamic upcoming cohorts (per location × per package) ----------

type CohortTemplate = {
  packageName: string;
  shortName: string;
  durationWeeks: number;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  generateClassroom?: boolean;
  driveSlots?: Omit<DriveSlotPlan, "vehicleNames"> & { vehicleNames?: string[] };
};

const COHORT_TEMPLATES: CohortTemplate[] = [
  {
    packageName: "Teen Drivers Ed (32-Hour TDLR Approved)",
    shortName: "Teen",
    durationWeeks: 6,
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
    capacity: 16,
    driveSlots: {
      daysOfWeek: [6],
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
    },
  },
  {
    packageName: "Adult Drivers Ed (6-Hour TDLR Approved)",
    shortName: "Adult",
    durationWeeks: 2,
    daysOfWeek: [2, 4],
    startTime: "18:30",
    endTime: "21:00",
    capacity: 14,
    driveSlots: {
      daysOfWeek: [6],
      startTime: "10:00",
      blockHours: 2,
      componentTypes: ["BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
    },
  },
  {
    packageName: "Behind-the-Wheel Only (7-Hour)",
    shortName: "BTW Only",
    durationWeeks: 4,
    daysOfWeek: [2, 4, 6],
    startTime: "09:00",
    endTime: "11:00",
    capacity: 12,
    generateClassroom: false,
    driveSlots: {
      daysOfWeek: [2, 4, 6],
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE"],
    },
  },
  {
    packageName: "TDLR Road Test Only",
    shortName: "Road Test",
    durationWeeks: 6,
    daysOfWeek: [6],
    startTime: "10:00",
    endTime: "11:00",
    capacity: 12,
    generateClassroom: false,
    driveSlots: {
      daysOfWeek: [6],
      startTime: "10:00",
      blockHours: 1,
      componentTypes: ["ROAD_TEST"],
    },
  },
  {
    packageName: "Parent-Taught Drivers Ed Support",
    shortName: "PTDE Support",
    durationWeeks: 3,
    daysOfWeek: [3],
    startTime: "18:00",
    endTime: "21:00",
    capacity: 12,
    driveSlots: {
      daysOfWeek: [0],
      startTime: "13:00",
      blockHours: 2,
      componentTypes: ["BTW_PRACTICE", "BTW_PRACTICE"],
    },
  },
];

// Two future month-anchored cohort starts per (location × package).
// Stable labels make the resulting offering names deterministic so re-runs dedupe.
const COHORT_MONTHS = [
  { label: "Jun 2026", year: 2026, month: 6, startDay: 1 },
  { label: "Jul 2026", year: 2026, month: 7, startDay: 6 },
];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDynamicOfferings(
  locationsForCohorts: Array<{ id: number; city: string; vehicleNames: string[] }>,
): OfferingSeed[] {
  const out: OfferingSeed[] = [];
  for (const loc of locationsForCohorts) {
    for (const tpl of COHORT_TEMPLATES) {
      for (const m of COHORT_MONTHS) {
        const start = new Date(m.year, m.month - 1, m.startDay);
        const end = new Date(start);
        end.setDate(end.getDate() + tpl.durationWeeks * 7);
        const driveSlots: DriveSlotPlan | undefined = tpl.driveSlots
          ? { ...tpl.driveSlots, vehicleNames: loc.vehicleNames }
          : undefined;
        out.push({
          name: `${tpl.shortName} – ${loc.city} – ${m.label}`,
          description: `${tpl.shortName} cohort starting ${m.label} at our ${loc.city} location.`,
          locationId: loc.id,
          packageNames: [tpl.packageName],
          capacity: tpl.capacity,
          status: "PUBLISHED",
          startDate: fmtDate(start),
          endDate: fmtDate(end),
          daysOfWeek: tpl.daysOfWeek,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          generateClassroom: tpl.generateClassroom,
          driveSlots,
        });
      }
    }
  }
  return out;
}

// ---------- Main ----------

async function main() {
  console.log(`Seeding tenant ${TENANT_ID}…`);
  const pre = await preflight();
  console.log(`  Tenant: ${pre.tenantName}`);

  await deleteStraySessions();

  // Sugar Land must exist before vehicles / cohorts / instructor mapping.
  const sugarLandId = await seedSugarLandLocation();
  console.log(`  Sugar Land location id: ${sugarLandId}`);

  const allLocationIds = [LOC_CYPRESS, LOC_PASADENA, sugarLandId];
  ensureInstructorCoverage(pre.activeInstructors, allLocationIds);
  const instructorByLocation = pickInstructorByLocation(pre.activeInstructors, allLocationIds);
  console.log(`  Instructor for Cypress:    ${instructorByLocation[LOC_CYPRESS]}`);
  console.log(`  Instructor for Pasadena:   ${instructorByLocation[LOC_PASADENA]}`);
  console.log(`  Instructor for Sugar Land: ${instructorByLocation[sugarLandId]}`);

  const packageIdByName = await seedPackages();
  const vehicleByName = await seedVehicles();
  await seedSugarLandVehicles(sugarLandId, vehicleByName);
  await seedOnlineCourses();

  // 1) Existing static cohorts (Cypress / Pasadena).
  await seedOfferingsAndSessions(OFFERING_SEEDS, packageIdByName, vehicleByName, instructorByLocation);

  // 2) New dynamically-generated upcoming cohorts across all 3 locations and
  //    all enrollable packages.
  const dynamic = buildDynamicOfferings([
    { id: LOC_CYPRESS, city: "Cypress", vehicleNames: ["Cypress 1", "Cypress 2"] },
    { id: LOC_PASADENA, city: "Pasadena", vehicleNames: ["Pasadena 1", "Pasadena 2", "Pasadena 3"] },
    { id: sugarLandId, city: "Sugar Land", vehicleNames: ["Sugar Land 1", "Sugar Land 2"] },
  ]);
  await seedOfferingsAndSessions(dynamic, packageIdByName, vehicleByName, instructorByLocation);

  await seedStandaloneSessions(vehicleByName, instructorByLocation);
  await seedPromotionsForTenant(packageIdByName);

  console.log("\nSummary:");
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(22)} created=${v.created}  existed=${v.existed}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
