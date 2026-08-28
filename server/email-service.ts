import { db } from "./db";
import { sessionChangeEmails, sessionActivityLog, emailUnsubscribes, type InsertSessionChangeEmail } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export interface SendEmailInput {
  tenantId: number;
  to: string;
  recipientUserId?: string | null;
  subject: string;
  body: string;
  html?: string | null;
  sessionId?: number | null;
  bookingId?: number | null;
  actorUserId?: string | null;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  status: "sent" | "skipped_no_provider" | "skipped_unsubscribed" | "failed";
  emailId: number;
  errorMsg?: string;
}

const DEFAULT_SENDER = "no-reply@drivorata.com";

export interface EffectiveSender {
  email: string;
  isDefault: boolean;
  source: "tenant" | "env" | "default";
}

export function getEffectiveSender(_tenantId: number): EffectiveSender {
  const envFrom = process.env.SESSION_EMAIL_FROM?.trim();
  if (envFrom) {
    return {
      email: envFrom,
      isDefault: envFrom.toLowerCase() === DEFAULT_SENDER.toLowerCase(),
      source: "env",
    };
  }
  return { email: DEFAULT_SENDER, isDefault: true, source: "default" };
}

let resendLoaded = false;
let resendClient: any = null;

async function tryLoadResend(): Promise<any | null> {
  if (resendLoaded) return resendClient;
  resendLoaded = true;
  if (!process.env.RESEND_API_KEY) return null;
  // Safety: never contact Resend from a test run, even if RESEND_API_KEY is
  // present in the inherited env. Test suites enroll fake students with
  // @test.local addresses and would otherwise hard-bounce real emails on every
  // run, exhausting the daily quota.
  if (process.env.NODE_ENV === "test" || process.env.TEST_AUTH_BYPASS === "1") {
    return null;
  }
  try {
    const mod: any = await import("resend");
    const Ctor = mod.Resend || mod.default?.Resend;
    if (!Ctor) return null;
    resendClient = new Ctor(process.env.RESEND_API_KEY);
    return resendClient;
  } catch {
    resendClient = null;
    return null;
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const insertVals: InsertSessionChangeEmail = {
    tenantId: input.tenantId,
    sessionId: input.sessionId ?? null,
    bookingId: input.bookingId ?? null,
    recipientEmail: input.to,
    recipientUserId: input.recipientUserId ?? null,
    subject: input.subject,
    body: input.body,
    status: "queued",
  };

  const [row] = await db.insert(sessionChangeEmails).values(insertVals).returning();

  // Suppression check: if this recipient is on the tenant's unsubscribe list,
  // log a row with skipped_unsubscribed and return without contacting the
  // provider. This keeps the email log complete (sent / skipped / failed) for
  // audit purposes.
  const normalizedEmail = input.to.trim().toLowerCase();
  const [supp] = await db
    .select({ id: emailUnsubscribes.id })
    .from(emailUnsubscribes)
    .where(and(
      eq(emailUnsubscribes.tenantId, input.tenantId),
      sql`lower(${emailUnsubscribes.email}) = ${normalizedEmail}`,
    ))
    .limit(1);
  if (supp) {
    await db.update(sessionChangeEmails)
      .set({ status: "skipped_unsubscribed", errorMsg: "Recipient on unsubscribe list" })
      .where(eq(sessionChangeEmails.id, row.id));
    return { status: "skipped_unsubscribed", emailId: row.id };
  }

  const fromAddr = getEffectiveSender(input.tenantId).email;
  const resend = await tryLoadResend();

  if (!resend) {
    await db.update(sessionChangeEmails)
      .set({ status: "skipped_no_provider", errorMsg: "RESEND_API_KEY not configured" })
      .where(eq(sessionChangeEmails.id, row.id));
    if (input.sessionId) {
      await db.insert(sessionActivityLog).values({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        action: "email_skipped",
        actorUserId: input.actorUserId ?? null,
        message: `Email skipped — no provider configured (queued) to ${input.to}: ${input.subject}`,
        payload: { emailId: row.id, recipient: input.to, providerStatus: "skipped_no_provider" },
      });
    }
    return { status: "skipped_no_provider", emailId: row.id };
  }

  try {
    const sendPayload: any = {
      from: fromAddr,
      to: input.to,
      subject: input.subject,
      text: input.body,
      ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
    };
    if (input.html) sendPayload.html = input.html;
    const resp: any = await resend.emails.send(sendPayload);
    if (resp?.error) {
      throw new Error(resp.error.message || resp.error.name || "Resend error");
    }
    const messageId = resp?.data?.id || resp?.id || null;
    await db.update(sessionChangeEmails)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: messageId })
      .where(eq(sessionChangeEmails.id, row.id));
    if (input.sessionId) {
      await db.insert(sessionActivityLog).values({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        action: "email_sent",
        actorUserId: input.actorUserId ?? null,
        message: `Email sent to ${input.to}: ${input.subject}`,
        payload: { emailId: row.id, recipient: input.to, providerStatus: "sent" },
      });
    }
    return { status: "sent", emailId: row.id };
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    await db.update(sessionChangeEmails)
      .set({ status: "failed", errorMsg: errMsg })
      .where(eq(sessionChangeEmails.id, row.id));
    if (input.sessionId) {
      await db.insert(sessionActivityLog).values({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        action: "email_failed",
        actorUserId: input.actorUserId ?? null,
        message: `Failed to send email to ${input.to}: ${errMsg}`,
        payload: { emailId: row.id, recipient: input.to },
      });
    }
    return { status: "failed", emailId: row.id, errorMsg: errMsg };
  }
}

export async function getSessionEmails(tenantId: number, sessionId: number) {
  const { scheduleSessions } = await import("@shared/schema");
  const { inArray } = await import("drizzle-orm");
  const [thisSession] = await db.select().from(scheduleSessions)
    .where(and(eq(scheduleSessions.tenantId, tenantId), eq(scheduleSessions.id, sessionId)));
  const linkedIds = new Set<number>([sessionId]);
  if (thisSession?.rescheduledFromSessionId) linkedIds.add(thisSession.rescheduledFromSessionId);
  const replacements = await db.select().from(scheduleSessions)
    .where(and(eq(scheduleSessions.tenantId, tenantId), eq(scheduleSessions.rescheduledFromSessionId, sessionId)));
  for (const r of replacements) linkedIds.add(r.id);
  return db.select().from(sessionChangeEmails)
    .where(and(eq(sessionChangeEmails.tenantId, tenantId), inArray(sessionChangeEmails.sessionId, Array.from(linkedIds))))
    .orderBy(desc(sessionChangeEmails.createdAt));
}

export async function getSessionActivity(tenantId: number, sessionId: number) {
  return db.select().from(sessionActivityLog)
    .where(and(eq(sessionActivityLog.tenantId, tenantId), eq(sessionActivityLog.sessionId, sessionId)))
    .orderBy(desc(sessionActivityLog.createdAt));
}
