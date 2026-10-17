process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-stripe-webhook";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Stripe from "stripe";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import {
  tenants,
  packages,
  carts,
  cartItems,
  enrollments,
  payments,
  tenantPaymentSettings,
} from "@shared/schema";
import {
  __setStripeCheckoutSessionForTests,
  __resetStripeCheckoutSessionForTests,
} from "../payments/stripe-adapter";

const WEBHOOK_SECRET = "whsec_test_stripe_webhook_secret";
const stripe = new Stripe("sk_test_unused", { apiVersion: "2025-01-27.acacia" as any });

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let packageId: number;
let sessionCounter = 0;

const createdCartIds: string[] = [];
const createdEnrollmentIds: number[] = [];

async function startServer(): Promise<void> {
  const app = express();
  // Same raw-body capture as server/index.ts — the webhook verifies these bytes.
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

before(async () => {
  const ts = Date.now();
  tenantSlug = `stripe-wh-${ts}`;
  const [tenant] = await db.insert(tenants).values({ name: `StripeWH ${ts}`, slug: tenantSlug }).returning();
  tenantId = tenant.id;

  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Webhook Package",
      price: 5000,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  packageId = pkg.id;

  await db.insert(tenantPaymentSettings).values({
    tenantId,
    stripeEnabled: true,
    stripeSecretKey: "sk_test_fake_for_unit_tests",
    stripeWebhookSecret: WEBHOOK_SECRET,
  });

  __setStripeCheckoutSessionForTests(async () => ({
    sessionId: `cs_test_${++sessionCounter}`,
    redirectUrl: "https://stripe.test/checkout",
  }));

  await startServer();
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  try {
    if (createdEnrollmentIds.length) {
      await db.delete(payments).where(inArray(payments.enrollmentId, createdEnrollmentIds));
    }
    if (createdCartIds.length) {
      const cartEnrollments = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(inArray(enrollments.cartId, createdCartIds));
      await db.delete(payments).where(inArray(payments.cartId, createdCartIds));
      if (cartEnrollments.length) {
        await db.delete(payments).where(inArray(payments.enrollmentId, cartEnrollments.map((e) => e.id)));
        await db.delete(enrollments).where(inArray(enrollments.id, cartEnrollments.map((e) => e.id)));
      }
      await db.delete(cartItems).where(inArray(cartItems.cartId, createdCartIds));
      await db.delete(carts).where(inArray(carts.id, createdCartIds));
    }
    if (createdEnrollmentIds.length) {
      await db.delete(enrollments).where(inArray(enrollments.id, createdEnrollmentIds));
    }
    await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    await db.delete(packages).where(eq(packages.id, packageId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const student = {
  firstName: "Webhook",
  lastName: "Student",
  email: "webhook.student@example.com",
  phone: "5555550100",
  dateOfBirth: "2008-01-01",
};

async function startExpressCheckout(): Promise<{ enrollmentId: number; paymentId: number }> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "STRIPE", packageId, student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `checkout/start failed: ${JSON.stringify(body)}`);
  createdEnrollmentIds.push(body.enrollmentId);
  return { enrollmentId: body.enrollmentId, paymentId: body.paymentId };
}

async function startCartCheckout(): Promise<{ cartId: string; paymentId: number }> {
  const cartRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart`, { method: "POST" });
  const cart = await cartRes.json();
  createdCartIds.push(cart.id);
  const itemRes = await fetch(`${baseUrl}/api/public/cart/${cart.id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId }),
  });
  assert.equal(itemRes.status, 200, `add item failed: ${await itemRes.text()}`);
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartId: cart.id, provider: "STRIPE", student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `cart-checkout/start failed: ${JSON.stringify(body)}`);
  return { cartId: cart.id, paymentId: body.paymentId };
}

async function getPayment(id: number) {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  return row;
}

function eventFor(type: string, paymentId: number, sessionId: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: `evt_${type}_${paymentId}_${Date.now()}`,
    object: "event",
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: `pi_${paymentId}`,
        metadata: { tenantId: String(tenantId), paymentId: String(paymentId) },
        ...extra,
      },
    },
  });
}

async function postWebhook(payload: string, signature?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sig = signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  if (sig) headers["stripe-signature"] = sig;
  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, { method: "POST", headers, body: payload });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

test("signed checkout.session.completed completes the payment and confirms the enrollment", async () => {
  const { enrollmentId, paymentId } = await startExpressCheckout();
  const before = await getPayment(paymentId);

  const res = await postWebhook(eventFor("checkout.session.completed", paymentId, before.providerOrderId!));
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const after = await getPayment(paymentId);
  assert.equal(after.status, "COMPLETED");
  assert.equal(after.providerPaymentId, `pi_${paymentId}`);
  const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  assert.equal(enrollment.status, "confirmed");

  const replay = await postWebhook(eventFor("checkout.session.completed", paymentId, before.providerOrderId!));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.alreadyProcessed, true);
});

test("signed checkout.session.completed activates a cart and creates its enrollment", async () => {
  const { cartId, paymentId } = await startCartCheckout();
  const before = await getPayment(paymentId);

  const res = await postWebhook(eventFor("checkout.session.completed", paymentId, before.providerOrderId!));
  assert.equal(res.status, 200, JSON.stringify(res.body));

  assert.equal((await getPayment(paymentId)).status, "COMPLETED");
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  assert.equal(cart.status, "converted");
  const created = await db.select().from(enrollments).where(eq(enrollments.cartId, cartId));
  assert.equal(created.length, 1);
  assert.equal(created[0].status, "confirmed");
});

test("a bad signature is rejected and changes nothing", async () => {
  const { paymentId } = await startExpressCheckout();
  const before = await getPayment(paymentId);
  const payload = eventFor("checkout.session.completed", paymentId, before.providerOrderId!);
  const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });

  const res = await postWebhook(payload, forged);
  assert.equal(res.status, 400);
  assert.equal((await getPayment(paymentId)).status, before.status);
});

test("an event for a different session than the payment's is rejected", async () => {
  const { paymentId } = await startExpressCheckout();
  const res = await postWebhook(eventFor("checkout.session.completed", paymentId, "cs_test_someone_else"));
  assert.equal(res.status, 400);
  assert.notEqual((await getPayment(paymentId)).status, "COMPLETED");
});

test("an unpaid completed session leaves the payment pending", async () => {
  const { paymentId } = await startExpressCheckout();
  const before = await getPayment(paymentId);
  const res = await postWebhook(
    eventFor("checkout.session.completed", paymentId, before.providerOrderId!, { payment_status: "unpaid" }),
  );
  assert.equal(res.status, 200);
  assert.equal((await getPayment(paymentId)).status, "PENDING");
});

test("checkout.session.expired marks a pending payment EXPIRED", async () => {
  const { paymentId } = await startExpressCheckout();
  const before = await getPayment(paymentId);
  const res = await postWebhook(eventFor("checkout.session.expired", paymentId, before.providerOrderId!));
  assert.equal(res.status, 200);
  assert.equal((await getPayment(paymentId)).status, "EXPIRED");
});

test("events are refused when the tenant has no webhook secret", async () => {
  const { paymentId } = await startExpressCheckout();
  const before = await getPayment(paymentId);
  await db
    .update(tenantPaymentSettings)
    .set({ stripeWebhookSecret: null })
    .where(eq(tenantPaymentSettings.tenantId, tenantId));
  try {
    const res = await postWebhook(eventFor("checkout.session.completed", paymentId, before.providerOrderId!));
    assert.equal(res.status, 400);
    assert.equal((await getPayment(paymentId)).status, "PENDING");
  } finally {
    await db
      .update(tenantPaymentSettings)
      .set({ stripeWebhookSecret: WEBHOOK_SECRET })
      .where(eq(tenantPaymentSettings.tenantId, tenantId));
  }
});

test("unhandled event types are acknowledged without a lookup", async () => {
  const res = await postWebhook(JSON.stringify({ id: "evt_x", type: "customer.created", data: { object: {} } }));
  assert.equal(res.status, 200);
});
