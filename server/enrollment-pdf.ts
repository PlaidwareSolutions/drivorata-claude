import PDFDocument from "pdfkit";

const BLUE = "#1e40af";
const DARK = "#1e293b";
const GRAY = "#475569";
const LIGHT = "#f1f5f9";
const WHITE = "#ffffff";

const MAX_NOTE_CHARS = 600;
const MAX_SNAPSHOT_EXTRAS = 6;
const MAX_VALUE_CHARS = 300;
const TRUNC_SUFFIX = " …(truncated)";

export interface PdfPackageSnapshot {
  name?: string | null;
  price?: number | null;
  priceCents?: number | null;
  creditClassroom?: number | null;
  creditDrive?: number | null;
  minAge?: number | null;
  description?: string | null;
  providerName?: string | null;
  providerUrl?: string | null;
  [key: string]: unknown;
}

export interface PdfCartCustomerSnapshot {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface PdfEnrollment {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | Date | null;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  notes: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  activatedAt: string | Date | null;
  confirmationEmailSentAt: string | Date | null;
  paymentReceivedEmailSentAt: string | Date | null;
  priceSnapshotCents: number | null;
  currencySnapshot: string | null;
  packageSnapshotJson: PdfPackageSnapshot | null;
}

export interface PdfPayment {
  id: number;
  provider: string;
  status: string;
  amountCents: number;
  currency: string | null;
  providerPaymentId: string | null;
  createdAt: string | Date;
  completedAt: string | Date | null;
  receiverName: string | null;
}

export interface PdfPackage {
  name?: string | null;
  creditClassroom?: number | null;
  creditDrive?: number | null;
}

export interface PdfLocation {
  name?: string | null;
}

export interface PdfOnlineCourse {
  name: string;
  providerName: string | null;
  providerUrl: string | null;
}

export interface EnrollmentPdfInput {
  tenant: { name: string; logoUrl?: string | null };
  logoBuffer?: Buffer | null;
  enrollment: PdfEnrollment;
  package: PdfPackage | null;
  location: PdfLocation | null;
  onlineCourse: PdfOnlineCourse | null;
  cartCustomerSnapshot: PdfCartCustomerSnapshot | null;
  cartId: string | null;
  payments: PdfPayment[];
}

const KNOWN_SNAP_KEYS = new Set([
  "id", "name", "price", "priceCents", "creditClassroom", "creditDrive",
  "minAge", "description", "providerName", "providerUrl",
  "imageUrl", "tenantId", "active", "sortOrder", "createdAt", "updatedAt",
]);

function dash(v: string | null | undefined): string {
  return v != null && String(v).trim() !== "" ? String(v) : "—";
}

function fmtCents(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${fmtDate(d)}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function computeAge(dob: string | Date | null | undefined, asOf: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  const ref = asOf ? (asOf instanceof Date ? asOf : new Date(asOf)) : new Date();
  if (isNaN(d.getTime()) || isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

function humanizeKey(k: string): string {
  return k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - TRUNC_SUFFIX.length)) + TRUNC_SUFFIX;
}

export function generateEnrollmentPurchasePDF(input: EnrollmentPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 36;
    const right = pageW - 36;
    const contentW = right - left;
    const bottomLimit = pageH - 36;

    const e = input.enrollment;
    const generatedAt = new Date();

    // ===== Header =====
    const headerH = 64;
    doc.rect(0, 0, pageW, headerH).fill(BLUE);

    let textX = left;
    if (input.logoBuffer) {
      try {
        doc.image(input.logoBuffer, left, 10, { fit: [44, 44] });
        textX = left + 54;
      } catch {
        // ignore unreadable image; render without it
      }
    }
    const headerTextW = right - textX - 180;
    doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(15)
      .text(input.tenant.name || "Driving School", textX, 14, { width: headerTextW });
    doc.fillColor(WHITE).font("Helvetica").fontSize(10)
      .text("Purchase Details", textX, 34, { width: headerTextW });

    doc.fillColor(WHITE).font("Helvetica").fontSize(9)
      .text(`Enrollment #${e.id}`, right - 180, 14, { width: 180, align: "right" })
      .text(`Generated ${fmtDateTime(generatedAt)}`, right - 180, 30, { width: 180, align: "right" });

    doc.fillColor(DARK);
    doc.y = headerH + 10;

    // ===== Helpers (do NOT auto-add pages — keep one page) =====
    function spaceLeft(): number {
      return bottomLimit - doc.y;
    }

    function sectionTitle(title: string) {
      if (spaceLeft() < 22) return;
      const y = doc.y;
      doc.rect(left, y, contentW, 16).fill(LIGHT);
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(9)
        .text(title.toUpperCase(), left + 8, y + 4, { width: contentW - 16 });
      doc.fillColor(DARK);
      doc.y = y + 19;
    }

    function cellHeight(val: string, w: number): number {
      doc.font("Helvetica").fontSize(9);
      return 10 + 2 + doc.heightOfString(val || "—", { width: w });
    }

    function drawCell(label: string, val: string, x: number, y: number, w: number) {
      doc.font("Helvetica").fontSize(7).fillColor(GRAY)
        .text(label, x, y, { width: w });
      doc.font("Helvetica").fontSize(9).fillColor(DARK)
        .text(val || "—", x, y + 10, { width: w });
    }

    function row(pairs: Array<[string, string]>) {
      const colW = contentW / 2;
      for (let i = 0; i < pairs.length; i += 2) {
        const a = pairs[i];
        const b = pairs[i + 1];
        const aVal = truncate(a[1] || "", MAX_VALUE_CHARS);
        const bVal = b ? truncate(b[1] || "", MAX_VALUE_CHARS) : "";
        const hA = cellHeight(aVal, colW - 6);
        const hB = b ? cellHeight(bVal, colW - 6) : 0;
        const needed = Math.max(hA, hB) + 4;
        if (spaceLeft() < needed) return; // hard one-page cap
        const yStart = doc.y;
        drawCell(a[0], aVal, left, yStart, colW - 6);
        if (b) drawCell(b[0], bVal, left + colW + 6, yStart, colW - 6);
        doc.y = yStart + Math.max(hA, hB) + 4;
      }
    }

    function blockText(label: string, val: string) {
      const capped = truncate(val || "—", MAX_NOTE_CHARS);
      doc.font("Helvetica").fontSize(9);
      const valH = doc.heightOfString(capped, { width: contentW });
      const needed = 10 + 2 + valH + 4;
      if (spaceLeft() < needed) return;
      doc.font("Helvetica").fontSize(7).fillColor(GRAY)
        .text(label, left, doc.y, { width: contentW });
      doc.font("Helvetica").fontSize(9).fillColor(DARK)
        .text(capped, left, doc.y + 1, { width: contentW });
      doc.moveDown(0.3);
    }

    function paragraph(text: string) {
      doc.font("Helvetica").fontSize(9);
      const h = doc.heightOfString(text, { width: contentW });
      if (spaceLeft() < h + 4) return;
      doc.fillColor(GRAY).text(text, left, doc.y, { width: contentW });
      doc.moveDown(0.3);
      doc.fillColor(DARK);
    }

    // ===== Data shaping =====
    const snap: PdfPackageSnapshot = e.packageSnapshotJson || {};
    const cartSnap: PdfCartCustomerSnapshot = input.cartCustomerSnapshot || {};
    const phone = e.phone || cartSnap.phone || null;
    const dob = e.dateOfBirth || cartSnap.dateOfBirth || null;
    const parentName = e.parentName || cartSnap.parentName || null;
    const parentEmail = e.parentEmail || cartSnap.parentEmail || null;
    const parentPhone = e.parentPhone || cartSnap.parentPhone || null;
    const studentNotes = cartSnap.notes || null;
    const adminNotes = e.notes || null;
    const ageAtPurchase = computeAge(dob, e.createdAt);
    const isMinor = ageAtPurchase != null && ageAtPurchase < 18;

    const sortedPayments = [...input.payments].sort(
      (a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime(),
    );
    const completed = sortedPayments.find((p) => p.status === "COMPLETED");
    const featured = completed || sortedPayments[0] || null;
    const priorAttempts = featured ? sortedPayments.length - 1 : 0;

    const priceCents = e.priceSnapshotCents
      ?? (snap.priceCents != null ? Number(snap.priceCents)
        : (snap.price != null ? Math.round(Number(snap.price) * 100) : null));
    const providerUrl = input.onlineCourse?.providerUrl || snap.providerUrl || null;

    // ===== Student =====
    sectionTitle(`Student${isMinor ? "  (minor at purchase)" : ""}`);
    row([
      ["First name", dash(e.firstName)],
      ["Last name", dash(e.lastName)],
      ["Email", dash(e.email)],
      ["Phone", dash(phone)],
      [
        "Date of birth",
        dob
          ? `${fmtDate(dob)}${ageAtPurchase != null ? `  ·  age ${ageAtPurchase} at purchase` : ""}`
          : "—",
      ],
      ["Location", dash(input.location?.name)],
    ]);

    // ===== Parent =====
    sectionTitle("Parent / Guardian");
    if (parentName || parentEmail || parentPhone) {
      row([
        ["Name", dash(parentName)],
        ["Email", dash(parentEmail)],
        ["Phone", dash(parentPhone)],
        ["", ""],
      ]);
    } else {
      paragraph(
        isMinor
          ? "No parent / guardian info on file (student is a minor — please collect)."
          : "No parent / guardian info provided.",
      );
    }

    // ===== Package =====
    sectionTitle("Package");
    const pkgPairs: Array<[string, string]> = [
      ["Package name", dash(snap.name || input.package?.name)],
      ["Price at purchase", fmtCents(priceCents, e.currencySnapshot)],
      [
        "Classroom credits",
        dash(snap.creditClassroom != null ? String(snap.creditClassroom)
          : input.package?.creditClassroom != null ? String(input.package.creditClassroom) : null),
      ],
      [
        "Drive credits",
        dash(snap.creditDrive != null ? String(snap.creditDrive)
          : input.package?.creditDrive != null ? String(input.package.creditDrive) : null),
      ],
      ["Minimum age", dash(snap.minAge != null ? String(snap.minAge) : null)],
    ];
    if (input.onlineCourse) {
      pkgPairs.push([
        "Online course",
        `${input.onlineCourse.name}${input.onlineCourse.providerName ? ` (${input.onlineCourse.providerName})` : ""}`,
      ]);
    }
    if (providerUrl) pkgPairs.push(["Provider URL", String(providerUrl)]);
    let extras = 0;
    for (const [k, v] of Object.entries(snap)) {
      if (KNOWN_SNAP_KEYS.has(k)) continue;
      if (v == null || typeof v === "object") continue;
      if (extras >= MAX_SNAPSHOT_EXTRAS) break;
      pkgPairs.push([humanizeKey(k), String(v)]);
      extras++;
    }
    row(pkgPairs);

    // ===== Notes =====
    sectionTitle("Notes");
    blockText("Notes from student (at checkout)", studentNotes || "—");
    if (adminNotes) blockText("Internal admin notes", adminNotes);

    // ===== Payment =====
    sectionTitle("Payment");
    if (!featured) {
      paragraph("No payment attempts on file.");
    } else {
      const status = `${featured.provider} — ${featured.status}${!completed ? "  (no completed payment yet)" : ""}`;
      const payPairs: Array<[string, string]> = [
        ["Status", status],
        ["Amount", fmtCents(featured.amountCents, featured.currency)],
        ["Date", fmtDateTime(featured.completedAt || featured.createdAt)],
      ];
      if (featured.providerPaymentId) payPairs.push(["Reference", String(featured.providerPaymentId)]);
      if (featured.receiverName) payPairs.push(["Received by", String(featured.receiverName)]);
      row(payPairs);
      if (priorAttempts > 0) {
        paragraph(`${priorAttempts} earlier attempt${priorAttempts === 1 ? "" : "s"} on file.`);
      }
    }

    // ===== Timeline =====
    sectionTitle("Timeline");
    const tlPairs: Array<[string, string]> = [
      ["Submitted", fmtDateTime(e.createdAt)],
      ["Last updated", fmtDateTime(e.updatedAt)],
      ["Activated", fmtDateTime(e.activatedAt)],
      ["Confirmation email", fmtDateTime(e.confirmationEmailSentAt)],
      ["Payment receipt email", fmtDateTime(e.paymentReceivedEmailSentAt)],
    ];
    if (input.cartId) tlPairs.push(["Originating cart", String(input.cartId)]);
    row(tlPairs);

    // ===== Footer =====
    doc.font("Helvetica").fontSize(7).fillColor(GRAY)
      .text(
        `${input.tenant.name || "Driving School"}  ·  Enrollment #${e.id}  ·  Generated ${fmtDateTime(generatedAt)}`,
        left, pageH - 24, { width: contentW, align: "center" },
      );

    doc.end();
  });
}
