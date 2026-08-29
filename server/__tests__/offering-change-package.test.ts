process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-offering-change-pkg";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import {
  users,
  tenants,
  tenantMembers,
  packages,
  locations,
  scheduleOfferings,
  scheduleSessions,
  enrollments,
  bookings,
  auditEvents,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let otherTenantId: number;
let locationId: number;
let adminUserId: string;
const createdUserIds: string[] = [];

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@ocp-test.local`,
  };
}

async function insertPkg(values: Partial<typeof packages.$inferInsert> & { name: string; tenantId: number }) {
  const [row] = await db
    .insert(packages)
    .values({
      price: 10000,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      kind: "SIMPLE",
      ...values,
    } as any)
    .returning();
  return row;
}

async function insertOffering(packageId: number) {
  const [row] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId,
      packageId,
      locationId,
      name: `Cohort ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      capacity: 20,
      startsAt: new Date(Date.now() + 7 * 86400000),
      endsAt: new Date(Date.now() + 14 * 86400000),
      status: "DRAFT",
    })
    .returning();
  return row;
}

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) =>
    server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `OCP ${ts}`, slug: `ocp-${ts}` })
    .returning();
  tenantId = tenant.id;
  const [otherTenant] = await db
    .insert(tenants)
    .values({ name: `OCP-OTHER ${ts}`, slug: `ocp-other-${ts}` })
    .returning();
  otherTenantId = otherTenant.id;

  const [loc] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc", address: "1 St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationId = loc.id;

  adminUserId = `ocp-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@ocp-test.local`,
    firstName: "O",
    lastName: "Admin",
  });
  createdUserIds.push(adminUserId);
  await db.insert(tenantMembers).values({
    tenantId,
    userId: adminUserId,
    role: "tenant_admin",
    status: "ACTIVE",
    active: true,
  });
});

after(async () => {
  try {
    for (const tid of [tenantId, otherTenantId].filter(Boolean)) {
      await db.delete(bookings).where(eq(bookings.tenantId, tid));
      await db.delete(enrollments).where(eq(enrollments.tenantId, tid));
      await db.delete(scheduleSessions).where(eq(scheduleSessions.tenantId, tid));
      await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tid));
      await db.delete(auditEvents).where(eq(auditEvents.tenantId, tid));
      await db.delete(packages).where(eq(packages.tenantId, tid));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tid));
      await db.delete(locations).where(eq(locations.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("PATCH /schedule-offerings/:oid re-parents to a new package and writes OFFERING_PACKAGE_CHANGED audit", async () => {
  const pkgA = await insertPkg({ tenantId, name: "PkgA-1" });
  const pkgB = await insertPkg({ tenantId, name: "PkgB-1" });
  const offering = await insertOffering(pkgA.id);

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${offering.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ packageId: pkgB.id }),
  });
  assert.equal(res.status, 200, `unexpected status: ${await res.clone().text()}`);
  const body = await res.json();
  assert.equal(body.packageId, pkgB.id);

  const audits = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, offering.id));
  const changed = audits.filter((a) => a.action === "OFFERING_PACKAGE_CHANGED");
  assert.equal(changed.length, 1, "expected exactly one audit event for the re-parent");
  const details = changed[0].details as any;
  assert.equal(details.fromPackageId, pkgA.id);
  assert.equal(details.toPackageId, pkgB.id);
  assert.equal(changed[0].actorUserId, adminUserId);
});

test("PATCH /schedule-offerings/:oid with same packageId is a no-op (no audit written)", async () => {
  const pkg = await insertPkg({ tenantId, name: "PkgSame" });
  const offering = await insertOffering(pkg.id);

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${offering.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ packageId: pkg.id, notes: "tweak" }),
  });
  assert.equal(res.status, 200);

  const audits = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, offering.id));
  const changed = audits.filter((a) => a.action === "OFFERING_PACKAGE_CHANGED");
  assert.equal(changed.length, 0, "no audit event should be written when packageId is unchanged");
});

test("PATCH /schedule-offerings/:oid returns 409 OFFERING_PACKAGE_AUDIENCE_MISMATCH when target ageMin/ageMax excludes an enrollee", async () => {
  const teenPkg = await insertPkg({ tenantId, name: "Teen Pkg", ageMin: 14, ageMax: 17 });
  const adultPkg = await insertPkg({ tenantId, name: "Adult Pkg", ageMin: 18, ageMax: 99 });
  const offering = await insertOffering(teenPkg.id);

  // Enroll a 15-year-old who is fine on teenPkg but excluded by adultPkg.
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 15);
  const dobStr = dob.toISOString().slice(0, 10);

  const [enrollment] = await db.insert(enrollments).values({
    tenantId,
    packageId: teenPkg.id,
    offeringId: offering.id,
    firstName: "Tina",
    lastName: "Teen",
    email: `tina-${Date.now()}@example.com`,
    dateOfBirth: dobStr,
    status: "confirmed",
  } as any).returning();

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${offering.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ packageId: adultPkg.id }),
  });
  assert.equal(res.status, 409, `unexpected status: ${await res.clone().text()}`);
  const body = await res.json();
  assert.equal(body.code, "OFFERING_PACKAGE_AUDIENCE_MISMATCH");
  assert.ok(Array.isArray(body.conflictingEnrollmentIds));
  assert.ok(body.conflictingEnrollmentIds.includes(enrollment.id));

  // Verify offering was NOT moved and no audit row was written.
  const [after] = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.id, offering.id));
  assert.equal(after.packageId, teenPkg.id);
  const audits = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, offering.id));
  assert.equal(audits.filter((a) => a.action === "OFFERING_PACKAGE_CHANGED").length, 0);
});

test("PATCH /schedule-offerings/:oid rejects cross-tenant target package with 400", async () => {
  const pkgA = await insertPkg({ tenantId, name: "MyPkg" });
  const offering = await insertOffering(pkgA.id);
  const foreignPkg = await insertPkg({ tenantId: otherTenantId, name: "Foreign Pkg" });

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${offering.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ packageId: foreignPkg.id }),
  });
  assert.equal(res.status, 400, `unexpected status: ${await res.clone().text()}`);
  const [after] = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.id, offering.id));
  assert.equal(after.packageId, pkgA.id);
});

test("GET /schedule-offerings/:oid/move-impact returns booked session + confirmed enrollment counts", async () => {
  const pkg = await insertPkg({ tenantId, name: "ImpactPkg" });
  const offering = await insertOffering(pkg.id);

  // 1 session with a BOOKED booking, 1 session with no bookings.
  const [session1] = await db.insert(scheduleSessions).values({
    tenantId,
    offeringId: offering.id,
    locationId,
    type: "CLASSROOM",
    capacity: 10,
    startAt: new Date(Date.now() + 8 * 86400000),
    endAt: new Date(Date.now() + 8 * 86400000 + 2 * 3600000),
    status: "SCHEDULED",
  } as any).returning();
  await db.insert(scheduleSessions).values({
    tenantId,
    offeringId: offering.id,
    locationId,
    type: "CLASSROOM",
    capacity: 10,
    startAt: new Date(Date.now() + 9 * 86400000),
    endAt: new Date(Date.now() + 9 * 86400000 + 2 * 3600000),
    status: "SCHEDULED",
  } as any);

  const [enrollment] = await db.insert(enrollments).values({
    tenantId,
    packageId: pkg.id,
    offeringId: offering.id,
    firstName: "Sam",
    lastName: "Student",
    email: `sam-${Date.now()}@example.com`,
    dateOfBirth: "2005-03-15",
    status: "confirmed",
  } as any).returning();
  // Cancelled enrollment should NOT count.
  await db.insert(enrollments).values({
    tenantId,
    packageId: pkg.id,
    offeringId: offering.id,
    firstName: "Cancel",
    lastName: "Ed",
    email: `cancelled-${Date.now()}@example.com`,
    status: "cancelled",
  } as any);

  await db.insert(bookings).values({
    tenantId,
    enrollmentId: enrollment.id,
    sessionId: session1.id,
    status: "BOOKED",
  } as any);

  const res = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${offering.id}/move-impact`,
    { headers: adminHeaders() },
  );
  assert.equal(res.status, 200, `unexpected status: ${await res.clone().text()}`);
  const body = await res.json();
  assert.equal(body.offeringId, offering.id);
  assert.equal(body.currentPackageId, pkg.id);
  assert.equal(body.bookedSessionCount, 1);
  assert.equal(body.confirmedEnrollmentCount, 1);
  assert.ok(Array.isArray(body.enrolleeAges));
  assert.equal(body.enrolleeAges.length, 1);
});

test("PATCH /schedule-offerings/:oid move with existing bookings preserves enrollment price snapshot and re-parents cohort+sessions+bookings", async () => {
  const pkgA = await insertPkg({ tenantId, name: "SnapPkgA", price: 10000 });
  const pkgB = await insertPkg({ tenantId, name: "SnapPkgB", price: 25000 });
  const offering = await insertOffering(pkgA.id);

  const [session1] = await db.insert(scheduleSessions).values({
    tenantId,
    offeringId: offering.id,
    locationId,
    type: "CLASSROOM",
    capacity: 10,
    startAt: new Date(Date.now() + 11 * 86400000),
    endAt: new Date(Date.now() + 11 * 86400000 + 2 * 3600000),
    status: "SCHEDULED",
  } as any).returning();

  // Enrollment was priced when pkgA was the parent — snapshot must NOT change.
  const [enrollment] = await db.insert(enrollments).values({
    tenantId,
    packageId: pkgA.id,
    offeringId: offering.id,
    firstName: "Snap",
    lastName: "Shot",
    email: `snap-${Date.now()}@example.com`,
    dateOfBirth: "2000-01-01",
    status: "confirmed",
    priceSnapshotCents: 10000,
  } as any).returning();

  const [booking] = await db.insert(bookings).values({
    tenantId,
    enrollmentId: enrollment.id,
    sessionId: session1.id,
    status: "BOOKED",
  } as any).returning();

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${offering.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ packageId: pkgB.id }),
  });
  assert.equal(res.status, 200, `unexpected status: ${await res.clone().text()}`);

  // Offering moved.
  const [afterOff] = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.id, offering.id));
  assert.equal(afterOff.packageId, pkgB.id);

  // Sessions & bookings stay with the cohort (not deleted, still referenced by offeringId).
  const sessionsAfter = await db.select().from(scheduleSessions).where(eq(scheduleSessions.offeringId, offering.id));
  assert.equal(sessionsAfter.length, 1);
  assert.equal(sessionsAfter[0].id, session1.id);
  const [bookingAfter] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
  assert.equal(bookingAfter.sessionId, session1.id);
  assert.equal(bookingAfter.status, "BOOKED");

  // Critical: existing enrollment price snapshot is unchanged (frozen at pkgA's price).
  const [enrollmentAfter] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment.id));
  assert.equal(
    enrollmentAfter.priceSnapshotCents,
    10000,
    "prior enrollment price snapshot must remain frozen at the original package's price",
  );

  // Audit row exists with the from/to package IDs.
  const audits = await db.select().from(auditEvents).where(eq(auditEvents.targetId, offering.id));
  const changed = audits.filter((a) => a.action === "OFFERING_PACKAGE_CHANGED");
  assert.equal(changed.length, 1);
  const details = changed[0].details as any;
  assert.equal(details.fromPackageId, pkgA.id);
  assert.equal(details.toPackageId, pkgB.id);
});
