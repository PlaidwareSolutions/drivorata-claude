import { storage } from "./storage";
import { sendEmail } from "./email-service";
import { db } from "./db";
import { tenantMembers, users, type ContactSubmission, type Tenant } from "@shared/schema";
import { and, eq, or } from "drizzle-orm";

/**
 * Build the per-submission reply-to address. Inbound mail sent here is
 * matched back to the originating submission via its `replyToken` and
 * appended to the in-app thread by the inbound webhook.
 */
export function buildReplyToAddress(submission: ContactSubmission): string | null {
  if (!submission.replyToken) return null;
  const domain =
    process.env.INBOUND_REPLY_DOMAIN ||
    extractDomainFromAddress(process.env.SESSION_EMAIL_FROM) ||
    "drivorata.com";
  return `reply+${submission.replyToken}@${domain}`;
}

function extractDomainFromAddress(addr: string | undefined): string | null {
  if (!addr) return null;
  const m = addr.match(/<([^>]+)>\s*$/);
  const email = (m ? m[1] : addr).trim();
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1) || null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dash(v: any): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s.length === 0 ? "—" : s;
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return "—";
    return dt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return "—";
  }
}

interface AdminRecipient {
  email: string;
  userId: string | null;
}

async function getAdminRecipients(tenantId: number): Promise<AdminRecipient[]> {
  const rows = await db
    .select({
      userId: tenantMembers.userId,
      emailInvited: tenantMembers.emailInvited,
      userEmail: users.email,
    })
    .from(tenantMembers)
    .leftJoin(users, eq(tenantMembers.userId, users.id))
    .where(and(
      eq(tenantMembers.tenantId, tenantId),
      eq(tenantMembers.status, "ACTIVE"),
      or(eq(tenantMembers.role, "tenant_admin"), eq(tenantMembers.role, "office_manager")),
    ));

  const seen = new Set<string>();
  const out: AdminRecipient[] = [];
  for (const r of rows) {
    const email = (r.userEmail || r.emailInvited || "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email, userId: r.userId ?? null });
  }
  return out;
}

export async function sendAdminContactNotification(
  submission: ContactSubmission,
  tenant: Tenant,
): Promise<void> {
  const recipients = await getAdminRecipients(tenant.id);
  if (recipients.length === 0) return;

  const headline = submission.name || submission.email || `Message #${submission.id}`;
  const subject = `[${tenant.name}] New contact message from ${headline}`;
  const baseUrl = process.env.APP_BASE_URL || "https://drivorata.com";
  const messageLink = `${baseUrl.replace(/\/$/, "")}/admin/messages/${submission.id}`;

  const textLines = [
    `New contact message at ${tenant.name}`,
    "",
    `From: ${dash(submission.name)} <${dash(submission.email)}>`,
    `Phone: ${dash(submission.phone)}`,
    `Received: ${formatDateTime(submission.createdAt)}`,
    "",
    "Message:",
    submission.message,
    "",
    `Open in your school admin: ${messageLink}`,
    `Or reply directly to ${submission.email}.`,
  ];

  const html =
    `<p style="margin:0 0 4px 0;color:#6b7280;font-size:12px">${escapeHtml(tenant.name)}</p>` +
    `<h2 style="margin:0 0 16px 0;font-size:18px">New contact message — ${escapeHtml(headline)}</h2>` +
    `<table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e7eb;border-radius:6px">` +
    `<tr><td style="padding:6px 12px;color:#6b7280;width:35%">Name</td><td style="padding:6px 12px">${escapeHtml(dash(submission.name))}</td></tr>` +
    `<tr><td style="padding:6px 12px;color:#6b7280;border-top:1px solid #f3f4f6">Email</td><td style="padding:6px 12px;border-top:1px solid #f3f4f6"><a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a></td></tr>` +
    `<tr><td style="padding:6px 12px;color:#6b7280;border-top:1px solid #f3f4f6">Phone</td><td style="padding:6px 12px;border-top:1px solid #f3f4f6">${escapeHtml(dash(submission.phone))}</td></tr>` +
    `<tr><td style="padding:6px 12px;color:#6b7280;border-top:1px solid #f3f4f6">Received</td><td style="padding:6px 12px;border-top:1px solid #f3f4f6">${escapeHtml(formatDateTime(submission.createdAt))}</td></tr>` +
    `</table>` +
    `<h3 style="margin:18px 0 6px 0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#374151">Message</h3>` +
    `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:6px;white-space:pre-wrap;font-size:14px">${escapeHtml(submission.message)}</div>` +
    `<p style="margin-top:16px"><a href="${escapeHtml(messageLink)}" style="display:inline-block;padding:8px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">Open in admin</a></p>` +
    `<p style="margin-top:8px;color:#6b7280;font-size:13px">Or reply directly to <a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a>.</p>`;

  for (const r of recipients) {
    try {
      await sendEmail({
        tenantId: tenant.id,
        to: r.email,
        recipientUserId: r.userId,
        subject,
        body: textLines.join("\n"),
        html,
        headers: (() => {
          const replyAddr = buildReplyToAddress(submission);
          if (replyAddr) return { "Reply-To": replyAddr };
          return submission.email ? { "Reply-To": submission.email } : undefined;
        })(),
      });
    } catch (err) {
      console.error(`[ContactAdminNotification] send to ${r.email} failed:`, err);
    }
  }
}

export interface SendContactReplyInput {
  submission: ContactSubmission;
  tenant: Tenant;
  subject: string;
  body: string;
  fromEmail?: string | null;
  actorUserId?: string | null;
}

export async function sendContactReplyEmail(input: SendContactReplyInput) {
  const { submission, tenant, subject, body, fromEmail, actorUserId } = input;

  const quotedDate = formatDateTime(submission.createdAt);
  const quotedHeader = `On ${quotedDate}, ${submission.name || submission.email} wrote:`;
  const quotedPlain = submission.message
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

  const textBody =
    `${body.trim()}\n\n` +
    `— The team at ${tenant.name}\n\n` +
    `------------------------------\n` +
    `${quotedHeader}\n${quotedPlain}\n`;

  const html =
    `<div style="font-size:14px;white-space:pre-wrap">${escapeHtml(body.trim())}</div>` +
    `<p style="margin-top:16px;color:#6b7280;font-size:13px">— The team at ${escapeHtml(tenant.name)}</p>` +
    `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>` +
    `<p style="color:#6b7280;font-size:12px;margin:0 0 6px 0">${escapeHtml(quotedHeader)}</p>` +
    `<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #e5e7eb;color:#4b5563;white-space:pre-wrap;font-size:13px">${escapeHtml(submission.message)}</blockquote>`;

  return sendEmail({
    tenantId: tenant.id,
    to: submission.email,
    subject,
    body: textBody,
    html,
    actorUserId: actorUserId ?? null,
    headers: (() => {
      const replyAddr = buildReplyToAddress(submission);
      if (replyAddr) return { "Reply-To": replyAddr };
      return fromEmail ? { "Reply-To": fromEmail } : undefined;
    })(),
  });
}

export async function sendContactConfirmationToSender(
  submissionId: number,
  tenant: Tenant,
): Promise<void> {
  // Atomic claim — prevents double-send on concurrent retries.
  const claimed = await storage.claimContactConfirmationEmailSend(submissionId, tenant.id);
  if (!claimed) return;
  if (!claimed.email) return;

  const subject = `${tenant.name}: We received your message`;
  const textBody =
    `Hi ${claimed.name || "there"},\n\n` +
    `Thanks for reaching out to ${tenant.name}. We've received your message and a member of our team will get back to you as soon as possible.\n\n` +
    `Here's a copy of what you sent us:\n\n` +
    `${claimed.message}\n\n` +
    (tenant.phone || tenant.email
      ? `If you need us sooner, you can reach us${tenant.phone ? ` at ${tenant.phone}` : ""}${tenant.phone && tenant.email ? " or" : ""}${tenant.email ? ` by email at ${tenant.email}` : ""}.\n\n`
      : "") +
    `— The team at ${tenant.name}`;

  const html =
    `<p>Hi ${escapeHtml(claimed.name || "there")},</p>` +
    `<p>Thanks for reaching out to <strong>${escapeHtml(tenant.name)}</strong>. We've received your message and a member of our team will get back to you as soon as possible.</p>` +
    `<p style="color:#6b7280;font-size:13px;margin-bottom:4px">Here's a copy of what you sent us:</p>` +
    `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:6px;white-space:pre-wrap;font-size:14px;background:#f9fafb">${escapeHtml(claimed.message)}</div>` +
    (tenant.phone || tenant.email
      ? `<p style="margin-top:16px">If you need us sooner, you can reach us${tenant.phone ? ` at <strong>${escapeHtml(tenant.phone)}</strong>` : ""}${tenant.phone && tenant.email ? " or" : ""}${tenant.email ? ` by email at <a href="mailto:${escapeHtml(tenant.email)}">${escapeHtml(tenant.email)}</a>` : ""}.</p>`
      : "") +
    `<p style="color:#6b7280;font-size:13px">— The team at ${escapeHtml(tenant.name)}</p>`;

  try {
    await sendEmail({
      tenantId: tenant.id,
      to: claimed.email,
      subject,
      body: textBody,
      html,
    });
  } catch (err) {
    console.error(`[ContactConfirmationEmail] send to ${claimed.email} failed:`, err);
    // Roll back the claim so a future retry can re-attempt and the UI
    // doesn't falsely show "sent" when delivery actually failed.
    try {
      await storage.releaseContactConfirmationEmailSend(submissionId, tenant.id);
    } catch (releaseErr) {
      console.error(`[ContactConfirmationEmail] failed to release claim for #${submissionId}:`, releaseErr);
    }
  }
}
