import { db } from "./db";
import { enrollments, type Enrollment, type Tenant, type Payment, type Cart, type CartItem, type Package, type ScheduleOffering } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { storage } from "./storage";
import { sendEmail } from "./email-service";
import { buildUnsubscribeUrl } from "./cart-reminders";

export type EnrollmentEmailKey = "enrollment_received" | "payment_received";

interface TemplateDef {
  key: EnrollmentEmailKey;
  label: string;
  description: string;
  defaultSubject: string;
  defaultBody: string;
  placeholders: string[];
}

const PLACEHOLDERS = [
  "{{firstName}}", "{{lastName}}", "{{schoolName}}", "{{packageName}}",
  "{{priceFormatted}}", "{{paymentMethod}}", "{{schoolPhone}}", "{{schoolEmail}}",
  "{{nextSteps}}", "{{providerUrl}}",
];

export const TEMPLATE_DEFS: Record<EnrollmentEmailKey, TemplateDef> = {
  enrollment_received: {
    key: "enrollment_received",
    label: "Enrollment Received",
    description: "Sent the moment a student starts checkout, before payment lands.",
    defaultSubject: "{{schoolName}}: We received your enrollment for {{packageName}}",
    defaultBody:
      `Hi {{firstName}},\n\n` +
      `Thanks for enrolling in {{packageName}} at {{schoolName}}. We've received your enrollment for {{priceFormatted}} via {{paymentMethod}}.\n\n` +
      `{{nextSteps}}\n\n` +
      `If you have any questions, reach us at {{schoolPhone}} or {{schoolEmail}}.\n\n` +
      `— The team at {{schoolName}}`,
    placeholders: PLACEHOLDERS,
  },
  payment_received: {
    key: "payment_received",
    label: "Payment Received",
    description: "Sent once payment lands (cash confirmed, Stripe/PayPal captured).",
    defaultSubject: "{{schoolName}}: Payment received — you're enrolled in {{packageName}}",
    defaultBody:
      `Hi {{firstName}},\n\n` +
      `Great news — we've received your payment of {{priceFormatted}} for {{packageName}}. Your enrollment at {{schoolName}} is now confirmed.\n\n` +
      `{{nextSteps}}\n\n` +
      `Questions? Call us at {{schoolPhone}} or email {{schoolEmail}}.\n\n` +
      `— The team at {{schoolName}}`,
    placeholders: PLACEHOLDERS,
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null) return "—";
  const amt = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${amt}` : `${amt} ${currency}`;
}

function paymentMethodLabel(provider: string | null | undefined): string {
  if (provider === "STRIPE") return "credit/debit card (Stripe)";
  if (provider === "PAYPAL") return "PayPal";
  if (provider === "CASH") return "cash";
  return "your selected payment method";
}

function nextStepsForReceived(provider: string | null | undefined, snapshot: any, tenant: Tenant): string {
  if (provider === "CASH") {
    const phone = tenant.phone ? ` (${tenant.phone})` : "";
    return `Your seat isn't fully confirmed until your cash payment is received. Please bring your payment to ${tenant.name}${phone} as soon as possible. We'll send a payment confirmation once it's logged.`;
  }
  if (provider === "STRIPE" || provider === "PAYPAL") {
    return `We'll email you a payment receipt as soon as ${provider === "STRIPE" ? "Stripe" : "PayPal"} processes your transaction. No further action is needed right now.`;
  }
  return `We'll be in touch shortly with the next steps for your enrollment.`;
}

function nextStepsForPaid(provider: string | null | undefined, snapshot: any): string {
  const isOnline = !!snapshot?.isOnlineCourse;
  if (isOnline && snapshot?.providerUrl) {
    return `You can start your online course here: ${snapshot.providerUrl}\n\nKeep this email — you'll need it to access your course.`;
  }
  if (isOnline) {
    return `You'll receive access details for your online course shortly.`;
  }
  return `You're all set! Your school will reach out with class times, locations, and any documents you need to bring on day one.`;
}

interface RenderContext {
  firstName: string;
  lastName: string;
  schoolName: string;
  packageName: string;
  priceFormatted: string;
  paymentMethod: string;
  schoolPhone: string;
  schoolEmail: string;
  nextSteps: string;
  providerUrl: string;
}

function applyTemplate(tpl: string, ctx: RenderContext): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const v = (ctx as any)[k];
    return v == null ? "" : String(v);
  });
}

async function getTemplate(tenantId: number, key: EnrollmentEmailKey): Promise<{ subject: string; body: string }> {
  const def = TEMPLATE_DEFS[key];
  const override = await storage.getEmailTemplate(tenantId, key);
  return {
    subject: override?.subjectOverride?.trim() || def.defaultSubject,
    body: override?.bodyOverride?.trim() || def.defaultBody,
  };
}

function buildHtmlFromText(text: string, unsubscribeUrl: string): string {
  const paragraphs = text.split(/\n{2,}/).map(p =>
    `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`
  ).join("");
  return `${paragraphs}<p style="color:#6b7280;font-size:12px;margin-top:24px">Don't want these emails? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>.</p>`;
}

async function sendOne(opts: {
  tenant: Tenant;
  recipientEmail: string;
  subject: string;
  body: string;
}): Promise<{ status: string; errorMsg?: string }> {
  const email = (opts.recipientEmail || "").trim();
  if (!email) return { status: "skipped_no_email" };
  // Note: sendEmail() handles the unsubscribe-list check itself and records a
  // skipped_unsubscribed log row, so we don't short-circuit here.
  const unsubscribeUrl = buildUnsubscribeUrl(opts.tenant.id, email);
  const html = buildHtmlFromText(opts.body, unsubscribeUrl);
  const res = await sendEmail({
    tenantId: opts.tenant.id,
    to: email,
    subject: opts.subject,
    body: opts.body + `\n\n---\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}`,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return { status: res.status, errorMsg: res.errorMsg };
}

function buildContext(args: {
  tenant: Tenant;
  firstName: string;
  lastName: string;
  packageName: string;
  priceCents: number | null | undefined;
  currency: string;
  provider: string | null | undefined;
  snapshot: any;
  forPaid: boolean;
}): RenderContext {
  const { tenant, snapshot, provider } = args;
  return {
    firstName: args.firstName || "there",
    lastName: args.lastName || "",
    schoolName: tenant.name,
    packageName: args.packageName || "your enrollment",
    priceFormatted: formatPrice(args.priceCents, args.currency),
    paymentMethod: paymentMethodLabel(provider),
    schoolPhone: tenant.phone || "",
    schoolEmail: tenant.email || "",
    nextSteps: args.forPaid
      ? nextStepsForPaid(provider, snapshot)
      : nextStepsForReceived(provider, snapshot, tenant),
    providerUrl: snapshot?.providerUrl || "",
  };
}

// Send "enrollment received" for a single existing enrollment row.
export async function sendEnrollmentReceived(
  enrollment: Enrollment,
  tenant: Tenant,
  payment: Payment | null,
): Promise<void> {
  if (enrollment.confirmationEmailSentAt) return;
  const snapshot = (enrollment.packageSnapshotJson as any) || {};
  const tpl = await getTemplate(tenant.id, "enrollment_received");
  const ctx = buildContext({
    tenant,
    firstName: enrollment.firstName,
    lastName: enrollment.lastName,
    packageName: snapshot.name || "your enrollment",
    priceCents: enrollment.priceSnapshotCents ?? payment?.amountCents ?? null,
    currency: enrollment.currencySnapshot || payment?.currency || "USD",
    provider: payment?.provider || null,
    snapshot,
    forPaid: false,
  });
  const subject = applyTemplate(tpl.subject, ctx);
  const body = applyTemplate(tpl.body, ctx);

  await sendOne({ tenant, recipientEmail: enrollment.email, subject, body });
  if (enrollment.parentEmail && enrollment.parentEmail.trim().toLowerCase() !== enrollment.email.trim().toLowerCase()) {
    await sendOne({ tenant, recipientEmail: enrollment.parentEmail, subject, body });
  }

  try {
    await db.update(enrollments)
      .set({ confirmationEmailSentAt: new Date() })
      .where(and(eq(enrollments.id, enrollment.id), eq(enrollments.tenantId, tenant.id)));
  } catch (err) {
    console.error("[EnrollmentEmails] failed to mark confirmation sent:", err);
  }
}

// For the cart flow at checkout-start (no enrollments exist yet) — we send a
// single "received" email to the cart customer.
export async function sendEnrollmentReceivedForCart(
  tenant: Tenant,
  cart: Cart,
  items: Array<CartItem & { package?: Package | null; offering?: ScheduleOffering | null }>,
  payment: Payment,
): Promise<void> {
  const cust = (cart.customerSnapshotJson as any) || {};
  const email = (cust.email || "").trim();
  if (!email) return;
  // Subject must stay single-line (many providers reject \n in subjects), so
  // build a short headline and put the multi-line bullet list only in the body.
  const headline = items.length === 0
    ? "your selected items"
    : items.length === 1
      ? (items[0].package?.name || "your course")
      : `${items.length} items (${items[0].package?.name || "Course"} + ${items.length - 1} more)`;
  const itemBullets = items.length > 0
    ? items.map(it => {
        const name = it.package?.name || "Course";
        const off = it.offering?.name ? ` — ${it.offering.name}` : "";
        return `• ${name}${off}`;
      }).join("\n")
    : "(your selected items)";
  const tpl = await getTemplate(tenant.id, "enrollment_received");
  // Render subject with the headline; render body with the bulleted list by
  // swapping in the multi-line summary just for the body context.
  const subjectCtx = buildContext({
    tenant,
    firstName: cust.firstName || "there",
    lastName: cust.lastName || "",
    packageName: headline,
    priceCents: payment.amountCents,
    currency: payment.currency || "USD",
    provider: payment.provider,
    snapshot: {},
    forPaid: false,
  });
  const bodyCtx = { ...subjectCtx, packageName: itemBullets };
  const subject = applyTemplate(tpl.subject, subjectCtx).replace(/\s*[\r\n]+\s*/g, " ").trim();
  const body = applyTemplate(tpl.body, bodyCtx);
  await sendOne({ tenant, recipientEmail: email, subject, body });
  const parentEmail = (cust.parentEmail || "").trim();
  if (parentEmail && parentEmail.toLowerCase() !== email.toLowerCase()) {
    await sendOne({ tenant, recipientEmail: parentEmail, subject, body });
  }
}

// Send "payment received" for a single enrollment. Idempotent via
// paymentReceivedEmailSentAt timestamp on the enrollment row.
export async function sendPaymentReceived(
  enrollmentId: number,
  tenantId: number,
): Promise<void> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return;
  const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
  if (!enrollment) return;
  if (enrollment.paymentReceivedEmailSentAt) return;

  // Atomically claim the send slot to prevent duplicate sends from concurrent
  // webhook retries. Only one update will return a row when the column is null.
  const [claimed] = await db.update(enrollments)
    .set({ paymentReceivedEmailSentAt: new Date() })
    .where(and(
      eq(enrollments.id, enrollmentId),
      eq(enrollments.tenantId, tenantId),
      isNull(enrollments.paymentReceivedEmailSentAt),
    ))
    .returning();
  if (!claimed) return;

  const snapshot = (enrollment.packageSnapshotJson as any) || {};
  let provider: string | null = null;
  try {
    const payments = await storage.getPaymentsByEnrollment(enrollmentId);
    const completed = payments.find(p => p.status === "COMPLETED") || payments[0];
    provider = completed?.provider || null;
  } catch {}

  const tpl = await getTemplate(tenant.id, "payment_received");
  const ctx = buildContext({
    tenant,
    firstName: enrollment.firstName,
    lastName: enrollment.lastName,
    packageName: snapshot.name || "your enrollment",
    priceCents: enrollment.amountPaid ?? enrollment.priceSnapshotCents ?? null,
    currency: enrollment.currencySnapshot || "USD",
    provider,
    snapshot,
    forPaid: true,
  });
  const subject = applyTemplate(tpl.subject, ctx);
  const body = applyTemplate(tpl.body, ctx);

  await sendOne({ tenant, recipientEmail: enrollment.email, subject, body });
  if (enrollment.parentEmail && enrollment.parentEmail.trim().toLowerCase() !== enrollment.email.trim().toLowerCase()) {
    await sendOne({ tenant, recipientEmail: enrollment.parentEmail, subject, body });
  }
}

// Fire-and-forget wrapper used from request handlers/webhooks so email work
// never blocks the HTTP response or webhook ack.
export function fireAndForget(fn: () => Promise<void>, label: string): void {
  fn().catch(err => console.error(`[EnrollmentEmails] ${label} failed:`, err));
}
