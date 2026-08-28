process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-error-codes";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  tenants,
  tenantMembers,
  packages,
  locations,
  packageLocations,
  packageUpsellDependencies,
  tenantPaymentSettings,
  carts,
  cartItems,
  scheduleOfferings,
} from "@shared/schema";
import { CartCheckoutErrorCode } from "@shared/api-errors";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let locationAId: number;
let locationBId: number;
let adminUserId: string;
const createdUserIds: string[] = [];

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@ec-test.local`,
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
  tenantSlug = `ec-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `EC ${ts}`, slug: tenantSlug })
    .returning();
  tenantId = tenant.id;

  const [locA] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc A", address: "1 St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationAId = locA.id;
  const [locB] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc B", address: "2 St", city: "Austin", state: "TX", zip: "78702" })
    .returning();
  locationBId = locB.id;

  adminUserId = `ec-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@ec-test.local`,
    firstName: "E",
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
      const cartIds = (
        await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId))
      ).map((c) => c.id);
      if (cartIds.length) await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
      if (cartIds.length) await db.delete(carts).where(inArray(carts.id, cartIds));
      await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tenantId));
      await db.delete(packageUpsellDependencies).where(eq(packageUpsellDependencies.tenantId, tenantId));
      await db.delete(packageLocations).where(eq(packageLocations.tenantId, tenantId));
      await db.delete(packages).where(eq(packages.tenantId, tenantId));
      await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
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
      locationScopeMode: "ALL_LOCATIONS",
      ...body,
    }),
  });
  assert.ok(res.status === 200 || res.status === 201, `unexpected status ${res.status}: ${await res.clone().text()}`);
  return res.json();
}

async function newCart(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart`, { method: "POST" });
  const c = await res.json();
  return c.id as string;
}

function assertCode(body: any, expected: string) {
  assert.equal(body.code, expected, `expected code ${expected}, got ${JSON.stringify(body)}`);
  assert.equal(typeof body.message, "string");
  assert.ok(body.message.length > 0, "message should be non-empty");
}

test("checkout/start returns INVALID_DATA on schema failure", async () => {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.INVALID_DATA);
});

test("checkout/start returns COHORT_SELECTION_REQUIRED for cohort-based package", async () => {
  const cohortPkg = await createPkg({
    name: "Teen Driver Ed",
    price: 29900,
    kind: "COHORT_BASED",
    classroomHoursRequired: 32,
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: cohortPkg.id,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.COHORT_SELECTION_REQUIRED);
});

test("checkout/start returns PACKAGE_NOT_STANDALONE for upsell-only package", async () => {
  const upsellOnly = await createPkg({
    name: "School Car",
    price: 8000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: upsellOnly.id,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.PACKAGE_NOT_STANDALONE);
});

test("checkout/start returns LOCATION_REQUIRED when SPECIFIC_LOCATIONS package has no location", async () => {
  const restricted = await createPkg({
    name: "Loc-A Only Pkg",
    price: 1000,
    kind: "SIMPLE",
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locationAId],
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: restricted.id,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.LOCATION_REQUIRED);
});

test("checkout/start returns LOCATION_NOT_ALLOWED when wrong location chosen", async () => {
  const restricted = await createPkg({
    name: "Loc-A Only Pkg2",
    price: 1000,
    kind: "SIMPLE",
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locationAId],
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: restricted.id,
      locationId: locationBId,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.LOCATION_NOT_ALLOWED);
});

test("checkout/start returns PAYMENT_PROVIDER_NOT_CONFIGURED when no settings", async () => {
  const ok = await createPkg({ name: "Standalone", price: 1000, kind: "SIMPLE" });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: ok.id,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED);
});

test("checkout/start returns PACKAGE_INACTIVE for inactive package", async () => {
  const inactive = await createPkg({ name: "Inactive", price: 1000, kind: "SIMPLE", active: false });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      packageId: inactive.id,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  // route maps inactive to INVALID_PACKAGE (the package is filtered out)
  assertCode(await res.json(), CartCheckoutErrorCode.INVALID_PACKAGE);
});

test("cart items POST returns OFFERING_NOT_FOUND for unknown offering", async () => {
  const cohortPkg = await createPkg({
    name: "TDE 2",
    price: 29900,
    kind: "COHORT_BASED",
    classroomHoursRequired: 32,
  });
  const cartId = await newCart();
  const res = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: cohortPkg.id, offeringId: 999999 }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.OFFERING_NOT_FOUND);
});

test("cart items POST returns COHORT_SELECTION_REQUIRED when offering missing for cohort-based pkg", async () => {
  const cohortPkg = await createPkg({
    name: "TDE 3",
    price: 29900,
    kind: "COHORT_BASED",
    classroomHoursRequired: 32,
  });
  const cartId = await newCart();
  const res = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: cohortPkg.id }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.COHORT_SELECTION_REQUIRED);
});

test("cart items POST returns UPSELL_PARENT_MISSING when upsell-only added to empty cart", async () => {
  const upsell = await createPkg({
    name: "Upsell only",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: true,
  });
  const cartId = await newCart();
  const res = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: upsell.id }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.UPSELL_PARENT_MISSING);
});

test("cart items POST returns LOCATION_NOT_ALLOWED for restricted package + wrong location", async () => {
  const restricted = await createPkg({
    name: "Loc-A Only Pkg3",
    price: 1000,
    kind: "SIMPLE",
    locationScopeMode: "SPECIFIC_LOCATIONS",
    locationIds: [locationAId],
  });
  const cartId = await newCart();
  const res = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: restricted.id, locationId: locationBId }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.LOCATION_NOT_ALLOWED);
});

test("cart items POST returns CART_LOCATION_MISMATCH when location conflicts", async () => {
  const ok = await createPkg({ name: "Std Pkg", price: 1000, kind: "SIMPLE" });
  const cartId = await newCart();
  // First pin location A
  const r1 = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: ok.id, locationId: locationAId }),
  });
  assert.equal(r1.status, 200);
  // Now try add with location B
  const r2 = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: ok.id, locationId: locationBId }),
  });
  assert.equal(r2.status, 400);
  assertCode(await r2.json(), CartCheckoutErrorCode.CART_LOCATION_MISMATCH);
});

test("cart-checkout/start returns CART_EMPTY for empty cart", async () => {
  const cartId = await newCart();
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      cartId,
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.CART_EMPTY);
});

test("cart-checkout/start returns CART_ID_REQUIRED when cartId is omitted", async () => {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.CART_ID_REQUIRED);
});

test("cart-checkout/headless returns PACKAGE_NOT_AVAILABLE when adding unbookable pkg", async () => {
  const unbookable = await createPkg({
    name: "Unbookable",
    price: 1000,
    kind: "SIMPLE",
    sellableStandalone: false,
    availableAsUpsell: false,
  });
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/headless`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      items: [{ packageId: unbookable.id }],
      student: { firstName: "T", lastName: "U", email: `t-${Date.now()}@x.test` },
    }),
  });
  assert.equal(res.status, 400);
  assertCode(await res.json(), CartCheckoutErrorCode.PACKAGE_NOT_AVAILABLE);
});
