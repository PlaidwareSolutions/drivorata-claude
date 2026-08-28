import type { Request, Response } from "express";
import { storage } from "./storage";
import { verifyResendSignature } from "./resend-webhook";
import { buildReplyToAddress } from "./contact-message-notifications";

interface InboundEvent {
  type?: string;
  data?: {
    from?: string | { email?: string; name?: string };
    to?: string | string[] | Array<string | { email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string> | Array<{ name: string; value: string }>;
    [k: string]: any;
  };
  [k: string]: any;
}

function extractEmail(addr: any): string | null {
  if (!addr) return null;
  if (typeof addr === "object") {
    if (addr.email) return String(addr.email).trim().toLowerCase();
    if (addr.address) return String(addr.address).trim().toLowerCase();
  }
  const s = String(addr).trim();
  const m = s.match(/<([^>]+)>/);
  const raw = m ? m[1] : s;
  return raw.trim().toLowerCase() || null;
}

function toAddressList(to: InboundEvent["data"] extends infer D ? (D extends { to?: infer T } ? T : never) : never): string[] {
  if (!to) return [];
  const arr = Array.isArray(to) ? to : [to];
  return arr.map(extractEmail).filter((s): s is string => !!s);
}

/**
 * Extract the per-submission token out of any `reply+<token>@...` recipient
 * address. Returns the first token found, or null.
 */
export function extractReplyToken(addresses: string[]): string | null {
  for (const addr of addresses) {
    const m = addr.match(/^reply\+([A-Za-z0-9_\-]+)@/i);
    if (m) return m[1];
  }
  return null;
}

/**
 * Best-effort stripping of quoted/forwarded content from an inbound email
 * body so the in-app thread shows only the new content the parent typed.
 * Conservative: if we can't find a clear marker, we keep the original.
 */
export function stripQuotedReply(body: string): string {
  if (!body) return body;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const cutPatterns = [
    /^On .+ wrote:\s*$/i,
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^From:\s.+/i,
    /^>+ /,
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (cutPatterns.some((p) => p.test(line))) {
      const head = lines.slice(0, i).join("\n").trimEnd();
      return head.length > 0 ? head : body.trim();
    }
  }
  return body.trim();
}

export async function processInboundEmail(event: InboundEvent): Promise<{
  handled: boolean;
  reason?: string;
  replyId?: number;
  submissionId?: number;
}> {
  const data = event?.data;
  if (!data) return { handled: false, reason: "missing data" };

  const recipients = toAddressList(data.to as any);
  const token = extractReplyToken(recipients);
  if (!token) return { handled: false, reason: "no reply token in recipients" };

  const submission = await storage.getContactSubmissionByReplyToken(token);
  if (!submission) return { handled: false, reason: "submission not found for token" };

  const fromEmail = extractEmail(data.from) || submission.email;
  const subject = (data.subject || `Re: message #${submission.id}`).slice(0, 500);
  const rawBody = data.text || htmlToText(data.html) || "";
  const body = stripQuotedReply(rawBody);
  if (!body) return { handled: false, reason: "empty body" };

  // For inbound replies, the parent wrote *to* the routed reply alias
  // (reply+<token>@…), not back to themselves. Recording that as `toEmail`
  // makes the thread direction read correctly in the admin UI.
  const inboxAddress = buildReplyToAddress(submission) || submission.email;
  const reply = await storage.createContactMessageReply({
    submissionId: submission.id,
    tenantId: submission.tenantId,
    authorUserId: null,
    authorEmail: fromEmail,
    toEmail: inboxAddress,
    subject,
    body,
  });
  await storage.updateContactMessageReplyEmailStatus(reply.id, "received", null);

  // A new reply from the parent re-opens the conversation in the inbox.
  if (submission.read) {
    await storage.updateContactSubmissionRead(submission.id, submission.tenantId, false);
  }

  return { handled: true, replyId: reply.id, submissionId: submission.id };
}

function htmlToText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\r?\n)?/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export async function handleInboundEmailWebhook(req: Request, res: Response) {
  // Allow a dedicated secret for the inbound endpoint, falling back to the
  // shared Resend webhook secret so existing setups keep working.
  const secret = process.env.INBOUND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET || "";
  if (!secret) {
    return res.status(503).json({ ok: false, message: "Inbound webhook not configured" });
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

  let event: InboundEvent;
  try {
    event = req.body && typeof req.body === "object" ? req.body : JSON.parse(
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"),
    );
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid JSON" });
  }

  try {
    const result = await processInboundEmail(event);
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[InboundEmailWebhook] processing error:", err);
    return res.status(500).json({ ok: false, message: "Processing failed" });
  }
}
