process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-payment-reconcile";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { and, eq, inArray, like } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { reconcilePendingCardPayments } from "../payments/reconcile";
import { completeProviderPayment } from "../payments/complete-payment";
import {
  tenants, users, tenantMembers, packages, carts, cartItems, enrollments, payments,
  sessionChangeEmails, tenantPaymentSettings,
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
let packageId: number;
let adminUserId: string;
let n = 0;
const stripeSays = new Map<string, Partial<StripeSessionStatus>>();
const retrieveCalls: string[] = [];

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const ts = Date.now();
  tenantSlug = `reconcile-${ts}`;
  const [t] = await db.insert(tenants).values({ name: "Reconcile School", slug: tenantSlug }).returning();
  tenantId = t.id;
  await db.insert(tenantPaymentSettings).values({ tenantId, stripeEnabled: true, stripeSecretKey: "sk_test_fake" });
  const [pkg] = await db
    .insert(packages)
    .values({ tenantId, name: "Road Test", price: 9000, classroomHoursRequired: 0, driveHoursRequired: 0, active: true, locationScopeMode: "ALL_LOCATIONS" })
    .returning();
  packageId = pkg.id;
  adminUserId = `reconcile-admin-${ts}`;
  await db.insert(users).values({ id: adminUserId, email: `${adminUserId}@example.com`, firstName: "R", lastName: "A" });
  await db.insert(tenantMembers).values({ tenantId, userId: adminUserId, role: "tenant_admin", status: "ACTIVE", active: true });

  __setStripeCheckoutSessionForTests(async () => ({ sessionId: `cs_reconcile_${++n}`, redirectUrl: "https://stripe.test/c" }));
  __setRetrieveStripeCheckoutSessionForTests(async (_k, sessionId) => {
    retrieveCalls.push(sessionId);
    const s = stripeSays.get(sessionId) ?? {};
    return {
      sessionId,
      status: s.status ?? "open",
      paymentStatus: s.paymentStatus ?? "unpaid",
      paymentIntentId: s.paymentIntentId ?? null,
      chargeId: null,
      amountTotalCents: null,
      customerEmail: null,
      paidAt: s.paidAt ?? null,
    };
  });
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  __resetRetrieveStripeCheckoutSessionForTests();
  try {
    await db.delete(sessionChangeEmails).where(eq(sessionChangeEmails.tenantId, tenantId));
    await db.delete(payments).where(eq(payments.tenantId, tenantId));
    const cartIds = (await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId))).map((c) => c.id);
    if (cartIds.length) await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
    await db.delete(enrollments).where(eq(enrollments.tenantId, tenantId));
    await db.delete(carts).where(eq(carts.tenantId, tenantId));
    await db.delete(packages).where(eq(packages.tenantId, tenantId));
    await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(eq(users.id, adminUserId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function checkout(minutesAgo: number) {
  const k = ++n;
  const student = { firstName: "Rae", lastName: `Con${k}`, email: `rae.con${k}.${Date.now()}@example.com`, phone: "5555550100", dateOfBirth: "2000-01-01" };
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/checkout/start`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "STRIPE", packageId, student }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  await db.update(payments).set({ createdAt: new Date(Date.now() - minutesAgo * 60_000) } as any).where(eq(payments.id, body.paymentId));
  const [p] = await db.select().from(payments).where(eq(payments.id, body.paymentId));
  return { payment: p, enrollmentId: body.enrollmentId as number, student };
}

async function emails(likeSubject: string, to?: string) {
  await new Promise((r) => setTimeout(r, 400));
  const rows = await db.select().from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), like(sessionChangeEmails.subject, likeSubject)));
  return to ? rows.filter((r) => r.recipientEmail === to) : rows;
}

test("a paid checkout whose webhook never arrived is completed, with both emails", async () => {
  const { payment, enrollmentId, student } = await checkout(20);
  stripeSays.set(payment.providerOrderId!, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_missed_1", paidAt: new Date("2030-01-01T12:00:00Z") });

  const r = await reconcilePendingCardPayments();
  assert.ok(r.completed >= 1);

  const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
  assert.equal(p.status, "COMPLETED");
  assert.equal(p.providerPaymentId, "pi_missed_1");
  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  assert.equal(e.status, "confirmed");
  assert.equal((await emails("%payment received%", student.email)).length, 1);
  assert.equal((await emails(`PAID%${p.reference}%`)).length, 1);
});

test("an unpaid open checkout is left pending and not re-asked within ten minutes", async () => {
  const { payment } = await checkout(20);
  const before = retrieveCalls.filter((c) => c === payment.providerOrderId).length;
  await reconcilePendingCardPayments();
  await reconcilePendingCardPayments();
  assert.equal(retrieveCalls.filter((c) => c === payment.providerOrderId).length, before + 1);
  const [p] = await db.select().from(payments).where(eq(payments.id, payment.id));
  assert.equal(p.status, "PENDING");
  assert.equal((p.metadataJson as any).providerCheck.paid, false);
});

test("paying late still enrols the customer after the expiry job gave up", async () => {
  const { payment, enrollmentId } = await checkout(90);
  await db.update(enrollments).set({ status: "expired" } as any).where(eq(enrollments.id, enrollmentId));
  await db.update(payments).set({ status: "EXPIRED" } as any).where(eq(payments.id, payment.id));
  stripeSays.set(payment.providerOrderId!, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_late_1" });

  await reconcilePendingCardPayments();
  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  assert.equal(e.status, "confirmed");
});

test("checkouts younger than ten minutes or older than 48 hours are not checked", async () => {
  const young = await checkout(2);
  const old = await checkout(60 * 50);
  await reconcilePendingCardPayments();
  assert.equal(retrieveCalls.includes(young.payment.providerOrderId!), false);
  assert.equal(retrieveCalls.includes(old.payment.providerOrderId!), false);
});

test("webhook and job completing at once activate the payment only once", async () => {
  const { payment, student } = await checkout(20);
  const [a, b] = await Promise.all([
    completeProviderPayment(payment.id, { providerPaymentId: "pi_race" }),
    completeProviderPayment(payment.id, { providerPaymentId: "pi_race" }),
  ]);
  assert.deepEqual([a.completed, b.completed].sort(), [false, true]);
  assert.equal((await emails("%payment received%", student.email)).length, 1);
});
