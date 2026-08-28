process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-enrollment-details";
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
  enrollments,
  payments,
  locations,
  onlineCourses,
  carts,
} from "@shared/schema";

type Role =
  | "student"
  | "parent"
  | "instructor"
  | "office_manager"
  | "tenant_admin"
  | "platform_admin";

const ROLES: Role[] = [
  "student",
  "parent",
  "instructor",
  "office_manager",
  "tenant_admin",
  "platform_admin",
];

const ADMIN_ROLES: Role[] = ["tenant_admin", "office_manager", "platform_admin"];
const NON_ADMIN_ROLES: Role[] = ["student", "parent", "instructor"];

let server: Server;
let baseUrl: string;
let tenantId: number;
let otherTenantId: number;
let packageId: number;
let locationId: number;
let onlineCourseId: number;
let cartId: string;
let fullEnrollmentId: number;
let nullsEnrollmentId: number;
let otherTenantEnrollmentId: number;

const userIds: Record<Role, string> = {
  student: "",
  parent: "",
  instructor: "",
  office_manager: "",
  tenant_admin: "",
  platform_admin: "",
};
const createdUserIds: string[] = [];
const cleanup: (() => Promise<void>)[] = [];

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

async function seed(): Promise<void> {
  const ts = Date.now();

  const [tenant] = await db
    .insert(tenants)
    .values({ name: `EDET Test ${ts}`, slug: `edet-test-${ts}` })
    .returning();
  tenantId = tenant.id;
  cleanup.push(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  const [otherTenant] = await db
    .insert(tenants)
    .values({ name: `EDET Other ${ts}`, slug: `edet-other-${ts}` })
    .returning();
  otherTenantId = otherTenant.id;
  cleanup.push(async () => {
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  });

  for (const role of ROLES) {
    const id = `edet-test-${role}-${ts}`;
    await db.insert(users).values({
      id,
      email: `${role}-${ts}@edet-test.local`,
      firstName: role,
      lastName: "Test",
    });
    createdUserIds.push(id);
    userIds[role] = id;
    await db.insert(tenantMembers).values({
      tenantId,
      userId: id,
      role,
      status: "ACTIVE",
      active: true,
    });
  }
  cleanup.push(async () => {
    await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "EDET Package",
      price: 12345,
      classroomHoursRequired: 32,
      driveHoursRequired: 7,
      creditClassroom: 32,
      creditDrive: 7,
      active: true,
    })
    .returning();
  packageId = pkg.id;

  const [loc] = await db
    .insert(locations)
    .values({
      tenantId,
      name: "EDET Location",
      address: "123 Test St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    })
    .returning();
  locationId = loc.id;

  const [oc] = await db
    .insert(onlineCourses)
    .values({
      tenantId,
      name: "EDET Online Course",
      price: 5000,
    })
    .returning();
  onlineCourseId = oc.id;

  const [cart] = await db
    .insert(carts)
    .values({
      tenantId,
      status: "open",
      customerSnapshotJson: { firstName: "Snap", lastName: "Shot", email: `snap-${ts}@edet.local` },
    })
    .returning();
  cartId = cart.id;

  const [fullEnr] = await db
    .insert(enrollments)
    .values({
      tenantId,
      packageId,
      locationId,
      onlineCourseId,
      cartId,
      firstName: "Full",
      lastName: "Detail",
      email: `full-${ts}@edet.local`,
      status: "active",
    })
    .returning();
  fullEnrollmentId = fullEnr.id;

  await db.insert(payments).values({
    tenantId,
    enrollmentId: fullEnrollmentId,
    provider: "CASH",
    status: "COMPLETED",
    amountCents: 12345,
    currency: "USD",
  });

  const [nullsEnr] = await db
    .insert(enrollments)
    .values({
      tenantId,
      firstName: "Null",
      lastName: "Fields",
      email: `nulls-${ts}@edet.local`,
      status: "pending",
    })
    .returning();
  nullsEnrollmentId = nullsEnr.id;

  const [otherEnr] = await db
    .insert(enrollments)
    .values({
      tenantId: otherTenantId,
      firstName: "Other",
      lastName: "Tenant",
      email: `other-${ts}@edet.local`,
      status: "active",
    })
    .returning();
  otherTenantEnrollmentId = otherEnr.id;
}

async function teardown(): Promise<void> {
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.error("cleanup error:", e);
    }
  }
}

async function callAs(
  role: Role,
  path: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { "x-test-user-id": userIds[role] },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

before(async () => {
  await startServer();
  await seed();
});

after(async () => {
  await teardown();
  await stopServer();
});

test("details: returns full aggregated shape for admin when all sources present", async () => {
  for (const role of ADMIN_ROLES) {
    const { status, body } = await callAs(
      role,
      `/api/tenants/${tenantId}/enrollments/${fullEnrollmentId}/details`,
    );
    assert.equal(status, 200, `expected 200 for ${role}, got ${status}`);
    assert.ok(body.enrollment, "expected enrollment in response");
    assert.equal(body.enrollment.id, fullEnrollmentId);
    assert.ok(body.package, "expected package in response");
    assert.equal(body.package.id, packageId);
    assert.ok(body.location, "expected location in response");
    assert.equal(body.location.id, locationId);
    assert.ok(body.onlineCourse, "expected onlineCourse in response");
    assert.equal(body.onlineCourse.id, onlineCourseId);
    assert.equal(body.cartId, cartId);
    assert.ok(body.cartCustomerSnapshot, "expected cart customer snapshot");
    assert.equal(body.cartCustomerSnapshot.firstName, "Snap");
    assert.ok(Array.isArray(body.payments), "expected payments array");
    assert.equal(body.payments.length, 1);
    assert.equal(body.payments[0].status, "COMPLETED");
  }
});

test("details: 403 for non-admin roles", async () => {
  for (const role of NON_ADMIN_ROLES) {
    const { status } = await callAs(
      role,
      `/api/tenants/${tenantId}/enrollments/${fullEnrollmentId}/details`,
    );
    assert.equal(status, 403, `expected 403 for ${role}, got ${status}`);
  }
});

test("details: 404 when enrollment does not belong to tenant", async () => {
  const { status } = await callAs(
    "tenant_admin",
    `/api/tenants/${tenantId}/enrollments/${otherTenantEnrollmentId}/details`,
  );
  assert.equal(status, 404);
});

test("details: gracefully handles null packageId/locationId/onlineCourseId/cartId", async () => {
  const { status, body } = await callAs(
    "tenant_admin",
    `/api/tenants/${tenantId}/enrollments/${nullsEnrollmentId}/details`,
  );
  assert.equal(status, 200);
  assert.ok(body.enrollment);
  assert.equal(body.enrollment.id, nullsEnrollmentId);
  assert.equal(body.package, null);
  assert.equal(body.location, null);
  assert.equal(body.onlineCourse, null);
  assert.equal(body.cartId, null);
  assert.equal(body.cartCustomerSnapshot, null);
  assert.ok(Array.isArray(body.payments));
  assert.equal(body.payments.length, 0);
});
