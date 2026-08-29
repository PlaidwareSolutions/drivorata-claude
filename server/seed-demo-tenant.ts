/**
 * Seed a generic "demo data" template into any tenant.
 *
 * Adapted from `server/seed-tenant-28.ts` (the hand-tailored seed for tenant 28).
 * The shape of the data — packages, vehicles, online courses, schedule offerings,
 * standalone drive/road-test sessions, and promotions — is broadly representative
 * of any Texas driving school. This module exposes a parameterised function so a
 * platform admin can populate any tenant with a starter catalog.
 *
 * Idempotency: every entity is deduped by `name + tenantId (+ locationId)` or, for
 * generated sessions, by a stable `seed:` signature stored in `notes`. Re-running
 * the function on the same tenant will report 0 new rows after the first pass.
 */
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  bookings,
  enrollments,
  locations,
  offeringWaitlist,
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

export type SeedDemoOptions = {
  tenantId: number;
  /**
   * Locations to seed offerings/vehicles/promotions against. If omitted, the
   * function uses up to the first 2 active locations on the tenant.
   */
  locationIds?: number[];
  /**
   * Single instructor user id to assign to every generated offering / session.
   * If omitted, the function picks an active instructor membership per location
   * (preferring location-scoped matches) and falls back to any active instructor.
   */
  instructorUserId?: string;
};

export type SeedCounter = { created: number; existed: number };
export type SeedDemoSummary = {
  tenantId: number;
  locationIds: number[];
  counts: Record<string, SeedCounter>;
};

function makeStats() {
  const counts: Record<string, SeedCounter> = {};
  return {
    counts,
    bump(key: string, created: boolean) {
      const s = (counts[key] ??= { created: 0, existed: 0 });
      if (created) s.created++;
      else s.existed++;
    },
  };
}

type ResolvedLocation = { id: number; name: string };

async function resolveContext(opts: SeedDemoOptions) {
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId));
  if (!tenant) throw new Error(`Tenant ${opts.tenantId} not found.`);

  const allLocs = await db
    .select({ id: locations.id, name: locations.name, active: locations.active })
    .from(locations)
    .where(eq(locations.tenantId, opts.tenantId));
  let chosen: ResolvedLocation[];
  if (opts.locationIds && opts.locationIds.length > 0) {
    const byId = new Map(allLocs.map((l) => [l.id, l]));
    chosen = opts.locationIds.map((id) => {
      const l = byId.get(id);
      if (!l) throw new Error(`Location ${id} not found on tenant ${opts.tenantId}.`);
      return { id: l.id, name: l.name };
    });
  } else {
    chosen = allLocs
      .filter((l) => l.active !== false)
      .sort((a, b) => a.id - b.id)
      .slice(0, 2)
      .map((l) => ({ id: l.id, name: l.name }));
  }
  if (chosen.length === 0) {
    throw new Error(
      `Tenant ${opts.tenantId} has no locations. Create at least one location before seeding demo data.`,
    );
  }

  let instructorByLoc: Record<number, string> = {};
  if (opts.instructorUserId) {
    const [member] = await db
      .select({ userId: tenantMembers.userId, active: tenantMembers.active })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, opts.tenantId),
          eq(tenantMembers.userId, opts.instructorUserId),
          eq(tenantMembers.role, "instructor"),
        ),
      );
    if (!member || !member.active) {
      throw new Error(
        `User ${opts.instructorUserId} is not an active instructor of tenant ${opts.tenantId}.`,
      );
    }
    for (const l of chosen) instructorByLoc[l.id] = opts.instructorUserId;
  } else {
    const members = await db
      .select({
        userId: tenantMembers.userId,
        locationScope: tenantMembers.locationScope,
        active: tenantMembers.active,
      })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, opts.tenantId), eq(tenantMembers.role, "instructor")));
    const active = members.filter((m) => m.active && m.userId);
    if (active.length === 0) {
      throw new Error(
        `Tenant ${opts.tenantId} has no active instructor members. Add one (or pass instructorUserId) before seeding demo data.`,
      );
    }
    const fallback = active[0].userId as string;
    const matches = (m: (typeof active)[number], locId: number) =>
      m.locationScope === "ALL" ||
      m.locationScope === null ||
      (Array.isArray(m.locationScope) && m.locationScope.includes(locId));
    for (const l of chosen) {
      instructorByLoc[l.id] = (active.find((m) => matches(m, l.id))?.userId as string) ?? fallback;
    }
  }

  return { tenantName: tenant.name, locs: chosen, instructorByLoc };
}

// ---------- Packages ----------

type PackageSeed = Omit<InsertPackage, "tenantId"> & {
  components?: Omit<InsertPackageComponent, "tenantId" | "packageId">[];
};

const PACKAGE_SEEDS: PackageSeed[] = [
  {
    name: "Teen Drivers Ed (32-Hour TDLR Approved)",
    description:
      "Texas TDLR Approved 32-hour classroom + 14-hour behind-the-wheel course for teens ages 14-17. Includes parent-taught study guide and final road test.",
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
    description:
      "Texas TDLR Approved 6-hour classroom + 7-hour behind-the-wheel course for adults ages 18-24.",
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
    description:
      "Drive hours only — for students who completed their classroom portion elsewhere. Includes 7 hours of in-car instruction.",
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
    description:
      "Texas TDLR Approved third-party road test. We administer and report your result to the DPS.",
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
    components: [{ type: "ROAD_TEST", label: "Road test", hours: 1, quantity: 1, sortOrder: 0 }],
  },
  {
    name: "Parent-Taught Drivers Ed Support",
    description:
      "Supplemental classroom + BTW package for families using the Texas Parent-Taught Drivers Ed (PTDE) program.",
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

async function seedPackages(tenantId: number, bump: (k: string, c: boolean) => void) {
  const existing = await db
    .select({ id: packages.id, name: packages.name })
    .from(packages)
    .where(eq(packages.tenantId, tenantId));
  const byName = new Map(existing.map((p) => [p.name, p.id]));
  for (const seed of PACKAGE_SEEDS) {
    if (byName.has(seed.name)) {
      bump("packages", false);
      continue;
    }
    const { components, ...pkgFields } = seed;
    const [created] = await db
      .insert(packages)
      .values({ ...pkgFields, tenantId })
      .returning({ id: packages.id });
    byName.set(seed.name, created.id);
    bump("packages", true);
    if (components && components.length > 0) {
      await db.insert(packageComponents).values(
        components.map((c) => ({ ...c, tenantId, packageId: created.id })),
      );
      for (const _ of components) bump("package_components", true);
    }
  }
  return byName;
}

// ---------- Vehicles ----------

const MAKE_MODEL_POOL: Array<{ make: string; model: string; year: number; color: string }> = [
  { make: "Toyota", model: "Corolla", year: 2023, color: "White" },
  { make: "Honda", model: "Civic", year: 2024, color: "Silver" },
  { make: "Nissan", model: "Sentra", year: 2023, color: "Blue" },
  { make: "Toyota", model: "Camry", year: 2022, color: "Gray" },
  { make: "Hyundai", model: "Elantra", year: 2024, color: "Black" },
];

function plateFor(tenantId: number, locationId: number, slot: number) {
  return `T${tenantId}-L${locationId}-${slot}`;
}

function vehicleNamesForLocation(loc: ResolvedLocation): string[] {
  return [`${loc.name} Vehicle 1`, `${loc.name} Vehicle 2`];
}

async function seedVehicles(
  tenantId: number,
  locs: ResolvedLocation[],
  bump: (k: string, c: boolean) => void,
) {
  const existing = await db
    .select({ id: vehicles.id, name: vehicles.name })
    .from(vehicles)
    .where(eq(vehicles.tenantId, tenantId));
  const byName = new Map(existing.map((v) => [v.name, v.id]));
  let globalSlot = 0;
  for (const loc of locs) {
    const names = vehicleNamesForLocation(loc);
    for (let i = 0; i < names.length; i++) {
      globalSlot++;
      const name = names[i];
      if (byName.has(name)) {
        bump("vehicles", false);
        continue;
      }
      const profile = MAKE_MODEL_POOL[(globalSlot - 1) % MAKE_MODEL_POOL.length];
      const insert: Omit<InsertVehicle, "tenantId"> = {
        locationId: loc.id,
        name,
        make: profile.make,
        model: profile.model,
        year: profile.year,
        plate: plateFor(tenantId, loc.id, i + 1),
        color: profile.color,
        status: "ACTIVE",
      };
      const [created] = await db
        .insert(vehicles)
        .values({ ...insert, tenantId })
        .returning({ id: vehicles.id });
      byName.set(name, created.id);
      bump("vehicles", true);
    }
  }
  return byName;
}

// ---------- Online courses ----------

const ONLINE_COURSE_SEEDS: Array<Omit<InsertOnlineCourse, "tenantId">> = [
  {
    name: "Texas Defensive Driving / Ticket Dismissal",
    description:
      "TDLR-approved 6-hour online defensive driving course. Dismiss a ticket or earn an insurance discount.",
    price: 3500,
    providerName: "myimprov.com",
    providerUrl: "https://www.myimprov.com/texas-defensive-driving/",
    imageUrl: null,
    active: true,
    sortOrder: 10,
  },
  {
    name: "Texas Adult Drivers Ed Online",
    description:
      "TDLR-approved adult drivers ed (ages 18-24) — fully online, complete at your own pace.",
    price: 8900,
    providerName: "Aceable",
    providerUrl: "https://www.aceable.com/drivers-ed/texas/adult/",
    imageUrl: null,
    active: true,
    sortOrder: 20,
  },
];

async function seedOnlineCoursesForTenant(tenantId: number, bump: (k: string, c: boolean) => void) {
  const existing = await db
    .select({ name: onlineCourses.name })
    .from(onlineCourses)
    .where(eq(onlineCourses.tenantId, tenantId));
  const byName = new Set(existing.map((c) => c.name));
  for (const seed of ONLINE_COURSE_SEEDS) {
    if (byName.has(seed.name)) {
      bump("online_courses", false);
      continue;
    }
    await db.insert(onlineCourses).values({ ...seed, tenantId });
    bump("online_courses", true);
  }
}

// ---------- Offerings + sessions ----------

type DriveSlotPlan = {
  daysOfWeek: number[];
  startTime: string;
  blockHours: number;
  componentTypes: Array<"BTW_OBSERVATION" | "BTW_PRACTICE" | "ROAD_TEST">;
};

type OfferingTemplate = {
  /** Index into the supplied locations array. Templates needing index >= locs.length are skipped. */
  locationIndex: number;
  nameTemplate: string; // {location} placeholder
  description: string;
  packageNames: string[];
  capacity: number;
  status: "PUBLISHED" | "FULL";
  /** Days from today (start). */
  startDayOffset: number;
  /** Days from today (end). */
  endDayOffset: number;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  driveSlots?: DriveSlotPlan;
  generateClassroom?: boolean;
};

const OFFERING_TEMPLATES: OfferingTemplate[] = [
  {
    locationIndex: 0,
    nameTemplate: "Teen Summer Cohort — {location}",
    description: "Six-week teen drivers ed cohort, evenings Mon/Wed/Fri.",
    packageNames: ["Teen Drivers Ed (32-Hour TDLR Approved)"],
    capacity: 16,
    status: "PUBLISHED",
    startDayOffset: 14,
    endDayOffset: 56,
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
    driveSlots: {
      daysOfWeek: [6],
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
    },
  },
  {
    locationIndex: 0,
    nameTemplate: "Adult Evening Course — {location}",
    description: "Two-week adult drivers ed cohort, Tue/Thu evenings.",
    packageNames: ["Adult Drivers Ed (6-Hour TDLR Approved)"],
    capacity: 12,
    status: "PUBLISHED",
    startDayOffset: 7,
    endDayOffset: 21,
    daysOfWeek: [2, 4],
    startTime: "18:30",
    endTime: "21:00",
    driveSlots: {
      daysOfWeek: [6],
      startTime: "10:00",
      blockHours: 2,
      componentTypes: ["BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
    },
  },
  {
    locationIndex: 0,
    nameTemplate: "BTW-Only Open Slots — {location}",
    description:
      "Open behind-the-wheel slots for students who completed classroom elsewhere or need additional drive hours.",
    packageNames: [
      "Behind-the-Wheel Only (7-Hour)",
      "Parent-Taught Drivers Ed Support",
      "Extra Drive Lesson (1 Hour)",
    ],
    capacity: 1,
    status: "PUBLISHED",
    startDayOffset: 7,
    endDayOffset: 49,
    daysOfWeek: [2, 4, 6],
    startTime: "09:00",
    endTime: "11:00",
    generateClassroom: false,
    driveSlots: {
      daysOfWeek: [2, 4, 6],
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE"],
    },
  },
  {
    locationIndex: 1,
    nameTemplate: "Teen Spring Cohort — {location}",
    description: "Six-week teen drivers ed cohort, evenings Mon/Wed/Fri.",
    packageNames: ["Teen Drivers Ed (32-Hour TDLR Approved)"],
    capacity: 18,
    status: "PUBLISHED",
    startDayOffset: 7,
    endDayOffset: 49,
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
    driveSlots: {
      daysOfWeek: [6, 0],
      startTime: "09:00",
      blockHours: 2,
      componentTypes: ["BTW_OBSERVATION", "BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
    },
  },
  {
    locationIndex: 1,
    nameTemplate: "Adult Weekend Intensive — {location}",
    description: "Two-Saturday adult drivers ed intensive.",
    packageNames: ["Adult Drivers Ed (6-Hour TDLR Approved)"],
    capacity: 14,
    status: "PUBLISHED",
    startDayOffset: 14,
    endDayOffset: 28,
    daysOfWeek: [6],
    startTime: "09:00",
    endTime: "15:00",
    driveSlots: {
      daysOfWeek: [0],
      startTime: "10:00",
      blockHours: 2,
      componentTypes: ["BTW_PRACTICE", "BTW_PRACTICE", "ROAD_TEST"],
    },
  },
  {
    locationIndex: 1,
    nameTemplate: "Teen Summer Cohort — {location} (FULL)",
    description: "Waitlist-only summer cohort — capacity reached.",
    packageNames: ["Teen Drivers Ed (32-Hour TDLR Approved)"],
    capacity: 12,
    status: "FULL",
    startDayOffset: 60,
    endDayOffset: 100,
    daysOfWeek: [1, 3, 5],
    startTime: "18:00",
    endTime: "21:00",
  },
  {
    locationIndex: 1,
    nameTemplate: "TDLR Road Test — {location}",
    description: "Recurring TDLR road-test slots. Includes optional vehicle rental.",
    packageNames: ["TDLR Road Test Only", "Vehicle Rental for Road Test"],
    capacity: 1,
    status: "PUBLISHED",
    startDayOffset: 7,
    endDayOffset: 49,
    daysOfWeek: [6],
    startTime: "10:00",
    endTime: "11:00",
    generateClassroom: false,
    driveSlots: {
      daysOfWeek: [6],
      startTime: "10:00",
      blockHours: 1,
      componentTypes: ["ROAD_TEST"],
    },
  },
];

function dateNDaysFromToday(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function buildOccurrences(spec: {
  startDayOffset: number;
  endDayOffset: number;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}) {
  const out: { startAt: Date; endAt: Date }[] = [];
  const [sh, sm] = spec.startTime.split(":").map(Number);
  const [eh, em] = spec.endTime.split(":").map(Number);
  const cur = dateNDaysFromToday(spec.startDayOffset);
  const last = dateNDaysFromToday(spec.endDayOffset);
  last.setHours(23, 59, 59, 999);
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

function addHoursToHHMM(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function dateOnly(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function buildOccurrencesBetween(spec: {
  startDate: Date;
  endDate: Date;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}) {
  const out: { startAt: Date; endAt: Date }[] = [];
  const [sh, sm] = spec.startTime.split(":").map(Number);
  const [eh, em] = spec.endTime.split(":").map(Number);
  const cur = dateOnly(spec.startDate);
  const last = dateOnly(spec.endDate);
  last.setHours(23, 59, 59, 999);
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
  tenantId: number,
  locs: ResolvedLocation[],
  packageIdByName: Map<string, number>,
  vehicleByName: Map<string, number>,
  instructorByLoc: Record<number, string>,
  bump: (k: string, c: boolean) => void,
) {
  const existing = await db
    .select({
      id: scheduleOfferings.id,
      name: scheduleOfferings.name,
      startsAt: scheduleOfferings.startsAt,
      endsAt: scheduleOfferings.endsAt,
    })
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.tenantId, tenantId));
  const byName = new Map(existing.map((o) => [o.name, o]));

  const seedTaggedSessions = await db
    .select({ notes: scheduleSessions.notes })
    .from(scheduleSessions)
    .where(
      and(eq(scheduleSessions.tenantId, tenantId), sql`${scheduleSessions.notes} like 'seed:offering:%'`),
    );
  const existingSlotKeys = new Set(seedTaggedSessions.map((r) => r.notes).filter((n): n is string => !!n));

  for (const tpl of OFFERING_TEMPLATES) {
    if (tpl.locationIndex >= locs.length) continue;
    const loc = locs[tpl.locationIndex];
    const offeringName = tpl.nameTemplate.replace("{location}", loc.name);
    const vehicleNames = vehicleNamesForLocation(loc);

    let offeringId: number;
    let offeringWindow: { startsAt: Date; endsAt: Date };
    const existingOffering = byName.get(offeringName);
    if (existingOffering) {
      offeringId = existingOffering.id;
      offeringWindow = {
        startsAt: existingOffering.startsAt as Date,
        endsAt: existingOffering.endsAt as Date,
      };
      bump("offerings", false);
    } else {
      const occs = buildOccurrences(tpl);
      if (occs.length === 0) continue;
      const startsAt = occs[0].startAt;
      const endsAt = occs[occs.length - 1].endAt;
      const seedPkgIds = tpl.packageNames
        .map((n) => packageIdByName.get(n))
        .filter((x): x is number => typeof x === "number");
      if (seedPkgIds.length === 0) {
        // packageId is now required on offerings; skip cohorts whose packages
        // are not yet seeded to keep this script idempotent.
        continue;
      }
      const offeringInsert: InsertScheduleOffering = {
        tenantId,
        packageId: seedPkgIds[0],
        locationId: loc.id,
        instructorId: instructorByLoc[loc.id],
        name: offeringName,
        description: tpl.description,
        capacity: tpl.capacity,
        startsAt,
        endsAt,
        status: tpl.status,
        notes: null,
      };
      const [created] = await db
        .insert(scheduleOfferings)
        .values(offeringInsert)
        .returning({ id: scheduleOfferings.id });
      offeringId = created.id;
      offeringWindow = { startsAt, endsAt };
      bump("offerings", true);
    }

    if (tpl.generateClassroom !== false) {
      // Anchor occurrences to the offering's persisted window so reruns on a
      // later day produce identical session timestamps (and therefore identical
      // slot keys) rather than drifting forward.
      const occs = buildOccurrencesBetween({
        startDate: offeringWindow.startsAt,
        endDate: offeringWindow.endsAt,
        daysOfWeek: tpl.daysOfWeek,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
      });
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
          tenantId,
          type: "CLASSROOM",
          instructorId: instructorByLoc[loc.id],
          locationId: loc.id,
          vehicleId: null,
          startAt: o.startAt,
          endAt: o.endAt,
          capacity: tpl.capacity,
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

    if (tpl.driveSlots) {
      const ds = tpl.driveSlots;
      const driveOccs = buildOccurrencesBetween({
        startDate: offeringWindow.startsAt,
        endDate: offeringWindow.endsAt,
        daysOfWeek: ds.daysOfWeek,
        startTime: ds.startTime,
        endTime: addHoursToHHMM(ds.startTime, ds.blockHours),
      });
      const driveGroup = `drv-${offeringId}`;
      const newRows: InsertScheduleSession[] = [];
      driveOccs.forEach((o, idx) => {
        const componentType = ds.componentTypes[idx % ds.componentTypes.length];
        const sessionType: "DRIVE" | "ROAD_TEST" = componentType === "ROAD_TEST" ? "ROAD_TEST" : "DRIVE";
        const vehicleName = vehicleNames[idx % vehicleNames.length];
        const vehicleId = vehicleByName.get(vehicleName) ?? null;
        const slotKey = `seed:offering:${offeringId}:${componentType}:${o.startAt.toISOString()}:v${vehicleId ?? "x"}`;
        if (existingSlotKeys.has(slotKey)) {
          bump("offering_drive_sessions", false);
          return;
        }
        existingSlotKeys.add(slotKey);
        newRows.push({
          tenantId,
          type: sessionType,
          instructorId: instructorByLoc[loc.id],
          locationId: loc.id,
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

// ---------- Standalone drive / road-test sessions ----------

async function seedStandaloneSessions(
  tenantId: number,
  locs: ResolvedLocation[],
  vehicleByName: Map<string, number>,
  instructorByLoc: Record<number, string>,
  bump: (k: string, c: boolean) => void,
) {
  const existing = await db
    .select({ notes: scheduleSessions.notes })
    .from(scheduleSessions)
    .where(
      and(eq(scheduleSessions.tenantId, tenantId), sql`${scheduleSessions.notes} like 'seed:standalone:%'`),
    );
  const existingKeys = new Set(existing.map((r) => r.notes).filter((n): n is string => !!n));
  const base = dateNDaysFromToday(7);

  type Plan = { locationId: number; vehicleName: string; type: "DRIVE" | "ROAD_TEST"; dayOffset: number; hour: number };
  const plans: Plan[] = [];
  for (const loc of locs) {
    const names = vehicleNamesForLocation(loc);
    const v1 = names[0];
    const v2 = names[1] ?? names[0];
    plans.push(
      { locationId: loc.id, vehicleName: v1, type: "DRIVE", dayOffset: 0, hour: 9 },
      { locationId: loc.id, vehicleName: v1, type: "DRIVE", dayOffset: 1, hour: 13 },
      { locationId: loc.id, vehicleName: v2, type: "DRIVE", dayOffset: 2, hour: 9 },
      { locationId: loc.id, vehicleName: v2, type: "DRIVE", dayOffset: 3, hour: 15 },
      { locationId: loc.id, vehicleName: v1, type: "ROAD_TEST", dayOffset: 4, hour: 10 },
      { locationId: loc.id, vehicleName: v2, type: "ROAD_TEST", dayOffset: 5, hour: 11 },
    );
  }

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
      tenantId,
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

async function seedPromotionsForTenant(
  tenantId: number,
  locs: ResolvedLocation[],
  packageIdByName: Map<string, number>,
  bump: (k: string, c: boolean) => void,
) {
  const existing = await db
    .select({ headline: promotions.headline })
    .from(promotions)
    .where(eq(promotions.tenantId, tenantId));
  const byHeadline = new Set(existing.map((p) => p.headline));
  const now = new Date();
  const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const teen = packageIdByName.get("Teen Drivers Ed (32-Hour TDLR Approved)") ?? null;
  const adult = packageIdByName.get("Adult Drivers Ed (6-Hour TDLR Approved)") ?? null;

  type PromoTemplate = {
    locationIndex: number;
    headlineTemplate: string;
    description: string;
    badgeText: string;
    icon: "tag" | "zap" | "gift" | "star" | "percent";
    ctaLabel: string;
    packageId: number | null;
  };
  const templates: PromoTemplate[] = [
    {
      locationIndex: 0,
      headlineTemplate: "{location} Teen Summer Special",
      description: "Save $50 on the upcoming Teen cohort. Limited seats.",
      badgeText: "$50 OFF",
      icon: "percent",
      ctaLabel: "Enroll Now",
      packageId: teen,
    },
    {
      locationIndex: 0,
      headlineTemplate: "Free Permit Practice with Adult Course at {location}",
      description: "Get our Permit Practice Test bundle free when you enroll in any Adult Drivers Ed course.",
      badgeText: "FREE BUNDLE",
      icon: "gift",
      ctaLabel: "Claim Offer",
      packageId: adult,
    },
    {
      locationIndex: 0,
      headlineTemplate: "TDLR Road Test — Same-Week Slots at {location}",
      description: "Same-week TDLR road test slots. Pass and drive home today.",
      badgeText: "OPEN SLOTS",
      icon: "zap",
      ctaLabel: "Book Road Test",
      packageId: null,
    },
    {
      locationIndex: 1,
      headlineTemplate: "{location} Weekend Intensive",
      description: "Finish your adult drivers ed in just two Saturdays.",
      badgeText: "2 WEEKENDS",
      icon: "star",
      ctaLabel: "Enroll Now",
      packageId: adult,
    },
    {
      locationIndex: 1,
      headlineTemplate: "{location} Sibling Discount",
      description: "Enroll two or more siblings and save 15% on each enrollment.",
      badgeText: "15% OFF",
      icon: "tag",
      ctaLabel: "Enroll Siblings",
      packageId: null,
    },
    {
      locationIndex: 1,
      headlineTemplate: "Teen Cohort Waitlist Bonus — {location}",
      description: "Join the summer waitlist and lock in current pricing — even if a seat opens later.",
      badgeText: "WAITLIST",
      icon: "gift",
      ctaLabel: "Join Waitlist",
      packageId: teen,
    },
  ];

  let order = 0;
  for (const tpl of templates) {
    if (tpl.locationIndex >= locs.length) continue;
    const loc = locs[tpl.locationIndex];
    const headline = tpl.headlineTemplate.replace("{location}", loc.name);
    if (byHeadline.has(headline)) {
      bump("promotions", false);
      order++;
      continue;
    }
    const insert: Omit<InsertPromotion, "tenantId"> = {
      locationId: loc.id,
      headline,
      description: tpl.description,
      badgeText: tpl.badgeText,
      icon: tpl.icon,
      ctaLabel: tpl.ctaLabel,
      packageId: tpl.packageId,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: order,
    };
    await db.insert(promotions).values({ ...insert, tenantId });
    bump("promotions", true);
    order++;
  }
}

const PROMO_HEADLINE_TEMPLATES: string[] = [
  "{location} Teen Summer Special",
  "Free Permit Practice with Adult Course at {location}",
  "TDLR Road Test — Same-Week Slots at {location}",
  "{location} Weekend Intensive",
  "{location} Sibling Discount",
  "Teen Cohort Waitlist Bonus — {location}",
];

// ---------- Clearing seeded demo data ----------

export type ClearDemoCounter = { deleted: number; skipped: number };
export type ClearDemoSummary = {
  tenantId: number;
  counts: Record<string, ClearDemoCounter>;
};

export async function clearDemoTenant(opts: { tenantId: number }): Promise<ClearDemoSummary> {
  const { tenantId } = opts;
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);

  const counts: Record<string, ClearDemoCounter> = {};
  const bump = (k: string, deleted: boolean, n = 1) => {
    if (n <= 0) return;
    const s = (counts[k] ??= { deleted: 0, skipped: 0 });
    if (deleted) s.deleted += n;
    else s.skipped += n;
  };

  const allLocs = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.tenantId, tenantId));

  // ---- Step A: identify seeded offerings and figure out which are still "in use".
  // An offering is considered in use if any enrollment or waitlist row references
  // it, OR if any of its sessions are referenced by a real customer artifact
  // (an enrollment-tied session, or a booking row). When in use, we must keep
  // both the offering AND its seeded sessions.
  const expectedOfferingNames = new Set<string>();
  for (const tpl of OFFERING_TEMPLATES) {
    for (const loc of allLocs) expectedOfferingNames.add(tpl.nameTemplate.replace("{location}", loc.name));
  }

  const allOfferingRows = expectedOfferingNames.size
    ? await db
        .select({ id: scheduleOfferings.id, name: scheduleOfferings.name })
        .from(scheduleOfferings)
        .where(eq(scheduleOfferings.tenantId, tenantId))
    : [];
  const candidateOfferings = allOfferingRows.filter((o) => expectedOfferingNames.has(o.name));
  const inUseOfferingIds = new Set<number>();
  for (const off of candidateOfferings) {
    const [{ count: enrollmentCount }] = await db
      .select({ count: count() })
      .from(enrollments)
      .where(eq(enrollments.offeringId, off.id));
    const [{ count: waitlistCount }] = await db
      .select({ count: count() })
      .from(offeringWaitlist)
      .where(eq(offeringWaitlist.offeringId, off.id));
    if (enrollmentCount > 0 || waitlistCount > 0) {
      inUseOfferingIds.add(off.id);
    }
  }

  // ---- Step B: gather all candidate seeded sessions and decide per-session.
  // - seed:offering:* sessions are deletable iff their offering is NOT in use,
  //   they have no enrollmentId, and no booking references them.
  // - seed:standalone:* sessions are deletable iff they have no enrollmentId
  //   and no booking references them.
  const seedSessionRows = await db
    .select({
      id: scheduleSessions.id,
      offeringId: scheduleSessions.offeringId,
      enrollmentId: scheduleSessions.enrollmentId,
      notes: scheduleSessions.notes,
    })
    .from(scheduleSessions)
    .where(
      and(
        eq(scheduleSessions.tenantId, tenantId),
        or(
          sql`${scheduleSessions.notes} like 'seed:offering:%'`,
          sql`${scheduleSessions.notes} like 'seed:standalone:%'`,
        ),
      ),
    );

  let sessionsWithBookings = new Set<number>();
  if (seedSessionRows.length > 0) {
    const bookedRows = await db
      .selectDistinct({ sessionId: bookings.sessionId })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          inArray(
            bookings.sessionId,
            seedSessionRows.map((s) => s.id),
          ),
        ),
      );
    sessionsWithBookings = new Set(bookedRows.map((r) => r.sessionId));
  }

  const sessionIdsToDelete: number[] = [];
  let sessionsSkipped = 0;
  for (const s of seedSessionRows) {
    const isOfferingSession = (s.notes ?? "").startsWith("seed:offering:");
    const offeringInUse =
      isOfferingSession && s.offeringId != null && inUseOfferingIds.has(s.offeringId);
    if (
      s.enrollmentId == null &&
      !sessionsWithBookings.has(s.id) &&
      !offeringInUse
    ) {
      sessionIdsToDelete.push(s.id);
    } else {
      sessionsSkipped++;
    }
  }
  if (sessionIdsToDelete.length > 0) {
    await db.delete(scheduleSessions).where(inArray(scheduleSessions.id, sessionIdsToDelete));
  }
  bump("schedule_sessions", true, sessionIdsToDelete.length);
  bump("schedule_sessions", false, sessionsSkipped);

  // ---- Step C: delete offerings that are not in use. Their seeded sessions
  // were just removed; any remaining sessions belong to real customer activity
  // (impossible because an in-use offering would already be skipped, but we
  // re-check defensively).
  for (const off of candidateOfferings) {
    if (inUseOfferingIds.has(off.id)) {
      bump("schedule_offerings", false);
      continue;
    }
    const [{ count: sessionCount }] = await db
      .select({ count: count() })
      .from(scheduleSessions)
      .where(eq(scheduleSessions.offeringId, off.id));
    if (sessionCount > 0) {
      bump("schedule_offerings", false);
      continue;
    }
    await db.delete(scheduleOfferings).where(eq(scheduleOfferings.id, off.id));
    bump("schedule_offerings", true);
  }

  // 3. Packages — skip any that real enrollments reference, and any still
  // referenced by an offering that was kept above (schedule_offerings.package_id
  // is ON DELETE RESTRICT, so deleting such a package would fail).
  const expectedPackageNames = new Set(PACKAGE_SEEDS.map((p) => p.name));
  const pkgRows = await db
    .select({ id: packages.id, name: packages.name })
    .from(packages)
    .where(eq(packages.tenantId, tenantId));
  const candidatePackages = pkgRows.filter((p) => expectedPackageNames.has(p.name));
  for (const p of candidatePackages) {
    const [{ count: enrollmentCount }] = await db
      .select({ count: count() })
      .from(enrollments)
      .where(eq(enrollments.packageId, p.id));
    if (enrollmentCount > 0) {
      bump("packages", false);
      continue;
    }
    const [{ count: offeringCount }] = await db
      .select({ count: count() })
      .from(scheduleOfferings)
      .where(eq(scheduleOfferings.packageId, p.id));
    if (offeringCount > 0) {
      bump("packages", false);
      continue;
    }
    // package_components cascade with the package row.
    await db.delete(packages).where(eq(packages.id, p.id));
    bump("packages", true);
  }

  // 4. Vehicles — skip if any session still references them.
  const expectedVehicleNames = new Set<string>();
  for (const loc of allLocs) {
    for (const n of vehicleNamesForLocation({ id: loc.id, name: loc.name })) {
      expectedVehicleNames.add(n);
    }
  }
  if (expectedVehicleNames.size > 0) {
    const vehRows = await db
      .select({ id: vehicles.id, name: vehicles.name })
      .from(vehicles)
      .where(eq(vehicles.tenantId, tenantId));
    const candidates = vehRows.filter((v) => expectedVehicleNames.has(v.name));
    for (const v of candidates) {
      const [{ count: sessionCount }] = await db
        .select({ count: count() })
        .from(scheduleSessions)
        .where(eq(scheduleSessions.vehicleId, v.id));
      if (sessionCount > 0) {
        bump("vehicles", false);
        continue;
      }
      await db.delete(vehicles).where(eq(vehicles.id, v.id));
      bump("vehicles", true);
    }
  }

  // 5. Online courses — skip if any enrollment references them.
  const expectedCourseNames = new Set(ONLINE_COURSE_SEEDS.map((c) => c.name));
  const courseRows = await db
    .select({ id: onlineCourses.id, name: onlineCourses.name })
    .from(onlineCourses)
    .where(eq(onlineCourses.tenantId, tenantId));
  const candidateCourses = courseRows.filter((c) => expectedCourseNames.has(c.name));
  for (const c of candidateCourses) {
    const [{ count: enrollmentCount }] = await db
      .select({ count: count() })
      .from(enrollments)
      .where(eq(enrollments.onlineCourseId, c.id));
    if (enrollmentCount > 0) {
      bump("online_courses", false);
      continue;
    }
    await db.delete(onlineCourses).where(eq(onlineCourses.id, c.id));
    bump("online_courses", true);
  }

  // 6. Promotions — match by templated headline, no inbound dependencies that hold customer data.
  const expectedHeadlines = new Set<string>();
  for (const tpl of PROMO_HEADLINE_TEMPLATES) {
    for (const loc of allLocs) expectedHeadlines.add(tpl.replace("{location}", loc.name));
  }
  if (expectedHeadlines.size > 0) {
    const promRows = await db
      .select({ id: promotions.id, headline: promotions.headline })
      .from(promotions)
      .where(eq(promotions.tenantId, tenantId));
    const ids = promRows.filter((p) => expectedHeadlines.has(p.headline)).map((p) => p.id);
    if (ids.length > 0) {
      await db.delete(promotions).where(inArray(promotions.id, ids));
    }
    bump("promotions", true, ids.length);
  }

  return { tenantId, counts };
}

// ---------- Public entry point ----------

export async function seedDemoTenant(opts: SeedDemoOptions): Promise<SeedDemoSummary> {
  const ctx = await resolveContext(opts);
  const stats = makeStats();
  const packageIdByName = await seedPackages(opts.tenantId, stats.bump);
  const vehicleByName = await seedVehicles(opts.tenantId, ctx.locs, stats.bump);
  await seedOnlineCoursesForTenant(opts.tenantId, stats.bump);
  await seedOfferingsAndSessions(
    opts.tenantId,
    ctx.locs,
    packageIdByName,
    vehicleByName,
    ctx.instructorByLoc,
    stats.bump,
  );
  await seedStandaloneSessions(opts.tenantId, ctx.locs, vehicleByName, ctx.instructorByLoc, stats.bump);
  await seedPromotionsForTenant(opts.tenantId, ctx.locs, packageIdByName, stats.bump);
  return {
    tenantId: opts.tenantId,
    locationIds: ctx.locs.map((l) => l.id),
    counts: stats.counts,
  };
}
