process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-online-course-location-scope";
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
  locations,
  onlineCourses,
  onlineCourseLocations,
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
let otherTenantId: number;
let locationAId: number;
let locationBId: number;
let foreignLocationId: number;

let allLocationsCourseId: number;
let restrictedCourseId: number;
let inactiveRestrictedCourseId: number;
let foreignTenantCourseId: number;

const createdEnrollmentIds: number[] = [];

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
  tenantSlug = `oc-loc-scope-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `OCLocScope ${ts}`, slug: tenantSlug })
    .returning();
  tenantId = tenant.id;

  const [otherTenant] = await db
    .insert(tenants)
    .values({ name: `OCLocScopeOther ${ts}`, slug: `oc-loc-scope-other-${ts}` })
    .returning();
  otherTenantId = otherTenant.id;

  const [locA] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc A", address: "1 A St", city: "Austin", state: "TX", zip: "78701" })
    .returning();
  locationAId = locA.id;
  const [locB] = await db
    .insert(locations)
    .values({ tenantId, name: "Loc B", address: "2 B St", city: "Dallas", state: "TX", zip: "75201" })
    .returning();
  locationBId = locB.id;

  const [foreignLoc] = await db
    .insert(locations)
    .values({
      tenantId: otherTenantId,
      name: "Foreign Loc",
      address: "9 Foreign St",
      city: "Houston",
      state: "TX",
      zip: "77001",
    })
    .returning();
  foreignLocationId = foreignLoc.id;

  const [allCourse] = await db
    .insert(onlineCourses)
    .values({
      tenantId,
      name: "All Locations Course",
      price: 7900,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  allLocationsCourseId = allCourse.id;

  const [restrictedCourse] = await db
    .insert(onlineCourses)
    .values({
      tenantId,
      name: "Loc A Only Course",
      price: 9900,
      active: true,
      locationScopeMode: "SPECIFIC_LOCATIONS",
    })
    .returning();
  restrictedCourseId = restrictedCourse.id;
  await db.insert(onlineCourseLocations).values({
    tenantId,
    onlineCourseId: restrictedCourseId,
    locationId: locationAId,
  });

  const [inactiveCourse] = await db
    .insert(onlineCourses)
    .values({
      tenantId,
      name: "Inactive Loc A Only Course",
      price: 5900,
      active: false,
      locationScopeMode: "SPECIFIC_LOCATIONS",
    })
    .returning();
  inactiveRestrictedCourseId = inactiveCourse.id;
  await db.insert(onlineCourseLocations).values({
    tenantId,
    onlineCourseId: inactiveRestrictedCourseId,
    locationId: locationAId,
  });

  // Seed an active online course on the *other* tenant to exercise the
  // cross-tenant guard at /online-course-checkout/start. A storefront for
  // `tenantSlug` must never accept a checkout that targets this course.
  const [foreignCourse] = await db
    .insert(onlineCourses)
    .values({
      tenantId: otherTenantId,
      name: "Foreign Tenant Course",
      price: 6900,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    })
    .returning();
  foreignTenantCourseId = foreignCourse.id;

  // Seed payment settings so the post-guard checkout pipeline can run for every
  // provider branch. CASH exercises the in-process pipeline end-to-end with no
  // external HTTP. STRIPE and PAYPAL are enabled with fake credentials and the
  // network adapters are stubbed below, so the full STRIPE/PAYPAL branches of
  // /online-course-checkout/start can also be exercised end-to-end.
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

  // Default no-op stubs so any pre-existing test that uses provider:"STRIPE"
  // and happens to pass the location guard never accidentally makes a real
  // network call. Tests that need to assert on the metadata passed to the
  // adapter install a capturing stub locally and reset afterwards.
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
    if (createdEnrollmentIds.length) {
      for (const eid of createdEnrollmentIds) {
        await db.delete(payments).where(eq(payments.enrollmentId, eid));
        await db.delete(enrollments).where(eq(enrollments.id, eid));
      }
    }
    const courseIds = [
      allLocationsCourseId,
      restrictedCourseId,
      inactiveRestrictedCourseId,
      foreignTenantCourseId,
    ].filter((x): x is number => typeof x === "number" && x > 0);
    if (courseIds.length) {
      await db
        .delete(onlineCourseLocations)
        .where(inArray(onlineCourseLocations.onlineCourseId, courseIds));
      await db.delete(onlineCourses).where(inArray(onlineCourses.id, courseIds));
    }
    if (tenantId) {
      await db.delete(tenantPaymentSettings).where(eq(tenantPaymentSettings.tenantId, tenantId));
    }
    if (foreignLocationId) await db.delete(locations).where(eq(locations.id, foreignLocationId));
    if (locationAId) await db.delete(locations).where(eq(locations.id, locationAId));
    if (locationBId) await db.delete(locations).where(eq(locations.id, locationBId));
    if (otherTenantId) await db.delete(tenants).where(eq(tenants.id, otherTenantId));
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  } catch (e) {
    console.error("teardown error:", e);
  }
  await stopServer();
});

async function listCourses(query: string): Promise<{ status: number; body: any }> {
  const url = `${baseUrl}/api/public/tenant/${tenantSlug}/online-courses${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed };
}

async function startOnlineCourseCheckout(body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/online-course-checkout/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  if (parsed && typeof parsed.enrollmentId === "number") {
    createdEnrollmentIds.push(parsed.enrollmentId);
  }
  return { status: res.status, body: parsed };
}

// ---------- Language field round-trip ----------

test("online-courses: POST defaults language to ENGLISH, PATCH updates to SPANISH, public list exposes it", async () => {
  // Use a fresh admin user/tenant member just for this test path. We piggyback
  // on the existing tenant — the routes only require admin auth headers and
  // we already set TEST_AUTH_BYPASS=1 at the top of this file.
  const { users, tenantMembers } = await import("@shared/schema");
  const adminId = `oc-lang-admin-${Date.now()}`;
  await db.insert(users).values({ id: adminId, email: `${adminId}@x.test`, firstName: "L", lastName: "A" });
  await db.insert(tenantMembers).values({
    tenantId,
    userId: adminId,
    role: "tenant_admin",
    status: "ACTIVE",
    active: true,
  });
  const adminHeaders = {
    "Content-Type": "application/json",
    "x-test-user-id": adminId,
    "x-test-user-email": `${adminId}@x.test`,
  };

  // Default ENGLISH on POST when omitted.
  const postRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/online-courses`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      tenantId,
      name: "Lang Default OC",
      price: 1000,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
    }),
  });
  assert.ok(postRes.status === 200 || postRes.status === 201, `unexpected POST status ${postRes.status}: ${await postRes.clone().text()}`);
  const created = await postRes.json();
  assert.equal(created.language, "ENGLISH");

  // POST with explicit SPANISH.
  const postSpRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/online-courses`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      tenantId,
      name: "Lang Spanish OC",
      price: 1000,
      active: true,
      locationScopeMode: "ALL_LOCATIONS",
      language: "SPANISH",
    }),
  });
  const createdSp = await postSpRes.json();
  assert.equal(createdSp.language, "SPANISH");

  // PATCH flips ENGLISH → SPANISH.
  const patchRes = await fetch(`${baseUrl}/api/tenants/${tenantId}/online-courses/${created.id}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ language: "SPANISH" }),
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.language, "SPANISH");

  // Public list exposes the field.
  const listRes = await fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/online-courses`);
  assert.equal(listRes.status, 200);
  const list: any[] = await listRes.json();
  const fromList = list.find((c) => c.id === created.id);
  assert.equal(fromList?.language, "SPANISH");

  // Cleanup the rows this test added.
  await db.delete(onlineCourses).where(eq(onlineCourses.id, created.id));
  await db.delete(onlineCourses).where(eq(onlineCourses.id, createdSp.id));
  await db.delete(tenantMembers).where(eq(tenantMembers.userId, adminId));
  await db.delete(users).where(eq(users.id, adminId));
});

// ---------- Public listing endpoint ----------

test("list: with no locationId, both ALL_LOCATIONS and SPECIFIC_LOCATIONS courses appear", async () => {
  const r = await listCourses("");
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.ok(Array.isArray(r.body), "response should be an array");
  const ids = new Set((r.body as any[]).map((c) => c.id));
  assert.ok(ids.has(allLocationsCourseId), "ALL_LOCATIONS course should be listed when no filter");
  assert.ok(ids.has(restrictedCourseId), "SPECIFIC_LOCATIONS course should be listed when no filter");
  assert.ok(!ids.has(inactiveRestrictedCourseId), "inactive course should never appear publicly");
});

test("list: filtering by an allowed location returns ALL_LOCATIONS + matching SPECIFIC_LOCATIONS courses", async () => {
  const r = await listCourses(`locationId=${locationAId}`);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  const ids = new Set((r.body as any[]).map((c) => c.id));
  assert.ok(ids.has(allLocationsCourseId), "ALL_LOCATIONS course should be listed at any location");
  assert.ok(ids.has(restrictedCourseId), "SPECIFIC course should be listed at its allowed location");
  assert.ok(!ids.has(inactiveRestrictedCourseId), "inactive course should never appear publicly");
});

test("list: filtering by a non-allowed location hides SPECIFIC_LOCATIONS courses but keeps ALL_LOCATIONS", async () => {
  const r = await listCourses(`locationId=${locationBId}`);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  const ids = new Set((r.body as any[]).map((c) => c.id));
  assert.ok(ids.has(allLocationsCourseId), "ALL_LOCATIONS course should remain visible at non-allowed location");
  assert.ok(!ids.has(restrictedCourseId), "SPECIFIC course should be hidden at non-allowed location");
});

test("list: filtering by a foreign-tenant locationId hides SPECIFIC_LOCATIONS courses (no cross-tenant leak)", async () => {
  const r = await listCourses(`locationId=${foreignLocationId}`);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  const ids = new Set((r.body as any[]).map((c) => c.id));
  assert.ok(ids.has(allLocationsCourseId), "ALL_LOCATIONS course should remain visible regardless of locationId");
  assert.ok(
    !ids.has(restrictedCourseId),
    "SPECIFIC course should not appear when filtered by a location it does not allow (foreign tenant)",
  );
});

test("list: invalid locationId (non-numeric) is rejected with 400", async () => {
  const r = await listCourses("locationId=abc");
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
});

// ---------- Checkout-time guard ----------

test("checkout: SPECIFIC course rejected when locationId is missing", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}-1@test.local` },
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.match(
    String(r.body?.message ?? ""),
    /restricted to specific locations|select a location/i,
    "rejection message should explain that a location is required",
  );
});

test("checkout: SPECIFIC course rejected when locationId is not in the allow list", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}-2@test.local` },
    locationId: locationBId,
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.match(
    String(r.body?.message ?? ""),
    /not available at/i,
    "rejection message should say the course is not available at that location",
  );
});

test("checkout: SPECIFIC course rejected when locationId belongs to another tenant", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}-3@test.local` },
    locationId: foreignLocationId,
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.match(
    String(r.body?.message ?? ""),
    /invalid location/i,
    "foreign-tenant location should be rejected as invalid before the scope guard runs",
  );
});

test("checkout: ALL_LOCATIONS course passes the location guard with no locationId", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: allLocationsCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}-4@test.local` },
  });
  const msg = String(r.body?.message ?? "");
  assert.ok(
    !/not available at|restricted to specific locations|select a location/i.test(msg),
    `ALL_LOCATIONS course should pass location guard with no locationId, got ${r.status}: ${msg}`,
  );
});

test("checkout: ALL_LOCATIONS course passes the location guard with a valid locationId", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: allLocationsCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}-5@test.local` },
    locationId: locationBId,
  });
  const msg = String(r.body?.message ?? "");
  assert.ok(
    !/not available at|restricted to specific locations|select a location/i.test(msg),
    `ALL_LOCATIONS course should pass location guard with any tenant location, got ${r.status}: ${msg}`,
  );
});

test("checkout: rejects an onlineCourseId that belongs to a different tenant", async () => {
  const email = `oc-cross-tenant-${Date.now()}@test.local`;
  const r = await startOnlineCourseCheckout({
    provider: "CASH",
    onlineCourseId: foreignTenantCourseId,
    student: { firstName: "Cross", lastName: "Tenant", email },
  });

  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.match(
    String(r.body?.message ?? ""),
    /invalid online course/i,
    "cross-tenant onlineCourseId should be rejected with the 'Invalid online course' message",
  );
  assert.equal(
    typeof r.body?.enrollmentId,
    "undefined",
    "no enrollmentId should be returned when the cross-tenant guard fires",
  );
  assert.equal(
    typeof r.body?.paymentId,
    "undefined",
    "no paymentId should be returned when the cross-tenant guard fires",
  );

  // Belt-and-suspenders: confirm no enrollment or payment row was created
  // against the foreign course as a side effect of the rejected request.
  const enrRows = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.onlineCourseId, foreignTenantCourseId));
  assert.equal(
    enrRows.length,
    0,
    "no enrollment row should exist for the foreign-tenant course after a rejected checkout",
  );

  // Directly assert that no payment row was created for the foreign tenant
  // either. This guards against future refactors that might decouple
  // payments from enrollments and silently leak a payment row even when
  // the cross-tenant guard rejects the request.
  const payRows = await db
    .select()
    .from(payments)
    .where(eq(payments.tenantId, otherTenantId));
  assert.equal(
    payRows.length,
    0,
    "no payment row should exist for the foreign tenant after a rejected cross-tenant checkout",
  );
});

test("checkout: SPECIFIC course at an allowed location passes the location guard", async () => {
  const r = await startOnlineCourseCheckout({
    provider: "STRIPE",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "A", lastName: "B", email: `oc-${Date.now()}-6@test.local` },
    locationId: locationAId,
  });
  const msg = String(r.body?.message ?? "");
  assert.ok(
    !/not available at|restricted to specific locations|select a location/i.test(msg),
    `SPECIFIC course at allowed location should pass guard, got ${r.status}: ${msg}`,
  );
});

// ---------- Full end-to-end checkout (post-guard pipeline) ----------
//
// These tests use the CASH provider so that the request flows all the way
// through createEnrollment + createPayment without hitting any external
// payment provider. They guard the post-guard pipeline (enrollment row,
// payment row, response payload) for online-course checkouts against
// silent regressions.

test("checkout E2E: ALL_LOCATIONS course completes a CASH checkout end-to-end", async () => {
  const email = `oc-e2e-all-${Date.now()}@test.local`;
  const r = await startOnlineCourseCheckout({
    provider: "CASH",
    onlineCourseId: allLocationsCourseId,
    student: { firstName: "Ada", lastName: "Lovelace", email },
  });

  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body?.cashPayment, true, "expected cashPayment: true in response");
  assert.equal(typeof r.body?.enrollmentId, "number", "expected numeric enrollmentId in response");
  assert.equal(typeof r.body?.paymentId, "number", "expected numeric paymentId in response");

  const [enr] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, r.body.enrollmentId));
  assert.ok(enr, "enrollment row should be persisted");
  assert.equal(enr.tenantId, tenantId, "enrollment should be scoped to the test tenant");
  assert.equal(enr.onlineCourseId, allLocationsCourseId, "enrollment should reference the chosen course");
  assert.equal(enr.locationId, null, "ALL_LOCATIONS checkout without a locationId should leave it null");
  assert.equal(enr.email, email, "enrollment should record the submitted student email");
  assert.equal(enr.status, "pending_payment", "enrollment should start in pending_payment status");
  assert.equal(enr.priceSnapshotCents, 7900, "enrollment should snapshot the course price");

  const [pay] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, r.body.paymentId));
  assert.ok(pay, "payment row should be persisted");
  assert.equal(pay.tenantId, tenantId, "payment should be scoped to the test tenant");
  assert.equal(pay.enrollmentId, r.body.enrollmentId, "payment should link back to the enrollment");
  assert.equal(pay.provider, "CASH", "payment provider should be CASH");
  assert.equal(pay.status, "PENDING", "CASH payment should be flipped from CREATED to PENDING");
  assert.equal(pay.amountCents, 7900, "payment amount should match course price");
  assert.equal(pay.currency, "USD", "payment currency should be USD");
});

test("checkout E2E: SPECIFIC course at an allowed location completes CASH checkout and stores locationId", async () => {
  const email = `oc-e2e-specific-${Date.now()}@test.local`;
  const r = await startOnlineCourseCheckout({
    provider: "CASH",
    onlineCourseId: restrictedCourseId,
    student: { firstName: "Grace", lastName: "Hopper", email },
    locationId: locationAId,
  });

  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body?.cashPayment, true, "expected cashPayment: true in response");
  assert.equal(typeof r.body?.enrollmentId, "number", "expected numeric enrollmentId in response");
  assert.equal(typeof r.body?.paymentId, "number", "expected numeric paymentId in response");

  const [enr] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, r.body.enrollmentId));
  assert.ok(enr, "enrollment row should be persisted");
  assert.equal(enr.tenantId, tenantId, "enrollment should be scoped to the test tenant");
  assert.equal(enr.onlineCourseId, restrictedCourseId, "enrollment should reference the chosen course");
  assert.equal(
    enr.locationId,
    locationAId,
    "SPECIFIC_LOCATIONS checkout should persist the chosen locationId on the enrollment",
  );
  assert.equal(enr.email, email, "enrollment should record the submitted student email");
  assert.equal(enr.status, "pending_payment", "enrollment should start in pending_payment status");
  assert.equal(enr.priceSnapshotCents, 9900, "enrollment should snapshot the course price");

  const [pay] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, r.body.paymentId));
  assert.ok(pay, "payment row should be persisted");
  assert.equal(pay.tenantId, tenantId, "payment should be scoped to the test tenant");
  assert.equal(pay.enrollmentId, r.body.enrollmentId, "payment should link back to the enrollment");
  assert.equal(pay.provider, "CASH", "payment provider should be CASH");
  assert.equal(pay.status, "PENDING", "CASH payment should be flipped from CREATED to PENDING");
  assert.equal(pay.amountCents, 9900, "payment amount should match course price");
});

// ---------- Stripe / PayPal end-to-end checkout (provider-stubbed) ----------
//
// These tests stub the Stripe and PayPal adapter calls so the full provider
// branches of /online-course-checkout/start can be exercised without making
// real HTTP calls. They guard against silent regressions in the metadata,
// amount, and redirect URL plumbing for online-course checkouts.

test("checkout E2E: STRIPE provider returns redirectUrl, persists providerOrderId+PENDING, and forwards correct metadata", async () => {
  const email = `oc-e2e-stripe-${Date.now()}@test.local`;
  const fakeSessionId = `cs_test_stripe_${Date.now()}`;
  const fakeRedirectUrl = `https://stripe.test/checkout/${fakeSessionId}`;

  let captured: StripeStartInput | undefined;
  __setStripeCheckoutSessionForTests(async (input) => {
    captured = input;
    return { sessionId: fakeSessionId, redirectUrl: fakeRedirectUrl };
  });

  try {
    const r = await startOnlineCourseCheckout({
      provider: "STRIPE",
      onlineCourseId: restrictedCourseId,
      student: { firstName: "Linus", lastName: "Torvalds", email },
      locationId: locationAId,
    });

    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body?.redirectUrl, fakeRedirectUrl, "response should expose the Stripe checkout URL");
    assert.ok(typeof r.body.redirectUrl === "string" && r.body.redirectUrl.length > 0, "redirectUrl must be a non-empty string");
    assert.equal(typeof r.body?.enrollmentId, "number", "expected numeric enrollmentId in response");
    assert.equal(typeof r.body?.paymentId, "number", "expected numeric paymentId in response");

    // Adapter input assertions: amount, currency, and metadata that the webhook needs.
    assert.ok(captured, "Stripe adapter should have been invoked");
    assert.equal(captured!.amountCents, 9900, "Stripe should be charged the course price in cents");
    assert.equal(captured!.currency, "USD", "Stripe currency should be USD");
    assert.ok(typeof captured!.successUrl === "string" && captured!.successUrl.length > 0, "successUrl must be set");
    assert.ok(typeof captured!.cancelUrl === "string" && captured!.cancelUrl.length > 0, "cancelUrl must be set");
    assert.equal(captured!.metadata.tenantId, String(tenantId), "metadata.tenantId must match the tenant");
    assert.equal(
      captured!.metadata.enrollmentId,
      String(r.body.enrollmentId),
      "metadata.enrollmentId must match the persisted enrollment",
    );
    assert.equal(
      captured!.metadata.paymentId,
      String(r.body.paymentId),
      "metadata.paymentId must match the persisted payment",
    );
    assert.equal(
      captured!.metadata.onlineCourseId,
      String(restrictedCourseId),
      "metadata.onlineCourseId must match the chosen course",
    );

    // Persisted enrollment.
    const [enr] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, r.body.enrollmentId));
    assert.ok(enr, "enrollment row should be persisted");
    assert.equal(enr.tenantId, tenantId, "enrollment should be scoped to the test tenant");
    assert.equal(enr.onlineCourseId, restrictedCourseId, "enrollment should reference the chosen course");
    assert.equal(enr.locationId, locationAId, "STRIPE checkout should persist the chosen locationId");
    assert.equal(enr.status, "pending_payment", "enrollment should start in pending_payment status");
    assert.equal(enr.priceSnapshotCents, 9900, "enrollment should snapshot the course price");

    // Persisted payment row: must end at PENDING with providerOrderId == sessionId.
    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, r.body.paymentId));
    assert.ok(pay, "payment row should be persisted");
    assert.equal(pay.tenantId, tenantId, "payment should be scoped to the test tenant");
    assert.equal(pay.enrollmentId, r.body.enrollmentId, "payment should link back to the enrollment");
    assert.equal(pay.provider, "STRIPE", "payment provider should be STRIPE");
    assert.equal(pay.status, "PENDING", "STRIPE payment should be flipped from CREATED to PENDING");
    assert.equal(pay.providerOrderId, fakeSessionId, "payment.providerOrderId should be the Stripe session id");
    assert.equal(pay.amountCents, 9900, "payment amount should match course price");
    assert.equal(pay.currency, "USD", "payment currency should be USD");
  } finally {
    __resetStripeCheckoutSessionForTests();
    // Reinstall the default no-op stub so subsequent tests in this file that
    // happen to pass through the STRIPE branch don't make a real network call.
    __setStripeCheckoutSessionForTests(async () => ({
      sessionId: "sess_default_stub",
      redirectUrl: "https://stripe.test/default",
    }));
  }
});

test("checkout E2E: PAYPAL provider returns redirectUrl, persists providerOrderId+PENDING, and forwards correct metadata", async () => {
  const email = `oc-e2e-paypal-${Date.now()}@test.local`;
  const fakeOrderId = `PAYPAL_ORDER_${Date.now()}`;
  const fakeApprovalUrl = `https://paypal.test/checkoutnow?token=${fakeOrderId}`;

  let captured: PayPalStartInput | undefined;
  __setPayPalOrderForTests(async (input) => {
    captured = input;
    return { orderId: fakeOrderId, approvalUrl: fakeApprovalUrl };
  });

  try {
    const r = await startOnlineCourseCheckout({
      provider: "PAYPAL",
      onlineCourseId: allLocationsCourseId,
      student: { firstName: "Margaret", lastName: "Hamilton", email },
    });

    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body?.redirectUrl, fakeApprovalUrl, "response should expose the PayPal approval URL");
    assert.ok(typeof r.body.redirectUrl === "string" && r.body.redirectUrl.length > 0, "redirectUrl must be a non-empty string");
    assert.equal(typeof r.body?.enrollmentId, "number", "expected numeric enrollmentId in response");
    assert.equal(typeof r.body?.paymentId, "number", "expected numeric paymentId in response");

    // Adapter input assertions: credentials, amount, currency, URLs, metadata.
    assert.ok(captured, "PayPal adapter should have been invoked");
    assert.equal(captured!.clientId, "test-paypal-client-id", "PayPal clientId should come from tenant settings");
    assert.equal(captured!.clientSecret, "test-paypal-client-secret", "PayPal clientSecret should come from tenant settings");
    assert.equal(captured!.mode, "sandbox", "PayPal mode should come from tenant settings");
    assert.equal(captured!.amountCents, 7900, "PayPal should be charged the course price in cents");
    assert.equal(captured!.currency, "USD", "PayPal currency should be USD");
    assert.ok(typeof captured!.returnUrl === "string" && captured!.returnUrl.length > 0, "returnUrl must be set");
    assert.ok(typeof captured!.cancelUrl === "string" && captured!.cancelUrl.length > 0, "cancelUrl must be set");
    assert.equal(captured!.metadata.tenantId, String(tenantId), "metadata.tenantId must match the tenant");
    assert.equal(
      captured!.metadata.enrollmentId,
      String(r.body.enrollmentId),
      "metadata.enrollmentId must match the persisted enrollment",
    );
    assert.equal(
      captured!.metadata.paymentId,
      String(r.body.paymentId),
      "metadata.paymentId must match the persisted payment",
    );
    assert.equal(
      captured!.metadata.onlineCourseId,
      String(allLocationsCourseId),
      "metadata.onlineCourseId must match the chosen course",
    );

    // Persisted enrollment.
    const [enr] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, r.body.enrollmentId));
    assert.ok(enr, "enrollment row should be persisted");
    assert.equal(enr.tenantId, tenantId, "enrollment should be scoped to the test tenant");
    assert.equal(enr.onlineCourseId, allLocationsCourseId, "enrollment should reference the chosen course");
    assert.equal(enr.locationId, null, "ALL_LOCATIONS PayPal checkout without a locationId should leave it null");
    assert.equal(enr.status, "pending_payment", "enrollment should start in pending_payment status");
    assert.equal(enr.priceSnapshotCents, 7900, "enrollment should snapshot the course price");

    // Persisted payment row: must end at PENDING with providerOrderId == orderId.
    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, r.body.paymentId));
    assert.ok(pay, "payment row should be persisted");
    assert.equal(pay.tenantId, tenantId, "payment should be scoped to the test tenant");
    assert.equal(pay.enrollmentId, r.body.enrollmentId, "payment should link back to the enrollment");
    assert.equal(pay.provider, "PAYPAL", "payment provider should be PAYPAL");
    assert.equal(pay.status, "PENDING", "PAYPAL payment should be flipped from CREATED to PENDING");
    assert.equal(pay.providerOrderId, fakeOrderId, "payment.providerOrderId should be the PayPal order id");
    assert.equal(pay.amountCents, 7900, "payment amount should match course price");
    assert.equal(pay.currency, "USD", "payment currency should be USD");
  } finally {
    __resetPayPalOrderForTests();
    // Reinstall the default no-op stub so subsequent tests in this file that
    // happen to pass through the PAYPAL branch don't make a real network call.
    __setPayPalOrderForTests(async () => ({
      orderId: "ord_default_stub",
      approvalUrl: "https://paypal.test/default",
    }));
  }
});

// ---------- Provider-down failure handling ----------
//
// When Stripe or PayPal throws (provider is down, credentials rejected, network
// timeout, etc.) the route used to leak orphan pending_payment enrollments and
// CREATED payment rows into the school's dashboard and bubble up a generic 500
// to the student. These tests pin the friendlier behaviour: a 502 with a clear
// message, the payment row marked FAILED, and the enrollment marked cancelled
// so it falls out of the dashboard's "pending" view.

test("checkout failure: STRIPE provider error returns 502, marks payment FAILED and enrollment cancelled", async () => {
  const email = `oc-stripe-down-${Date.now()}@test.local`;
  __setStripeCheckoutSessionForTests(async () => {
    throw new Error("simulated Stripe outage");
  });

  try {
    const r = await startOnlineCourseCheckout({
      provider: "STRIPE",
      onlineCourseId: allLocationsCourseId,
      student: { firstName: "Stripe", lastName: "Down", email },
    });

    assert.equal(r.status, 502, `expected 502, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(
      String(r.body?.message ?? ""),
      /payment provider.*unavailable|try again/i,
      "response should explain the provider is unavailable, not a generic 500",
    );

    // Locate the orphan rows by email so we can assert the cleanup ran even
    // though the route does not return enrollmentId/paymentId on failure.
    const enrRows = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.email, email));
    assert.equal(enrRows.length, 1, "exactly one enrollment row should exist for this student");
    const enr = enrRows[0];
    createdEnrollmentIds.push(enr.id);
    assert.equal(
      enr.status,
      "cancelled",
      "enrollment should be marked cancelled so it falls out of the pending dashboard view",
    );

    const payRows = await db
      .select()
      .from(payments)
      .where(eq(payments.enrollmentId, enr.id));
    assert.equal(payRows.length, 1, "exactly one payment row should exist for this enrollment");
    const pay = payRows[0];
    assert.equal(pay.provider, "STRIPE", "payment provider should be STRIPE");
    assert.equal(
      pay.status,
      "FAILED",
      "payment should be marked FAILED instead of left as CREATED so the dashboard stays clean",
    );
    assert.equal(pay.providerOrderId, null, "providerOrderId should never have been set");
  } finally {
    __resetStripeCheckoutSessionForTests();
    __setStripeCheckoutSessionForTests(async () => ({
      sessionId: "sess_default_stub",
      redirectUrl: "https://stripe.test/default",
    }));
  }
});

test("checkout failure: PAYPAL provider error returns 502, marks payment FAILED and enrollment cancelled", async () => {
  const email = `oc-paypal-down-${Date.now()}@test.local`;
  __setPayPalOrderForTests(async () => {
    throw new Error("simulated PayPal outage");
  });

  try {
    const r = await startOnlineCourseCheckout({
      provider: "PAYPAL",
      onlineCourseId: allLocationsCourseId,
      student: { firstName: "PayPal", lastName: "Down", email },
    });

    assert.equal(r.status, 502, `expected 502, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.match(
      String(r.body?.message ?? ""),
      /payment provider.*unavailable|try again/i,
      "response should explain the provider is unavailable, not a generic 500",
    );

    const enrRows = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.email, email));
    assert.equal(enrRows.length, 1, "exactly one enrollment row should exist for this student");
    const enr = enrRows[0];
    createdEnrollmentIds.push(enr.id);
    assert.equal(
      enr.status,
      "cancelled",
      "enrollment should be marked cancelled so it falls out of the pending dashboard view",
    );

    const payRows = await db
      .select()
      .from(payments)
      .where(eq(payments.enrollmentId, enr.id));
    assert.equal(payRows.length, 1, "exactly one payment row should exist for this enrollment");
    const pay = payRows[0];
    assert.equal(pay.provider, "PAYPAL", "payment provider should be PAYPAL");
    assert.equal(
      pay.status,
      "FAILED",
      "payment should be marked FAILED instead of left as CREATED so the dashboard stays clean",
    );
    assert.equal(pay.providerOrderId, null, "providerOrderId should never have been set");
  } finally {
    __resetPayPalOrderForTests();
    __setPayPalOrderForTests(async () => ({
      orderId: "ord_default_stub",
      approvalUrl: "https://paypal.test/default",
    }));
  }
});
