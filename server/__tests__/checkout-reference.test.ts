process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-checkout-reference";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { activateCart } from "../payments/activation-service";
import { storage } from "../storage";
import {
  tenants,
  packages,
  locations,
  scheduleOfferings,
  carts,
  cartItems,
  enrollments,
  payments,
  bookings,
  tenantPaymentSettings,
} from "@shared/schema";
import {
  __setStripeCheckoutSessionForTests,
  __resetStripeCheckoutSessionForTests,
  type StripeStartInput,
} from "../payments/stripe-adapter";
import { describePurchase, generateReference, purchaseItem } from "../payments/checkout-reference";

const REF_RE = /^[A-Z]{2}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let simplePackageId: number;
let classPackageId: number;
let locationId: number;
let offeringId: number;
const stripeCalls: StripeStartInput[] = [];

test("generateReference uses the school's initials and an unambiguous code", () => {
  const ref = generateReference("All Ages Driving School");
  assert.match(ref, REF_RE);
  assert.ok(ref.startsWith("AA-"));
  assert.ok(generateReference(null).startsWith("DV-"));
  assert.ok(ref.length <= 20);
});

test("describePurchase names the class, location and local date, and fits the limit", () => {
  const item = purchaseItem({
    name: "Teen Driver Ed",
    priceCents: 42500,
    offering: {
      id: 1,
      name: "Cypress Evening Class",
      startsAt: new Date("2026-11-03T23:00:00Z"),
      endsAt: new Date("2026-11-20T01:00:00Z"),
    },
    location: { id: 2, name: "Cypress", timezone: "America/Chicago" },
  });
  assert.equal(
    describePurchase([item], "AA-7K3F9Q"),
    "Teen Driver Ed: Cypress Evening Class — Cypress — Tue, Nov 3, 2026, 5:00 PM (ref AA-7K3F9Q)",
  );
  const short = describePurchase([item, item, item], "AA-7K3F9Q", 127);
  assert.ok(short.length <= 127);
  assert.ok(short.endsWith("(ref AA-7K3F9Q)"));
});

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const ts = Date.now();
  tenantSlug = `checkout-ref-${ts}`;
  const [tenant] = await db.insert(tenants).values({ name: "All Ages Driving School", slug: tenantSlug }).returning();
  tenantId = tenant.id;
  await db.insert(tenantPaymentSettings).values({
    tenantId,
    stripeEnabled: true,
    stripeSecretKey: "sk_test_fake_for_unit_tests",
    cashEnabled: true,
  });
  const [loc] = await db
    .insert(locations)
    .values({ tenantId, name: "Cypress", address: "1 A St", city: "Cypress", state: "TX", zip: "77429" })
    .returning();
  locationId = loc.id;
  const [simple] = await db
    .insert(packages)
    .values({ tenantId, name: "Road Test", price: 9000, classroomHoursRequired: 0, driveHoursRequired: 0, active: true, locationScopeMode: "ALL_LOCATIONS" })
    .returning();
  simplePackageId = simple.id;
  const [cls] = await db
    .insert(packages)
    .values({ tenantId, name: "Teen Driver Ed", price: 42500, classroomHoursRequired: 0, driveHoursRequired: 0, active: true, locationScopeMode: "ALL_LOCATIONS" })
    .returning();
  classPackageId = cls.id;
  const [off] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId, packageId: classPackageId, locationId, name: "Cypress Evening Class",
      startsAt: new Date("2030-11-04T23:00:00Z"), endsAt: new Date("2030-11-20T01:00:00Z"), status: "PUBLISHED", capacity: 20,
    })
    .returning();
  offeringId = off.id;

  let n = 0;
  __setStripeCheckoutSessionForTests(async (input) => {
    stripeCalls.push(input);
    return { sessionId: `cs_ref_${++n}`, redirectUrl: "https://stripe.test/checkout" };
  });
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  try {
    const enrIds = (await db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.tenantId, tenantId))).map((e) => e.id);
    if (enrIds.length) await db.delete(bookings).where(inArray(bookings.enrollmentId, enrIds));
    await db.delete(payments).where(eq(payments.tenantId, tenantId));
    const cartIds = (await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId))).map((c) => c.id);
    if (cartIds.length) await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
    await db.delete(enrollments).where(eq(enrollments.tenantId, tenantId));
    await db.delete(carts).where(eq(carts.tenantId, tenantId));
    await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tenantId));
    await db.delete(packages).where(eq(packages.tenantId, tenantId));
    await db.delete(locations).where(eq(locations.tenantId, tenantId));
    await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const student = {
  firstName: "Ref",
  lastName: "Student",
  email: "ref.student@example.com",
  phone: "5555550100",
  dateOfBirth: "2008-01-01",
};

test("express checkout: reference on the payment, the enrollment, Stripe and the response", async () => {
  const before = stripeCalls.length;
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "STRIPE", packageId: simplePackageId, locationId, student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.match(body.reference, REF_RE);

  const [p] = await db.select().from(payments).where(eq(payments.id, body.paymentId));
  assert.equal(p.reference, body.reference);
  assert.deepEqual((p.metadataJson as any).purchase[0].locationName, "Cypress");
  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, body.enrollmentId));
  assert.equal(e.reference, body.reference);

  const call = stripeCalls[before];
  assert.equal(call.reference, body.reference);
  assert.equal(call.metadata.reference, body.reference);
  assert.equal(call.description, `Road Test — Cypress (ref ${body.reference})`);
  assert.match(call.successUrl, new RegExp(`ref=${body.reference}$`));

  const status = await (await fetch(`${baseUrl}/api/public/enrollments/${body.enrollmentId}/status`)).json();
  assert.equal(status.reference, body.reference);
});

test("cart checkout: the class and its date travel with the payment and into the enrollment", async () => {
  const cart = await (await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart`, { method: "POST" })).json();
  const itemRes = await fetch(`${baseUrl}/api/public/cart/${cart.id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: classPackageId, offeringId }),
  });
  assert.equal(itemRes.status, 200, await itemRes.text());
  const before = stripeCalls.length;
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartId: cart.id, provider: "STRIPE", student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.match(body.reference, REF_RE);

  const call = stripeCalls[before];
  assert.equal(
    call.description,
    `Teen Driver Ed: Cypress Evening Class — Cypress — Mon, Nov 4, 2030, 5:00 PM (ref ${body.reference})`,
  );
  assert.equal(call.metadata.offeringIds, String(offeringId));
  assert.match(call.successUrl, new RegExp(`cart=${cart.id}&ref=${body.reference}$`));

  const [p] = await db.select().from(payments).where(eq(payments.id, body.paymentId));
  const purchase = (p.metadataJson as any).purchase;
  assert.equal(purchase[0].offeringId, offeringId);
  assert.equal(purchase[0].startsAt, "2030-11-04T23:00:00.000Z");

  // Payment lands: the cart's enrollment carries the same reference.
  await storage.updatePayment(p.id, { status: "COMPLETED", completedAt: new Date() } as any);
  const r = await activateCart(p.id, { notifyCustomer: false, notifyAdmin: false });
  assert.equal(r.ok, true, JSON.stringify(r));
  const [e] = await db.select().from(enrollments).where(eq(enrollments.cartId, cart.id));
  assert.equal(e.reference, body.reference);
  assert.equal(e.offeringId, offeringId);
});

test("cash checkout also gets a reference", async () => {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "CASH", packageId: simplePackageId, student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.cashPayment, true);
  assert.match(body.reference, REF_RE);
});
