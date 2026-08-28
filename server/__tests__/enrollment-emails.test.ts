process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-enrollment-emails";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
delete process.env.RESEND_API_KEY;

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and, desc, inArray } from "drizzle-orm";

import { db } from "../db";
import {
  tenants,
  packages,
  enrollments,
  emailUnsubscribes,
  sessionChangeEmails,
  tenantEmailTemplates,
} from "@shared/schema";
import {
  sendEnrollmentReceived,
  sendPaymentReceived,
} from "../enrollment-emails";

let tenantId: number;
let packageId: number;
const enrollmentIds: number[] = [];
const cleanup: (() => Promise<void>)[] = [];

async function fetchEmails(to: string) {
  return db
    .select()
    .from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), eq(sessionChangeEmails.recipientEmail, to)))
    .orderBy(desc(sessionChangeEmails.createdAt));
}

before(async () => {
  const ts = Date.now();
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `Email Test School ${ts}`,
      slug: `email-test-${ts}`,
      contactPhone: "555-0100",
      contactEmail: `school-${ts}@email-test.local`,
    })
    .returning();
  tenantId = tenant.id;
  cleanup.push(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  const [pkg] = await db
    .insert(packages)
    .values({
      tenantId,
      name: "Email Test Package",
      price: 25000,
      classroomHoursRequired: 32,
      driveHoursRequired: 7,
      creditClassroom: 32,
      creditDrive: 7,
      active: true,
    })
    .returning();
  packageId = pkg.id;
});

after(async () => {
  for (const fn of cleanup.reverse()) {
    try { await fn(); } catch (e) { console.error(e); }
  }
});

async function makeEnrollment(opts: { email: string; firstName?: string; parentEmail?: string }) {
  const [enr] = await db.insert(enrollments).values({
    tenantId,
    packageId,
    firstName: opts.firstName ?? "Test",
    lastName: "Student",
    email: opts.email,
    parentEmail: opts.parentEmail ?? null,
    status: "pending_payment",
    packageSnapshotJson: { name: "Email Test Package", price: 25000 },
  }).returning();
  enrollmentIds.push(enr.id);
  return enr;
}

async function loadTenant() {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return t!;
}

test("enrollment_received logs a skipped_no_provider row when RESEND_API_KEY is unset", async () => {
  const email = `e1-${Date.now()}@email-test.local`;
  const enr = await makeEnrollment({ email });
  await sendEnrollmentReceived(enr, await loadTenant(), null);
  const rows = await fetchEmails(email);
  assert.equal(rows.length, 1, "exactly one log row written");
  assert.equal(rows[0].status, "skipped_no_provider");
  assert.match(rows[0].subject, /enrollment/i);
});

test("enrollment_received fans out to parent email when different from student", async () => {
  const studentEmail = `e2s-${Date.now()}@email-test.local`;
  const parentEmail = `e2p-${Date.now()}@email-test.local`;
  const enr = await makeEnrollment({ email: studentEmail, parentEmail });
  await sendEnrollmentReceived(enr, await loadTenant(), null);
  const studentRows = await fetchEmails(studentEmail);
  const parentRows = await fetchEmails(parentEmail);
  assert.equal(studentRows.length, 1);
  assert.equal(parentRows.length, 1);
});

test("enrollment_received does NOT fan out when parent email equals student email", async () => {
  const email = `e3-${Date.now()}@email-test.local`;
  const enr = await makeEnrollment({ email, parentEmail: email });
  await sendEnrollmentReceived(enr, await loadTenant(), null);
  const rows = await fetchEmails(email);
  assert.equal(rows.length, 1, "deduped to a single send");
});

test("recipient on the unsubscribe list logs status=skipped_unsubscribed", async () => {
  const email = `e4-${Date.now()}@email-test.local`;
  await db.insert(emailUnsubscribes).values({ tenantId, email, reason: "test" });
  const enr = await makeEnrollment({ email });
  await sendEnrollmentReceived(enr, await loadTenant(), null);
  const rows = await fetchEmails(email);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "skipped_unsubscribed");
});

test("payment_received is idempotent across concurrent retries", async () => {
  const email = `e5-${Date.now()}@email-test.local`;
  const enr = await makeEnrollment({ email });
  await db.update(enrollments).set({ status: "active" }).where(eq(enrollments.id, enr.id));
  await Promise.all([
    sendPaymentReceived(enr.id, tenantId),
    sendPaymentReceived(enr.id, tenantId),
    sendPaymentReceived(enr.id, tenantId),
  ]);
  const rows = await fetchEmails(email);
  const paymentRows = rows.filter(r => /payment received/i.test(r.subject));
  assert.equal(paymentRows.length, 1, "idempotent: only one payment_received logged");
  const [updated] = await db.select().from(enrollments).where(eq(enrollments.id, enr.id));
  assert.ok(updated.paymentReceivedEmailSentAt, "timestamp flag set");
});

test("tenant template override is used in subject/body when present", async () => {
  await db.insert(tenantEmailTemplates).values({
    tenantId,
    templateKey: "enrollment_received",
    subjectOverride: "CUSTOM SUBJECT for {{firstName}}",
    bodyOverride: "CUSTOM BODY {{packageName}}",
  });
  cleanup.push(async () => {
    await db.delete(tenantEmailTemplates).where(eq(tenantEmailTemplates.tenantId, tenantId));
  });
  const email = `e6-${Date.now()}@email-test.local`;
  const enr = await makeEnrollment({ email, firstName: "Casey" });
  await sendEnrollmentReceived(enr, await loadTenant(), null);
  const rows = await fetchEmails(email);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, "CUSTOM SUBJECT for Casey");
  assert.match(rows[0].body, /CUSTOM BODY Email Test Package/);
});
