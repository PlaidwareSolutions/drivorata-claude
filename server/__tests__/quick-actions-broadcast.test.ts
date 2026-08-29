process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-quick-actions-broadcast";
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
  tenants,
  users,
  tenantMembers,
  packages,
  locations,
  enrollments,
  payments,
  notifications,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let adminUserId: string;
let studentUserId: string;
let parentUserId: string;
let instructorUserId: string;
let nonAdminUserId: string;
let packageId: number;
let locationId: number;
let secondLocationId: number;

const createdEnrollmentIds: number[] = [];
const createdPaymentIds: number[] = [];
const createdUserIds: string[] = [];

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) =>
    server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

async function stopServer(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function adminHeaders(userId: string = adminUserId) {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": userId,
    "x-test-user-email": `${userId}@qab-test.local`,
  };
}

before(async () => {
  const ts = Date.now();
  const slug = `qab-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `QAB ${ts}`, slug })
    .returning();
  tenantId = tenant.id;

  const [locA] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc A", address: "1 A St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationId = locA.id;
  const [locB] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc B", address: "1 B St", city: "Austin", state: "TX", zip: "78702" })
    .returning();
  secondLocationId = locB.id;

  // Admin user
  adminUserId = `qab-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@qab-test.local`,
    firstName: "Q",
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

  // Non-admin user (student role)
  nonAdminUserId = `qab-nonadmin-${ts}`;
  await db.insert(users).values({
    id: nonAdminUserId,
    email: `${nonAdminUserId}@qab-test.local`,
    firstName: "N",
    lastName: "Student",
  });
  createdUserIds.push(nonAdminUserId);
  await db.insert(tenantMembers).values({
    tenantId,
    userId: nonAdminUserId,
    role: "student",
    status: "ACTIVE",
    active: true,
  });

  // Audience members
  studentUserId = `qab-student-${ts}`;
  await db.insert(users).values({
    id: studentUserId,
    email: `${studentUserId}@qab-test.local`,
    firstName: "S",
    lastName: "Tudent",
  });
  createdUserIds.push(studentUserId);
  await db.insert(tenantMembers).values({
    tenantId,
    userId: studentUserId,
    role: "student",
    status: "ACTIVE",
    active: true,
  });

  parentUserId = `qab-parent-${ts}`;
  await db.insert(users).values({
    id: parentUserId,
    email: `${parentUserId}@qab-test.local`,
    firstName: "P",
    lastName: "Arent",
  });
  createdUserIds.push(parentUserId);
  await db.insert(tenantMembers).values({
    tenantId,
    userId: parentUserId,
    role: "parent",
    status: "ACTIVE",
    active: true,
  });

  instructorUserId = `qab-instr-${ts}`;
  await db.insert(users).values({
    id: instructorUserId,
    email: `${instructorUserId}@qab-test.local`,
    firstName: "I",
    lastName: "Nstr",
  });
  createdUserIds.push(instructorUserId);
  await db.insert(tenantMembers).values({
    tenantId,
    userId: instructorUserId,
    role: "instructor",
    status: "ACTIVE",
    active: true,
  });

  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "QAB Package",
      price: 19900,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  packageId = pkg.id;

  await startServer();
});

after(async () => {
  try {
    if (createdPaymentIds.length) {
      await db.delete(payments).where(inArray(payments.id, createdPaymentIds));
    }
    if (createdEnrollmentIds.length) {
      await db.delete(payments).where(inArray(payments.enrollmentId, createdEnrollmentIds));
      await db.delete(enrollments).where(inArray(enrollments.id, createdEnrollmentIds));
    }
    if (createdUserIds.length) {
      await db.delete(notifications).where(inArray(notifications.userId, createdUserIds));
    }
    if (tenantId) {
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
      await db.delete(packages).where(eq(packages.tenantId, tenantId));
      await db.delete(locations).where(eq(locations.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  } catch (e) {
    console.error("teardown error:", e);
  }
  await stopServer();
});

test("admin-enroll: forbidden for non-admin role", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/admin-enroll`, {
    method: "POST",
    headers: adminHeaders(nonAdminUserId),
    body: JSON.stringify({
      packageId,
      firstName: "Walk",
      lastName: "In",
      email: `walkin-${Date.now()}@qab-test.local`,
      paymentMethod: "PENDING",
    }),
  });
  assert.equal(res.status, 403);
});

test("admin-enroll: validates required fields", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/admin-enroll`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ packageId, firstName: "", lastName: "", email: "not-an-email" }),
  });
  assert.equal(res.status, 400);
});

test("admin-enroll: PENDING creates enrollment with no payment", async () => {
  const email = `walkin-pending-${Date.now()}@qab-test.local`;
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/admin-enroll`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      packageId,
      locationId,
      firstName: "Walk",
      lastName: "Pending",
      email,
      paymentMethod: "PENDING",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.enrollmentId, "enrollmentId should be returned");
  assert.equal(body.status, "pending");
  assert.equal(body.paymentId, null);
  createdEnrollmentIds.push(body.enrollmentId);
});

test("admin-enroll: CASH_PAID creates COMPLETED CASH payment and confirms", async () => {
  const email = `walkin-cash-${Date.now()}@qab-test.local`;
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/admin-enroll`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      packageId,
      locationId,
      firstName: "Walk",
      lastName: "Cash",
      email,
      paymentMethod: "CASH_PAID",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.enrollmentId);
  assert.ok(body.paymentId, "paymentId should be returned");
  assert.equal(body.status, "confirmed");
  createdEnrollmentIds.push(body.enrollmentId);
  createdPaymentIds.push(body.paymentId);

  const pay = await db.select().from(payments).where(eq(payments.id, body.paymentId));
  assert.equal(pay.length, 1);
  assert.equal(pay[0].provider, "CASH");
  assert.equal(pay[0].status, "COMPLETED");
  assert.equal(pay[0].enrollmentId, body.enrollmentId);
});

test("admin-enroll: rejects packageId from a different tenant", async () => {
  // Create a foreign tenant + package
  const ts = Date.now();
  const [otherTenant] = await db
    .insert(tenants)
    .values({ name: `QAB-other-${ts}`, slug: `qab-other-${ts}` })
    .returning();
  const [otherPkg] = await db
    .insert(packages)
    .values({
      tenantId: otherTenant.id,
      name: "Foreign Package",
      price: 1000,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  try {
    const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/admin-enroll`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        packageId: otherPkg.id,
        firstName: "X",
        lastName: "Y",
        email: `x-${ts}@qab-test.local`,
        paymentMethod: "PENDING",
      }),
    });
    assert.equal(res.status, 404);
  } finally {
    await db.delete(packages).where(eq(packages.id, otherPkg.id));
    await db.delete(tenants).where(eq(tenants.id, otherTenant.id));
  }
});

test("broadcasts/preview: forbidden for non-admin", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(nonAdminUserId),
    body: JSON.stringify({ audience: "ALL_MEMBERS" }),
  });
  assert.equal(res.status, 403);
});

test("broadcasts/preview: ROLE_STUDENT counts only student members", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ audience: "ROLE_STUDENT" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  // Two student members exist: nonAdminUserId + studentUserId
  assert.ok(body.recipientCount >= 2, `expected >=2 recipients, got ${body.recipientCount}`);
  assert.equal(body.recipientCount, body.emailCount);
  assert.equal(body.recipientCount, body.inAppCount);
});

test("broadcasts/preview: ROLE_PARENT counts only parents", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ audience: "ROLE_PARENT" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.recipientCount, 1);
});

test("broadcasts: send to ROLE_INSTRUCTOR via inApp creates notification rows", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "ROLE_INSTRUCTOR",
      channels: { email: false, inApp: true },
      subject: "Heads up team",
      body: "Reminder: please log your sessions today.",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.recipients >= 1, `expected recipients >=1, got ${body.recipients}`);
  assert.ok(body.notifications >= 1, `expected notifications >=1, got ${body.notifications}`);

  // Verify the instructor actually got a notification row
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, instructorUserId));
  assert.ok(
    rows.some((r) => r.title === "Heads up team"),
    "instructor should have received the broadcast notification",
  );
});

test("broadcasts: validates that at least one channel is selected", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "ROLE_STUDENT",
      channels: { email: false, inApp: false },
      subject: "x",
      body: "y",
    }),
  });
  assert.equal(res.status, 400);
});

test("broadcasts: empty audience returns 400", async () => {
  // Filter to a location that no one is scoped to (using ROLE_OFFICE_MANAGER which has no members)
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "ROLE_OFFICE_MANAGER",
      channels: { email: true, inApp: true },
      subject: "Hello",
      body: "World",
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /No recipients/i);
});

test("broadcasts/preview: CUSTOM_EMAIL_LIST resolves provided addresses", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "CUSTOM_EMAIL_LIST",
      customEmails: [
        "fresh1@external.example.com",
        "fresh2@external.example.com",
        `${studentUserId}@qab-test.local`, // existing user — should still resolve
      ],
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.recipientCount, 3);
  assert.equal(body.emailCount, 3);
  assert.ok(Array.isArray(body.sampleNames));
  assert.ok(body.sampleNames.length <= 5);
});

test("broadcasts/preview: CUSTOM_EMAIL_LIST without emails returns zero", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "CUSTOM_EMAIL_LIST",
      customEmails: [],
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.recipientCount, 0);
});

test("broadcasts/preview: ROSTER_OF_OFFERING with no offering returns zero", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "ROSTER_OF_OFFERING",
      offeringId: 999999999,
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.recipientCount, 0);
});

test("broadcasts/preview: STALE_CREDIT_STUDENTS accepts staleDays parameter", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "STALE_CREDIT_STUDENTS",
      staleDays: 30,
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(typeof body.recipientCount, "number");
  assert.ok(Array.isArray(body.sampleNames));
});

test("broadcasts/preview: returns sampleNames array", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ audience: "ROLE_STUDENT" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.sampleNames));
  assert.ok(body.sampleNames.length <= 5);
  assert.ok(body.sampleNames.length > 0);
});

test("broadcasts: CUSTOM_EMAIL_LIST never delivers in-app to a user from a different tenant", async () => {
  const ts = Date.now();
  const otherSlug = `qab-other-${ts}`;
  const [otherTenant] = await db
    .insert(tenants)
    .values({ name: `QAB Other ${ts}`, slug: otherSlug })
    .returning();
  const foreignUserId = `qab-foreign-${ts}`;
  const foreignEmail = `${foreignUserId}@qab-test.local`;
  await db.insert(users).values({
    id: foreignUserId,
    email: foreignEmail,
    firstName: "F",
    lastName: "Oreign",
  });
  await db.insert(tenantMembers).values({
    tenantId: otherTenant.id,
    userId: foreignUserId,
    role: "student",
    status: "ACTIVE",
    active: true,
  });

  try {
    // Preview should not surface the foreign user as an in-app recipient.
    const previewRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        audience: "CUSTOM_EMAIL_LIST",
        customEmails: [foreignEmail],
      }),
    });
    const previewBody = await previewRes.json();
    assert.equal(previewRes.status, 200, JSON.stringify(previewBody));
    assert.equal(previewBody.recipientCount, 1);
    assert.equal(previewBody.emailCount, 1);
    assert.equal(previewBody.inAppCount, 0, "foreign-tenant user must not be counted as in-app recipient");

    // Send: in-app channel must NOT create a notification row for the foreign user.
    const sendRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        audience: "CUSTOM_EMAIL_LIST",
        customEmails: [foreignEmail],
        channels: { email: false, inApp: true },
        subject: "Cross-tenant guard test",
        body: "Should never reach you.",
      }),
    });
    // No in-app recipients → tally should report 0 notifications. The send may
    // still succeed (200) because the recipient list is non-empty.
    const sendBody = await sendRes.json();
    if (sendRes.status === 200) {
      assert.equal(sendBody.notifications, 0, "no notifications should be created for foreign-tenant user");
    } else {
      // Acceptable: rejected because no inApp targets.
      assert.equal(sendRes.status, 400);
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, foreignUserId));
    assert.equal(rows.length, 0, "no notification row should exist for the foreign-tenant user");
  } finally {
    await db.delete(notifications).where(eq(notifications.userId, foreignUserId));
    await db.delete(tenantMembers).where(eq(tenantMembers.userId, foreignUserId));
    await db.delete(users).where(eq(users.id, foreignUserId));
    await db.delete(tenants).where(eq(tenants.id, otherTenant.id));
  }
});

test("broadcasts/preview: rejects invalid email in CUSTOM_EMAIL_LIST", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/broadcasts/preview`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      audience: "CUSTOM_EMAIL_LIST",
      customEmails: ["not-an-email"],
    }),
  });
  assert.equal(res.status, 400);
});
