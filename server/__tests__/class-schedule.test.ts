process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-class-schedule";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { formatDateRange, summarizeSchedule } from "../class-schedule";
import {
  tenants, packages, packageLocations, locations, scheduleOfferings, scheduleSessions,
  carts, cartItems, enrollments, payments, bookings, sessionChangeEmails, tenantPaymentSettings,
} from "@shared/schema";
import {
  __setStripeCheckoutSessionForTests,
  __resetStripeCheckoutSessionForTests,
  __setRetrieveStripeCheckoutSessionForTests,
  __resetRetrieveStripeCheckoutSessionForTests,
} from "../payments/stripe-adapter";

const TZ = "America/Chicago";
// 2030-11-04 is a Monday. 23:00Z = 5:00 PM CST.
const at = (day: number, hourUtc: number) => new Date(Date.UTC(2030, 10, day, hourUtc, 0, 0));

test("summarizeSchedule: consecutive weekdays with one time range", () => {
  const s = [4, 5, 6, 7].map((d) => ({ startAt: at(d, 23), endAt: at(d + 1, 2) }));
  assert.equal(summarizeSchedule(s, TZ), "Mon–Thu, 5:00–8:00 PM");
});

test("summarizeSchedule: weekend pair, mixed meridiem, and varying times", () => {
  assert.equal(
    summarizeSchedule([{ startAt: at(9, 17), endAt: at(9, 19) }, { startAt: at(10, 17), endAt: at(10, 19) }], TZ),
    "Sat & Sun, 11:00 AM–1:00 PM",
  );
  assert.equal(
    summarizeSchedule([{ startAt: at(4, 23), endAt: at(5, 2) }, { startAt: at(6, 15), endAt: at(6, 18) }], TZ),
    "Mon & Wed, times vary",
  );
  assert.equal(summarizeSchedule([], TZ), "");
});

test("formatDateRange: multi-day and single-day", () => {
  assert.equal(formatDateRange(at(4, 23), at(21, 2), TZ), "Nov 4 – Nov 20, 2030");
  assert.equal(formatDateRange(at(9, 15), at(9, 23), TZ), "Sat, Nov 9, 2030");
});

let server: Server;
let baseUrl: string;
let tenantId: number;
let slug: string;
let cypressId: number;
let pasadenaId: number;
let teenPkgId: number;
let adultPkgId: number;
let simplePkgId: number;
const ids: Record<string, number> = {};
const stripePaid = new Set<string>();
let n = 0;

before(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  slug = `schedule-${Date.now()}`;
  const [t] = await db.insert(tenants).values({ name: "All Ages Driving School", slug }).returning();
  tenantId = t.id;
  await db.insert(tenantPaymentSettings).values({ tenantId, stripeEnabled: true, stripeSecretKey: "sk_test_fake", cashEnabled: true });
  const [cy] = await db.insert(locations).values({ tenantId, name: "Cypress,TX", address: "1 A", city: "Cypress", state: "TX", zip: "77429", phone: "281-859-3100" }).returning();
  const [pa] = await db.insert(locations).values({ tenantId, name: "Pasadena,TX", address: "2 B", city: "Pasadena", state: "TX", zip: "77502", phone: "713-947-7322" }).returning();
  cypressId = cy.id;
  pasadenaId = pa.id;

  const pkg = async (name: string, audience: "TEENS" | "ADULTS" | "BOTH", active = true) =>
    (await db.insert(packages).values({ tenantId, name, price: 42500, classroomHoursRequired: 0, driveHoursRequired: 0, active, audience, locationScopeMode: "ALL_LOCATIONS" } as any).returning())[0].id;
  teenPkgId = await pkg("Teen Driver Ed", "TEENS");
  adultPkgId = await pkg("Adult 6-Hour", "ADULTS");
  simplePkgId = await pkg("Road Test", "BOTH");
  const inactivePkg = await pkg("Retired Course", "TEENS", false);
  await db.insert(packageLocations).values({ tenantId, packageId: teenPkgId, locationId: pasadenaId, priceOverrideCents: 39900 } as any);

  const offering = async (key: string, values: Record<string, unknown>) => {
    const [o] = await db.insert(scheduleOfferings).values({
      tenantId, capacity: 20, status: "PUBLISHED", startsAt: at(4, 23), endsAt: at(8, 2), ...values,
    } as any).returning();
    ids[key] = o.id;
    return o.id;
  };
  const cyTeen = await offering("cyTeen", { packageId: teenPkgId, locationId: cypressId, name: "Cypress Evening", description: "Bring your learner permit." });
  await db.insert(scheduleSessions).values([
    ...[4, 5, 6, 7].map((d) => ({ tenantId, locationId: cypressId, offeringId: cyTeen, type: "CLASSROOM", capacity: 20, startAt: at(d, 23), endAt: at(d + 1, 2) })),
    { tenantId, locationId: cypressId, offeringId: cyTeen, type: "CLASSROOM", capacity: 20, status: "CANCELLED", startAt: at(8, 15), endAt: at(8, 18) },
  ] as any);
  await offering("paTeenFewLeft", { packageId: teenPkgId, locationId: pasadenaId, name: "Pasadena Weekend", capacity: 5, enrolledCount: 3, startsAt: at(9, 15), endsAt: at(9, 23) });
  await offering("cyAdultFull", { packageId: adultPkgId, locationId: cypressId, name: "Adult Saturday", status: "FULL", startsAt: at(16, 15), endsAt: at(16, 21) });
  await offering("past", { packageId: teenPkgId, locationId: cypressId, name: "Last Year", startsAt: new Date("2020-01-06T23:00:00Z"), endsAt: new Date("2020-01-10T02:00:00Z") });
  await offering("draft", { packageId: teenPkgId, locationId: cypressId, name: "Draft", status: "DRAFT" });
  await offering("inactivePkg", { packageId: inactivePkg, locationId: cypressId, name: "Retired" });

  __setStripeCheckoutSessionForTests(async () => ({ sessionId: `cs_status_${++n}`, redirectUrl: "https://stripe.test/c" }));
  __setRetrieveStripeCheckoutSessionForTests(async (_k, sessionId) => ({
    sessionId,
    status: stripePaid.has(sessionId) ? "complete" : "open",
    paymentStatus: stripePaid.has(sessionId) ? "paid" : "unpaid",
    paymentIntentId: stripePaid.has(sessionId) ? `pi_${sessionId}` : null,
    chargeId: null, amountTotalCents: null, customerEmail: null, paidAt: null,
  }));
});

after(async () => {
  __resetStripeCheckoutSessionForTests();
  __resetRetrieveStripeCheckoutSessionForTests();
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
    await db.delete(packageLocations).where(eq(packageLocations.tenantId, tenantId));
    await db.delete(packages).where(eq(packages.tenantId, tenantId));
    await db.delete(locations).where(eq(locations.tenantId, tenantId));
    await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test("C1: upcoming published classes only, with dates, summary, location phone, price and seats", async () => {
  const r = await get(`/api/public/tenant/${slug}/class-schedule`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.map((x: any) => x.offeringId), [ids.cyTeen, ids.paTeenFewLeft, ids.cyAdultFull]);

  const cy = r.body[0];
  assert.equal(cy.packageName, "Teen Driver Ed");
  assert.equal(cy.audience, "TEENS");
  assert.equal(cy.className, "Cypress Evening");
  assert.equal(cy.details, "Bring your learner permit.");
  assert.deepEqual(cy.location, { id: cypressId, name: "Cypress,TX", city: "Cypress", phone: "281-859-3100" });
  assert.equal(cy.scheduleSummary, "Mon–Thu, 5:00–8:00 PM");
  assert.equal(cy.dateRange, "Nov 4 – Nov 7, 2030");
  assert.equal(cy.sessions.length, 4, "cancelled session excluded");
  assert.equal(cy.priceCents, 42500);
  assert.equal(cy.availability, "OPEN");
  assert.deepEqual(cy.enroll, { packageId: teenPkgId, offeringId: ids.cyTeen, locationId: cypressId });

  const pa = r.body[1];
  assert.equal(pa.priceCents, 39900, "Pasadena price override");
  assert.equal(pa.remainingSeats, 2);
  assert.equal(pa.availability, "FEW_LEFT");
  assert.equal(pa.scheduleSummary, "", "no sessions yet");
  assert.equal(pa.dateRange, "Sat, Nov 9, 2030");
  assert.equal(r.body[2].availability, "FULL");
});

test("C1: filters by location, audience and package; rejects bad filters", async () => {
  const byLoc = await get(`/api/public/tenant/${slug}/class-schedule?locationId=${pasadenaId}`);
  assert.deepEqual(byLoc.body.map((x: any) => x.offeringId), [ids.paTeenFewLeft]);
  const adults = await get(`/api/public/tenant/${slug}/class-schedule?audience=ADULTS`);
  assert.deepEqual(adults.body.map((x: any) => x.offeringId), [ids.cyAdultFull]);
  const byPkg = await get(`/api/public/tenant/${slug}/class-schedule?packageId=${teenPkgId}`);
  assert.equal(byPkg.body.length, 2);
  const bad = await get(`/api/public/tenant/${slug}/class-schedule?audience=KIDS`);
  assert.equal(bad.status, 400);
});

test("C2: pending → paid once Stripe says so (asks Stripe itself), with the enrollment confirmed", async () => {
  const student = { firstName: "Sky", lastName: "Status", email: `sky.status.${Date.now()}@example.com` };
  const start = await post(`/api/public/tenant/${slug}/checkout/start`, {
    provider: "STRIPE", packageId: simplePkgId, locationId: cypressId, student,
    utm_source: "google", utm_medium: "cpc", utm_campaign: "fall-teen", gclid: "Cj0KCQ",
  });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const ref = start.body.reference;

  const pending = await get(`/api/public/tenant/${slug}/checkout/${ref}/status`);
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  assert.equal(pending.body.state, "pending");
  assert.deepEqual(pending.body.items, [{ name: "Road Test", className: null, startsAt: null, locationName: "Cypress,TX", locationPhone: "281-859-3100" }]);

  const [p] = await db.select().from(payments).where(eq(payments.reference, ref));
  assert.deepEqual((p.metadataJson as any).attribution, { utmSource: "google", utmMedium: "cpc", utmCampaign: "fall-teen", gclid: "Cj0KCQ" });

  stripePaid.add(p.providerOrderId!);
  await db.update(payments).set({ metadataJson: { ...(p.metadataJson as any), providerCheck: null } } as any).where(eq(payments.id, p.id));
  const paid = await get(`/api/public/tenant/${slug}/checkout/${ref.toLowerCase()}/status`);
  assert.equal(paid.body.state, "paid");
  assert.ok(paid.body.paidAt);
  assert.deepEqual(paid.body.enrollments, [{ id: start.body.enrollmentId, status: "confirmed" }]);
});

test("C2: cash checkout is cash_due; class purchase lists the class and date; unknown reference is 404", async () => {
  const cart = (await post(`/api/public/tenant/${slug}/cart`, {})).body;
  await post(`/api/public/cart/${cart.id}/items`, { packageId: teenPkgId, offeringId: ids.cyTeen });
  const start = await post(`/api/public/tenant/${slug}/cart-checkout/start`, {
    cartId: cart.id, provider: "CASH", student: { firstName: "Cash", lastName: "Due", email: `cash.due.${Date.now()}@example.com` },
  });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const s = await get(`/api/public/tenant/${slug}/checkout/${start.body.reference}/status`);
  assert.equal(s.body.state, "cash_due");
  assert.equal(s.body.items[0].className, "Cypress Evening");
  assert.equal(s.body.items[0].startsAt, at(4, 23).toISOString());
  assert.equal(s.body.items[0].locationPhone, "281-859-3100");

  const missing = await get(`/api/public/tenant/${slug}/checkout/ZZ-NOPE99/status`);
  assert.equal(missing.status, 404);
});
