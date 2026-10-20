process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-secrets-and-refunds";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { storage } from "../storage";
import { decryptSecret, encryptSecret, isEncrypted } from "../lib/secrets";
import { completeProviderPayment } from "../payments/complete-payment";
import { __setAuthnetApiForTests, __resetAuthnetApiForTests } from "../payments/authorizenet-adapter";
import { __setRefundStripePaymentForTests, __resetRefundStripePaymentForTests, __setStripeCheckoutSessionForTests, __resetStripeCheckoutSessionForTests } from "../payments/stripe-adapter";
import {
  tenants, users, tenantMembers, packages, carts, cartItems, enrollments, payments, sessionChangeEmails, tenantPaymentSettings,
} from "@shared/schema";

const KEY = crypto.randomBytes(32).toString("base64");

test("secrets: round trip, legacy plain text passes through, wrong key fails", () => {
  const saved = process.env.PAYMENT_SECRETS_KEY;
  try {
    delete process.env.PAYMENT_SECRETS_KEY;
    assert.equal(encryptSecret("sk_live_abc"), "sk_live_abc", "no key → stored as before");
    process.env.PAYMENT_SECRETS_KEY = KEY;
    const enc = encryptSecret("sk_live_abc")!;
    assert.ok(isEncrypted(enc) && !enc.includes("sk_live_abc"));
    assert.notEqual(encryptSecret("sk_live_abc"), enc, "random IV per encryption");
    assert.equal(decryptSecret(enc), "sk_live_abc");
    assert.equal(decryptSecret("plain-legacy"), "plain-legacy");
    assert.equal(encryptSecret(enc), enc, "never double-encrypted");
    process.env.PAYMENT_SECRETS_KEY = crypto.randomBytes(32).toString("base64");
    assert.throws(() => decryptSecret(enc));
  } finally {
    if (saved == null) delete process.env.PAYMENT_SECRETS_KEY;
    else process.env.PAYMENT_SECRETS_KEY = saved;
  }
});

let server: Server;
let baseUrl: string;
let tenantId: number;
let slug: string;
let packageId: number;
let adminUserId: string;
let n = 0;
const anetCalls: Array<{ name: string; body: any }> = [];
const txStatus = new Map<string, string>();
let failNextAnet = false;
const stripeRefunds: Array<{ pi: string; amount?: number }> = [];

before(async () => {
  process.env.PAYMENT_SECRETS_KEY = KEY;
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  slug = `refunds-${Date.now()}`;
  const [t] = await db.insert(tenants).values({ name: "Refund School", slug }).returning();
  tenantId = t.id;
  await storage.upsertTenantPaymentSettings({
    tenantId, stripeEnabled: true, stripeSecretKey: "sk_test_refund", stripeWebhookSecret: "whsec_x",
    authnetEnabled: true, authnetApiLoginId: "login", authnetTransactionKey: "txkey", authnetSignatureKey: "sigkey",
    authnetMode: "sandbox", cardProvider: "AUTHORIZE_NET",
  } as any);
  const [pkg] = await db.insert(packages).values({ tenantId, name: "Road Test", price: 9000, classroomHoursRequired: 0, driveHoursRequired: 0, active: true, locationScopeMode: "ALL_LOCATIONS" }).returning();
  packageId = pkg.id;
  adminUserId = `refund-admin-${Date.now()}`;
  await db.insert(users).values({ id: adminUserId, email: `${adminUserId}@example.com`, firstName: "R", lastName: "A" });
  await db.insert(tenantMembers).values({ tenantId, userId: adminUserId, role: "tenant_admin", status: "ACTIVE", active: true });

  __setAuthnetApiForTests(async (_mode, body) => {
    const name = Object.keys(body)[0];
    anetCalls.push({ name, body: (body as any)[name] });
    const ok = { messages: { resultCode: "Ok", message: [{ code: "I00001", text: "Successful." }] } };
    if (name === "getHostedPaymentPageRequest") return { ...ok, token: "tok" };
    if (name === "getTransactionDetailsRequest") {
      const id = (body as any)[name].transId;
      return { ...ok, transaction: { transId: id, transactionStatus: txStatus.get(id) ?? "capturedPendingSettlement", authAmount: 90, payment: { creditCard: { cardNumber: "XXXX1111" } } } };
    }
    if (name === "createTransactionRequest") {
      if (failNextAnet) {
        failNextAnet = false;
        return { messages: { resultCode: "Error", message: [{ code: "E00027", text: "The transaction was unsuccessful." }] }, transactionResponse: { responseCode: "3", errors: [{ errorCode: "54", errorText: "The referenced transaction does not meet the criteria for issuing a credit." }] } };
      }
      return { ...ok, transactionResponse: { responseCode: "1", transId: `r${++n}` } };
    }
    return ok;
  });
  __setRefundStripePaymentForTests(async (_k, pi, amount) => {
    stripeRefunds.push({ pi, amount });
    return `re_${pi}`;
  });
  __setStripeCheckoutSessionForTests(async () => ({ sessionId: `cs_ref_${++n}`, redirectUrl: "https://stripe.test" }));
});

after(async () => {
  __resetAuthnetApiForTests();
  __resetRefundStripePaymentForTests();
  __resetStripeCheckoutSessionForTests();
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

test("payment keys are stored encrypted and read back in plain text; plain-text rows are upgraded", async () => {
  const [raw] = await db.select().from(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
  for (const v of [raw.stripeSecretKey, raw.stripeWebhookSecret, raw.authnetTransactionKey, raw.authnetSignatureKey]) {
    assert.ok(isEncrypted(v), `stored encrypted: ${String(v).slice(0, 8)}`);
  }
  assert.equal(raw.authnetApiLoginId, "login", "login id is not a secret");
  const read = await storage.getTenantPaymentSettings(tenantId);
  assert.equal(read!.stripeSecretKey, "sk_test_refund");
  assert.equal(read!.authnetTransactionKey, "txkey");

  await db.update(tenantPaymentSettings).set({ authnetSignatureKey: "legacy-plain" } as any).where(eq(tenantPaymentSettings.tenantId, tenantId));
  assert.equal((await storage.getTenantPaymentSettings(tenantId))!.authnetSignatureKey, "legacy-plain");
  assert.equal(await storage.encryptLegacyPaymentSecrets(tenantId), 1);
  const [after] = await db.select().from(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
  assert.ok(isEncrypted(after.authnetSignatureKey));
  assert.equal((await storage.getTenantPaymentSettings(tenantId))!.authnetSignatureKey, "legacy-plain");
  await storage.upsertTenantPaymentSettings({ tenantId, authnetSignatureKey: "sigkey" } as any);
});

async function paidExpress(provider: "AUTHORIZE_NET" | "STRIPE", transId: string) {
  const student = { firstName: "Rae", lastName: `Fund${++n}`, email: `rae.fund${n}.${Date.now()}@example.com` };
  const r = await fetch(`${baseUrl}/api/public/tenant/${slug}/checkout/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, packageId, student }) });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  await completeProviderPayment(body.paymentId, { providerPaymentId: transId }, { notifyCustomer: false, notifyAdmin: false });
  return body as { enrollmentId: number; paymentId: number };
}

async function refund(enrollmentId: number, body: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/enrollments/${enrollmentId}/refund`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-test-user-id": adminUserId, "x-test-user-email": `${adminUserId}@example.com` }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function state(c: { enrollmentId: number; paymentId: number }) {
  const [p] = await db.select().from(payments).where(eq(payments.id, c.paymentId));
  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, c.enrollmentId));
  return { p, e };
}

test("Authorize.net same-day payment is voided; settled one is refunded with the card's last four", async () => {
  const a = await paidExpress("AUTHORIZE_NET", "7001");
  const r1 = await refund(a.enrollmentId);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.outcomes[0].method, "void");
  assert.equal(anetCalls.at(-1)!.body.transactionRequest.transactionType, "voidTransaction");
  const s1 = await state(a);
  assert.equal(s1.p.status, "REFUNDED");
  assert.equal(s1.e.status, "refunded");
  assert.equal((s1.p.metadataJson as any).refunds[0].method, "void");

  const b = await paidExpress("AUTHORIZE_NET", "7002");
  txStatus.set("7002", "settledSuccessfully");
  const r2 = await refund(b.enrollmentId);
  assert.equal(r2.body.outcomes[0].method, "refund");
  const req = anetCalls.at(-1)!.body.transactionRequest;
  assert.equal(req.transactionType, "refundTransaction");
  assert.equal(req.payment.creditCard.cardNumber, "1111");
  assert.equal(req.amount, "90.00");

  const again = await refund(b.enrollmentId);
  assert.equal(again.status, 400, "already refunded");
});

test("a processor refusal changes nothing", async () => {
  const c = await paidExpress("AUTHORIZE_NET", "7003");
  failNextAnet = true;
  const r = await refund(c.enrollmentId);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Authorize\.net refused the refund/);
  const s = await state(c);
  assert.equal(s.p.status, "COMPLETED");
  assert.equal(s.e.status, "confirmed");
});

test("Stripe payments are refunded through Stripe; record-only moves no money", async () => {
  const c = await paidExpress("STRIPE", "pi_ref_1");
  const r = await refund(c.enrollmentId);
  assert.equal(r.body.outcomes[0].method, "refund");
  assert.deepEqual(stripeRefunds.at(-1), { pi: "pi_ref_1", amount: undefined });

  const d = await paidExpress("AUTHORIZE_NET", "7004");
  const before = anetCalls.length;
  const r2 = await refund(d.enrollmentId, { recordOnly: true });
  assert.equal(r2.body.outcomes[0].method, "record_only");
  assert.equal(anetCalls.length, before, "no processor call");
  assert.equal((await state(d)).p.status, "REFUNDED");
});

test("one enrollment of a shared cart: partial refund once settled, refused before", async () => {
  const cart = await (await fetch(`${baseUrl}/api/public/tenant/${slug}/cart`, { method: "POST" })).json();
  const [second] = await db.insert(packages).values({ tenantId, name: "Lessons", price: 20000, classroomHoursRequired: 0, driveHoursRequired: 0, active: true, locationScopeMode: "ALL_LOCATIONS" }).returning();
  for (const pid of [packageId, second.id]) {
    await fetch(`${baseUrl}/api/public/cart/${cart.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: pid }) });
  }
  const start = await (await fetch(`${baseUrl}/api/public/tenant/${slug}/cart-checkout/start`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartId: cart.id, provider: "AUTHORIZE_NET", student: { firstName: "Two", lastName: "Items", email: `two.items.${Date.now()}@example.com` } }),
  })).json();
  await completeProviderPayment(start.paymentId, { providerPaymentId: "7005" }, { notifyCustomer: false, notifyAdmin: false });
  const enrs = await db.select().from(enrollments).where(eq(enrollments.cartId, cart.id));
  const roadTest = enrs.find((e) => e.packageId === packageId)!;

  const early = await refund(roadTest.id);
  assert.equal(early.status, 400);
  assert.match(early.body.message, /after tonight's settlement/);

  txStatus.set("7005", "settledSuccessfully");
  const r = await refund(roadTest.id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.outcomes[0].amountCents, 9000, "only this enrollment's share");
  assert.equal(anetCalls.at(-1)!.body.transactionRequest.amount, "90.00");
  const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
  assert.equal(p.status, "COMPLETED", "the payment still covers the other enrollment");
  await db.delete(packages).where(eq(packages.id, second.id)).catch(() => {});
});
