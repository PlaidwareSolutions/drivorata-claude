process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-cart-enrollment-location";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { storage } from "../storage";
import { db } from "../db";
import {
  tenants,
  packages,
  locations,
  carts,
  cartItems,
  scheduleOfferings,
  enrollments,
  payments,
} from "@shared/schema";

let tenantId: number;
let packageId: number;
let offeringLocationId: number;
let explicitCartLocationId: number;
let offeringId: number;
const createdCartIds: string[] = [];
const createdEnrollmentIds: number[] = [];

before(async () => {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `CartLoc ${ts}`, slug: `cart-loc-${ts}` })
    .returning();
  tenantId = tenant.id;

  const [offLoc] = await db
    .insert(locations)
    .values({ tenantId, name: "Cypress, TX", address: "1 Cypress Way", city: "Cypress", state: "TX", zip: "77433" })
    .returning();
  offeringLocationId = offLoc.id;

  const [explicitLoc] = await db
    .insert(locations)
    .values({ tenantId, name: "Sugar Land, TX", address: "2 Sugar Way", city: "Sugar Land", state: "TX", zip: "77478" })
    .returning();
  explicitCartLocationId = explicitLoc.id;

  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Teen Drivers Ed",
      price: 49900,
      classroomHoursRequired: 32,
      driveHoursRequired: 7,
      active: true,
    })
    .returning();
  packageId = pkg.id;

  const [off] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId,
      packageId,
      locationId: offeringLocationId,
      name: "Teen — Cypress – Jul 2026",
      capacity: 20,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "PUBLISHED",
    })
    .returning();
  offeringId = off.id;
});

after(async () => {
  if (createdEnrollmentIds.length) {
    await db.delete(payments).where(inArray(payments.enrollmentId, createdEnrollmentIds));
    await db.delete(enrollments).where(inArray(enrollments.id, createdEnrollmentIds));
  }
  if (createdCartIds.length) {
    await db.delete(cartItems).where(inArray(cartItems.cartId, createdCartIds));
    await db.delete(carts).where(inArray(carts.id, createdCartIds));
  }
  if (offeringId) {
    await db.delete(scheduleOfferings).where(eq(scheduleOfferings.id, offeringId));
  }
  if (packageId) await db.delete(packages).where(eq(packages.id, packageId));
  if (offeringLocationId) await db.delete(locations).where(eq(locations.id, offeringLocationId));
  if (explicitCartLocationId) await db.delete(locations).where(eq(locations.id, explicitCartLocationId));
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
});

async function makeCart(opts: { locationId: number | null }): Promise<string> {
  const [cart] = await db
    .insert(carts)
    .values({
      tenantId,
      status: "open",
      locationId: opts.locationId,
      customerSnapshotJson: {
        firstName: "Inara",
        lastName: "Zainab",
        email: `inara-${Date.now()}-${Math.random()}@example.test`,
      },
    })
    .returning();
  createdCartIds.push(cart.id);
  await db.insert(cartItems).values({
    cartId: cart.id,
    packageId,
    offeringId,
    priceCents: 49900,
  });
  return cart.id;
}

test("cart enrollment inherits offering's locationId when cart has none", async () => {
  const cartId = await makeCart({ locationId: null });
  const result = await storage.createCartEnrollmentsAndBookAtomic(cartId, {
    id: 0,
    tenantId,
    amountCents: 49900,
  });
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.enrollments.length, 1);
  const enr = result.enrollments[0];
  createdEnrollmentIds.push(enr.id);
  assert.equal(
    enr.locationId,
    offeringLocationId,
    `enrollment should inherit offering's locationId (${offeringLocationId}) when cart has none, got ${enr.locationId}`,
  );
});

test("cart enrollment keeps explicit cart locationId even when offering has its own", async () => {
  const cartId = await makeCart({ locationId: explicitCartLocationId });
  const result = await storage.createCartEnrollmentsAndBookAtomic(cartId, {
    id: 0,
    tenantId,
    amountCents: 49900,
  });
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  if (!result.ok) return;
  const enr = result.enrollments[0];
  createdEnrollmentIds.push(enr.id);
  assert.equal(
    enr.locationId,
    explicitCartLocationId,
    "explicit cart locationId must win over the offering's locationId",
  );
});
