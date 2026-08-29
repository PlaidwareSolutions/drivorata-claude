process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-cash-email";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray, and } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import {
  users,
  tenants,
  tenantMembers,
  packages,
  tenantPaymentSettings,
  carts,
  cartItems,
  sessionChangeEmails,
  payments,
} from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let adminUserId: string;
const createdUserIds: string[] = [];

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-test-user-id": adminUserId,
    "x-test-user-email": `${adminUserId}@cash-email-test.local`,
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
  tenantSlug = `cash-email-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `Cash Email ${ts}`, slug: tenantSlug })
    .returning();
  tenantId = tenant.id;

  await db.insert(tenantPaymentSettings).values({ tenantId, cashEnabled: true } as any);

  adminUserId = `cash-email-admin-${ts}`;
  await db.insert(users).values({
    id: adminUserId,
    email: `${adminUserId}@cash-email-test.local`,
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
      await db.delete(sessionChangeEmails).where(eq(sessionChangeEmails.tenantId, tenantId));
      const cartRows = await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId));
      const cartIds = cartRows.map((c) => c.id);
      if (cartIds.length) {
        await db.delete(payments).where(inArray(payments.cartId, cartIds));
        await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
        await db.delete(carts).where(inArray(carts.id, cartIds));
      }
      await db.delete(packages).where(eq(packages.tenantId, tenantId));
      await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
      await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
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

async function createSimplePkg(name: string): Promise<any> {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/packages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      tenantId,
      name,
      price: 37500,
      classroomHoursRequired: 0,
      driveHoursRequired: 0,
      active: true,
      kind: "SIMPLE",
      locationScopeMode: "ALL_LOCATIONS",
    }),
  });
  assert.ok(res.status === 200 || res.status === 201, `create pkg failed ${res.status}: ${await res.clone().text()}`);
  return res.json();
}

async function newCart(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart`, { method: "POST" });
  const c = await res.json();
  return c.id as string;
}

// cart-checkout/start — CASH sends "Enrollment Received" email to student
test("CASH cart checkout logs enrollment-received email for student", async () => {
  const pkg = await createSimplePkg("Teen Driver Ed");
  const cartId = await newCart();

  const addRes = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: pkg.id }),
  });
  assert.equal(addRes.status, 200, `add item failed: ${await addRes.clone().text()}`);

  const studentEmail = `student-${Date.now()}@cash-email-test.local`;
  const parentEmail = `parent-${Date.now()}@cash-email-test.local`;

  const checkoutRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      cartId,
      student: { firstName: "Asif", lastName: "H", email: studentEmail, parentEmail },
    }),
  });
  assert.equal(checkoutRes.status, 200, `checkout failed: ${await checkoutRes.clone().text()}`);
  const body = await checkoutRes.json();
  assert.equal(body.cashPayment, true);

  // fireAndForget schedules the send; give it a moment
  await new Promise((r) => setTimeout(r, 300));

  // Student email row
  const studentRows = await db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, studentEmail)));
  assert.ok(studentRows.length > 0, "expected session_change_emails row for student");
  const studentRow = studentRows[0];
  // In test env RESEND_API_KEY is absent → skipped_no_provider; in a real env it would be "sent"
  assert.ok(
    studentRow.status === "skipped_no_provider" || studentRow.status === "sent",
    `unexpected email status: ${studentRow.status}`,
  );
  assert.ok(studentRow.subject.includes("Teen Driver Ed") || studentRow.subject.toLowerCase().includes("enrollment"),
    `unexpected subject: ${studentRow.subject}`);

  // Parent email row (different address → second row)
  const parentRows = await db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, parentEmail)));
  assert.ok(parentRows.length > 0, "expected session_change_emails row for parent");
});

// Deduplication: student email === parent email → only ONE row
test("CASH cart checkout sends only one email when student and parent share an address", async () => {
  const pkg = await createSimplePkg("Teen Driver Ed 2");
  const cartId = await newCart();

  const addRes = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: pkg.id }),
  });
  assert.equal(addRes.status, 200);

  const sharedEmail = `shared-${Date.now()}@cash-email-test.local`;

  const checkoutRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      cartId,
      student: { firstName: "Same", lastName: "Email", email: sharedEmail, parentEmail: sharedEmail },
    }),
  });
  assert.equal(checkoutRes.status, 200, `checkout failed: ${await checkoutRes.clone().text()}`);

  await new Promise((r) => setTimeout(r, 300));

  const rows = await db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, sharedEmail)));
  assert.equal(rows.length, 1, `expected exactly 1 email (deduplication), got ${rows.length}`);
});

// Headless (one-shot) CASH cart checkout also sends the email
test("CASH headless cart checkout logs enrollment-received email", async () => {
  const pkg = await createSimplePkg("Teen Driver Ed 3");
  const studentEmail = `headless-${Date.now()}@cash-email-test.local`;

  const checkoutRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/headless`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      items: [{ packageId: pkg.id }],
      student: { firstName: "Headless", lastName: "Student", email: studentEmail },
    }),
  });
  assert.equal(checkoutRes.status, 200, `headless checkout failed: ${await checkoutRes.clone().text()}`);

  await new Promise((r) => setTimeout(r, 300));

  const rows = await db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, studentEmail)));
  assert.ok(rows.length > 0, "expected session_change_emails row for headless checkout student");
});

// Resend endpoint: POST /api/tenants/:tenantId/payments/:paymentId/resend-enrollment-received-email
test("resend-enrollment-received-email endpoint re-sends email for CASH cart payment", async () => {
  const pkg = await createSimplePkg("Teen Driver Ed 4");
  const cartId = await newCart();

  const addRes = await fetch(`${baseUrl}/api/public/cart/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: pkg.id }),
  });
  assert.equal(addRes.status, 200);

  const studentEmail = `resend-test-${Date.now()}@cash-email-test.local`;

  const checkoutRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/cart-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "CASH",
      cartId,
      student: { firstName: "Resend", lastName: "Test", email: studentEmail },
    }),
  });
  assert.equal(checkoutRes.status, 200);
  const { paymentId } = await checkoutRes.json();
  assert.ok(paymentId, "expected paymentId in checkout response");

  await new Promise((r) => setTimeout(r, 300));

  // Count rows before resend
  const rowsBefore = await db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, studentEmail)));
  const countBefore = rowsBefore.length;
  assert.ok(countBefore > 0, "email should have been sent on checkout");

  // Call the resend endpoint
  const resendRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/payments/${paymentId}/resend-enrollment-received-email`, {
    method: "POST",
    headers: adminHeaders(),
  });
  assert.equal(resendRes.status, 200, `resend failed: ${await resendRes.clone().text()}`);
  const resendBody = await resendRes.json();
  assert.equal(resendBody.ok, true);

  await new Promise((r) => setTimeout(r, 300));

  // A second email row should now exist
  const rowsAfter = await db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, studentEmail)));
  assert.ok(rowsAfter.length > countBefore, `expected more email rows after resend; got ${rowsAfter.length}, was ${countBefore}`);
});
