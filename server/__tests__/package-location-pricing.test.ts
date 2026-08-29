process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-pkg-loc-pricing";
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
  packageLocations,
  locations,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let locA: number;
let locB: number;
let locC: number;
let adminUserId: string;
const createdUserIds: string[] = [];

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@plp-test.local`,
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
  tenantSlug = `plp-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `PLP ${ts}`, slug: tenantSlug })
    .returning();
  tenantId = tenant.id;

  const [a, b, c] = await db
    .insert(locations)
    .values([
      { tenantId, name: "Austin", address: "1 St", city: "Austin", state: "TX", zip: "78701" },
      { tenantId, name: "Houston", address: "2 St", city: "Houston", state: "TX", zip: "77001" },
      { tenantId, name: "Dallas", address: "3 St", city: "Dallas", state: "TX", zip: "75201" },
    ])
    .returning();
  locA = a.id;
  locB = b.id;
  locC = c.id;

  adminUserId = `plp-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@plp-test.local`,
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
      await db.delete(packageLocations).where(eq(packageLocations.tenantId, tenantId));
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

async function createPkg(body: any): Promise<any> {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      tenantId,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      kind: "SIMPLE",
      sellableStandalone: true,
      ...body,
    }),
  });
  assert.ok(
    res.status === 200 || res.status === 201,
    `unexpected status ${res.status}: ${await res.clone().text()}`,
  );
  return res.json();
}

test("PATCH /packages/:id persists per-location price overrides and GET hydrates them", async () => {
  const pkg = await createPkg({
    name: "Detail-page Save Pkg",
    price: 41000,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locA, locB],
  });

  // Initially no overrides → GET returns linked ids with nulls.
  const initial = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}/locations`,
    { headers: adminHeaders() },
  ).then((r) => r.json());
  assert.deepEqual(initial.locationIds.slice().sort(), [locA, locB].slice().sort());
  assert.equal(initial.priceOverrides[locA], null);
  assert.equal(initial.priceOverrides[locB], null);

  // PATCH with overrides for both locations (cents).
  const patchRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({
      locationScopeMode: "SPECIFIC_LOCATIONS",
      locationIds: [locA, locB],
      locationPriceOverrides: {
        [String(locA)]: 37500,
        [String(locB)]: 41000,
      },
    }),
  });
  assert.equal(patchRes.status, 200);

  const afterSave = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}/locations`,
    { headers: adminHeaders() },
  ).then((r) => r.json());
  assert.equal(afterSave.priceOverrides[locA], 37500);
  assert.equal(afterSave.priceOverrides[locB], 41000);

  // PATCH again clearing one override (sending null) — must persist as null.
  await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({
      locationScopeMode: "SPECIFIC_LOCATIONS",
      locationIds: [locA, locB],
      locationPriceOverrides: {
        [String(locA)]: 37500,
        [String(locB)]: null,
      },
    }),
  });
  const afterClear = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}/locations`,
    { headers: adminHeaders() },
  ).then((r) => r.json());
  assert.equal(afterClear.priceOverrides[locA], 37500);
  assert.equal(afterClear.priceOverrides[locB], null);
});

test("PATCH /packages/:id silently drops negative override amounts (falls back to base price)", async () => {
  const pkg = await createPkg({
    name: "Invalid Amount Pkg",
    price: 30000,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locA],
  });
  await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({
      locationScopeMode: "SPECIFIC_LOCATIONS",
      locationIds: [locA],
      locationPriceOverrides: { [String(locA)]: -100 },
    }),
  });
  const got = await fetch(
    `${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}/locations`,
    { headers: adminHeaders() },
  ).then((r) => r.json());
  // Negative value silently dropped → no override stored.
  assert.equal(got.priceOverrides[locA] ?? null, null);
});

test("GET /api/public/tenant/:slug/packages returns locationPrices for non-null overrides only", async () => {
  const pkg = await createPkg({
    name: "Public Mixed Pkg",
    price: 41000,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locA, locB, locC],
  });
  await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({
      locationScopeMode: "SPECIFIC_LOCATIONS",
      locationIds: [locA, locB, locC],
      locationPriceOverrides: {
        [String(locA)]: 37500,
        [String(locB)]: 41000,
        // locC intentionally omitted (no override).
      },
    }),
  });

  const list = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/packages`).then((r) =>
    r.json(),
  );
  const found = list.find((p: any) => p.id === pkg.id);
  assert.ok(found, "public list must include the new package");
  assert.equal(found.price, 41000, "base price unchanged");
  const byLoc: Record<number, number> = {};
  for (const row of found.locationPrices ?? []) byLoc[row.locationId] = row.priceCents;
  assert.equal(byLoc[locA], 37500);
  assert.equal(byLoc[locB], 41000);
  assert.equal(byLoc[locC], undefined, "locations without overrides are omitted");
});

test("GET /api/public/tenant/:slug/packages/:id returns locationPrices on the detail response", async () => {
  const pkg = await createPkg({
    name: "Public Detail Pkg",
    price: 50000,
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locA, locB],
  });
  await fetch(`${baseUrl}/api/tenants/${tenantId}/packages/${pkg.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({
      locationScopeMode: "SPECIFIC_LOCATIONS",
      locationIds: [locA, locB],
      locationPriceOverrides: { [String(locA)]: 48000 },
    }),
  });

  const detail = await fetch(
    `${baseUrl}/api/public/tenant/${tenantSlug}/packages/${pkg.id}`,
  ).then((r) => r.json());
  assert.equal(detail.id, pkg.id);
  assert.equal(detail.price, 50000);
  assert.ok(Array.isArray(detail.locationPrices));
  assert.equal(detail.locationPrices.length, 1);
  assert.equal(detail.locationPrices[0].locationId, locA);
  assert.equal(detail.locationPrices[0].priceCents, 48000);
});

test("ALL_LOCATIONS package with no overrides returns empty locationPrices on public list", async () => {
  const pkg = await createPkg({
    name: "School-wide Pkg",
    price: 19900,
    locationScopeMode: "ALL_LOCATIONS",
  });
  const list = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/packages`).then((r) =>
    r.json(),
  );
  const found = list.find((p: any) => p.id === pkg.id);
  assert.ok(found);
  assert.deepEqual(found.locationPrices ?? [], []);
});
