import { db } from "./db";
import { enrollments, payments, tenantMembers, users, type Payment, type Tenant } from "@shared/schema";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { storage } from "./storage";
import { sendEmail, type EmailKind } from "./email-service";
import { platformBaseUrl } from "./lib/request";
import {
  classDateLines,
  formatLocalDateTime,
  loadEnrollmentContext,
  locationLine,
  paymentMethodLabel,
  type EnrollmentContext,
} from "./enrollment-context";
import { formatClassDate, type PurchaseItem } from "./payments/checkout-reference";

// Owner notifications. Each subject starts with the payment state so a
// started-but-unpaid checkout can never be mistaken for a sale:
//   PAID      — payment completed, enrollment confirmed (sent once per enrollment)
//   CASH DUE  — seat reserved, cash to be collected
//   NOT PAID  — card checkout started but never paid (follow-up lead)
//   NEW       — enrollment recorded with no payment involved (admin/manual)

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

function formatCents(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null || isNaN(Number(cents))) return "—";
  const amt = (Number(cents) / 100).toFixed(2);
  return currency === "USD" ? `$${amt}` : `${amt} ${currency}`;
}

function shortDate(iso: Date | string, timezone: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone });
}

function ageAtPurchase(dob: string | null | undefined, asOf: Date | string | null | undefined): number | null {
  if (!dob || !asOf) return null;
  const birth = new Date(dob);
  const ref = typeof asOf === "string" ? new Date(asOf) : asOf;
  if (isNaN(birth.getTime()) || isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

interface AdminRecipient {
  email: string;
  userId: string | null;
}

async function getAdminRecipients(tenant: Tenant): Promise<AdminRecipient[]> {
  const rows = await db
    .select({
      userId: tenantMembers.userId,
      emailInvited: tenantMembers.emailInvited,
      userEmail: users.email,
    })
    .from(tenantMembers)
    .leftJoin(users, eq(tenantMembers.userId, users.id))
    .where(and(
      eq(tenantMembers.tenantId, tenant.id),
      eq(tenantMembers.status, "ACTIVE"),
      or(eq(tenantMembers.role, "tenant_admin"), eq(tenantMembers.role, "office_manager")),
    ));

  const seen = new Set<string>();
  const out: AdminRecipient[] = [];
  const add = (email: string | null | undefined, userId: string | null) => {
    const e = (email || "").trim();
    if (!e || seen.has(e.toLowerCase())) return;
    seen.add(e.toLowerCase());
    out.push({ email: e, userId });
  };
  for (const extra of tenant.enrollmentNotificationEmails ?? []) add(extra, null);
  for (const r of rows) add(r.userEmail || r.emailInvited, r.userId ?? null);
  return out;
}

interface SummaryRow {
  label: string;
  value: string;
}
type Section = { title: string; rows: SummaryRow[] };

function renderTextBody(banner: string, schoolName: string, sections: Section[], link: string | null): string {
  const lines: string[] = [banner, schoolName, ""];
  for (const sec of sections) {
    lines.push(`== ${sec.title} ==`);
    for (const row of sec.rows) lines.push(row.label ? `${row.label}: ${row.value}` : row.value);
    lines.push("");
  }
  if (link) lines.push(`Open in admin: ${link}`);
  return lines.join("\n").trimEnd();
}

function renderHtmlBody(banner: string, bannerColor: string, schoolName: string, sections: Section[], link: string | null): string {
  const parts: string[] = [];
  parts.push(`<p style="margin:0 0 4px 0;color:#6b7280;font-size:12px">${escapeHtml(schoolName)}</p>`);
  parts.push(
    `<div style="margin:0 0 16px 0;padding:10px 14px;border-radius:6px;background:${bannerColor};color:#fff;font-size:16px;font-weight:600">${escapeHtml(banner)}</div>`,
  );
  for (const sec of sections) {
    parts.push(`<h3 style="margin:18px 0 6px 0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#374151">${escapeHtml(sec.title)}</h3>`);
    parts.push(`<table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e7eb;border-radius:6px">`);
    for (const row of sec.rows) {
      if (!row.label) {
        parts.push(`<tr><td colspan="2" style="padding:8px 12px;color:#374151;white-space:pre-wrap">${escapeHtml(row.value)}</td></tr>`);
      } else {
        parts.push(
          `<tr>` +
          `<td style="padding:6px 12px;color:#6b7280;width:40%;border-top:1px solid #f3f4f6;vertical-align:top">${escapeHtml(row.label)}</td>` +
          `<td style="padding:6px 12px;border-top:1px solid #f3f4f6;white-space:pre-wrap">${escapeHtml(row.value)}</td>` +
          `</tr>`,
        );
      }
    }
    parts.push(`</table>`);
  }
  if (link) {
    parts.push(`<p style="margin:20px 0 0 0"><a href="${escapeHtml(link)}" style="color:#2563eb">Open in admin →</a></p>`);
  }
  return parts.join("");
}

/** Sends to every recipient; true when at least one send went through. */
async function deliver(
  tenant: Tenant,
  msg: { subject: string; body: string; html: string },
  trace: { kind: EmailKind; enrollmentId?: number | null; paymentId?: number | null; replyTo?: string | null },
  label: string,
): Promise<boolean> {
  const recipients = await getAdminRecipients(tenant);
  if (recipients.length === 0) {
    console.warn(`[OwnerNotification] ${label}: tenant ${tenant.id} has no admin or notification recipients`);
    return false;
  }
  let delivered = false;
  for (const r of recipients) {
    try {
      const res = await sendEmail({ tenantId: tenant.id, to: r.email, recipientUserId: r.userId, ...msg, ...trace });
      if (res.status === "sent" || res.status === "skipped_no_provider") delivered = true;
      else console.error(`[OwnerNotification] ${label}: send to ${r.email} ${res.status}${res.errorMsg ? `: ${res.errorMsg}` : ""}`);
    } catch (err) {
      console.error(`[OwnerNotification] ${label}: send to ${r.email} failed:`, err);
    }
  }
  return delivered;
}

function studentSections(p: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  createdAt?: Date | string | null;
}): Section[] {
  const age = ageAtPurchase(p.dateOfBirth, p.createdAt);
  const isMinor = age != null && age < 18;
  const sections: Section[] = [
    {
      title: `Student${isMinor ? " (minor)" : ""}`,
      rows: [
        { label: "Name", value: dash(`${p.firstName || ""} ${p.lastName || ""}`) },
        { label: "Email", value: dash(p.email) },
        { label: "Phone", value: dash(p.phone) },
        ...(p.dateOfBirth ? [{ label: "Date of birth", value: `${p.dateOfBirth}${age != null ? ` (age ${age})` : ""}` }] : []),
      ],
    },
  ];
  if (p.parentName || p.parentEmail || p.parentPhone) {
    sections.push({
      title: "Parent / Guardian",
      rows: [
        { label: "Name", value: dash(p.parentName) },
        { label: "Email", value: dash(p.parentEmail) },
        { label: "Phone", value: dash(p.parentPhone) },
      ],
    });
  } else if (isMinor) {
    sections.push({ title: "Parent / Guardian", rows: [{ label: "", value: "No parent / guardian on file — student is a minor, please collect." }] });
  }
  return sections;
}

type EnrollmentState = "PAID" | "CASH DUE" | "NEW";

function enrollmentState(ctx: EnrollmentContext): EnrollmentState {
  if (ctx.payment?.status === "COMPLETED") return "PAID";
  if (ctx.payment?.provider === "CASH" && ["CREATED", "PENDING"].includes(ctx.payment.status)) return "CASH DUE";
  return "NEW";
}

const BANNERS: Record<EnrollmentState, { text: string; color: string }> = {
  PAID: { text: "PAID — payment completed, enrollment confirmed", color: "#15803d" },
  "CASH DUE": { text: "CASH DUE — seat reserved, payment not received yet", color: "#b45309" },
  NEW: { text: "NEW ENROLLMENT — no payment recorded", color: "#4b5563" },
};

function buildEnrollmentMessage(ctx: EnrollmentContext, state: EnrollmentState) {
  const { enrollment: e, tenant, payment, offering } = ctx;
  const snap = (e.packageSnapshotJson as any) || {};
  const packageName = snap.name || "Enrollment";
  const dates = classDateLines(ctx);
  const name = `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email;
  const ref = ctx.reference;

  const what = offering?.name && offering.name !== packageName ? `${packageName}: ${offering.name}` : packageName;
  const firstStart = ctx.sessions[0]?.startAt ?? (offering ? new Date(offering.startsAt) : null);
  const amount = payment ? formatCents(payment.amountCents, payment.currency) : formatCents(e.priceSnapshotCents, e.currencySnapshot || "USD");
  const subject =
    `${state} — New enrollment: ${name} — ${what}${firstStart ? `, ${shortDate(firstStart, ctx.timezone)}` : ""}` +
    ` — ${amount}${ref ? ` (ref ${ref})` : ""}`;

  const sections: Section[] = [
    ...studentSections({ ...e, createdAt: e.createdAt }),
    {
      title: "Class & schedule",
      rows: [
        { label: "Course", value: dash(packageName) },
        ...(offering ? [{ label: "Class", value: offering.name }] : []),
        { label: dates.length > 1 ? "Dates" : "Date", value: dates.length ? dates.join("\n") : "No class date (scheduled separately)" },
        { label: "Location", value: dash(locationLine(ctx.location)) },
        ...(snap.providerUrl ? [{ label: "Online course link", value: String(snap.providerUrl) }] : []),
      ],
    },
  ];

  const paymentRows: SummaryRow[] = [{ label: "Reference", value: dash(ref) }];
  if (!payment) {
    paymentRows.push({ label: "", value: "No payment on file." });
  } else {
    paymentRows.push(
      { label: "Status", value: payment.status === "COMPLETED" ? "Paid" : `${payment.status} — not paid` },
      { label: "Amount", value: formatCents(payment.amountCents, payment.currency) },
      ...(payment.serviceFeeCents ? [{ label: "Of which service fee", value: formatCents(payment.serviceFeeCents, payment.currency) }] : []),
      ...(payment.cartId && payment.status === "COMPLETED" ? [{ label: "Covers", value: "the whole order (cart)" }] : []),
      { label: "Method", value: paymentMethodLabel(payment.provider) },
      { label: payment.status === "COMPLETED" ? "Paid at" : "Started at", value: formatLocalDateTime(payment.completedAt || payment.createdAt, ctx.timezone) },
      ...(payment.providerPaymentId ? [{ label: "Transaction ID", value: String(payment.providerPaymentId) }] : []),
      ...(payment.receiverName ? [{ label: "Received by", value: String(payment.receiverName) }] : []),
      ...(ctx.payments.length > 1 ? [{ label: "Earlier attempts", value: `${ctx.payments.length - 1} on file` }] : []),
    );
  }
  sections.push({ title: "Payment", rows: paymentRows });
  if (e.notes) sections.push({ title: "Notes", rows: [{ label: "", value: e.notes }] });

  const link = `${platformBaseUrl()}/admin/enrollments?focusId=${e.id}`;
  const banner = BANNERS[state];
  return {
    subject,
    body: renderTextBody(banner.text, tenant.name, sections, link),
    html: renderHtmlBody(banner.text, banner.color, tenant.name, sections, link),
  };
}

// Owner notification for one enrollment, labelled by its payment state. The
// PAID notification is sent at most once per enrollment: the slot is claimed
// atomically (concurrent webhook retries) and released again if nothing could
// be delivered, so it can be retried instead of silently lost. CASH DUE / NEW
// come from single request paths and are not deduplicated.
export async function sendAdminEnrollmentNotification(
  enrollmentId: number,
  tenantId: number,
): Promise<void> {
  const ctx = await loadEnrollmentContext(enrollmentId, tenantId);
  if (!ctx || ctx.tenant.adminEnrollmentNotificationsEnabled === false) return;
  const state = enrollmentState(ctx);

  if (state === "PAID") {
    const [claimed] = await db.update(enrollments)
      .set({ adminNotificationEmailSentAt: new Date() })
      .where(and(
        eq(enrollments.id, enrollmentId),
        eq(enrollments.tenantId, tenantId),
        isNull(enrollments.adminNotificationEmailSentAt),
      ))
      .returning({ id: enrollments.id });
    if (!claimed) return;
  }

  const kind: EmailKind = state === "PAID" ? "owner_paid" : state === "CASH DUE" ? "owner_cash_due" : "owner_new";
  const delivered = await deliver(
    ctx.tenant,
    buildEnrollmentMessage(ctx, state),
    // Replying to the notification writes to the student.
    { kind, enrollmentId, paymentId: ctx.payment?.id ?? null, replyTo: ctx.enrollment.email },
    `${state} enrollment#${enrollmentId}`,
  );
  if (!delivered && state === "PAID") {
    await db.update(enrollments)
      .set({ adminNotificationEmailSentAt: null })
      .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.tenantId, tenantId)));
  }
}

// ---------------------------------------------------------------------------
// Checkout-level notifications (no confirmed enrollment exists): a cash cart
// reservation, or a card checkout that was never paid.

export type CheckoutNotificationKind = "cash_due" | "not_paid";
const CLAIM_KEY: Record<CheckoutNotificationKind, string> = {
  cash_due: "cashDueNotifiedAt",
  not_paid: "notPaidNotifiedAt",
};

async function claimPaymentNotification(paymentId: number, key: string): Promise<boolean> {
  const rows = await db.update(payments)
    .set({ metadataJson: sql`coalesce(${payments.metadataJson}, '{}'::jsonb) || jsonb_build_object(${key}::text, now())` } as any)
    .where(and(eq(payments.id, paymentId), sql`not (coalesce(${payments.metadataJson}, '{}'::jsonb) ? ${key})`))
    .returning({ id: payments.id });
  return rows.length > 0;
}

async function releasePaymentNotification(paymentId: number, key: string): Promise<void> {
  await db.update(payments)
    .set({ metadataJson: sql`${payments.metadataJson} - ${key}::text` } as any)
    .where(eq(payments.id, paymentId));
}

async function checkoutCustomer(payment: Payment) {
  if (payment.enrollmentId) {
    const e = await storage.getEnrollmentById(payment.enrollmentId, payment.tenantId);
    if (e) return { ...e, createdAt: payment.createdAt };
  }
  if (payment.cartId) {
    const cart = await storage.getCart(payment.cartId);
    const c = (cart?.customerSnapshotJson as any) || {};
    return { ...c, createdAt: payment.createdAt };
  }
  return { createdAt: payment.createdAt };
}

export async function sendCheckoutOwnerNotification(paymentId: number, kind: CheckoutNotificationKind): Promise<void> {
  const payment = await storage.getPayment(paymentId);
  if (!payment) return;
  const tenant = await storage.getTenant(payment.tenantId);
  if (!tenant || tenant.adminEnrollmentNotificationsEnabled === false) return;
  if (kind === "not_paid" && tenant.abandonedCheckoutNotificationsEnabled === false) return;

  const key = CLAIM_KEY[kind];
  if (!(await claimPaymentNotification(payment.id, key))) return;

  const timezone = tenant.timezone || "America/Chicago";
  const customer = await checkoutCustomer(payment);
  const purchase = (((payment.metadataJson as any)?.purchase) || []) as PurchaseItem[];
  const itemLines = purchase.map((it) =>
    [
      it.className && it.className !== it.name ? `${it.name}: ${it.className}` : it.name,
      it.locationName,
      it.startsAt ? formatClassDate(it.startsAt, it.timezone || timezone) : null,
    ].filter(Boolean).join(" — "),
  );
  const first = purchase[0];
  const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email || "Unknown customer";
  const what = first
    ? `${first.className && first.className !== first.name ? first.className : first.name}${first.startsAt ? `, ${shortDate(first.startsAt, first.timezone || timezone)}` : ""}`
    : "checkout";
  const amount = formatCents(payment.amountCents, payment.currency);
  const ref = payment.reference ? ` (ref ${payment.reference})` : "";

  const subject = kind === "not_paid"
    ? `NOT PAID — checkout not completed: ${name}${customer.phone ? `, ${customer.phone}` : ""} — ${what} — ${amount}${ref}`
    : `CASH DUE — reservation: ${name} — ${what} — ${amount}${ref}`;
  const banner = kind === "not_paid"
    ? { text: "NOT PAID — this customer started checking out but did not pay", color: "#b91c1c" }
    : { text: "CASH DUE — seat requested, cash payment not received yet", color: "#b45309" };
  const guidance = kind === "not_paid"
    ? "No payment was taken, no enrollment was confirmed and no seat is held. They may have had trouble paying — consider following up."
    : "Nothing is confirmed until you record the cash payment in Admin → Enrollments → Pending cash.";

  const sections: Section[] = [
    { title: "What happened", rows: [{ label: "", value: guidance }] },
    ...studentSections(customer),
    { title: "What they chose", rows: itemLines.length ? itemLines.map((l) => ({ label: "", value: l })) : [{ label: "", value: "—" }] },
    {
      title: "Checkout",
      rows: [
        { label: "Reference", value: dash(payment.reference) },
        { label: "Amount", value: amount },
        { label: "Method", value: paymentMethodLabel(payment.provider) },
        { label: "Started at", value: formatLocalDateTime(payment.createdAt, timezone) },
      ],
    },
  ];
  const link = `${platformBaseUrl()}/admin/enrollments`;
  const delivered = await deliver(
    tenant,
    {
      subject,
      body: renderTextBody(banner.text, tenant.name, sections, link),
      html: renderHtmlBody(banner.text, banner.color, tenant.name, sections, link),
    },
    {
      kind: kind === "not_paid" ? "owner_not_paid" : "owner_cash_due",
      enrollmentId: payment.enrollmentId,
      paymentId: payment.id,
      replyTo: customer.email || null,
    },
    `${kind} payment#${payment.id}`,
  );
  if (!delivered) await releasePaymentNotification(payment.id, key);
}

// Card checkouts that were started but not paid within `olderThanHours`, and
// not since paid some other way, get one NOT PAID notification. Only recent
// checkouts qualify, so turning this on never mails out a historical backlog.
export async function notifyAbandonedCheckouts(tenantId: number, olderThanHours: number): Promise<number> {
  const now = Date.now();
  const candidates = await db.select().from(payments).where(and(
    eq(payments.tenantId, tenantId),
    inArray(payments.provider, ["STRIPE", "PAYPAL", "AUTHORIZE_NET"]),
    inArray(payments.status, ["CREATED", "PENDING", "EXPIRED", "FAILED"]),
    lt(payments.createdAt, new Date(now - olderThanHours * 3600_000)),
    gt(payments.createdAt, new Date(now - 48 * 3600_000)),
    sql`not (coalesce(${payments.metadataJson}, '{}'::jsonb) ? 'notPaidNotifiedAt')`,
  ));

  let sent = 0;
  for (const p of candidates) {
    const customer = await checkoutCustomer(p);
    const email = String(customer.email || "").trim().toLowerCase();
    // Paid on a later attempt (same cart, same enrollment or same customer)?
    const later = await db.execute(sql`
      select 1 from payments p2
      left join enrollments e2 on e2.id = p2.enrollment_id
      left join carts c2 on c2.id = p2.cart_id
      where p2.tenant_id = ${tenantId} and p2.status = 'COMPLETED' and p2.id <> ${p.id}
        and (
          (${p.cartId}::text is not null and p2.cart_id = ${p.cartId}::text)
          or (${p.enrollmentId}::int is not null and p2.enrollment_id = ${p.enrollmentId}::int)
          or (${email} <> '' and p2.created_at >= ${p.createdAt}
              and lower(coalesce(e2.email, c2.customer_snapshot_json->>'email', '')) = ${email})
        )
      limit 1`);
    const rows = ((later as { rows?: unknown[] }).rows ?? (later as unknown as unknown[])) as unknown[];
    if (rows.length > 0) continue;
    await sendCheckoutOwnerNotification(p.id, "not_paid");
    sent++;
  }
  return sent;
}
