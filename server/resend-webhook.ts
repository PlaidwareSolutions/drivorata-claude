import type { Request, Response } from "express";
import crypto from "crypto";
import { storage } from "./storage";

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked";

interface ResendEvent {
  type: ResendEventType | string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string | string[];
    subject?: string;
    [k: string]: any;
  };
}

const SUPPRESSION_SOURCES: Record<string, string> = {
  "email.bounced": "bounce",
  "email.complained": "complaint",
};

function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const base64Part = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  try {
    return Buffer.from(base64Part, "base64");
  } catch {
    return Buffer.from(base64Part, "utf8");
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a Resend (Svix) webhook signature.
 * Returns true if valid, false otherwise.
 */
export function verifyResendSignature(opts: {
  secret: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string | Buffer;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  const { secret, svixId, svixTimestamp, svixSignature, rawBody } = opts;
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;

  const tolerance = opts.toleranceSeconds ?? 5 * 60;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > tolerance) return false;

  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedPayload = `${svixId}.${svixTimestamp}.${bodyStr}`;
  const key = decodeWebhookSecret(secret);
  const expected = crypto.createHmac("sha256", key).update(signedPayload).digest("base64");

  // svix-signature header format: "v1,<base64sig> v1,<base64sig> ..."
  const parts = svixSignature.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf(",");
    if (idx < 0) continue;
    const version = part.slice(0, idx);
    const sig = part.slice(idx + 1);
    if (version !== "v1") continue;
    if (timingSafeEqualStr(sig, expected)) return true;
  }
  return false;
}

function extractRecipients(to: string | string[] | undefined): string[] {
  if (!to) return [];
  const arr = Array.isArray(to) ? to : [to];
  return arr
    .map(s => (s || "").trim().toLowerCase())
    .filter(s => s.length > 0);
}

/**
 * Resolve which tenant an event belongs to. We look up the email by its
 * Resend message id (saved as `providerMessageId` on `session_change_emails`
 * for every email the platform sends). If we can't find a match the event
 * is dropped — without a tenant we have nowhere to record the suppression.
 */
async function resolveTenantId(emailId: string | undefined): Promise<number | null> {
  if (!emailId) return null;
  const row = await storage.getSessionChangeEmailByProviderMessageId(emailId);
  return row?.tenantId ?? null;
}

export async function processResendEvent(event: ResendEvent): Promise<{
  handled: boolean;
  reason?: string;
  tenantId?: number;
  suppressed?: string[];
}> {
  const type = event.type;
  if (!type) return { handled: false, reason: "missing type" };

  // Delivered events: nothing to do beyond acknowledgement (could be used for
  // analytics later).
  if (type === "email.delivered") {
    return { handled: true };
  }

  const source = SUPPRESSION_SOURCES[type];
  if (!source) {
    return { handled: false, reason: `unhandled type ${type}` };
  }

  const recipients = extractRecipients(event.data?.to);
  if (recipients.length === 0) {
    return { handled: false, reason: "no recipients" };
  }

  const tenantId = await resolveTenantId(event.data?.email_id);
  if (!tenantId) {
    return { handled: false, reason: "tenant not resolved" };
  }

  for (const email of recipients) {
    await storage.addEmailUnsubscribe({
      tenantId,
      email,
      source,
    });
    try {
      await storage.createAuditEvent({
        tenantId,
        actorUserId: "system:resend-webhook",
        action: "email.suppressed",
        targetType: "EMAIL",
        targetId: 0,
        details: {
          email,
          source,
          eventType: type,
          providerMessageId: event.data?.email_id || null,
        },
      });
    } catch {}
  }

  return { handled: true, tenantId, suppressed: recipients };
}

export async function handleResendWebhook(req: Request, res: Response) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  if (!secret) {
    return res.status(503).json({ ok: false, message: "Webhook not configured" });
  }

  const svixId = String(req.headers["svix-id"] || "");
  const svixTimestamp = String(req.headers["svix-timestamp"] || "");
  const svixSignature = String(req.headers["svix-signature"] || "");

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    return res.status(400).json({ ok: false, message: "Missing raw body" });
  }

  const valid = verifyResendSignature({
    secret,
    svixId,
    svixTimestamp,
    svixSignature,
    rawBody,
  });
  if (!valid) {
    return res.status(401).json({ ok: false, message: "Invalid signature" });
  }

  let event: ResendEvent;
  try {
    event = req.body && typeof req.body === "object" ? req.body : JSON.parse(
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"),
    );
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid JSON" });
  }

  try {
    const result = await processResendEvent(event);
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[ResendWebhook] processing error:", err);
    return res.status(500).json({ ok: false, message: "Processing failed" });
  }
}
