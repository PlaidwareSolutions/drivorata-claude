process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-package-cohorts";
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
  bookings,
  enrollments,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let locationId: number;
let adminUserId: string;
const createdUserIds: string[] = [];
const createdEnrollmentIds: number[] = [];

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@pca-test.local`,
  };
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
    .values({ name: `PCA ${ts}`, slug: `pca-${ts}` })
    .returning();
  tenantId = tenant.id;

  const [loc] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc", address: "1 St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationId = loc.id;

  adminUserId = `pca-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@pca-test.local`,
    firstName: "P",
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
    if (tenantId) {
      const offIds = (
        await db.select({ id: scheduleOfferings.id }).from(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tenantId))
      ).map((o) => o.id);
      const sessIds = offIds.length
        ? (
            await db.select({ id: scheduleSessions.id }).from(scheduleSessions).where(inArray(scheduleSessions.offeringId, offIds))
          ).map((s) => s.id)
        : [];
      if (sessIds.length) await db.delete(bookings).where(inArray(bookings.sessionId, sessIds));
      if (sessIds.length) await db.delete(scheduleSessions).where(inArray(scheduleSessions.id, sessIds));
      if (offIds.length) await db.delete(scheduleOfferings).where(inArray(scheduleOfferings.id, offIds));
      if (createdEnrollmentIds.length) {
        await db.delete(enrollments).where(inArray(enrollments.id, createdEnrollmentIds));
      }
      await db.delete(packages).where(eq(packages.tenantId, tenantId));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
      await db.delete(locations).where(eq(locations.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("POST /schedule-offerings rejects missing packageId with 400", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      // packageId intentionally omitted
      name: "No-pkg cohort",
      capacity: 10,
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(),
      status: "DRAFT",
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.message, "Invalid data");
  assert.ok(Array.isArray(body.errors));
});

test("DELETE /schedule-offerings/:id returns strict 409 when bookings exist (no cascade bypass)", async () => {
  // Create a package
  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Del Pkg",
      price: 10000,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();

  // Create an offering
  const [off] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId,
      packageId: pkg.id,
      locationId,
      name: "Del Cohort",
      capacity: 10,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 86400000 + 3600000),
      status: "PUBLISHED",
    })
    .returning();

  // Create a session for that offering
  const [sess] = await db
    .insert(scheduleSessions)
    .values({
      tenantId,
      type: "CLASSROOM",
      locationId,
      startAt: new Date(Date.now() + 86400000),
      endAt: new Date(Date.now() + 86400000 + 3600000),
      capacity: 10,
      status: "SCHEDULED",
      offeringId: off.id,
    })
    .returning();

  // Create a stub enrollment so we can satisfy bookings.enrollmentId NOT NULL
  const [enr] = await db
    .insert(enrollments)
    .values({
      tenantId,
      packageId: pkg.id,
      firstName: "B",
      lastName: "Ooked",
      email: `booked-${Date.now()}@pca.local`,
      phone: "555-0001",
      paymentStatus: "PENDING",
      status: "pending",
    })
    .returning();
  createdEnrollmentIds.push(enr.id);

  // Create a BOOKED booking
  await db.insert(bookings).values({
    tenantId,
    enrollmentId: enr.id,
    sessionId: sess.id,
    status: "BOOKED",
  });

  // First: vanilla DELETE → 409
  const res1 = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${off.id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  assert.equal(res1.status, 409);
  const body1 = await res1.json();
  assert.ok(Array.isArray(body1.sessionIdsWithBookings));
  assert.ok(body1.sessionIdsWithBookings.includes(sess.id));

  // Second: cascade=true must NOT bypass — endpoint no longer accepts it.
  const res2 = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${off.id}?cascade=true`,
    { method: "DELETE", headers: adminHeaders() },
  );
  assert.equal(res2.status, 409, "cascade=true must not bypass booking protection");

  // Verify the offering and session still exist.
  const stillOff = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.id, off.id));
  assert.equal(stillOff.length, 1);
  const stillSess = await db.select().from(scheduleSessions).where(eq(scheduleSessions.id, sess.id));
  assert.equal(stillSess.length, 1);
});

test("DELETE /schedule-offerings/:id succeeds and removes offering+sessions when no bookings", async () => {
  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Del Pkg OK",
      price: 5000,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();

  const [off] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId,
      packageId: pkg.id,
      locationId,
      name: "Cohort OK",
      capacity: 10,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 86400000 + 3600000),
      status: "PUBLISHED",
    })
    .returning();

  const [s1] = await db
    .insert(scheduleSessions)
    .values({
      tenantId,
      type: "CLASSROOM",
      locationId,
      startAt: new Date(Date.now() + 86400000),
      endAt: new Date(Date.now() + 86400000 + 3600000),
      capacity: 10,
      status: "SCHEDULED",
      offeringId: off.id,
    })
    .returning();
  const [s2] = await db
    .insert(scheduleSessions)
    .values({
      tenantId,
      type: "CLASSROOM",
      locationId,
      startAt: new Date(Date.now() + 2 * 86400000),
      endAt: new Date(Date.now() + 2 * 86400000 + 3600000),
      capacity: 10,
      status: "SCHEDULED",
      offeringId: off.id,
    })
    .returning();

  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/schedule-offerings/${off.id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  assert.equal(res.status, 200, "delete should succeed when no bookings exist");

  const goneOff = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.id, off.id));
  assert.equal(goneOff.length, 0, "offering should be removed");
  const goneSess = await db
    .select()
    .from(scheduleSessions)
    .where(inArray(scheduleSessions.id, [s1.id, s2.id]));
  assert.equal(goneSess.length, 0, "associated sessions should be removed transactionally");
});

test("POST /packages with cohorts is atomic — invalid cohort rolls back the whole package", async () => {
  const before = (await db.select({ id: packages.id }).from(packages).where(eq(packages.tenantId, tenantId))).length;

  // Send a cohort with an end date BEFORE the start date so that the
  // resulting recurrence yields zero sessions but we still expect a clean
  // success — then send an invalid cohort schema (capacity 0) to force a
  // ZodError mid-array which must roll back everything.
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const endsAt = new Date(Date.now() + 86400000 + 3600000).toISOString();
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      name: `Atomic-${Date.now()}`,
      price: 12345,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      creditClassroom: 0,
      creditDrive: 0,
      locationScopeMode: "ALL_LOCATIONS",
      cohorts: [
        {
          offering: {
            name: "Good cohort",
            capacity: 10,
            startsAt,
            endsAt,
            status: "DRAFT",
          },
        },
        {
          offering: {
            // Invalid: empty name
            name: "",
            capacity: 10,
            startsAt,
            endsAt,
            status: "DRAFT",
          },
        },
      ],
    }),
  });
  assert.equal(res.status, 400);

  const after = (await db.select({ id: packages.id }).from(packages).where(eq(packages.tenantId, tenantId))).length;
  assert.equal(after, before, "no package row should be created when any cohort is invalid");
});

test("POST /packages with valid cohorts + recurrence + skipDates creates package, offerings and sessions", async () => {
  // 5 weekday occurrences in a Mon-Fri week, then skip one of them.
  // Pick a known Monday (UTC-safe enough for date-only inputs in local TZ).
  const startDate = "2030-01-07"; // Monday
  const endDate = "2030-01-11"; // Friday
  const skip = "2030-01-09"; // Wednesday → skipped
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      name: `Recur-${Date.now()}`,
      price: 50000,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      creditClassroom: 0,
      creditDrive: 0,
      locationScopeMode: "ALL_LOCATIONS",
      cohorts: [
        {
          offering: {
            name: "Recur cohort",
            capacity: 10,
            startsAt: new Date(`${startDate}T09:00:00`).toISOString(),
            endsAt: new Date(`${endDate}T11:00:00`).toISOString(),
            status: "DRAFT",
          },
          recurrence: {
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: "09:00",
            endTime: "11:00",
            startDate,
            endDate,
            skipDates: [skip],
          },
        },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const pkg = (await res.json()) as { id: number };

  const offs = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.packageId, pkg.id));
  assert.equal(offs.length, 1);
  const sess = await db.select().from(scheduleSessions).where(eq(scheduleSessions.offeringId, offs[0].id));
  // 5 weekdays - 1 skip = 4 sessions
  assert.equal(sess.length, 4);
});

test("POST /packages with explicit cohorts[].sessions list creates exactly those sessions", async () => {
  const s1 = new Date(Date.now() + 2 * 86400000);
  const e1 = new Date(s1.getTime() + 60 * 60 * 1000);
  const s2 = new Date(Date.now() + 3 * 86400000);
  const e2 = new Date(s2.getTime() + 60 * 60 * 1000);
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      name: `Explicit-${Date.now()}`,
      price: 1000,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      creditClassroom: 0,
      creditDrive: 0,
      locationScopeMode: "ALL_LOCATIONS",
      cohorts: [
        {
          offering: {
            name: "Explicit cohort",
            capacity: 5,
            startsAt: s1.toISOString(),
            endsAt: e2.toISOString(),
            status: "DRAFT",
          },
          sessions: [
            { startAt: s1.toISOString(), endAt: e1.toISOString() },
            { startAt: s2.toISOString(), endAt: e2.toISOString() },
          ],
        },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const pkg = (await res.json()) as { id: number };
  const offs = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.packageId, pkg.id));
  assert.equal(offs.length, 1);
  const sess = await db.select().from(scheduleSessions).where(eq(scheduleSessions.offeringId, offs[0].id));
  assert.equal(sess.length, 2);
});
