process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-authorize-net";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { and, eq, inArray, like } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { reconcilePendingCardPayments } from "../payments/reconcile";
import {
  verifyAuthnetSignature,
  __setAuthnetApiForTests,
  __resetAuthnetApiForTests,
} from "../payments/authorizenet-adapter";
import {
  tenants, users, tenantMembers, packages, carts, cartItems, enrollments, payments, sessionChangeEmails, tenantPaymentSettings,
} from "@shared/schema";

const SIG_KEY = "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90";

test("verifyAuthnetSignature accepts the key as text or hex, with or without the sha512= prefix", () => {
  const body = Buffer.from('{"eventType":"net.authorize.payment.authcapture.created"}');
  const asText = crypto.createHmac("sha512", Buffer.from(SIG_KEY, "utf8")).update(body).digest("hex").toUpperCase();
  const asHex = crypto.createHmac("sha512", Buffer.from(SIG_KEY, "hex")).update(body).digest("hex").toUpperCase();
  assert.equal(verifyAuthnetSignature(body, `sha512=${asText}`, SIG_KEY), true);
  assert.equal(verifyAuthnetSignature(body, `sha512=${asHex.toLowerCase()}`, SIG_KEY), true);
  assert.equal(verifyAuthnetSignature(body, asHex, SIG_KEY), true);
  assert.equal(verifyAuthnetSignature(Buffer.concat([body, Buffer.from(" ")]), `sha512=${asHex}`, SIG_KEY), false);
  assert.equal(verifyAuthnetSignature(body, undefined, SIG_KEY), false);
  assert.equal(verifyAuthnetSignature(body, "sha512=nothex", SIG_KEY), false);
});

let server: Server;
let baseUrl: string;
let tenantId: number;
let slug: string;
let packageId: number;
let adminUserId: string;
let n = 0;

// A tiny Authorize.net: tokens on request, transactions we register.
const calls: string[] = [];
const hostedRequests: any[] = [];
const transactions = new Map<string, { transId: string; transactionStatus: string; invoiceNumber: string; authAmount: number }>();
function fakeAuthnet() {
  __setAuthnetApiForTests(async (_mode, body) => {
    const name = Object.keys(body)[0];
    calls.push(name);
    const ok = { messages: { resultCode: "Ok", message: [{ code: "I00001", text: "Successful." }] } };
    if (name === "getHostedPaymentPageRequest") {
      hostedRequests.push((body as any)[name]);
      return { ...ok, token: `tok_${++n}` };
    }
    if (name === "getTransactionDetailsRequest") {
      const t = transactions.get((body as any)[name].transId);
      if (!t) return { messages: { resultCode: "Error", message: [{ code: "E00040", text: "The record cannot be found." }] } };
      return { ...ok, transaction: { ...t, order: { invoiceNumber: t.invoiceNumber }, submitTimeUTC: "2026-10-20T15:00:00Z" } };
    }
    if (name === "getUnsettledTransactionListRequest") {
      return { ...ok, transactions: Array.from(transactions.values()).map((t) => ({ transId: t.transId, transactionStatus: t.transactionStatus, invoiceNumber: t.invoiceNumber, settleAmount: t.authAmount, submitTimeUTC: "2026-10-20T15:00:00Z" })) };
    }
    if (name === "getSettledBatchListRequest") return { ...ok };
    return ok;
  });
}

before(async () => {
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  slug = `authnet-${Date.now()}`;
  const [t] = await db.insert(tenants).values({ name: "All Ages Driving School", slug }).returning();
  tenantId = t.id;
  await db.insert(tenantPaymentSettings).values({
    tenantId,
    stripeEnabled: true, stripeSecretKey: "sk_test_fake",
    authnetEnabled: true, authnetApiLoginId: "login", authnetTransactionKey: "key", authnetSignatureKey: SIG_KEY, authnetMode: "sandbox",
    cardProvider: "AUTHORIZE_NET",
    serviceFeeFlatCents: 1500,
  } as any);
  const [pkg] = await db.insert(packages).values({ tenantId, name: "Road Test", price: 9000, classroomHoursRequired: 0, driveHoursRequired: 0, active: true, locationScopeMode: "ALL_LOCATIONS" }).returning();
  packageId = pkg.id;
  adminUserId = `authnet-admin-${Date.now()}`;
  await db.insert(users).values({ id: adminUserId, email: `${adminUserId}@example.com`, firstName: "A", lastName: "N" });
  await db.insert(tenantMembers).values({ tenantId, userId: adminUserId, role: "tenant_admin", status: "ACTIVE", active: true });
  fakeAuthnet();
});

after(async () => {
  __resetAuthnetApiForTests();
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

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function cartCheckout(student = { firstName: "Ann", lastName: `Net${++n}`, email: `ann.net${n}.${Date.now()}@example.com` }) {
  const cart = (await post(`/api/public/tenant/${slug}/cart`, {})).body;
  await post(`/api/public/cart/${cart.id}/items`, { packageId });
  const r = await post(`/api/public/tenant/${slug}/cart-checkout/start`, {
    cartId: cart.id, provider: "AUTHORIZE_NET", student, externalSuccessUrl: "https://shop.example/thank-you",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { ...r.body, cartId: cart.id as string, student };
}

function signed(event: unknown) {
  const raw = JSON.stringify(event);
  const sig = crypto.createHmac("sha512", Buffer.from(SIG_KEY, "hex")).update(raw).digest("hex").toUpperCase();
  return { raw, headers: { "X-ANET-Signature": `sha512=${sig}` } };
}

async function paymentByRef(ref: string) {
  const [p] = await db.select().from(payments).where(eq(payments.reference, ref));
  return p;
}

test("payment methods offer one card processor: the school's choice, else whichever is ready", async () => {
  const m = await (await fetch(`${baseUrl}/api/public/tenant/${slug}/payment-methods`)).json();
  assert.deepEqual(m.methods, ["AUTHORIZE_NET"]);
  await db.update(tenantPaymentSettings).set({ authnetSignatureKey: null } as any).where(eq(tenantPaymentSettings.tenantId, tenantId));
  try {
    const m2 = await (await fetch(`${baseUrl}/api/public/tenant/${slug}/payment-methods`)).json();
    assert.deepEqual(m2.methods, ["STRIPE"], "falls back while Authorize.net isn't fully configured");
  } finally {
    await db.update(tenantPaymentSettings).set({ authnetSignatureKey: SIG_KEY } as any).where(eq(tenantPaymentSettings.tenantId, tenantId));
  }
});

test("checkout start returns our pay page; the fee applies; the pay page posts the token to Authorize.net", async () => {
  const before = calls.filter((c) => c === "getHostedPaymentPageRequest").length;
  const c = await cartCheckout();
  assert.equal(c.totalCents, 9000 + 1500);
  assert.match(c.redirectUrl, new RegExp(`/pay/${c.reference}$`));
  const p = await paymentByRef(c.reference);
  assert.equal(p.provider, "AUTHORIZE_NET");
  assert.equal(p.status, "PENDING");
  assert.equal((p.metadataJson as any).authnet.returnUrl, `https://shop.example/thank-you?cart=${c.cartId}&ref=${c.reference}`);

  const page1 = await (await fetch(`${baseUrl}/pay/${c.reference}`)).text();
  assert.match(page1, /action="https:\/\/test\.authorize\.net\/payment\/payment"/);
  assert.match(page1, /name="token" value="tok_\d+"/);
  await fetch(`${baseUrl}/pay/${c.reference.toLowerCase()}`);
  assert.equal(calls.filter((x) => x === "getHostedPaymentPageRequest").length, before + 1, "token reused within 14 minutes");

  await db.update(payments).set({ metadataJson: { ...(p.metadataJson as any), authnet: { ...(p.metadataJson as any).authnet, tokenIssuedAt: "2020-01-01T00:00:00Z" } } } as any).where(eq(payments.id, p.id));
  await fetch(`${baseUrl}/pay/${c.reference}`);
  assert.equal(calls.filter((x) => x === "getHostedPaymentPageRequest").length, before + 2, "stale token replaced");

  const missing = await fetch(`${baseUrl}/pay/ZZ-NOPE99`);
  assert.equal(missing.status, 404);
});

test("a signed authcapture webhook completes the payment, creates the enrollment and sends the emails", async () => {
  const c = await cartCheckout();
  transactions.set("6001", { transId: "6001", transactionStatus: "capturedPendingSettlement", invoiceNumber: c.reference, authAmount: 105 });
  const { raw, headers } = signed({ eventType: "net.authorize.payment.authcapture.created", payload: { entityName: "transaction", id: "6001", responseCode: 1 } });

  const bad = await post("/api/webhooks/authorizenet", raw, { "X-ANET-Signature": "sha512=" + "0".repeat(128) });
  assert.equal(bad.status, 401);
  assert.equal((await paymentByRef(c.reference)).status, "PENDING");

  const r = await post("/api/webhooks/authorizenet", raw, headers);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.outcome, "completed");
  const p = await paymentByRef(c.reference);
  assert.equal(p.status, "COMPLETED");
  assert.equal(p.providerPaymentId, "6001");
  const [e] = await db.select().from(enrollments).where(eq(enrollments.cartId, c.cartId));
  assert.equal(e.status, "confirmed");
  assert.equal(e.reference, c.reference);

  await new Promise((res) => setTimeout(res, 400));
  const mails = await db.select().from(sessionChangeEmails).where(eq(sessionChangeEmails.tenantId, tenantId));
  assert.ok(mails.some((m) => m.recipientEmail === c.student.email && /payment received/i.test(m.subject)), "customer confirmation");
  assert.ok(mails.some((m) => m.subject.startsWith("PAID") && m.subject.includes(c.reference)), "owner PAID");
  assert.ok(mails.find((m) => m.subject.startsWith("PAID"))!.body.includes("credit/debit card"));

  const again = await post("/api/webhooks/authorizenet", raw, headers);
  assert.equal(again.body.outcome, "already completed");
});

test("webhook refuses an amount that doesn't match, and leaves fraud-held payments pending", async () => {
  const c = await cartCheckout();
  transactions.set("6002", { transId: "6002", transactionStatus: "capturedPendingSettlement", invoiceNumber: c.reference, authAmount: 1.0 });
  const mismatch = signed({ eventType: "net.authorize.payment.authcapture.created", payload: { entityName: "transaction", id: "6002" } });
  const r = await post("/api/webhooks/authorizenet", mismatch.raw, mismatch.headers);
  assert.equal(r.body.outcome, "amount mismatch");
  assert.equal((await paymentByRef(c.reference)).status, "PENDING");

  const held = signed({ eventType: "net.authorize.payment.fraud.held", payload: { entityName: "transaction", id: "6002" } });
  const h = await post("/api/webhooks/authorizenet", held.raw, held.headers);
  assert.equal(h.body.held, true);
  assert.equal((await paymentByRef(c.reference)).status, "PENDING");
});

test("the reconcile job finds a paid transaction by invoice number when the webhook never came", async () => {
  const c = await cartCheckout();
  await db.update(payments).set({ createdAt: new Date(Date.now() - 20 * 60_000) } as any).where(eq(payments.reference, c.reference));
  transactions.set("6003", { transId: "6003", transactionStatus: "capturedPendingSettlement", invoiceNumber: c.reference, authAmount: 105 });
  await reconcilePendingCardPayments();
  const p = await paymentByRef(c.reference);
  assert.equal(p.status, "COMPLETED");
  assert.equal(p.providerPaymentId, "6003");
});

test("checkout status checks Authorize.net live while pending; the pay page then sends paid customers back", async () => {
  const c = await cartCheckout();
  const pending = await (await fetch(`${baseUrl}/api/public/tenant/${slug}/checkout/${c.reference}/status`)).json();
  assert.equal(pending.state, "pending");
  await db.update(payments).set({ metadataJson: { ...((await paymentByRef(c.reference)).metadataJson as any), providerCheck: null } } as any).where(eq(payments.reference, c.reference));
  transactions.set("6004", { transId: "6004", transactionStatus: "settledSuccessfully", invoiceNumber: c.reference, authAmount: 105 });
  const paid = await (await fetch(`${baseUrl}/api/public/tenant/${slug}/checkout/${c.reference}/status`)).json();
  assert.equal(paid.state, "paid");
  assert.equal(paid.provider, "AUTHORIZE_NET");

  const back = await fetch(`${baseUrl}/pay/${c.reference}`, { redirect: "manual" });
  assert.equal(back.status, 303);
  assert.equal(back.headers.get("location"), `https://shop.example/thank-you?cart=${c.cartId}&ref=${c.reference}`);
});

test("admin settings mask the Authorize.net keys and keep them on a masked save", async () => {
  const headers = { "Content-Type": "application/json", "x-test-user-id": adminUserId, "x-test-user-email": `${adminUserId}@example.com` };
  const got = await (await fetch(`${baseUrl}/api/tenants/${tenantId}/payment-settings`, { headers })).json();
  assert.equal(got.authnetApiLoginId, "login");
  assert.match(got.authnetTransactionKey, /\*\*\*\*/);
  assert.match(got.authnetSignatureKey, /\*\*\*\*/);
  const put = await fetch(`${baseUrl}/api/tenants/${tenantId}/payment-settings`, {
    method: "PUT", headers, body: JSON.stringify({ authnetTransactionKey: got.authnetTransactionKey, authnetSignatureKey: got.authnetSignatureKey, cardProvider: "AUTHORIZE_NET" }),
  });
  assert.equal(put.status, 200);
  const [row] = await db.select().from(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
  assert.equal(row.authnetTransactionKey, "key");
  assert.equal(row.authnetSignatureKey, SIG_KEY);
});

test("Authorize.net never sees a URL with '&' (its form renders blank); our return URLs forward to the storefront", async () => {
  const c = await cartCheckout();
  const req = hostedRequests.at(-1);
  const ret = JSON.parse(req.hostedPaymentSettings.setting.find((x: any) => x.settingName === "hostedPaymentReturnOptions").settingValue);
  assert.ok(!ret.url.includes("&") && !ret.cancelUrl.includes("&"));
  assert.match(ret.url, new RegExp(`/pay/${c.reference}/return$`));
  assert.match(ret.cancelUrl, new RegExp(`/pay/${c.reference}/cancel$`));

  const back = await fetch(`${baseUrl}/pay/${c.reference}/return`, { redirect: "manual" });
  assert.equal(back.status, 303);
  assert.equal(back.headers.get("location"), `https://shop.example/thank-you?cart=${c.cartId}&ref=${c.reference}`);
  const cancel = await fetch(`${baseUrl}/pay/${c.reference}/cancel`, { redirect: "manual" });
  assert.equal(cancel.status, 303);
  assert.equal((await fetch(`${baseUrl}/pay/ZZ-NOPE99/return`, { redirect: "manual" })).status, 404);
});
