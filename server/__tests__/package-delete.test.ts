process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-package-delete";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { users, tenants, tenantMembers, packages, scheduleOfferings, scheduleSessions, enrollments } from "@shared/schema";

// DELETE /api/tenants/:tenantId/packages/:id
//
// schedule_offerings.package_id is ON DELETE restrict, so a package that has
// ever had an offering cannot be deleted. The route must explain that with a
// 409 rather than a bare 500, and only tenant admins may delete at all.

let server: Server;
let baseUrl: string;
let tenantId: number;
let otherTenantId: number;

const ts = Date.now();
const userIds = {
  tenant_admin: `pkgdel-admin-${ts}`,
  office_manager: `pkgdel-om-${ts}`,
};

function headers(role: keyof typeof userIds) {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": userIds[role],
    "x-test-user-email": `${userIds[role]}@pkgdel-test.local`,
  };
}

async function insertPkg(name: string, tid = tenantId) {
  const [row] = await db
    .insert(packages)
    .values({ tenantId: tid, name, price: 10000, active: true, kind: "SIMPLE" } as any)
    .returning();
  return row;
}

async function insertOffering(packageId: number, status: "DRAFT" | "CANCELLED" | "COMPLETED") {
  const [row] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId,
      packageId,
      name: `Offering ${status} ${ts}`,
      capacity: 20,
      startsAt: new Date(Date.now() - 30 * 86400000),
      endsAt: new Date(Date.now() - 20 * 86400000),
      status,
    })
    .returning();
  return row;
}

async function packageExists(id: number) {
  const rows = await db.select({ id: packages.id }).from(packages).where(eq(packages.id, id));
  return rows.length === 1;
}

async function del(pkgId: number, role: keyof typeof userIds = "tenant_admin", tid = tenantId, qs = "") {
  const res = await fetch(`${baseUrl}/api/tenants/${tid}/packages/${pkgId}${qs}`, {
    method: "DELETE",
    headers: headers(role),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [tenant] = await db.insert(tenants).values({ name: `PkgDel ${ts}`, slug: `pkgdel-${ts}` }).returning();
  tenantId = tenant.id;
  const [other] = await db.insert(tenants).values({ name: `PkgDel Other ${ts}`, slug: `pkgdel-other-${ts}` }).returning();
  otherTenantId = other.id;

  for (const [role, id] of Object.entries(userIds)) {
    await db.insert(users).values({ id, email: `${id}@pkgdel-test.local`, firstName: role, lastName: "Test" });
  }
  await db.insert(tenantMembers).values([
    { tenantId, userId: userIds.tenant_admin, role: "tenant_admin", status: "ACTIVE", active: true },
    { tenantId, userId: userIds.office_manager, role: "office_manager", status: "ACTIVE", active: true },
  ]);
});

after(async () => {
  try {
    for (const tid of [tenantId, otherTenantId].filter(Boolean)) {
      await db.delete(enrollments).where(eq(enrollments.tenantId, tid));
      await db.delete(scheduleSessions).where(eq(scheduleSessions.tenantId, tid));
      await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tid));
      await db.delete(packages).where(eq(packages.tenantId, tid));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
    await db.delete(users).where(inArray(users.id, Object.values(userIds)));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("tenant admin can delete a package with no offerings", async () => {
  const pkg = await insertPkg("Plain package");
  const r = await del(pkg.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await packageExists(pkg.id), false);
});

test("a package with a cancelled offering returns 409 with an explanation and is kept", async () => {
  const pkg = await insertPkg("Has cancelled offering");
  await insertOffering(pkg.id, "CANCELLED");

  const r = await del(pkg.id);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "PACKAGE_HAS_OFFERINGS");
  assert.equal(r.body.offeringCount, 1);
  assert.match(r.body.message, /cannot be deleted/i);
  assert.match(r.body.message, /inactive/i);
  assert.equal(await packageExists(pkg.id), true);
});

test("the count includes every offering, whatever its status", async () => {
  const pkg = await insertPkg("Has several offerings");
  await insertOffering(pkg.id, "DRAFT");
  await insertOffering(pkg.id, "COMPLETED");
  await insertOffering(pkg.id, "CANCELLED");

  const r = await del(pkg.id);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.offeringCount, 3);
  assert.equal(r.body.draftOfferingCount, 1);
  assert.match(r.body.message, /2 classes that were published/);
});

test("office managers get a 403 that says who may delete", async () => {
  const pkg = await insertPkg("OM cannot delete");
  const r = await del(pkg.id, "office_manager");
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.match(r.body.message, /school admins/i);
  assert.equal(await packageExists(pkg.id), true);
});

test("a package id that does not exist returns 404", async () => {
  const r = await del(999999999);
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.equal(r.body.message, "Package not found");
});

test("another tenant's package is reported as not found and left alone", async () => {
  const foreign = await insertPkg("Foreign package", otherTenantId);
  const r = await del(foreign.id);
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.equal(await packageExists(foreign.id), true);
});

async function offeringExists(id: number) {
  return (await db.select({ id: scheduleOfferings.id }).from(scheduleOfferings).where(eq(scheduleOfferings.id, id))).length === 1;
}

test("a package whose only class is an unused draft asks first, then deletes both", async () => {
  const pkg = await insertPkg("Only an unused draft");
  const off = await insertOffering(pkg.id, "DRAFT");
  await db.insert(scheduleSessions).values({
    tenantId, offeringId: off.id, type: "CLASSROOM", startAt: off.startsAt, endAt: off.endsAt,
  } as any);

  const first = await del(pkg.id);
  assert.equal(first.status, 409, JSON.stringify(first.body));
  assert.equal(first.body.code, "PACKAGE_HAS_ONLY_DRAFT_OFFERINGS");
  assert.match(first.body.message, /1 class still in draft/);
  assert.equal(await packageExists(pkg.id), true);

  const second = await del(pkg.id, "tenant_admin", tenantId, "?withDraftOfferings=1");
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.deletedDraftOfferings, 1);
  assert.equal(await packageExists(pkg.id), false);
  assert.equal(await offeringExists(off.id), false);
});

test("a draft class someone enrolled in still blocks, even with the flag", async () => {
  const pkg = await insertPkg("Draft with an enrollment");
  const off = await insertOffering(pkg.id, "DRAFT");
  await db.insert(enrollments).values({
    tenantId, packageId: pkg.id, offeringId: off.id, status: "pending",
    firstName: "Dee", lastName: "Raft", email: `dee.${ts}@pkgdel-test.local`,
  } as any);

  const r = await del(pkg.id, "tenant_admin", tenantId, "?withDraftOfferings=1");
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "PACKAGE_HAS_ENROLLMENTS");
  assert.equal(await packageExists(pkg.id), true);
  assert.equal(await offeringExists(off.id), true);
});

test("the flag never removes published classes", async () => {
  const pkg = await insertPkg("Draft plus completed");
  const draft = await insertOffering(pkg.id, "DRAFT");
  await insertOffering(pkg.id, "COMPLETED");
  const r = await del(pkg.id, "tenant_admin", tenantId, "?withDraftOfferings=1");
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(await packageExists(pkg.id), true);
  assert.equal(await offeringExists(draft.id), true);
});

test("a package with enrollments is never deleted, even without classes", async () => {
  const pkg = await insertPkg("No classes, has an enrollment");
  const [e] = await db.insert(enrollments).values({
    tenantId, packageId: pkg.id, status: "expired",
    firstName: "Kee", lastName: "Pme", email: `kee.${ts}@pkgdel-test.local`,
  } as any).returning();

  const r = await del(pkg.id, "tenant_admin", tenantId, "?withDraftOfferings=1");
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, "PACKAGE_HAS_ENROLLMENTS");
  assert.equal(r.body.enrollmentCount, 1);
  assert.match(r.body.message, /inactive/);
  assert.equal(await packageExists(pkg.id), true);
  assert.equal((await db.select().from(enrollments).where(eq(enrollments.id, e.id))).length, 1);
});
