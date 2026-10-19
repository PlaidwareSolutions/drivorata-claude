process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-email-tracking";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { sendEmail, __setResendClientForTests, __setEmailRetryDelayForTests } from "../email-service";
import { processResendEvent } from "../resend-webhook";
import { emailUnsubscribes, sessionChangeEmails, tenants } from "@shared/schema";

let tenantId: number;

before(async () => {
  const [t] = await db.insert(tenants).values({ name: "Tracking School", slug: `tracking-${Date.now()}` }).returning();
  tenantId = t.id;
  __setEmailRetryDelayForTests(1);
});

afterEach(() => __setResendClientForTests(null));

after(async () => {
  await db.delete(emailUnsubscribes).where(eq(emailUnsubscribes.tenantId, tenantId));
  await db.delete(sessionChangeEmails).where(eq(sessionChangeEmails.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
});

/** A fake Resend client that answers with the given responses in order. */
function fakeResend(responses: Array<{ data?: { id: string }; error?: { name: string; message: string } } | Error>) {
  const calls: any[] = [];
  return {
    calls,
    client: {
      emails: {
        send: async (payload: any) => {
          calls.push(payload);
          const next = responses[Math.min(calls.length - 1, responses.length - 1)];
          if (next instanceof Error) throw next;
          return next;
        },
      },
    },
  };
}

async function row(id: number) {
  const [r] = await db.select().from(sessionChangeEmails).where(eq(sessionChangeEmails.id, id));
  return r;
}

test("records kind, enrollment and payment on the email log", async () => {
  const fake = fakeResend([{ data: { id: "msg_tag_1" } }]);
  __setResendClientForTests(fake.client);
  const res = await sendEmail({
    tenantId, to: "a@example.com", subject: "s", body: "b",
    kind: "owner_paid", enrollmentId: 41, paymentId: 42,
  });
  assert.equal(res.status, "sent");
  const r = await row(res.emailId);
  assert.equal(r.kind, "owner_paid");
  assert.equal(r.enrollmentId, 41);
  assert.equal(r.paymentId, 42);
  assert.equal(r.providerMessageId, "msg_tag_1");
});

test("retries once on a temporary Resend error", async () => {
  const fake = fakeResend([
    { error: { name: "rate_limit_exceeded", message: "Too many requests" } },
    { data: { id: "msg_retry_ok" } },
  ]);
  __setResendClientForTests(fake.client);
  const res = await sendEmail({ tenantId, to: "b@example.com", subject: "s", body: "b" });
  assert.equal(res.status, "sent");
  assert.equal(fake.calls.length, 2);
  assert.equal((await row(res.emailId)).providerMessageId, "msg_retry_ok");
});

test("retries a network failure once, then records the failure", async () => {
  const fake = fakeResend([new Error("socket hang up"), new Error("socket hang up")]);
  __setResendClientForTests(fake.client);
  const res = await sendEmail({ tenantId, to: "c@example.com", subject: "s", body: "b" });
  assert.equal(res.status, "failed");
  assert.equal(fake.calls.length, 2);
  assert.match((await row(res.emailId)).errorMsg ?? "", /socket hang up/);
});

test("does not retry a permanent error", async () => {
  const fake = fakeResend([{ error: { name: "validation_error", message: "Invalid `to` field" } }]);
  __setResendClientForTests(fake.client);
  const res = await sendEmail({ tenantId, to: "not-an-email", subject: "s", body: "b" });
  assert.equal(res.status, "failed");
  assert.equal(fake.calls.length, 1);
});

test("Resend webhook events update delivery status, and a late delay never overwrites the outcome", async () => {
  const fake = fakeResend([{ data: { id: "msg_delivery_1" } }]);
  __setResendClientForTests(fake.client);
  const sent = await sendEmail({ tenantId, to: "d@example.com", subject: "s", body: "b" });

  await processResendEvent({ type: "email.delivery_delayed", created_at: "2026-10-19T10:00:00Z", data: { email_id: "msg_delivery_1" } });
  assert.equal((await row(sent.emailId)).deliveryStatus, "delivery_delayed");

  await processResendEvent({ type: "email.delivered", created_at: "2026-10-19T10:05:00Z", data: { email_id: "msg_delivery_1" } });
  let r = await row(sent.emailId);
  assert.equal(r.deliveryStatus, "delivered");
  assert.equal(r.deliveryUpdatedAt?.toISOString(), "2026-10-19T10:05:00.000Z");

  await processResendEvent({ type: "email.delivery_delayed", created_at: "2026-10-19T10:06:00Z", data: { email_id: "msg_delivery_1" } });
  r = await row(sent.emailId);
  assert.equal(r.deliveryStatus, "delivered", "out-of-order delay ignored");
});

test("a bounce is recorded on the email and suppresses the address", async () => {
  const fake = fakeResend([{ data: { id: "msg_bounce_1" } }]);
  __setResendClientForTests(fake.client);
  const sent = await sendEmail({ tenantId, to: "bounce@example.com", subject: "s", body: "b" });
  await processResendEvent({ type: "email.bounced", data: { email_id: "msg_bounce_1", to: ["bounce@example.com"] } });
  assert.equal((await row(sent.emailId)).deliveryStatus, "bounced");
  const supp = await db.select().from(emailUnsubscribes)
    .where(and(eq(emailUnsubscribes.tenantId, tenantId), eq(emailUnsubscribes.email, "bounce@example.com")));
  assert.equal(supp.length, 1);
});

test("passes Reply-To to Resend only when given", async () => {
  const fake = fakeResend([{ data: { id: "msg_reply_1" } }]);
  __setResendClientForTests(fake.client);
  await sendEmail({ tenantId, to: "r@example.com", subject: "s", body: "b", replyTo: "owner@example.com" });
  await sendEmail({ tenantId, to: "r@example.com", subject: "s", body: "b" });
  assert.equal(fake.calls[0].replyTo, "owner@example.com");
  assert.equal("replyTo" in fake.calls[1], false);
});
