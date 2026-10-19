import { db } from "./db";
import { enrollments, type Enrollment, type Tenant, type Payment, type Cart, type CartItem, type Package, type ScheduleOffering } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { storage } from "./storage";
import { sendEmail } from "./email-service";
import { buildUnsubscribeUrl } from "./cart-reminders";
import {
  classDateLines,
  loadEnrollmentContext,
  locationLine,
  paymentMethodLabel,
  type EnrollmentContext,
} from "./enrollment-context";
import { formatClassDate, type PurchaseItem } from "./payments/checkout-reference";

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
  "{{reference}}", "{{className}}", "{{classDates}}", "{{locationName}}", "{{locationPhone}}",
  "{{enrollmentDetails}}",
];

// {{enrollmentDetails}} is the block that answers "what did I sign up for,
// when and where": reference, class, every session date, location and amount.
// A school's custom template that predates it gets the block appended, so no
// confirmation goes out without the class and date.
const DETAILS_PLACEHOLDER = "{{enrollmentDetails}}";

export const TEMPLATE_DEFS: Record<EnrollmentEmailKey, TemplateDef> = {
  enrollment_received: {
    key: "enrollment_received",
    label: "Enrollment Received",
    description:
      "Sent when an enrollment is recorded before any payment: a cash reservation (pay at the office) " +
      "or an enrollment added without payment. Card checkouts don't get this email — they get Payment Received once paid.",
    defaultSubject: "{{schoolName}}: We received your enrollment for {{packageName}}",
    defaultBody:
      `Hi {{firstName}},\n\n` +
      `Thanks for enrolling in {{packageName}} at {{schoolName}}.\n\n` +
      `{{nextSteps}}\n\n` +
      `{{enrollmentDetails}}\n\n` +
      `If you have any questions, reach us at {{schoolPhone}} or {{schoolEmail}}.\n\n` +
      `— The team at {{schoolName}}`,
    placeholders: PLACEHOLDERS,
  },
  payment_received: {
    key: "payment_received",
    label: "Payment Received",
    description: "Sent once payment lands (cash confirmed, Stripe/PayPal captured). This is the enrollment confirmation.",
    defaultSubject: "{{schoolName}}: You're enrolled in {{packageName}} — payment received",
    defaultBody:
      `Hi {{firstName}},\n\n` +
      `We've received your payment of {{priceFormatted}} and your enrollment at {{schoolName}} is confirmed.\n\n` +
      `{{enrollmentDetails}}\n\n` +
      `{{nextSteps}}\n\n` +
      `Questions? Call us at {{schoolPhone}} or email {{schoolEmail}}, and mention your reference {{reference}}.\n\n` +
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

function nextStepsForReceived(provider: string | null | undefined, phone: string, tenant: Tenant): string {
  if (provider === "CASH") {
    const at = phone ? ` (${phone})` : "";
    return `Your seat is reserved but NOT confirmed until we receive your cash payment. Please bring your payment to ${tenant.name}${at} as soon as possible. We'll email you a confirmation once it's received.`;
  }
  return `We'll be in touch shortly with the next steps for your enrollment.`;
}

function nextStepsForPaid(snapshot: any, hasClassDates: boolean): string {
  const isOnline = !!snapshot?.isOnlineCourse;
  if (isOnline && snapshot?.providerUrl) {
    return `You can start your online course here: ${snapshot.providerUrl}\n\nKeep this email — you'll need it to access your course.`;
  }
  if (isOnline) {
    return `You'll receive access details for your online course shortly.`;
  }
  return hasClassDates
    ? `Please arrive a few minutes early on your first day. If you can't make a date, call us as soon as possible.`
    : `We'll contact you to schedule your sessions.`;
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
  reference: string;
  className: string;
  classDates: string;
  locationName: string;
  locationPhone: string;
  enrollmentDetails: string;
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
  let body = override?.bodyOverride?.trim() || def.defaultBody;
  if (!body.includes(DETAILS_PLACEHOLDER)) body = `${body}\n\n${DETAILS_PLACEHOLDER}`;
  return {
    subject: override?.subjectOverride?.trim() || def.defaultSubject,
    body,
  };
}

function render(tpl: { subject: string; body: string }, ctx: RenderContext) {
  return {
    // Subjects must stay single-line (providers reject \n in subjects).
    subject: applyTemplate(tpl.subject, ctx).replace(/\s*[\r\n]+\s*/g, " ").trim(),
    // Collapse the blank paragraphs left by empty placeholders.
    body: applyTemplate(tpl.body, ctx).replace(/\n{3,}/g, "\n\n").trim(),
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

async function sendToStudentAndParent(tenant: Tenant, email: string, parentEmail: string | null | undefined, msg: { subject: string; body: string }) {
  await sendOne({ tenant, recipientEmail: email, ...msg });
  if (parentEmail && parentEmail.trim() && parentEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    await sendOne({ tenant, recipientEmail: parentEmail, ...msg });
  }
}

function detailsBlock(lines: Array<[string, string | string[] | null | undefined]>): string {
  const out: string[] = [];
  for (const [label, value] of lines) {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) {
      out.push(value.length === 1 ? `${label}: ${value[0]}` : `${label}:\n${value.map((v) => `  • ${v}`).join("\n")}`);
    } else {
      out.push(`${label}: ${value}`);
    }
  }
  return out.join("\n");
}

function contextFromEnrollment(ctx: EnrollmentContext, opts: { paid: boolean }): RenderContext {
  const { enrollment, tenant, payment, offering, location } = ctx;
  const snapshot = (enrollment.packageSnapshotJson as any) || {};
  const packageName = snapshot.name || "your enrollment";
  const dates = classDateLines(ctx);
  // What the customer was actually charged: the completed payment's gross
  // (incl. any service fee). A cart payment covers the whole order.
  const paidPayment = payment?.status === "COMPLETED" ? payment : null;
  const priceCents = opts.paid
    ? paidPayment?.amountCents ?? enrollment.amountPaid ?? enrollment.priceSnapshotCents
    : enrollment.priceSnapshotCents ?? payment?.amountCents ?? null;
  const amountLabel = !opts.paid ? "Amount due" : paidPayment?.cartId ? "Total paid (this order)" : "Amount paid";
  const currency = enrollment.currencySnapshot || payment?.currency || "USD";
  const provider = payment?.provider ?? null;

  return {
    firstName: enrollment.firstName || "there",
    lastName: enrollment.lastName || "",
    schoolName: tenant.name,
    packageName,
    priceFormatted: formatPrice(priceCents, currency),
    paymentMethod: paymentMethodLabel(provider),
    schoolPhone: ctx.contactPhone,
    schoolEmail: ctx.contactEmail,
    nextSteps: opts.paid ? nextStepsForPaid(snapshot, dates.length > 0) : nextStepsForReceived(provider, ctx.contactPhone, tenant),
    providerUrl: snapshot.providerUrl || "",
    reference: ctx.reference || "",
    className: offering?.name || "",
    classDates: dates.join("\n"),
    locationName: location?.name || "",
    locationPhone: location?.phone || "",
    enrollmentDetails: detailsBlock([
      ["Reference", ctx.reference],
      ["Course", packageName],
      ["Class", offering?.name && offering.name !== packageName ? offering.name : null],
      [dates.length > 1 ? "Dates" : "Date", dates],
      ["Location", locationLine(location)],
      [amountLabel, priceCents != null ? `${formatPrice(priceCents, currency)}${provider ? ` (${paymentMethodLabel(provider)})` : ""}` : null],
    ]),
  };
}

// Send "enrollment received" for a single existing enrollment row. Card
// checkouts no longer call this: an unpaid card checkout is not an enrollment.
export async function sendEnrollmentReceived(
  enrollment: Enrollment,
  tenant: Tenant,
  _payment: Payment | null,
): Promise<void> {
  if (enrollment.confirmationEmailSentAt) return;
  const ctx = await loadEnrollmentContext(enrollment.id, tenant.id);
  if (!ctx) return;
  const msg = render(await getTemplate(tenant.id, "enrollment_received"), contextFromEnrollment(ctx, { paid: false }));

  await sendToStudentAndParent(tenant, enrollment.email, enrollment.parentEmail, msg);

  try {
    await db.update(enrollments)
      .set({ confirmationEmailSentAt: new Date() })
      .where(and(eq(enrollments.id, enrollment.id), eq(enrollments.tenantId, tenant.id)));
  } catch (err) {
    console.error("[EnrollmentEmails] failed to mark confirmation sent:", err);
  }
}

// Cash cart checkout (no enrollments exist until the cash is confirmed): one
// "received" email to the cart customer, listing each item, class and date.
export async function sendEnrollmentReceivedForCart(
  tenant: Tenant,
  cart: Cart,
  items: Array<CartItem & { package?: Package | null; offering?: ScheduleOffering | null }>,
  payment: Payment,
): Promise<void> {
  const cust = (cart.customerSnapshotJson as any) || {};
  const email = (cust.email || "").trim();
  if (!email) return;
  const headline = items.length === 0
    ? "your selected items"
    : items.length === 1
      ? (items[0].package?.name || "your course")
      : `${items.length} items (${items[0].package?.name || "Course"} + ${items.length - 1} more)`;

  const purchase = (((payment.metadataJson as any)?.purchase) || []) as PurchaseItem[];
  const itemLines = purchase.length
    ? purchase.map((it) =>
        [it.className && it.className !== it.name ? `${it.name}: ${it.className}` : it.name, it.locationName, it.startsAt ? formatClassDate(it.startsAt, it.timezone) : null]
          .filter(Boolean)
          .join(" — "),
      )
    : items.map((it) => [it.package?.name || "Course", it.offering?.name].filter(Boolean).join(" — "));
  const location = cart.locationId ? await storage.getLocation(cart.locationId) : null;
  const phone = location?.phone || tenant.phone || "";

  const ctx: RenderContext = {
    firstName: cust.firstName || "there",
    lastName: cust.lastName || "",
    schoolName: tenant.name,
    packageName: headline,
    priceFormatted: formatPrice(payment.amountCents, payment.currency || "USD"),
    paymentMethod: paymentMethodLabel(payment.provider),
    schoolPhone: phone,
    schoolEmail: location?.email || tenant.email || "",
    nextSteps: nextStepsForReceived(payment.provider, phone, tenant),
    providerUrl: "",
    reference: payment.reference || "",
    className: purchase.find((p) => p.className)?.className || "",
    classDates: purchase.filter((p) => p.startsAt).map((p) => formatClassDate(p.startsAt!, p.timezone)).join("\n"),
    locationName: location?.name || purchase.find((p) => p.locationName)?.locationName || "",
    locationPhone: location?.phone || "",
    enrollmentDetails: detailsBlock([
      ["Reference", payment.reference],
      [itemLines.length > 1 ? "Items" : "Item", itemLines],
      ["Amount due", formatPrice(payment.amountCents, payment.currency || "USD")],
    ]),
  };
  const msg = render(await getTemplate(tenant.id, "enrollment_received"), ctx);
  await sendToStudentAndParent(tenant, email, cust.parentEmail, msg);
}

// Send "payment received" — the enrollment confirmation — for a single
// enrollment. Idempotent via paymentReceivedEmailSentAt on the enrollment row.
export async function sendPaymentReceived(
  enrollmentId: number,
  tenantId: number,
): Promise<void> {
  const ctx = await loadEnrollmentContext(enrollmentId, tenantId);
  if (!ctx) return;
  if (ctx.enrollment.paymentReceivedEmailSentAt) return;

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

  const msg = render(await getTemplate(tenantId, "payment_received"), contextFromEnrollment(ctx, { paid: true }));
  await sendToStudentAndParent(ctx.tenant, ctx.enrollment.email, ctx.enrollment.parentEmail, msg);
}

// Fire-and-forget wrapper used from request handlers/webhooks so email work
// never blocks the HTTP response or webhook ack.
export function fireAndForget(fn: () => Promise<void>, label: string): void {
  fn().catch(err => console.error(`[EnrollmentEmails] ${label} failed:`, err));
}
