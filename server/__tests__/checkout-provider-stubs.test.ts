process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-checkout-provider-stubs";
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
  tenants,
  packages,
  locations,
  carts,
  cartItems,
  enrollments,
  payments,
  tenantPaymentSettings,
} from "@shared/schema";
import {
  __setStripeCheckoutSessionForTests,
  __resetStripeCheckoutSessionForTests,
  type StripeStartInput,
} from "../payments/stripe-adapter";
import {
  __setPayPalOrderForTests,
  __resetPayPalOrderForTests,
  type PayPalStartInput,
} from "../payments/paypal-adapter";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let locationAId: number;
let standalonePackageId: number;
let cartPackageId: number;

const createdCartIds: string[] = [];
const createdEnrollmentIds: number[] = [];
const createdPaymentIds: number[] = [];

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
  tenantSlug = `chk-prov-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `ChkProv ${ts}`, slug: tenantSlug })
    .returning();
  tenantId = tenant.id;

  const [locA] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc A", address: "1 A St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationAId = locA.id;

  // A standalone package safe for the legacy single-package
  // /checkout/start endpoint — no classroom/drive hours required, so it
  // is not gated to the cart flow.
  const [standalonePkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Standalone Add-on Package",
      price: 4900,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
      isAddOn: true,
    })
    .returning();
  standalonePackageId = standalonePkg.id;

  // A second package used for cart-based checkout (kept distinct so cart
  // total assertions can't accidentally pass by coincidence).
  const [cartPkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Cart Package",
      price: 12300,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  cartPackageId = cartPkg.id;

  // Seed payment settings so the Stripe/PayPal branches of every checkout
  // endpoint can run end-to-end. The actual provider HTTP calls are
  // stubbed below.
  await db.insert(tenantPaymentSettings).values({
    tenantId,
    cashEnabled: true,
    stripeEnabled: true,
    stripeSecretKey: "sk_test_fake_for_unit_tests",
    paypalEnabled: true,
    paypalClientId: "test-paypal-client-id",
    paypalClientSecret: "test-paypal-client-secret",
    paypalMode: "sandbox",
  });

  // Default no-op stubs so unrelated branches that may pass through the
  // STRIPE/PAYPAL adapters never make a real network call. Each test
  // installs a capturing stub locally and resets it in a finally block.
  __setStripeCheckoutSessionForTests(async () => ({
    sessionId: "sess_default_stub",
    redirectUrl: "https://stripe.test/default",
  }));
  __setPayPalOrderForTests(async () => ({
    orderId: "ord_default_stub",
    approvalUrl: "https://paypal.test/default",
  }));

  await startServer();
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  __resetPayPalOrderForTests();
  try {
    if (createdPaymentIds.length) {
      await db.delete(payments).where(inArray(payments.id, createdPaymentIds));
    }
    if (createdEnrollmentIds.length) {
      await db.delete(payments).where(inArray(payments.enrollmentId, createdEnrollmentIds));
      await db.delete(enrollments).where(inArray(enrollments.id, createdEnrollmentIds));
    }
    if (createdCartIds.length) {
      await db.delete(payments).where(inArray(payments.cartId, createdCartIds));
      await db.delete(cartItems).where(inArray(cartItems.cartId, createdCartIds));
      await db.delete(carts).where(inArray(carts.id, createdCartIds));
    }
    if (tenantId) {
      await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    }
    if (standalonePackageId) await db.delete(packages).where(eq(packages.id, standalonePackageId));
    if (cartPackageId) await db.delete(packages).where(eq(packages.id, cartPackageId));
    if (locationAId) await db.delete(locations).where(eq(locations.id, locationAId));
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

async function addCartItem(cartId: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

async function startCartCheckout(cartId: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartId, ...body }),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  if (parsed && typeof parsed.paymentId === "number") createdPaymentIds.push(parsed.paymentId);
  return { status: res.status, body: parsed };
}

async function startPackageCheckout(body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  if (parsed && typeof parsed.enrollmentId === "number") createdEnrollmentIds.push(parsed.enrollmentId);
  if (parsed && typeof parsed.paymentId === "number") createdPaymentIds.push(parsed.paymentId);
  return { status: res.status, body: parsed };
}

// ---------- Package (single-item) checkout: STRIPE / PAYPAL ----------

test("package checkout E2E: STRIPE returns redirectUrl, persists providerOrderId+PENDING, forwards metadata", async () => {
  const email = `pkg-stripe-${Date.now()}@test.local`;
  const fakeSessionId = `cs_pkg_${Date.now()}`;
  const fakeRedirectUrl = `https://stripe.test/checkout/${fakeSessionId}`;

  let captured: StripeStartInput | undefined;
  __setStripeCheckoutSessionForTests(async (input) => {
    captured = input;
    return { sessionId: fakeSessionId, redirectUrl: fakeRedirectUrl };
  });

  try {
    const r = await startPackageCheckout({
      provider: "STRIPE",
      packageId: standalonePackageId,
      locationId: locationAId,
      student: { firstName: "Ada", lastName: "Lovelace", email },
    });

    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body?.redirectUrl, fakeRedirectUrl, "response should expose Stripe checkout URL");
    assert.ok(typeof r.body.redirectUrl === "string" && r.body.redirectUrl.length > 0, "redirectUrl must be a non-empty string");
    assert.equal(typeof r.body?.enrollmentId, "number", "expected numeric enrollmentId");
    assert.equal(typeof r.body?.paymentId, "number", "expected numeric paymentId");

    assert.ok(captured, "Stripe adapter should have been invoked");
    assert.equal(captured!.amountCents, 4900, "Stripe should be charged the package price");
    assert.equal(captured!.currency, "USD", "Stripe currency should be USD");
    assert.equal(captured!.secretKey, "sk_test_fake_for_unit_tests", "Stripe secretKey should come from tenant settings");
    assert.ok(typeof captured!.successUrl === "string" && captured!.successUrl.length > 0, "successUrl must be set");
    assert.ok(typeof captured!.cancelUrl === "string" && captured!.cancelUrl.length > 0, "cancelUrl must be set");
    assert.equal(captured!.metadata.tenantId, String(tenantId), "metadata.tenantId must match tenant");
    assert.equal(
      captured!.metadata.enrollmentId,
      String(r.body.enrollmentId),
      "metadata.enrollmentId must match persisted enrollment",
    );
    assert.equal(
      captured!.metadata.paymentId,
      String(r.body.paymentId),
      "metadata.paymentId must match persisted payment",
    );

    const [pay] = await db.select().from(payments).where(eq(payments.id, r.body.paymentId));
    assert.ok(pay, "payment row should be persisted");
    assert.equal(pay.tenantId, tenantId);
    assert.equal(pay.enrollmentId, r.body.enrollmentId, "payment should link to enrollment");
    assert.equal(pay.provider, "STRIPE");
    assert.equal(pay.status, "PENDING", "STRIPE payment should be flipped from CREATED to PENDING");
    assert.equal(pay.providerOrderId, fakeSessionId, "providerOrderId should be the Stripe session id");
    assert.equal(pay.amountCents, 4900);
    assert.equal(pay.currency, "USD");
  } finally {
    __resetStripeCheckoutSessionForTests();
    __setStripeCheckoutSessionForTests(async () => ({
      sessionId: "sess_default_stub",
      redirectUrl: "https://stripe.test/default",
    }));
  }
});

test("package checkout E2E: PAYPAL returns redirectUrl, persists providerOrderId+PENDING, forwards metadata", async () => {
  const email = `pkg-paypal-${Date.now()}@test.local`;
  const fakeOrderId = `PAYPAL_PKG_${Date.now()}`;
  const fakeApprovalUrl = `https://paypal.test/checkoutnow?token=${fakeOrderId}`;

  let captured: PayPalStartInput | undefined;
  __setPayPalOrderForTests(async (input) => {
    captured = input;
    return { orderId: fakeOrderId, approvalUrl: fakeApprovalUrl };
  });

  try {
    const r = await startPackageCheckout({
      provider: "PAYPAL",
      packageId: standalonePackageId,
      locationId: locationAId,
      student: { firstName: "Grace", lastName: "Hopper", email },
    });

    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body?.redirectUrl, fakeApprovalUrl, "response should expose PayPal approval URL");
    assert.ok(typeof r.body.redirectUrl === "string" && r.body.redirectUrl.length > 0, "redirectUrl must be a non-empty string");
    assert.equal(typeof r.body?.enrollmentId, "number");
    assert.equal(typeof r.body?.paymentId, "number");

    assert.ok(captured, "PayPal adapter should have been invoked");
    assert.equal(captured!.clientId, "test-paypal-client-id", "PayPal clientId should come from tenant settings");
    assert.equal(captured!.clientSecret, "test-paypal-client-secret", "PayPal clientSecret should come from tenant settings");
    assert.equal(captured!.mode, "sandbox", "PayPal mode should come from tenant settings");
    assert.equal(captured!.amountCents, 4900);
    assert.equal(captured!.currency, "USD");
    assert.ok(typeof captured!.returnUrl === "string" && captured!.returnUrl.length > 0, "returnUrl must be set");
    assert.ok(typeof captured!.cancelUrl === "string" && captured!.cancelUrl.length > 0, "cancelUrl must be set");
    assert.equal(captured!.metadata.tenantId, String(tenantId));
    assert.equal(captured!.metadata.enrollmentId, String(r.body.enrollmentId));
    assert.equal(captured!.metadata.paymentId, String(r.body.paymentId));

    const [pay] = await db.select().from(payments).where(eq(payments.id, r.body.paymentId));
    assert.ok(pay, "payment row should be persisted");
    assert.equal(pay.tenantId, tenantId);
    assert.equal(pay.enrollmentId, r.body.enrollmentId);
    assert.equal(pay.provider, "PAYPAL");
    assert.equal(pay.status, "PENDING", "PAYPAL payment should be flipped from CREATED to PENDING");
    assert.equal(pay.providerOrderId, fakeOrderId, "providerOrderId should be the PayPal order id");
    assert.equal(pay.amountCents, 4900);
    assert.equal(pay.currency, "USD");
  } finally {
    __resetPayPalOrderForTests();
    __setPayPalOrderForTests(async () => ({
      orderId: "ord_default_stub",
      approvalUrl: "https://paypal.test/default",
    }));
  }
});

// ---------- Cart checkout: STRIPE / PAYPAL ----------

test("cart checkout E2E: STRIPE returns redirectUrl, persists providerOrderId+PENDING, forwards metadata, freezes cart", async () => {
  const cartId = await createCart();
  const addRes = await addCartItem(cartId, { packageId: cartPackageId, locationId: locationAId });
  assert.equal(addRes.status, 200, `cart add failed: ${addRes.status} ${JSON.stringify(addRes.body)}`);

  const fakeSessionId = `cs_cart_${Date.now()}`;
  const fakeRedirectUrl = `https://stripe.test/cart/${fakeSessionId}`;

  let captured: StripeStartInput | undefined;
  __setStripeCheckoutSessionForTests(async (input) => {
    captured = input;
    return { sessionId: fakeSessionId, redirectUrl: fakeRedirectUrl };
  });

  try {
    const r = await startCartCheckout(cartId, {
      provider: "STRIPE",
      student: { firstName: "Linus", lastName: "Torvalds", email: `cart-stripe-${Date.now()}@test.local` },
    });

    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body?.redirectUrl, fakeRedirectUrl, "response should expose Stripe checkout URL");
    assert.ok(typeof r.body.redirectUrl === "string" && r.body.redirectUrl.length > 0, "redirectUrl must be a non-empty string");
    assert.equal(r.body?.cartId, cartId, "response should echo the cartId");
    assert.equal(typeof r.body?.paymentId, "number", "expected numeric paymentId");

    assert.ok(captured, "Stripe adapter should have been invoked");
    assert.equal(captured!.amountCents, 12300, "Stripe should be charged the cart total in cents");
    assert.equal(captured!.currency, "USD");
    assert.equal(captured!.secretKey, "sk_test_fake_for_unit_tests");
    assert.ok(typeof captured!.successUrl === "string" && captured!.successUrl.length > 0, "successUrl must be set");
    assert.ok(typeof captured!.cancelUrl === "string" && captured!.cancelUrl.length > 0, "cancelUrl must be set");
    assert.equal(captured!.metadata.tenantId, String(tenantId), "metadata.tenantId must match tenant");
    assert.equal(captured!.metadata.cartId, cartId, "metadata.cartId must match the cart");
    assert.equal(
      captured!.metadata.paymentId,
      String(r.body.paymentId),
      "metadata.paymentId must match the persisted payment",
    );

    const [pay] = await db.select().from(payments).where(eq(payments.id, r.body.paymentId));
    assert.ok(pay, "payment row should be persisted");
    assert.equal(pay.tenantId, tenantId);
    assert.equal(pay.cartId, cartId, "cart-checkout payment should link back to the cart");
    assert.equal(pay.enrollmentId, null, "cart-checkout payment should NOT link to an enrollment up-front");
    assert.equal(pay.provider, "STRIPE");
    assert.equal(pay.status, "PENDING", "STRIPE cart payment should be flipped from CREATED to PENDING");
    assert.equal(pay.providerOrderId, fakeSessionId, "providerOrderId should be the Stripe session id");
    assert.equal(pay.amountCents, 12300);
    assert.equal(pay.currency, "USD");

    // Cart should now be frozen — only happens after the provider session
    // is successfully created.
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.status, "checkout_pending", "cart should be flipped to checkout_pending after provider success");
  } finally {
    __resetStripeCheckoutSessionForTests();
    __setStripeCheckoutSessionForTests(async () => ({
      sessionId: "sess_default_stub",
      redirectUrl: "https://stripe.test/default",
    }));
  }
});

test("cart checkout E2E: PAYPAL returns redirectUrl, persists providerOrderId+PENDING, forwards metadata, freezes cart", async () => {
  const cartId = await createCart();
  const addRes = await addCartItem(cartId, { packageId: cartPackageId, locationId: locationAId });
  assert.equal(addRes.status, 200, `cart add failed: ${addRes.status} ${JSON.stringify(addRes.body)}`);

  const fakeOrderId = `PAYPAL_CART_${Date.now()}`;
  const fakeApprovalUrl = `https://paypal.test/checkoutnow?token=${fakeOrderId}`;

  let captured: PayPalStartInput | undefined;
  __setPayPalOrderForTests(async (input) => {
    captured = input;
    return { orderId: fakeOrderId, approvalUrl: fakeApprovalUrl };
  });

  try {
    const r = await startCartCheckout(cartId, {
      provider: "PAYPAL",
      student: { firstName: "Margaret", lastName: "Hamilton", email: `cart-paypal-${Date.now()}@test.local` },
    });

    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body?.redirectUrl, fakeApprovalUrl, "response should expose PayPal approval URL");
    assert.ok(typeof r.body.redirectUrl === "string" && r.body.redirectUrl.length > 0, "redirectUrl must be a non-empty string");
    assert.equal(r.body?.cartId, cartId);
    assert.equal(typeof r.body?.paymentId, "number");

    assert.ok(captured, "PayPal adapter should have been invoked");
    assert.equal(captured!.clientId, "test-paypal-client-id");
    assert.equal(captured!.clientSecret, "test-paypal-client-secret");
    assert.equal(captured!.mode, "sandbox");
    assert.equal(captured!.amountCents, 12300, "PayPal should be charged the cart total in cents");
    assert.equal(captured!.currency, "USD");
    assert.ok(typeof captured!.returnUrl === "string" && captured!.returnUrl.length > 0, "returnUrl must be set");
    assert.ok(captured!.returnUrl.includes(`cartId=${cartId}`), "returnUrl should include the cartId");
    assert.ok(typeof captured!.cancelUrl === "string" && captured!.cancelUrl.length > 0, "cancelUrl must be set");
    assert.equal(captured!.metadata.tenantId, String(tenantId));
    assert.equal(captured!.metadata.cartId, cartId);
    assert.equal(captured!.metadata.paymentId, String(r.body.paymentId));

    const [pay] = await db.select().from(payments).where(eq(payments.id, r.body.paymentId));
    assert.ok(pay, "payment row should be persisted");
    assert.equal(pay.tenantId, tenantId);
    assert.equal(pay.cartId, cartId);
    assert.equal(pay.enrollmentId, null, "cart-checkout payment should NOT link to an enrollment up-front");
    assert.equal(pay.provider, "PAYPAL");
    assert.equal(pay.status, "PENDING", "PAYPAL cart payment should be flipped from CREATED to PENDING");
    assert.equal(pay.providerOrderId, fakeOrderId, "providerOrderId should be the PayPal order id");
    assert.equal(pay.amountCents, 12300);
    assert.equal(pay.currency, "USD");

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.status, "checkout_pending", "cart should be flipped to checkout_pending after provider success");
  } finally {
    __resetPayPalOrderForTests();
    __setPayPalOrderForTests(async () => ({
      orderId: "ord_default_stub",
      approvalUrl: "https://paypal.test/default",
    }));
  }
});

// ---------- Provider failure semantics for cart checkout ----------

test("cart checkout: STRIPE adapter failure marks payment FAILED and keeps cart open", async () => {
  const cartId = await createCart();
  const addRes = await addCartItem(cartId, { packageId: cartPackageId, locationId: locationAId });
  assert.equal(addRes.status, 200);

  __setStripeCheckoutSessionForTests(async () => {
    throw new Error("simulated Stripe outage");
  });

  try {
    const r = await startCartCheckout(cartId, {
      provider: "STRIPE",
      student: { firstName: "Err", lastName: "Test", email: `cart-stripe-fail-${Date.now()}@test.local` },
    });

    assert.equal(r.status, 500, `expected 500 on provider failure, got ${r.status}: ${JSON.stringify(r.body)}`);

    // Cart must remain open so the buyer can retry without being stuck in
    // checkout_pending limbo.
    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.status, "open", "cart must stay open after provider failure");

    // The payment row that was created up-front must end at FAILED so it
    // can't accidentally be reused or captured later.
    const cartPayments = await db.select().from(payments).where(eq(payments.cartId, cartId));
    assert.ok(cartPayments.length >= 1, "expected at least one payment row created for the cart");
    for (const p of cartPayments) {
      createdPaymentIds.push(p.id);
      assert.equal(
        p.status,
        "FAILED",
        `cart payment after provider failure should be FAILED, got ${p.status}`,
      );
      assert.equal(p.providerOrderId, null, "FAILED payment should not have a providerOrderId set");
    }
  } finally {
    __resetStripeCheckoutSessionForTests();
    __setStripeCheckoutSessionForTests(async () => ({
      sessionId: "sess_default_stub",
      redirectUrl: "https://stripe.test/default",
    }));
  }
});

test("cart checkout: PAYPAL adapter failure marks payment FAILED and keeps cart open", async () => {
  const cartId = await createCart();
  const addRes = await addCartItem(cartId, { packageId: cartPackageId, locationId: locationAId });
  assert.equal(addRes.status, 200);

  __setPayPalOrderForTests(async () => {
    throw new Error("simulated PayPal outage");
  });

  try {
    const r = await startCartCheckout(cartId, {
      provider: "PAYPAL",
      student: { firstName: "Err", lastName: "Test", email: `cart-paypal-fail-${Date.now()}@test.local` },
    });

    assert.equal(r.status, 500, `expected 500 on provider failure, got ${r.status}: ${JSON.stringify(r.body)}`);

    const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
    assert.equal(cart.status, "open", "cart must stay open after provider failure");

    const cartPayments = await db.select().from(payments).where(eq(payments.cartId, cartId));
    assert.ok(cartPayments.length >= 1, "expected at least one payment row created for the cart");
    for (const p of cartPayments) {
      createdPaymentIds.push(p.id);
      assert.equal(
        p.status,
        "FAILED",
        `cart payment after PayPal failure should be FAILED, got ${p.status}`,
      );
      assert.equal(p.providerOrderId, null, "FAILED payment should not have a providerOrderId set");
    }
  } finally {
    __resetPayPalOrderForTests();
    __setPayPalOrderForTests(async () => ({
      orderId: "ord_default_stub",
      approvalUrl: "https://paypal.test/default",
    }));
  }
});

// ---------- Provider failure semantics for package checkout ----------
//
// The single-package /checkout/start endpoint (server/routes.ts ~line 4848)
// does NOT currently wrap the provider call in a per-call try/catch the way
// cart-checkout does. A provider exception bubbles to the outer route
// handler which returns 500 with `{ message: "Failed to start checkout" }`
// and leaves the up-front payment row at status CREATED with no
// providerOrderId. These tests document and pin that current behavior so
// any future refactor that changes failure semantics — such as aligning it
// with cart-checkout's FAILED transition — is forced to update this test
// file in lockstep.

test("package checkout: STRIPE adapter failure returns 500 and leaves payment row at CREATED", async () => {
  const email = `pkg-stripe-fail-${Date.now()}@test.local`;

  __setStripeCheckoutSessionForTests(async () => {
    throw new Error("simulated Stripe outage");
  });

  try {
    const r = await startPackageCheckout({
      provider: "STRIPE",
      packageId: standalonePackageId,
      locationId: locationAId,
      student: { firstName: "Err", lastName: "Test", email },
    });

    assert.equal(r.status, 500, `expected 500 on provider failure, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(
      String(r.body?.message ?? ""),
      /failed to start checkout/i,
      "package checkout should return its generic 500 message on provider failure",
    );

    // The pending_payment enrollment that was created up-front before the
    // provider call should still exist (the route does not roll it back).
    const enrRows = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.email, email));
    assert.equal(enrRows.length, 1, "package checkout creates the enrollment before the provider call");
    const enr = enrRows[0]!;
    createdEnrollmentIds.push(enr.id);
    assert.equal(enr.status, "pending_payment", "enrollment should remain in pending_payment after provider failure");

    // Payment row should still exist and have NOT been advanced past the
    // initial CREATED state, with no providerOrderId set.
    const payRows = await db.select().from(payments).where(eq(payments.enrollmentId, enr.id));
    assert.equal(payRows.length, 1, "exactly one payment row should be persisted for the enrollment");
    const p = payRows[0]!;
    createdPaymentIds.push(p.id);
    assert.equal(p.provider, "STRIPE");
    assert.equal(
      p.status,
      "CREATED",
      `package STRIPE payment after provider failure should still be CREATED, got ${p.status}`,
    );
    assert.equal(p.providerOrderId, null, "no providerOrderId should be set when the provider call failed");
    assert.equal(p.amountCents, 4900, "payment amount should still match the package price");
  } finally {
    __resetStripeCheckoutSessionForTests();
    __setStripeCheckoutSessionForTests(async () => ({
      sessionId: "sess_default_stub",
      redirectUrl: "https://stripe.test/default",
    }));
  }
});

test("package checkout: PAYPAL adapter failure returns 500 and leaves payment row at CREATED", async () => {
  const email = `pkg-paypal-fail-${Date.now()}@test.local`;

  __setPayPalOrderForTests(async () => {
    throw new Error("simulated PayPal outage");
  });

  try {
    const r = await startPackageCheckout({
      provider: "PAYPAL",
      packageId: standalonePackageId,
      locationId: locationAId,
      student: { firstName: "Err", lastName: "Test", email },
    });

    assert.equal(r.status, 500, `expected 500 on provider failure, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(
      String(r.body?.message ?? ""),
      /failed to start checkout/i,
      "package checkout should return its generic 500 message on provider failure",
    );

    const enrRows = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.email, email));
    assert.equal(enrRows.length, 1, "package checkout creates the enrollment before the provider call");
    const enr = enrRows[0]!;
    createdEnrollmentIds.push(enr.id);
    assert.equal(enr.status, "pending_payment", "enrollment should remain in pending_payment after provider failure");

    const payRows = await db.select().from(payments).where(eq(payments.enrollmentId, enr.id));
    assert.equal(payRows.length, 1, "exactly one payment row should be persisted for the enrollment");
    const p = payRows[0]!;
    createdPaymentIds.push(p.id);
    assert.equal(p.provider, "PAYPAL");
    assert.equal(
      p.status,
      "CREATED",
      `package PAYPAL payment after provider failure should still be CREATED, got ${p.status}`,
    );
    assert.equal(p.providerOrderId, null, "no providerOrderId should be set when the provider call failed");
    assert.equal(p.amountCents, 4900, "payment amount should still match the package price");
  } finally {
    __resetPayPalOrderForTests();
    __setPayPalOrderForTests(async () => ({
      orderId: "ord_default_stub",
      approvalUrl: "https://paypal.test/default",
    }));
  }
});
