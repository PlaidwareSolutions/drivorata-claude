import { db } from "./db";
import { enrollments, tenantMembers, users } from "@shared/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { storage } from "./storage";
import { sendEmail } from "./email-service";

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

async function getAdminRecipients(tenantId: number): Promise<AdminRecipient[]> {
  const rows = await db
    .select({
      memberId: tenantMembers.id,
      userId: tenantMembers.userId,
      emailInvited: tenantMembers.emailInvited,
      role: tenantMembers.role,
      status: tenantMembers.status,
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

interface SummaryRow {
  label: string;
  value: string;
}

const KNOWN_SNAPSHOT_KEYS = new Set([
  "id", "name", "price", "priceCents", "creditClassroom", "creditDrive",
  "minAge", "description", "providerName", "providerUrl",
  "imageUrl", "tenantId", "active", "sortOrder", "createdAt", "updatedAt",
]);

function humanizeKey(k: string): string {
  return k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function snapshotExtraRows(snap: any): SummaryRow[] {
  if (!snap || typeof snap !== "object") return [];
  return Object.entries(snap)
    .filter(([k, v]) => !KNOWN_SNAPSHOT_KEYS.has(k) && v != null && typeof v !== "object")
    .map(([k, v]) => ({ label: humanizeKey(k), value: String(v) }));
}

function buildSummary(args: {
  enrollment: any;
  pkg: any;
  location: any;
  onlineCourse: any;
  cartCustomerSnapshot: any;
  cartId: string | null;
  payments: any[];
}): { sections: { title: string; rows: SummaryRow[] }[]; headline: string; packageName: string } {
  const e = args.enrollment;
  const snap = (e.packageSnapshotJson as any) || {};
  const cartSnap = (args.cartCustomerSnapshot as any) || {};

  const phone = e.phone || cartSnap.phone || null;
  const dob = e.dateOfBirth || cartSnap.dateOfBirth || null;
  const parentName = e.parentName || cartSnap.parentName || null;
  const parentEmail = e.parentEmail || cartSnap.parentEmail || null;
  const parentPhone = e.parentPhone || cartSnap.parentPhone || null;
  const studentNotes = cartSnap.notes || null;
  const adminNotes = e.notes || null;

  const age = ageAtPurchase(dob, e.createdAt);
  const isMinor = age != null && age < 18;

  const sortedPayments = [...args.payments].sort(
    (a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime(),
  );
  const completed = sortedPayments.find((p) => p.status === "COMPLETED");
  const featured = completed || sortedPayments[0] || null;
  const priorAttempts = featured ? sortedPayments.length - 1 : 0;

  const priceCents = e.priceSnapshotCents ??
    (snap.priceCents != null ? Number(snap.priceCents) : (snap.price != null ? Math.round(Number(snap.price) * 100) : null));
  const packageName = snap.name || args.pkg?.name || "Enrollment";

  const sections: { title: string; rows: SummaryRow[] }[] = [];

  sections.push({
    title: `Student${isMinor ? " (minor at purchase)" : ""}`,
    rows: [
      { label: "First name", value: dash(e.firstName) },
      { label: "Last name", value: dash(e.lastName) },
      { label: "Email", value: dash(e.email) },
      { label: "Phone", value: dash(phone) },
      {
        label: "Date of birth",
        value: dob ? `${dob}${age != null ? ` (age ${age} at purchase)` : ""}` : "—",
      },
    ],
  });

  sections.push({
    title: "Parent / Guardian",
    rows: parentName || parentEmail || parentPhone
      ? [
          { label: "Name", value: dash(parentName) },
          { label: "Email", value: dash(parentEmail) },
          { label: "Phone", value: dash(parentPhone) },
        ]
      : [{ label: "", value: isMinor
          ? "No parent / guardian info on file (student is a minor — please collect)."
          : "No parent / guardian info provided." }],
  });

  sections.push({
    title: "Location",
    rows: [{ label: "Name", value: dash(args.location?.name) }],
  });

  const pkgRows: SummaryRow[] = [
    { label: "Package name", value: dash(packageName) },
    { label: "Price at purchase", value: formatCents(priceCents, e.currencySnapshot || "USD") },
    {
      label: "Classroom credits",
      value: dash(snap.creditClassroom != null ? String(snap.creditClassroom)
        : (args.pkg?.creditClassroom != null ? String(args.pkg.creditClassroom) : null)),
    },
    {
      label: "Drive credits",
      value: dash(snap.creditDrive != null ? String(snap.creditDrive)
        : (args.pkg?.creditDrive != null ? String(args.pkg.creditDrive) : null)),
    },
    { label: "Minimum age", value: dash(snap.minAge != null ? String(snap.minAge) : null) },
  ];
  if (args.onlineCourse) {
    pkgRows.push({
      label: "Online course",
      value: `${args.onlineCourse.name}${args.onlineCourse.providerName ? ` (${args.onlineCourse.providerName})` : ""}`,
    });
  }
  const providerUrl = args.onlineCourse?.providerUrl || snap.providerUrl || null;
  if (providerUrl) pkgRows.push({ label: "Provider URL", value: providerUrl });
  for (const extra of snapshotExtraRows(snap)) pkgRows.push(extra);
  sections.push({ title: "Package", rows: pkgRows });

  const noteRows: SummaryRow[] = [];
  noteRows.push({ label: "From student (at checkout)", value: dash(studentNotes) });
  if (adminNotes) noteRows.push({ label: "Internal admin notes", value: adminNotes });
  sections.push({ title: "Notes", rows: noteRows });

  const paymentRows: SummaryRow[] = [];
  if (!featured) {
    paymentRows.push({ label: "", value: "No payment attempts on file." });
  } else {
    paymentRows.push({ label: "Method", value: `${featured.provider} — ${featured.status}${!completed ? " (no completed payment yet)" : ""}` });
    paymentRows.push({ label: "Amount", value: formatCents(featured.amountCents, featured.currency) });
    paymentRows.push({ label: "When", value: formatDateTime(featured.completedAt || featured.createdAt) });
    if (featured.providerPaymentId) paymentRows.push({ label: "Reference", value: String(featured.providerPaymentId) });
    if (featured.receiverName) paymentRows.push({ label: "Received by", value: String(featured.receiverName) });
    if (priorAttempts > 0) {
      paymentRows.push({ label: "Earlier attempts", value: `${priorAttempts} on file` });
    }
  }
  sections.push({ title: "Payment", rows: paymentRows });

  const timelineRows: SummaryRow[] = [
    { label: "Submitted", value: formatDateTime(e.createdAt) },
    { label: "Last updated", value: formatDateTime(e.updatedAt) },
    { label: "Activated", value: formatDateTime(e.activatedAt) },
    { label: "Confirmation email", value: formatDateTime(e.confirmationEmailSentAt) },
    { label: "Payment receipt email", value: formatDateTime(e.paymentReceivedEmailSentAt) },
  ];
  if (args.cartId) timelineRows.push({ label: "Originating cart", value: args.cartId });
  sections.push({ title: "Timeline", rows: timelineRows });

  const headline = `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.email || `Enrollment #${e.id}`;
  return { sections, headline, packageName };
}

function renderTextBody(headline: string, schoolName: string, sections: { title: string; rows: SummaryRow[] }[]): string {
  const lines: string[] = [];
  lines.push(`New enrollment at ${schoolName}`);
  lines.push(headline);
  lines.push("");
  for (const sec of sections) {
    lines.push(`== ${sec.title} ==`);
    for (const row of sec.rows) {
      if (!row.label) lines.push(row.value);
      else lines.push(`${row.label}: ${row.value}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderHtmlBody(headline: string, schoolName: string, sections: { title: string; rows: SummaryRow[] }[]): string {
  const parts: string[] = [];
  parts.push(`<p style="margin:0 0 4px 0;color:#6b7280;font-size:12px">${escapeHtml(schoolName)}</p>`);
  parts.push(`<h2 style="margin:0 0 16px 0;font-size:18px">New enrollment — ${escapeHtml(headline)}</h2>`);
  for (const sec of sections) {
    parts.push(`<h3 style="margin:18px 0 6px 0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#374151">${escapeHtml(sec.title)}</h3>`);
    parts.push(`<table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e7eb;border-radius:6px">`);
    for (const row of sec.rows) {
      if (!row.label) {
        parts.push(`<tr><td colspan="2" style="padding:8px 12px;color:#6b7280">${escapeHtml(row.value)}</td></tr>`);
      } else {
        parts.push(
          `<tr>` +
          `<td style="padding:6px 12px;color:#6b7280;width:40%;border-top:1px solid #f3f4f6">${escapeHtml(row.label)}</td>` +
          `<td style="padding:6px 12px;border-top:1px solid #f3f4f6;white-space:pre-wrap">${escapeHtml(row.value)}</td>` +
          `</tr>`
        );
      }
    }
    parts.push(`</table>`);
  }
  return parts.join("");
}

// Sends a "new enrollment" summary email to all active tenant_admin and
// office_manager members of the tenant. Idempotent via an atomic claim of
// enrollments.adminNotificationEmailSentAt (so concurrent webhook retries or
// restarts won't double-send).
export async function sendAdminEnrollmentNotification(
  enrollmentId: number,
  tenantId: number,
): Promise<void> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return;
  if (tenant.adminEnrollmentNotificationsEnabled === false) return;

  // Atomically claim the send slot to prevent duplicate sends.
  const [claimed] = await db.update(enrollments)
    .set({ adminNotificationEmailSentAt: new Date() })
    .where(and(
      eq(enrollments.id, enrollmentId),
      eq(enrollments.tenantId, tenantId),
      isNull(enrollments.adminNotificationEmailSentAt),
    ))
    .returning();
  if (!claimed) return;

  const recipients = await getAdminRecipients(tenantId);
  if (recipients.length === 0) return;

  const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
  if (!enrollment) return;

  const [pkg, location, paymentsList, onlineCourse, cart] = await Promise.all([
    enrollment.packageId ? storage.getPackage(enrollment.packageId) : Promise.resolve(undefined),
    enrollment.locationId ? storage.getLocation(enrollment.locationId) : Promise.resolve(undefined),
    storage.getPaymentsByEnrollment(enrollmentId),
    enrollment.onlineCourseId ? storage.getOnlineCourse(enrollment.onlineCourseId) : Promise.resolve(undefined),
    enrollment.cartId ? storage.getCart(enrollment.cartId) : Promise.resolve(undefined),
  ]);

  const { sections, headline, packageName } = buildSummary({
    enrollment,
    pkg: pkg ?? null,
    location: location ?? null,
    onlineCourse: onlineCourse ?? null,
    cartCustomerSnapshot: cart?.customerSnapshotJson ?? null,
    cartId: enrollment.cartId ?? null,
    payments: paymentsList,
  });

  const subject = `[${tenant.name}] New enrollment: ${headline} — ${packageName}`;
  const body = renderTextBody(headline, tenant.name, sections);
  const html = renderHtmlBody(headline, tenant.name, sections);

  for (const r of recipients) {
    try {
      await sendEmail({
        tenantId,
        to: r.email,
        recipientUserId: r.userId,
        subject,
        body,
        html,
      });
    } catch (err) {
      console.error(`[AdminEnrollmentNotification] send to ${r.email} failed:`, err);
    }
  }
}
