process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-seed-demo-tenant";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../db";
import {
  users,
  tenants,
  tenantMembers,
  locations,
  packages,
  packageComponents,
  vehicles,
  scheduleOfferings,
  scheduleSessions,
  promotions,
  onlineCourses,
  enrollments,
  bookings,
  offeringWaitlist,
} from "@shared/schema";
import { seedDemoTenant, clearDemoTenant } from "../seed-demo-tenant";

let tenantId: number;
let locationIds: number[] = [];
let instructorUserId: string;
const cleanup: (() => Promise<void>)[] = [];

before(async () => {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `Seed Demo ${ts}`, slug: `seed-demo-${ts}` })
    .returning();
  tenantId = tenant.id;

  const [loc1] = await db
    .insert(locations)
    .values({ tenantId, name: `North ${ts}`, address: "100 N St", city: "Austin", state: "TX", zip: "78701", active: true })
    .returning();
  const [loc2] = await db
    .insert(locations)
    .values({ tenantId, name: `South ${ts}`, address: "200 S St", city: "Austin", state: "TX", zip: "78702", active: true })
    .returning();
  locationIds = [loc1.id, loc2.id];

  instructorUserId = `seed-demo-instr-${ts}`;
  await db.insert(users).values({
    id: instructorUserId,
    email: `instr-${ts}@seed-demo.local`,
    firstName: "Demo",
    lastName: "Instructor",
  });
  await db.insert(tenantMembers).values({
    tenantId,
    userId: instructorUserId,
    role: "instructor",
    status: "ACTIVE",
    active: true,
    locationScope: locationIds,
  });

  cleanup.push(async () => {
    // Cascade-delete most rows by removing the tenant; users are cleaned separately.
    await db.delete(scheduleSessions).where(eq(scheduleSessions.tenantId, tenantId));
    await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tenantId));
    await db.delete(promotions).where(eq(promotions.tenantId, tenantId));
    await db.delete(onlineCourses).where(eq(onlineCourses.tenantId, tenantId));
    await db.delete(vehicles).where(eq(vehicles.tenantId, tenantId));
    const pkgIds = (
      await db.select({ id: packages.id }).from(packages).where(eq(packages.tenantId, tenantId))
    ).map((r) => r.id);
    if (pkgIds.length > 0) {
      await db.delete(packageComponents).where(inArray(packageComponents.packageId, pkgIds));
    }
    await db.delete(packages).where(eq(packages.tenantId, tenantId));
    await db.delete(locations).where(eq(locations.tenantId, tenantId));
    await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(eq(users.id, instructorUserId));
  });
});

after(async () => {
  for (const fn of cleanup.reverse()) {
    await fn().catch(() => undefined);
  }
});

function totals(counts: Record<string, { created: number; existed: number }>) {
  return Object.values(counts).reduce(
    (acc, c) => ({ created: acc.created + c.created, existed: acc.existed + c.existed }),
    { created: 0, existed: 0 },
  );
}

test("seedDemoTenant creates the catalog on first run", async () => {
  const summary = await seedDemoTenant({ tenantId, locationIds, instructorUserId });
  const t = totals(summary.counts);
  assert.ok(t.created > 0, "first run should create rows");
  assert.equal(t.existed, 0, "first run should find no pre-existing rows");
  assert.ok(summary.counts.packages?.created >= 1);
  assert.ok(summary.counts.offerings?.created >= 1);
  assert.ok(
    (summary.counts.offering_classroom_sessions?.created ?? 0) > 0,
    "first run should create classroom sessions",
  );
});

test("seedDemoTenant is idempotent on immediate re-run", async () => {
  const summary = await seedDemoTenant({ tenantId, locationIds, instructorUserId });
  const t = totals(summary.counts);
  assert.equal(t.created, 0, `re-run created rows: ${JSON.stringify(summary.counts)}`);
  assert.ok(t.existed > 0, "re-run should report existing rows");
});

test("seedDemoTenant is idempotent even after the system clock advances", async () => {
  // The reviewer flagged that occurrence dates were originally derived from
  // `today + offset`, which would drift on a later day and double-insert
  // sessions. Anchoring to the persisted offering window must keep the slot
  // keys stable across reruns regardless of when the rerun happens.
  const RealDate = global.Date;
  const advanced = RealDate.now() + 30 * 24 * 60 * 60 * 1000;
  type DateArgs =
    | []
    | [number | string | Date]
    | [number, number, number?, number?, number?, number?, number?];
  class FakeDate extends RealDate {
    constructor(...args: DateArgs) {
      if (args.length === 0) {
        super(advanced);
      } else if (args.length === 1) {
        super(args[0] as number | string | Date);
      } else {
        const [y, m, d = 1, h = 0, mi = 0, s = 0, ms = 0] = args;
        super(y, m, d, h, mi, s, ms);
      }
    }
    static now(): number {
      return advanced;
    }
  }
  global.Date = FakeDate as unknown as DateConstructor;
  try {
    const summary = await seedDemoTenant({ tenantId, locationIds, instructorUserId });
    const t = totals(summary.counts);
    assert.equal(
      summary.counts.offering_classroom_sessions?.created ?? 0,
      0,
      "advancing the clock must not produce new classroom sessions",
    );
    assert.equal(
      summary.counts.offering_drive_sessions?.created ?? 0,
      0,
      "advancing the clock must not produce new drive sessions",
    );
    assert.equal(t.created, 0, `clock-advanced re-run created rows: ${JSON.stringify(summary.counts)}`);
  } finally {
    global.Date = RealDate;
  }
});

function clearTotals(counts: Record<string, { deleted: number; skipped: number }>) {
  return Object.values(counts).reduce(
    (acc, c) => ({ deleted: acc.deleted + c.deleted, skipped: acc.skipped + c.skipped }),
    { deleted: 0, skipped: 0 },
  );
}

test("clearDemoTenant preserves seeded rows referenced by real customer data", async () => {
  // Tenant currently has the seeded catalog from earlier tests. Attach real
  // customer data to a sample of seeded rows: one package via an enrollment,
  // one offering via an enrollment + waitlist + a booking on one of its
  // sessions, and one standalone session via a booking.
  const seededPackages = await db.select().from(packages).where(eq(packages.tenantId, tenantId));
  assert.ok(seededPackages.length > 0, "expected seeded packages from prior tests");
  const protectedPackage = seededPackages[0];

  const seededOfferings = await db
    .select()
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.tenantId, tenantId));
  assert.ok(seededOfferings.length > 0, "expected seeded offerings from prior tests");
  const protectedOffering = seededOfferings[0];

  // Pick a session for the protected offering and a standalone seeded session.
  const protectedOfferingSession = (
    await db
      .select()
      .from(scheduleSessions)
      .where(eq(scheduleSessions.offeringId, protectedOffering.id))
  )[0];
  assert.ok(protectedOfferingSession, "expected a seeded session for the protected offering");
  const standaloneSession = (
    await db
      .select()
      .from(scheduleSessions)
      .where(eq(scheduleSessions.tenantId, tenantId))
  ).find((s) => (s.notes ?? "").startsWith("seed:standalone:"));
  assert.ok(standaloneSession, "expected a seeded standalone session");

  // Insert an enrollment that references the protected package + offering.
  const [protectedEnrollment] = await db
    .insert(enrollments)
    .values({
      tenantId,
      packageId: protectedPackage.id,
      offeringId: protectedOffering.id,
      firstName: "Real",
      lastName: "Customer",
      email: `real-${Date.now()}@example.com`,
      status: "active",
    })
    .returning();

  // Add a waitlist row on the same offering.
  const [waitlistRow] = await db
    .insert(offeringWaitlist)
    .values({
      tenantId,
      offeringId: protectedOffering.id,
      firstName: "Wait",
      lastName: "Lister",
      email: `wait-${Date.now()}@example.com`,
    })
    .returning();

  // Book the standalone session to the enrollment.
  const [standaloneBooking] = await db
    .insert(bookings)
    .values({
      tenantId,
      enrollmentId: protectedEnrollment.id,
      sessionId: standaloneSession.id,
    })
    .returning();

  cleanup.push(async () => {
    await db.delete(bookings).where(eq(bookings.id, standaloneBooking.id)).catch(() => undefined);
    await db.delete(offeringWaitlist).where(eq(offeringWaitlist.id, waitlistRow.id)).catch(() => undefined);
    await db.delete(enrollments).where(eq(enrollments.id, protectedEnrollment.id)).catch(() => undefined);
  });

  const summary = await clearDemoTenant({ tenantId });
  const t = clearTotals(summary.counts);
  assert.ok(t.deleted > 0, `expected some rows to be deleted: ${JSON.stringify(summary.counts)}`);
  assert.ok(t.skipped > 0, `expected some rows to be skipped: ${JSON.stringify(summary.counts)}`);

  // Protected package + offering must still exist.
  const pkgAfter = await db.select().from(packages).where(eq(packages.id, protectedPackage.id));
  assert.equal(pkgAfter.length, 1, "protected package should not be deleted");
  const offAfter = await db
    .select()
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.id, protectedOffering.id));
  assert.equal(offAfter.length, 1, "protected offering should not be deleted");

  // The protected offering's seeded sessions must still exist.
  const protectedOfferingSessionsAfter = await db
    .select()
    .from(scheduleSessions)
    .where(eq(scheduleSessions.offeringId, protectedOffering.id));
  assert.ok(
    protectedOfferingSessionsAfter.length > 0,
    "sessions attached to an in-use offering must be preserved",
  );

  // The booked standalone session must still exist.
  const standaloneAfter = await db
    .select()
    .from(scheduleSessions)
    .where(eq(scheduleSessions.id, standaloneSession.id));
  assert.equal(standaloneAfter.length, 1, "session referenced by a booking must be preserved");

  // Other seeded offerings (no real usage) should be gone.
  const remainingSeededOfferings = await db
    .select()
    .from(scheduleOfferings)
    .where(eq(scheduleOfferings.tenantId, tenantId));
  assert.ok(
    remainingSeededOfferings.length < seededOfferings.length,
    "unused seeded offerings should have been removed",
  );
});

test("clearDemoTenant is idempotent on a clean tenant", async () => {
  // After the first clear, only protected rows remain. Re-running should
  // either delete nothing or leave only the same protected skips.
  const summary = await clearDemoTenant({ tenantId });
  const t = clearTotals(summary.counts);
  assert.equal(t.deleted, 0, `re-run should not delete anything: ${JSON.stringify(summary.counts)}`);
});
