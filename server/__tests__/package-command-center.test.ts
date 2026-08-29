process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-package-command-center";
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
  creditLedger,
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
const FULFILLABLE_ROLES: Role[] = [
  "tenant_admin",
  "office_manager",
  "platform_admin",
  "instructor",
];

let server: Server;
let baseUrl: string;
let tenantId: number;
let packageId: number;
let oldEnrollmentId: number;
let newEnrollmentId: number;
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
    .values({ name: `PCC Test ${ts}`, slug: `pcc-test-${ts}` })
    .returning();
  tenantId = tenant.id;
  cleanup.push(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  for (const role of ROLES) {
    const id = `pcc-test-${role}-${ts}`;
    await db.insert(users).values({
      id,
      email: `${role}-${ts}@pcc-test.local`,
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
      name: "PCC Test Package",
      price: 10000,
      classroomHoursRequired: 32,
      driveHoursRequired: 7,
      creditClassroom: 32,
      creditDrive: 7,
      active: true,
    })
    .returning();
  packageId = pkg.id;

  // Old enrollment (created 31 days ago) — should appear in setup-health
  // unused-credits list because credits exist with no upcoming bookings.
  const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const [oldEnr] = await db
    .insert(enrollments)
    .values({
      tenantId,
      packageId,
      firstName: "Stale",
      lastName: "Student",
      email: `stale-${ts}@pcc-test.local`,
      status: "active",
      createdAt: oldDate,
      updatedAt: oldDate,
    })
    .returning();
  oldEnrollmentId = oldEnr.id;
  await db.insert(creditLedger).values({
    tenantId,
    enrollmentId: oldEnrollmentId,
    type: "DRIVE",
    delta: 5,
    reason: "PACKAGE_GRANT",
  });

  // New enrollment (created today) — must NOT appear in unused-credits list
  // even though it has credits, because the 30-day grace window applies.
  const [newEnr] = await db
    .insert(enrollments)
    .values({
      tenantId,
      packageId,
      firstName: "Fresh",
      lastName: "Student",
      email: `fresh-${ts}@pcc-test.local`,
      status: "active",
    })
    .returning();
  newEnrollmentId = newEnr.id;
  await db.insert(creditLedger).values({
    tenantId,
    enrollmentId: newEnrollmentId,
    type: "DRIVE",
    delta: 5,
    reason: "PACKAGE_GRANT",
  });
}

async function teardown(): Promise<void> {
  // packages, enrollments, credit_ledger get deleted by tenant cascade.
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.error("cleanup error:", e);
    }
  }
}

async function callAs(role: Role, path: string): Promise<{ status: number; body: any }> {
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
  // Note: registerRoutes() schedules a background cleanup setInterval that
  // keeps the event loop alive. Run this suite with `--test-force-exit` so
  // the runner terminates cleanly without masking real test failures.
});

const adminEndpoints = [
  () => `/api/tenants/${tenantId}/packages/${packageId}/sessions`,
  () => `/api/tenants/${tenantId}/packages/${packageId}/enrollments`,
  () => `/api/tenants/${tenantId}/packages/${packageId}/offerings`,
  () => `/api/tenants/${tenantId}/packages/${packageId}/financials`,
  () => `/api/tenants/${tenantId}/enrollments/${oldEnrollmentId}/credit-balance`,
  () => `/api/tenants/${tenantId}/setup-health`,
];

test("admin-only endpoints: low-privilege roles get 403", async () => {
  for (const role of ROLES) {
    if (ADMIN_ROLES.includes(role)) continue;
    for (const make of adminEndpoints) {
      const path = make();
      const { status } = await callAs(role, path);
      assert.equal(
        status,
        403,
        `expected 403 for ${role} GET ${path}, got ${status}`,
      );
    }
  }
});

test("admin-only endpoints: admin roles get 200", async () => {
  for (const role of ADMIN_ROLES) {
    for (const make of adminEndpoints) {
      const path = make();
      const { status } = await callAs(role, path);
      assert.equal(
        status,
        200,
        `expected 200 for ${role} GET ${path}, got ${status}`,
      );
    }
  }
});

test("fulfillable-packages: low-privilege roles get 403, admin+instructor get 200", async () => {
  // Pick a session id (no real session needed — handler returns [] for unknown
  // ids, which is still 200 OK; what matters is the RBAC gate).
  const path = `/api/tenants/${tenantId}/sessions/0/fulfillable-packages`;
  for (const role of ROLES) {
    const { status } = await callAs(role, path);
    if (FULFILLABLE_ROLES.includes(role)) {
      assert.equal(status, 200, `expected 200 for ${role} (fulfillable), got ${status}`);
    } else {
      assert.equal(status, 403, `expected 403 for ${role} (fulfillable), got ${status}`);
    }
  }
});

test("setup-health 30-day rule: enrollment created <30 days ago is excluded", async () => {
  const { status, body } = await callAs("tenant_admin", `/api/tenants/${tenantId}/setup-health`);
  assert.equal(status, 200);
  const ids: number[] = (body.enrollmentsWithUnusedCredits ?? []).map((e: any) => e.id);
  assert.ok(
    ids.includes(oldEnrollmentId),
    `expected stale (>30d) enrollment ${oldEnrollmentId} to appear in unused-credits list, got ${JSON.stringify(ids)}`,
  );
  assert.ok(
    !ids.includes(newEnrollmentId),
    `expected fresh (<30d) enrollment ${newEnrollmentId} to be excluded from unused-credits list, got ${JSON.stringify(ids)}`,
  );
});

test("enrollments endpoint includes credit balances for admins", async () => {
  const { status, body } = await callAs(
    "tenant_admin",
    `/api/tenants/${tenantId}/packages/${packageId}/enrollments`,
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(body), "expected array");
  for (const enr of body) {
    assert.ok(enr.creditBalance, "expected creditBalance on each enrollment");
    assert.equal(typeof enr.creditBalance.classroom, "number");
    assert.equal(typeof enr.creditBalance.drive, "number");
  }
});
