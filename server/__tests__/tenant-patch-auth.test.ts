process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-tenant-patch-auth";
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
  platformMembers,
  payments,
  tenantApiKeys,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;

const ts = Date.now();

const userIds = {
  platform_admin: `tpa-platform-admin-${ts}`,
  tenant_admin: `tpa-tenant-admin-${ts}`,
  instructor: `tpa-instructor-${ts}`,
  student: `tpa-student-${ts}`,
};

function headers(role: keyof typeof userIds) {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": userIds[role],
    "x-test-user-email": `${userIds[role]}@tpa-test.local`,
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

  const [tenant] = await db
    .insert(tenants)
    .values({ name: `TPA School ${ts}`, slug: `tpa-school-${ts}` })
    .returning();
  tenantId = tenant.id;

  for (const [role, id] of Object.entries(userIds)) {
    await db.insert(users).values({
      id,
      email: `${id}@tpa-test.local`,
      firstName: role,
      lastName: "Test",
    });
  }

  await db.insert(tenantMembers).values([
    { tenantId, userId: userIds.tenant_admin, role: "tenant_admin", status: "ACTIVE", active: true },
    { tenantId, userId: userIds.instructor, role: "instructor", status: "ACTIVE", active: true },
    { tenantId, userId: userIds.student, role: "student", status: "ACTIVE", active: true },
  ]);

  await db.insert(platformMembers).values({
    userId: userIds.platform_admin,
    role: "admin",
    active: true,
  });
});

after(async () => {
  try {
    await db.delete(platformMembers).where(eq(platformMembers.userId, userIds.platform_admin));
    await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(inArray(users.id, Object.values(userIds)));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("platform_admin can update tenant name, email, and phone", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
    method: "PATCH",
    headers: headers("platform_admin"),
    body: JSON.stringify({
      name: `TPA School Updated ${ts}`,
      email: `contact-${ts}@tpa-school.com`,
      phone: "512-555-0001",
    }),
  });
  assert.equal(res.status, 200, `unexpected status: ${await res.clone().text()}`);
  const body = await res.json();
  assert.equal(body.name, `TPA School Updated ${ts}`);
  assert.equal(body.email, `contact-${ts}@tpa-school.com`);
  assert.equal(body.phone, "512-555-0001");
});

test("tenant_admin can update their own school name", async () => {
  const newName = `TPA School Renamed ${ts}`;
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
    method: "PATCH",
    headers: headers("tenant_admin"),
    body: JSON.stringify({ name: newName }),
  });
  assert.equal(res.status, 200, `unexpected status: ${await res.clone().text()}`);
  const body = await res.json();
  assert.equal(body.name, newName);
  assert.equal(body.id, tenantId);
});

test("instructor cannot update tenant contact info (403)", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
    method: "PATCH",
    headers: headers("instructor"),
    body: JSON.stringify({ name: "Should Not Work" }),
  });
  assert.equal(res.status, 403, `expected 403 but got: ${res.status}`);
});

test("student cannot update tenant contact info (403)", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
    method: "PATCH",
    headers: headers("student"),
    body: JSON.stringify({ name: "Should Not Work Either" }),
  });
  assert.equal(res.status, 403, `expected 403 but got: ${res.status}`);
});

// --- Slug-change guard tests ---

test("slug change with invalid characters returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
    method: "PATCH",
    headers: headers("platform_admin"),
    body: JSON.stringify({ slug: "bad slug!!!" }),
  });
  assert.equal(res.status, 400, `expected 400 but got: ${res.status}`);
  const body = await res.json();
  assert.ok(body.message, "expected an error message");
});

test("slug change to a taken slug returns 409", async () => {
  const otherSlug = `tpa-other-${ts}`;
  const [other] = await db
    .insert(tenants)
    .values({ name: `TPA Other School ${ts}`, slug: otherSlug })
    .returning();

  try {
    const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
      method: "PATCH",
      headers: headers("platform_admin"),
      body: JSON.stringify({ slug: otherSlug }),
    });
    assert.equal(res.status, 409, `expected 409 but got: ${res.status}`);
    const body = await res.json();
    assert.ok(body.message, "expected an error message");
  } finally {
    await db.delete(tenants).where(eq(tenants.id, other.id));
  }
});

test("slug change with active API key and no confirmSlugChange returns 422 with requiresConfirmation", async () => {
  const newSlug = `tpa-school-apikey-${ts}`;
  const [apiKey] = await db
    .insert(tenantApiKeys)
    .values({
      tenantId,
      name: "Test Key",
      keyHash: "hash-placeholder",
      keyPrefix: "drv_test",
    })
    .returning();

  try {
    const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
      method: "PATCH",
      headers: headers("platform_admin"),
      body: JSON.stringify({ slug: newSlug }),
    });
    assert.equal(res.status, 422, `expected 422 but got: ${res.status}`);
    const body = await res.json();
    assert.equal(body.requiresConfirmation, true);
    assert.ok(Array.isArray(body.warnings) && body.warnings.length > 0, "expected warnings array");
  } finally {
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.id, apiKey.id));
  }
});

test("slug change with PENDING payment and no confirmSlugChange returns 422 with payment warning", async () => {
  const newSlug = `tpa-school-payment-${ts}`;
  const [payment] = await db
    .insert(payments)
    .values({
      tenantId,
      provider: "STRIPE",
      status: "PENDING",
      amountCents: 9999,
    })
    .returning();

  try {
    const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
      method: "PATCH",
      headers: headers("platform_admin"),
      body: JSON.stringify({ slug: newSlug }),
    });
    assert.equal(res.status, 422, `expected 422 but got: ${res.status}`);
    const body = await res.json();
    assert.equal(body.requiresConfirmation, true);
    assert.ok(Array.isArray(body.warnings) && body.warnings.length > 0, "expected warnings array");
    assert.ok(
      body.warnings.some((w: string) => w.includes("payment")),
      `expected a warning mentioning "payment(s)", got: ${JSON.stringify(body.warnings)}`,
    );
  } finally {
    await db.delete(payments).where(eq(payments.id, payment.id));
  }
});

test("slug change with confirmSlugChange=true updates the slug successfully", async () => {
  const newSlug = `tpa-school-confirmed-${ts}`;
  const [apiKey] = await db
    .insert(tenantApiKeys)
    .values({
      tenantId,
      name: "Test Key Confirm",
      keyHash: "hash-placeholder-2",
      keyPrefix: "drv_test2",
    })
    .returning();

  try {
    const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
      method: "PATCH",
      headers: headers("platform_admin"),
      body: JSON.stringify({ slug: newSlug, confirmSlugChange: true }),
    });
    assert.equal(res.status, 200, `expected 200 but got: ${await res.clone().text()}`);
    const body = await res.json();
    assert.equal(body.slug, newSlug);
  } finally {
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.id, apiKey.id));
  }
});

test("slug change with confirmSlugChange=true succeeds even with a PENDING payment", async () => {
  const newSlug = `tpa-school-pay-confirmed-${ts}`;
  const [payment] = await db
    .insert(payments)
    .values({
      tenantId,
      provider: "STRIPE",
      status: "PENDING",
      amountCents: 4999,
    })
    .returning();

  try {
    const res = await fetch(`${baseUrl}/api/tenants/${tenantId}`, {
      method: "PATCH",
      headers: headers("platform_admin"),
      body: JSON.stringify({ slug: newSlug, confirmSlugChange: true }),
    });
    assert.equal(res.status, 200, `expected 200 but got: ${await res.clone().text()}`);
    const body = await res.json();
    assert.equal(body.slug, newSlug);
  } finally {
    await db.delete(payments).where(eq(payments.id, payment.id));
  }
});
