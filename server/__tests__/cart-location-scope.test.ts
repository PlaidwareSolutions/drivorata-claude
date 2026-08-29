process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-cart-location-scope";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import {
  tenants,
  packages,
  locations,
  packageLocations,
  carts,
  cartItems,
  onlineCourses,
  onlineCourseLocations,
  enrollments,
  payments,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let locationAId: number;
let locationBId: number;
let allowedPackageId: number;
let restrictedPackageId: number;
let restrictedCourseId: number;
let allowedCourseId: number;
const createdCartIds: string[] = [];
const createdEnrollmentIds: number[] = [];

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

before(async () => {
  const ts = Date.now();
  tenantSlug = `cart-loc-scope-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `CartLocScope ${ts}`, slug: tenantSlug })
    .returning();
  tenantId = tenant.id;

  const [locA] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc A", address: "1 A St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationAId = locA.id;
  const [locB] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc B", address: "2 B St", city: "Dallas", state: "TX", zip: "75201" })
    .returning();
  locationBId = locB.id;

  const [pkgAll] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "All Locations Package",
      price: 9900,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  allowedPackageId = pkgAll.id;

  const [pkgRestricted] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Loc A Only Package",
      price: 14900,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "SPECIFIC_LOCATIONS",
    })
    .returning();
  restrictedPackageId = pkgRestricted.id;
  await db.insert(packageLocations).values({ tenantId, packageId: restrictedPackageId, locationId: locationAId });

  const [courseRestricted] = await db
    .insert(onlineCourses)
    .values({
      tenantId,
      name: "Loc A Only Course",
      price: 9900,
      active: true,
      locationScopeMode: "SPECIFIC_LOCATIONS",
    })
    .returning();
  restrictedCourseId = courseRestricted.id;
  await db.insert(onlineCourseLocations).values({
    tenantId,
    onlineCourseId: restrictedCourseId,
    locationId: locationAId,
  });

  const [courseAll] = await db
    .insert(onlineCourses)
    .values({
      tenantId,
      name: "All Locations Course",
      price: 7900,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  allowedCourseId = courseAll.id;

  await startServer();
});

after(async () => {
  try {
    if (createdEnrollmentIds.length) {
      for (const eid of createdEnrollmentIds) {
        await db.delete(payments).where(eq(payments.enrollmentId, eid));
        await db.delete(enrollments).where(eq(enrollments.id, eid));
      }
    }
    if (createdCartIds.length) {
      for (const cid of createdCartIds) {
        await db.delete(cartItems).where(eq(cartItems.cartId, cid));
        await db.delete(carts).where(eq(carts.id, cid));
      }
    }
    await db.delete(packageLocations).where(eq(packageLocations.packageId, restrictedPackageId));
    if (restrictedCourseId) {
      await db
        .delete(onlineCourseLocations)
        .where(eq(onlineCourseLocations.onlineCourseId, restrictedCourseId));
      await db.delete(onlineCourses).where(eq(onlineCourses.id, restrictedCourseId));
    }
    if (allowedCourseId) await db.delete(onlineCourses).where(eq(onlineCourses.id, allowedCourseId));
    if (allowedPackageId) await db.delete(packages).where(eq(packages.id, allowedPackageId));
    if (restrictedPackageId) await db.delete(packages).where(eq(packages.id, restrictedPackageId));
    if (locationAId) await db.delete(locations).where(eq(locations.id, locationAId));
    if (locationBId) await db.delete(locations).where(eq(locations.id, locationBId));
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await stopServer();
});

async function createCart(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart`, { method: "POST" });
  assert.equal(res.status, 200, `cart create failed: ${res.status}`);
  const cart = await res.json();
  createdCartIds.push(cart.id);
  return cart.id;
}

async function addItem(cartId: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

async function startCheckout(cartId: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartId, ...body }),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

test("cart-add: SPECIFIC package allowed at the chosen location succeeds and pins cart location", async () => {
  const cartId = await createCart();
  const r = await addItem(cartId, { packageId: restrictedPackageId, locationId: locationAId });
  assert.equal(r.status, 200, `expected 200 add, got ${r.status}: ${JSON.stringify(r.body)}`);

  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  assert.equal(cart.locationId, locationAId, "cart should be pinned to the chosen location");
});

test("cart-add: SPECIFIC package rejected when chosen location is not allowed", async () => {
  const cartId = await createCart();
  const r = await addItem(cartId, { packageId: restrictedPackageId, locationId: locationBId });
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
});

test("cart-add: SPECIFIC package rejected when no location is provided and cart has none pinned", async () => {
  const cartId = await createCart();
  const r = await addItem(cartId, { packageId: restrictedPackageId });
  assert.equal(r.status, 400, `expected 400 no-location, got ${r.status}: ${JSON.stringify(r.body)}`);
});

test("cart-add: locationId conflicting with already-pinned cart location is rejected", async () => {
  const cartId = await createCart();
  const ok = await addItem(cartId, { packageId: allowedPackageId, locationId: locationAId });
  assert.equal(ok.status, 200, `seed add should succeed, got ${ok.status}: ${JSON.stringify(ok.body)}`);

  const conflict = await addItem(cartId, { packageId: allowedPackageId, locationId: locationBId });
  assert.equal(conflict.status, 400, `expected 400 conflict, got ${conflict.status}: ${JSON.stringify(conflict.body)}`);
});

test("cart-add: invalid (foreign-tenant) locationId is rejected", async () => {
  const cartId = await createCart();
  const r = await addItem(cartId, { packageId: allowedPackageId, locationId: 999_999_999 });
  assert.equal(r.status, 400, `expected 400 bad-location, got ${r.status}: ${JSON.stringify(r.body)}`);
});

test("cart-checkout: SPECIFIC add-on allowed via cart's pinned location succeeds even when checkout body omits locationId", async () => {
  const cartId = await createCart();
  const ok = await addItem(cartId, { packageId: restrictedPackageId, locationId: locationAId });
  assert.equal(ok.status, 200, `seed add should succeed, got ${ok.status}: ${JSON.stringify(ok.body)}`);

  // Checkout will fail later for payment-config reasons (no STRIPE/PAYPAL/CASH
  // is enabled on this throwaway tenant), but it must NOT fail on the
  // location-scope guard. We assert the response is NOT the location-scope
  // rejection — i.e. checkout got past the per-item location check.
  const r = await startCheckout(cartId, {
    provider: "STRIPE",
    student: { firstName: "A", lastName: "B", email: `t-${Date.now()}@test.local` },
  });
  const msg = String(r.body?.message ?? "");
  assert.ok(
    !/not available at|requires a location/i.test(msg),
    `checkout should pass location-scope guard via cart's pinned location, got ${r.status}: ${msg}`,
  );
});

test("cart-checkout: rejects when explicit body locationId conflicts with cart's pinned location", async () => {
  const cartId = await createCart();
  const ok = await addItem(cartId, { packageId: restrictedPackageId, locationId: locationAId });
  assert.equal(ok.status, 200);

  const r = await startCheckout(cartId, {
    provider: "STRIPE",
    student: { firstName: "A", lastName: "B", email: `t-${Date.now()}@test.local` },
    locationId: locationBId,
  });
  assert.equal(r.status, 400, `expected 400 conflict, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.match(String(r.body?.message ?? ""), /different location/i);
});

test("cart-checkout: SPECIFIC add-on rejected when neither cart nor body provides a location", async () => {
  // Insert a cart row directly with a SPECIFIC add-on but no pinned location
  // — simulates a legacy cart created before the pin-on-add behavior shipped.
  const [legacyCart] = await db
    .insert(carts)
    .values({ tenantId, status: "open", locationId: null })
    .returning();
  createdCartIds.push(legacyCart.id);
  await db.insert(cartItems).values({
    cartId: legacyCart.id,
    packageId: restrictedPackageId,
    offeringId: null,
    priceCents: 14900,
  });

  const r = await startCheckout(legacyCart.id, {
    provider: "STRIPE",
    student: { firstName: "A", lastName: "B", email: `t-${Date.now()}@test.local` },
  });
  assert.equal(r.status, 400, `expected 400 missing-location, got ${r.status}: ${JSON.stringify(r.body)}`);
});

async function startOnlineCourseCheckout(body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/online-course-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

test("online-course-checkout: SPECIFIC course rejected without locationId", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}@test.local` },
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
});

test("online-course-checkout: SPECIFIC course rejected when locationId is not allow-listed", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}@test.local` },
    locationId: locationBId,
  });
  assert.equal(r.status, 400, `expected 400 not-allowed, got ${r.status}: ${JSON.stringify(r.body)}`);
});

test("online-course-checkout: foreign-tenant locationId is rejected", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: allowedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}@test.local` },
    locationId: 999_999_999,
  });
  assert.equal(r.status, 400, `expected 400 bad-location, got ${r.status}: ${JSON.stringify(r.body)}`);
});

test("online-course-checkout: SPECIFIC course at allowed location passes the location guard", async () => {
  // Will still fail downstream on payment-config (no provider enabled), but
  // must NOT be the location guard. Assert message does not match the guard
  // pattern.
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}@test.local` },
    locationId: locationAId,
  });
  const msg = String(r.body?.message ?? "");
  assert.ok(
    !/not available at|requires a location/i.test(msg),
    `should pass location-scope guard, got ${r.status}: ${msg}`,
  );
});
