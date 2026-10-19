process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-payment-recovery";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { and, eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import {
  tenants,
  users,
  tenantMembers,
  packages,
  locations,
  scheduleOfferings,
  carts,
  cartItems,
  enrollments,
  payments,
  bookings,
  sessionChangeEmails,
  tenantPaymentSettings,
} from "@shared/schema";
import {
  __setStripeCheckoutSessionForTests,
  __resetStripeCheckoutSessionForTests,
  __setRetrieveStripeCheckoutSessionForTests,
  __resetRetrieveStripeCheckoutSessionForTests,
  type StripeSessionStatus,
} from "../payments/stripe-adapter";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let adminUserId: string;
let simplePackageId: number;
let classPackageId: number;
let locationId: number;
let sessionCounter = 0;

// What the stubbed Stripe says about each checkout session.
const stripeSessions = new Map<string, Partial<StripeSessionStatus>>();

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@recovery-test.local`,
  };
}

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const ts = Date.now();
  tenantSlug = `recovery-${ts}`;
  const [tenant] = await db.insert(tenants).values({ name: `Recovery ${ts}`, slug: tenantSlug }).returning();
  tenantId = tenant.id;

  await db.insert(tenantPaymentSettings).values({
    tenantId,
    stripeEnabled: true,
    stripeSecretKey: "sk_test_fake_for_unit_tests",
    stripeWebhookSecret: "whsec_unused",
  });

  const [loc] = await db
    .insert(locations)
    .values({ tenantId, name: "Cypress", address: "1 A St", city: "Cypress", state: "TX", zip: "77429" })
    .returning();
  locationId = loc.id;

  const [simple] = await db
    .insert(packages)
    .values({
      tenantId, name: "Road Test", price: 9000, classroomHoursRequired: 0, driveHoursRequired: 0,
      active: true, locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  simplePackageId = simple.id;

  const [cls] = await db
    .insert(packages)
    .values({
      tenantId, name: "Teen Class", price: 42500, classroomHoursRequired: 0, driveHoursRequired: 0,
      active: true, locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  classPackageId = cls.id;

  adminUserId = `recovery-admin-${ts}`;
  await db.insert(users).values({ id: adminUserId, email: `${adminUserId}@recovery-test.local`, firstName: "R", lastName: "Admin" });
  await db.insert(tenantMembers).values({ tenantId, userId: adminUserId, role: "tenant_admin", status: "ACTIVE", active: true });

  __setStripeCheckoutSessionForTests(async () => ({
    sessionId: `cs_recovery_${++sessionCounter}`,
    redirectUrl: "https://stripe.test/checkout",
  }));
  __setRetrieveStripeCheckoutSessionForTests(async (_key, sessionId) => {
    const s = stripeSessions.get(sessionId) ?? {};
    return {
      sessionId,
      status: s.status ?? "complete",
      paymentStatus: s.paymentStatus ?? "paid",
      paymentIntentId: s.paymentIntentId ?? `pi_${sessionId}`,
      chargeId: s.chargeId ?? `ch_${sessionId}`,
      amountTotalCents: s.amountTotalCents ?? null,
      customerEmail: s.customerEmail ?? null,
      paidAt: s.paidAt ?? new Date("2026-08-01T15:00:00Z"),
    };
  });
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  __resetRetrieveStripeCheckoutSessionForTests();
  try {
    await db.delete(sessionChangeEmails).where(eq(sessionChangeEmails.tenantId, tenantId));
    const enrRows = await db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.tenantId, tenantId));
    const enrIds = enrRows.map((e) => e.id);
    if (enrIds.length) await db.delete(bookings).where(inArray(bookings.enrollmentId, enrIds));
    await db.delete(payments).where(eq(payments.tenantId, tenantId));
    const cartRows = await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId));
    if (cartRows.length) await db.delete(cartItems).where(inArray(cartItems.cartId, cartRows.map((c) => c.id)));
    await db.delete(enrollments).where(eq(enrollments.tenantId, tenantId));
    await db.delete(carts).where(eq(carts.tenantId, tenantId));
    await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tenantId));
    await db.delete(packages).where(eq(packages.tenantId, tenantId));
    await db.delete(locations).where(eq(locations.tenantId, tenantId));
    await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(eq(users.id, adminUserId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let studentCounter = 0;
function newStudent() {
  const n = ++studentCounter;
  return {
    firstName: "Rec",
    lastName: `Student${n}`,
    email: `recovery.student${n}.${Date.now()}@example.com`,
    phone: "5555550100",
    dateOfBirth: "2008-01-01",
  };
}

/** An express (single-package) checkout the expiry job has since expired. */
async function expiredExpressCheckout() {
  const student = newStudent();
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "STRIPE", packageId: simplePackageId, student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  await db.update(enrollments).set({ status: "expired" } as any).where(eq(enrollments.id, body.enrollmentId));
  await db.update(payments).set({ status: "EXPIRED" } as any).where(eq(payments.id, body.paymentId));
  const [payment] = await db.select().from(payments).where(eq(payments.id, body.paymentId));
  return { enrollmentId: body.enrollmentId as number, payment, student };
}

/** A cart checkout for a class that has since run (offering now COMPLETED and in the past). */
async function pastClassCartCheckout() {
  const [offering] = await db
    .insert(scheduleOfferings)
    .values({
      tenantId, packageId: classPackageId, locationId, name: "Cypress Teen Class",
      startsAt: new Date(Date.now() + 7 * 86400_000), endsAt: new Date(Date.now() + 14 * 86400_000),
      status: "PUBLISHED", capacity: 20,
    })
    .returning();
  const student = newStudent();
  const cartRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart`, { method: "POST" });
  const cart = await cartRes.json();
  const itemRes = await fetch(`${baseUrl}/api/public/cart/${cart.id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: classPackageId, offeringId: offering.id }),
  });
  assert.equal(itemRes.status, 200, await itemRes.text());
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartId: cart.id, provider: "STRIPE", student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  // Time passes: the class runs and is closed out.
  await db
    .update(scheduleOfferings)
    .set({ startsAt: new Date(Date.now() - 30 * 86400_000), endsAt: new Date(Date.now() - 20 * 86400_000), status: "COMPLETED" } as any)
    .where(eq(scheduleOfferings.id, offering.id));
  const [payment] = await db.select().from(payments).where(eq(payments.id, body.paymentId));
  return { cartId: cart.id as string, offeringId: offering.id, payment, student };
}

async function recover(paymentId: number, body: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/payments/${paymentId}/recover`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function emailsTo(address: string) {
  // Sends are fire-and-forget; give them a moment to land in the log.
  await new Promise((r) => setTimeout(r, 300));
  return db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, address)));
}

test("recovers a paid express checkout whose enrollment had expired, without emailing anyone", async () => {
  const { enrollmentId, payment, student } = await expiredExpressCheckout();
  const before = await emailsTo(student.email);

  const r = await recover(payment.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.enrollmentIds, [enrollmentId]);

  const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
  assert.equal(p.status, "COMPLETED");
  assert.equal(p.providerPaymentId, `pi_${payment.providerOrderId}`);
  assert.equal(new Date(p.completedAt!).toISOString(), "2026-08-01T15:00:00.000Z");
  assert.equal((p.metadataJson as any).recovery.by, adminUserId);
  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  assert.equal(e.status, "confirmed");
  assert.equal((await emailsTo(student.email)).length, before.length, "no customer email on silent recovery");

  const again = await recover(payment.id);
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyCompleted, true);
});

test("recovers a past-class cart purchase: enrollment records the class but books no seat", async () => {
  const { cartId, offeringId, payment, student } = await pastClassCartCheckout();
  const ownerEmailsBefore = (await emailsTo(`${adminUserId}@recovery-test.local`)).length;

  const r = await recover(payment.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.bookedSeat, false);
  assert.equal(r.body.enrollmentIds.length, 1);

  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, r.body.enrollmentIds[0]));
  assert.equal(e.status, "confirmed");
  assert.equal(e.offeringId, offeringId);
  assert.equal((await db.select().from(bookings).where(eq(bookings.enrollmentId, e.id))).length, 0);
  const [off] = await db.select().from(scheduleOfferings).where(eq(scheduleOfferings.id, offeringId));
  assert.equal(off.enrolledCount, 0);
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  assert.equal(cart.status, "converted");
  assert.equal((await emailsTo(student.email)).length, 0);
  assert.equal(
    (await emailsTo(`${adminUserId}@recovery-test.local`)).length,
    ownerEmailsBefore,
    "no owner email on silent recovery",
  );
});

test("sends the customer confirmation only when asked", async () => {
  const { payment, student } = await expiredExpressCheckout();
  const before = (await emailsTo(student.email)).length;
  const r = await recover(payment.id, { notifyCustomer: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = await emailsTo(student.email);
  assert.equal(after.length, before + 1);
  assert.match(after[after.length - 1].subject ?? "", /Payment received/);
});

test("refuses when Stripe says the checkout was not paid, and records the expiry", async () => {
  const { payment } = await pastClassCartCheckout();
  await db.update(payments).set({ status: "PENDING" } as any).where(eq(payments.id, payment.id));
  stripeSessions.set(payment.providerOrderId!, { status: "expired", paymentStatus: "unpaid" });

  const r = await recover(payment.id);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /not paid/);
  const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
  assert.equal(p.status, "EXPIRED");
  assert.equal((p.metadataJson as any).providerCheck.paid, false);
  assert.equal((await db.select().from(enrollments).where(eq(enrollments.cartId, payment.cartId!))).length, 0);
});

test("refuses when Stripe's amount differs from the checkout", async () => {
  const { payment } = await expiredExpressCheckout();
  stripeSessions.set(payment.providerOrderId!, { amountTotalCents: payment.amountCents + 100 });
  const r = await recover(payment.id);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /resolve by hand/);
  const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
  assert.equal(p.status, "EXPIRED");
});

test("check endpoint records Stripe's answer on every unconfirmed payment", async () => {
  const { payment } = await expiredExpressCheckout();
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/unconfirmed-card-payments/check`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
  const summary = await res.json();
  assert.equal(res.status, 200, JSON.stringify(summary));
  assert.ok(summary.checked >= 1);
  assert.equal(summary.errors.length, 0);

  const list = await (await fetch(`${baseUrl}/api/tenants/${tenantId}/unconfirmed-card-payments`, { headers: adminHeaders() })).json();
  const row = list.find((p: any) => p.id === payment.id);
  assert.ok(row, "payment listed");
  assert.equal(row.metadataJson.providerCheck.paid, true);
  assert.equal(row.enrollment.email.endsWith("@example.com"), true);
});

test("non-members cannot list or recover", async () => {
  const headers = { "Content-Type": "application/json", "x-test-user-id": "someone-else", "x-test-user-email": "x@y.z" };
  const list = await fetch(`${baseUrl}/api/tenants/${tenantId}/unconfirmed-card-payments`, { headers });
  assert.equal(list.status, 403);
  const rec = await fetch(`${baseUrl}/api/tenants/${tenantId}/payments/1/recover`, { method: "POST", headers, body: "{}" });
  assert.equal(rec.status, 403);
});
