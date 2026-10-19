process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-enrollment-notifications";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { and, eq, inArray, like } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { storage } from "../storage";
import { activateCart, activateEnrollment } from "../payments/activation-service";
import { notifyAbandonedCheckouts, sendAdminEnrollmentNotification } from "../admin-enrollment-notifications";
import {
  tenants,
  users,
  tenantMembers,
  packages,
  locations,
  scheduleOfferings,
  scheduleSessions,
  carts,
  cartItems,
  enrollments,
  payments,
  bookings,
  sessionChangeEmails,
  tenantPaymentSettings,
  tenantEmailTemplates,
} from "@shared/schema";
import {
  __setStripeCheckoutSessionForTests,
  __resetStripeCheckoutSessionForTests,
} from "../payments/stripe-adapter";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;
let adminUserId: string;
let adminEmail: string;
const ownerExtra = "owner.personal@example.com";
let simplePackageId: number;
let classPackageId: number;
let locationId: number;
let offeringId: number;
let n = 0;

function adminHeaders() {
  return { "Content-Type": "application/json", "x-test-user-id": adminUserId, "x-test-user-email": adminEmail };
}

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const ts = Date.now();
  tenantSlug = `notify-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "All Ages Driving School", slug: tenantSlug, phone: "713-000-0000", email: "school@example.com" })
    .returning();
  tenantId = tenant.id;
  await db.insert(tenantPaymentSettings).values({
    tenantId, stripeEnabled: true, stripeSecretKey: "sk_test_fake", cashEnabled: true,
  });
  const [loc] = await db
    .insert(locations)
    .values({ tenantId, name: "Cypress", address: "123 Main St", city: "Cypress", state: "TX", zip: "77429", phone: "281-555-0101" })
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
      startsAt: new Date("2030-11-04T23:00:00Z"), endsAt: new Date("2030-11-06T02:00:00Z"), status: "PUBLISHED", capacity: 20,
    })
    .returning();
  offeringId = off.id;
  await db.insert(scheduleSessions).values([
    { tenantId, locationId, type: "CLASSROOM", offeringId, capacity: 20, startAt: new Date("2030-11-04T23:00:00Z"), endAt: new Date("2030-11-05T02:00:00Z") },
    { tenantId, locationId, type: "CLASSROOM", offeringId, capacity: 20, startAt: new Date("2030-11-05T23:00:00Z"), endAt: new Date("2030-11-06T02:00:00Z") },
  ] as any);

  adminUserId = `notify-admin-${ts}`;
  adminEmail = `${adminUserId}@example.com`;
  await db.insert(users).values({ id: adminUserId, email: adminEmail, firstName: "N", lastName: "Admin" });
  await db.insert(tenantMembers).values({ tenantId, userId: adminUserId, role: "tenant_admin", status: "ACTIVE", active: true });

  __setStripeCheckoutSessionForTests(async () => ({ sessionId: `cs_notify_${++n}`, redirectUrl: "https://stripe.test/c" }));
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  try {
    await db.delete(sessionChangeEmails).where(eq(sessionChangeEmails.tenantId, tenantId));
    const enrIds = (await db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.tenantId, tenantId))).map((e) => e.id);
    if (enrIds.length) await db.delete(bookings).where(inArray(bookings.enrollmentId, enrIds));
    await db.delete(payments).where(eq(payments.tenantId, tenantId));
    const cartIds = (await db.select({ id: carts.id }).from(carts).where(eq(carts.tenantId, tenantId))).map((c) => c.id);
    if (cartIds.length) await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
    await db.delete(enrollments).where(eq(enrollments.tenantId, tenantId));
    await db.delete(carts).where(eq(carts.tenantId, tenantId));
    await db.delete(scheduleSessions).where(eq(scheduleSessions.tenantId, tenantId));
    await db.delete(scheduleOfferings).where(eq(scheduleOfferings.tenantId, tenantId));
    await db.delete(packages).where(eq(packages.tenantId, tenantId));
    await db.delete(locations).where(eq(locations.tenantId, tenantId));
    await db.delete(tenantEmailTemplates).where(eq(tenantEmailTemplates.tenantId, tenantId));
    await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    await db.delete(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(eq(users.id, adminUserId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let studentN = 0;
function newStudent(extra: Record<string, string> = {}) {
  const k = ++studentN;
  return {
    firstName: "Nora",
    lastName: `Student${k}`,
    email: `nora.student${k}.${Date.now()}@example.com`,
    phone: "832-555-0199",
    dateOfBirth: "2009-03-01",
    ...extra,
  };
}

async function settle() {
  await new Promise((r) => setTimeout(r, 400));
}

async function emailsTo(address: string) {
  await settle();
  return db.select().from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, address)));
}

async function ownerEmails(subjectPrefix: string) {
  await settle();
  return db.select().from(sessionChangeEmails)
    .where(and(
      eq(sessionChangeEmails.tenantId, tenantId),
      eq(sessionChangeEmails.recipientEmail, adminEmail),
      like(sessionChangeEmails.subject, `${subjectPrefix}%`),
    ));
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function startClassCartCheckout(provider: "STRIPE" | "CASH", student = newStudent()) {
  const cart = (await post(`/api/public/tenant/${tenantSlug}/cart`, {})).body;
  const item = await post(`/api/public/cart/${cart.id}/items`, { packageId: classPackageId, offeringId });
  assert.equal(item.status, 200, JSON.stringify(item.body));
  const r = await post(`/api/public/tenant/${tenantSlug}/cart-checkout/start`, { cartId: cart.id, provider, student });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { cartId: cart.id as string, paymentId: r.body.paymentId as number, reference: r.body.reference as string, student };
}

async function pay(paymentId: number) {
  await storage.updatePayment(paymentId, { status: "COMPLETED", completedAt: new Date("2030-10-01T15:30:00Z"), providerPaymentId: "pi_test_123" } as any);
}

test("a card checkout sends nothing until it is paid", async () => {
  const before = (await ownerEmails("")).length;
  const student = newStudent();
  const r = await post(`/api/public/tenant/${tenantSlug}/checkout/start`, { provider: "STRIPE", packageId: simplePackageId, student });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await emailsTo(student.email)).length, 0, "no customer email at checkout start");
  assert.equal((await ownerEmails("")).length, before, "no owner email at checkout start");
});

test("paying for a class: customer confirmation and owner PAID notification carry class, dates and reference", async () => {
  await db.update(tenants).set({ enrollmentNotificationEmails: [ownerExtra] } as any).where(eq(tenants.id, tenantId));
  const { paymentId, reference, student, cartId } = await startClassCartCheckout("STRIPE");
  await pay(paymentId);
  const r = await activateCart(paymentId);
  assert.equal(r.ok, true, JSON.stringify(r));

  const customer = await emailsTo(student.email);
  assert.equal(customer.length, 1);
  assert.match(customer[0].subject, /You're enrolled in Teen Driver Ed/);
  const body = customer[0].body;
  assert.match(body, new RegExp(`Reference: ${reference}`));
  assert.match(body, /Class: Cypress Evening Class/);
  assert.match(body, /Mon, Nov 4, 2030, 5:00 PM – 8:00 PM/);
  assert.match(body, /Tue, Nov 5, 2030, 5:00 PM – 8:00 PM/);
  assert.match(body, /Location: Cypress — 123 Main St, Cypress, TX — 281-555-0101/);
  assert.match(body, /Total paid \(this order\): \$425\.00 \(credit\/debit card\)/);
  assert.match(body, /Call us at 281-555-0101/, "location phone, not the school's main number");

  const paid = await ownerEmails("PAID");
  const mine = paid.filter((e) => e.subject.includes(reference));
  assert.equal(mine.length, 1);
  assert.equal(
    mine[0].subject,
    `PAID — New enrollment: ${student.firstName} ${student.lastName} — Teen Driver Ed: Cypress Evening Class, Nov 4 — $425.00 (ref ${reference})`,
  );
  assert.match(mine[0].body, /PAID — payment completed, enrollment confirmed/);
  assert.match(mine[0].body, /Transaction ID: pi_test_123/);
  assert.match(mine[0].body, /Covers: the whole order \(cart\)/);
  assert.match(mine[0].body, /\/admin\/enrollments\?focusId=\d+/);
  const extra = (await emailsTo(ownerExtra)).filter((e) => e.subject.includes(reference));
  assert.equal(extra.length, 1, "extra owner inbox also notified");

  // Webhook retry: no second PAID email.
  const [enr] = await db.select().from(enrollments).where(eq(enrollments.cartId, cartId));
  await sendAdminEnrollmentNotification(enr.id, tenantId);
  assert.equal((await ownerEmails("PAID")).filter((e) => e.subject.includes(reference)).length, 1);
  await db.update(tenants).set({ enrollmentNotificationEmails: null } as any).where(eq(tenants.id, tenantId));
});

test("PAID notification is not marked sent when nobody could receive it", async () => {
  await db.update(tenantMembers).set({ status: "DISABLED" } as any).where(eq(tenantMembers.tenantId, tenantId));
  try {
    const student = newStudent();
    const r = await post(`/api/public/tenant/${tenantSlug}/checkout/start`, { provider: "STRIPE", packageId: simplePackageId, student });
    await pay(r.body.paymentId);
    await activateEnrollment(r.body.enrollmentId, r.body.paymentId);
    await settle();
    const [e] = await db.select().from(enrollments).where(eq(enrollments.id, r.body.enrollmentId));
    assert.equal(e.status, "confirmed");
    assert.equal(e.adminNotificationEmailSentAt, null, "slot released for a later retry");
  } finally {
    await db.update(tenantMembers).set({ status: "ACTIVE" } as any).where(eq(tenantMembers.tenantId, tenantId));
  }
});

test("cash: reservation emails say payment is due; confirming the cash sends PAID", async () => {
  const student = newStudent();
  const r = await post(`/api/public/tenant/${tenantSlug}/checkout/start`, { provider: "CASH", packageId: simplePackageId, student });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ref = r.body.reference;

  const customer = await emailsTo(student.email);
  assert.equal(customer.length, 1);
  assert.match(customer[0].body, /reserved but NOT confirmed until we receive your cash payment/);
  assert.match(customer[0].body, new RegExp(`Reference: ${ref}`));
  assert.equal((await ownerEmails("CASH DUE")).filter((e) => e.subject.includes(ref)).length, 1);

  const confirm = await fetch(`${baseUrl}/api/tenants/${tenantId}/payments/${r.body.paymentId}/confirm-cash`, { method: "POST", headers: adminHeaders(), body: "{}" });
  assert.equal(confirm.status, 200);
  assert.equal((await ownerEmails("PAID")).filter((e) => e.subject.includes(ref)).length, 1);
});

test("cash cart reservation notifies the owner with the class and date", async () => {
  const { reference } = await startClassCartCheckout("CASH");
  const due = (await ownerEmails("CASH DUE")).filter((e) => e.subject.includes(reference));
  assert.equal(due.length, 1);
  assert.match(due[0].subject, /Cypress Evening Class, Nov 4/);
  assert.match(due[0].body, /Teen Driver Ed: Cypress Evening Class — Cypress — Mon, Nov 4, 2030, 5:00 PM/);
});

test("abandoned card checkouts: one NOT PAID email, none when later paid or too old", async () => {
  const abandoned = await startClassCartCheckout("STRIPE");
  const retried = await startClassCartCheckout("STRIPE");
  const retriedPaid = await startClassCartCheckout("STRIPE", retried.student);
  const ancient = await startClassCartCheckout("STRIPE");
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
  await db.update(payments).set({ createdAt: twoHoursAgo } as any).where(inArray(payments.id, [abandoned.paymentId, retried.paymentId]));
  await db.update(payments).set({ createdAt: new Date(Date.now() - 72 * 3600_000) } as any).where(eq(payments.id, ancient.paymentId));
  await pay(retriedPaid.paymentId);

  await notifyAbandonedCheckouts(tenantId, 1);
  await notifyAbandonedCheckouts(tenantId, 1);
  const notPaid = await ownerEmails("NOT PAID");
  const forRef = (ref: string) => notPaid.filter((e) => e.subject.includes(ref)).length;
  assert.equal(forRef(abandoned.reference), 1);
  assert.equal(forRef(retried.reference), 0, "customer paid on a later attempt");
  assert.equal(forRef(ancient.reference), 0, "outside the 48h window");
  const mail = notPaid.find((e) => e.subject.includes(abandoned.reference))!;
  assert.match(mail.subject, new RegExp(`^NOT PAID — checkout not completed: Nora ${abandoned.student.lastName}, 832-555-0199 — Cypress Evening Class, Nov 4`));
  assert.match(mail.body, /No payment was taken, no enrollment was confirmed and no seat is held/);
});

test("abandoned-checkout emails can be switched off", async () => {
  const res = await fetch(`${baseUrl}/api/tenants/${tenantId}/admin-enrollment-notifications/settings`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ notifyAbandonedCheckouts: false, extraRecipients: ["Owner@Example.com", "owner@example.com"] }),
  });
  const settings = await res.json();
  assert.equal(res.status, 200, JSON.stringify(settings));
  assert.deepEqual(settings, { enabled: true, extraRecipients: ["owner@example.com"], notifyAbandonedCheckouts: false });
  try {
    const c = await startClassCartCheckout("STRIPE");
    await db.update(payments).set({ createdAt: new Date(Date.now() - 2 * 3600_000) } as any).where(eq(payments.id, c.paymentId));
    await notifyAbandonedCheckouts(tenantId, 1);
    assert.equal((await ownerEmails("NOT PAID")).filter((e) => e.subject.includes(c.reference)).length, 0);
  } finally {
    await db.update(tenants).set({ abandonedCheckoutNotificationsEnabled: true, enrollmentNotificationEmails: null } as any).where(eq(tenants.id, tenantId));
  }
});

test("a school's custom template still gets the enrollment details", async () => {
  await db.insert(tenantEmailTemplates).values({
    tenantId, templateKey: "payment_received", subjectOverride: "Thanks {{firstName}}", bodyOverride: "Hi {{firstName}}, you're in!",
  });
  try {
    const { paymentId, reference, student } = await startClassCartCheckout("STRIPE");
    await pay(paymentId);
    await activateCart(paymentId);
    const mail = (await emailsTo(student.email))[0];
    assert.equal(mail.subject, "Thanks Nora");
    assert.match(mail.body, /^Hi Nora, you're in!\n\nReference: /);
    assert.match(mail.body, new RegExp(`Reference: ${reference}`));
    assert.match(mail.body, /Mon, Nov 4, 2030/);
  } finally {
    await db.delete(tenantEmailTemplates).where(eq(tenantEmailTemplates.tenantId, tenantId));
  }
});

test("admin details show the class, reference and email history; resend sends again", async () => {
  const { paymentId, reference, cartId, student } = await startClassCartCheckout("STRIPE");
  await pay(paymentId);
  await activateCart(paymentId);
  await settle();
  const [enr] = await db.select().from(enrollments).where(eq(enrollments.cartId, cartId));

  const detailsUrl = `${baseUrl}/api/tenants/${tenantId}/enrollments/${enr.id}/details`;
  const d = await (await fetch(detailsUrl, { headers: adminHeaders() })).json();
  assert.equal(d.reference, reference);
  assert.equal(d.offering.name, "Cypress Evening Class");
  assert.deepEqual(d.classDates, ["Mon, Nov 4, 2030, 5:00 PM – 8:00 PM", "Tue, Nov 5, 2030, 5:00 PM – 8:00 PM"]);
  assert.ok(d.payments.some((p: any) => p.id === paymentId && p.status === "COMPLETED"), "cart payment included");
  const kinds = d.emails.map((e: any) => e.kind).sort();
  assert.deepEqual(kinds, ["customer_payment_received", "owner_paid"]);

  for (const target of ["customer", "owner"]) {
    const r = await fetch(`${baseUrl}/api/tenants/${tenantId}/enrollments/${enr.id}/resend-email`, {
      method: "POST", headers: adminHeaders(), body: JSON.stringify({ target }),
    });
    assert.equal(r.status, 200, await r.clone().text());
  }
  const after = await (await fetch(detailsUrl, { headers: adminHeaders() })).json();
  const count = (k: string) => after.emails.filter((e: any) => e.kind === k).length;
  assert.equal(count("customer_payment_received"), 2);
  assert.equal(count("owner_paid"), 2);
  assert.equal((await emailsTo(student.email)).length, 2);

  const bad = await fetch(`${baseUrl}/api/tenants/${tenantId}/enrollments/${enr.id}/resend-email`, {
    method: "POST", headers: adminHeaders(), body: JSON.stringify({ target: "everyone" }),
  });
  assert.equal(bad.status, 400);
});

test("payments list with context names the customer, class and enrollment", async () => {
  const { paymentId, reference, cartId, student } = await startClassCartCheckout("STRIPE");
  await pay(paymentId);
  await activateCart(paymentId);
  const [enr] = await db.select().from(enrollments).where(eq(enrollments.cartId, cartId));

  const list = await (await fetch(`${baseUrl}/api/tenants/${tenantId}/payments?include=context`, { headers: adminHeaders() })).json();
  const row = list.find((p: any) => p.id === paymentId);
  assert.ok(row, "payment listed");
  assert.equal(row.reference, reference);
  assert.equal(row.status, "COMPLETED");
  assert.equal(row.enrollment.id, enr.id);
  assert.equal(row.cartCustomer.email, student.email);
  assert.equal(row.metadataJson.purchase[0].className, "Cypress Evening Class");
  assert.equal(row.cartItems[0].offering.name, "Cypress Evening Class");

  const plain = await (await fetch(`${baseUrl}/api/tenants/${tenantId}/payments`, { headers: adminHeaders() })).json();
  assert.equal(plain.find((p: any) => p.id === paymentId).enrollment, undefined, "plain list unchanged");
});
