import crypto, { randomUUID } from "crypto";
import { storage } from "./storage";
import { sendEmail } from "./email-service";
import type { Tenant } from "@shared/schema";

function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://drivorata.com";
}

export function buildTrackingPixelUrl(token: string): string {
  return `${appBaseUrl()}/track/cart-reminder/open/${encodeURIComponent(token)}.gif`;
}

export function buildTrackedClickUrl(token: string): string {
  return `${appBaseUrl()}/track/cart-reminder/click/${encodeURIComponent(token)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const DEFAULT_STAGE1_HOURS = 1;
export const DEFAULT_STAGE2_HOURS = 24;

type Kind = "abandoned_cart" | "pending_cash";

interface SendOpts {
  tenant: Tenant;
  kind: Kind;
  stage: 1 | 2;
  cartId: string | null;
  paymentId: number | null;
  recipientEmail: string;
  firstName: string;
  itemSummary: string;
  resumeUrl: string;
  triggeredBy: "cron" | "manual";
  actorUserId: string | null;
}

function buildSubject(kind: Kind, stage: 1 | 2, tenantName: string) {
  if (kind === "abandoned_cart") {
    return stage === 1
      ? `${tenantName}: You left items in your cart`
      : `${tenantName}: Still interested? Your cart is waiting`;
  }
  return stage === 1
    ? `${tenantName}: We're holding your spot — pay cash to confirm`
    : `${tenantName}: Final reminder — please pay cash to confirm your spot`;
}

function buildIntro(opts: SendOpts): string {
  const { kind, stage, tenant } = opts;
  if (kind === "abandoned_cart") {
    return stage === 1
      ? `You left these courses in your cart at ${tenant.name}:`
      : `Just a friendly reminder — these courses are still in your cart at ${tenant.name}:`;
  }
  return stage === 1
    ? `We're holding your spot at ${tenant.name} for these items, awaiting your cash payment:`
    : `Final reminder: please pay cash by Friday to keep your spot at ${tenant.name} for:`;
}

function buildTextBody(opts: SendOpts, trackedUrl: string, unsubscribeUrl: string): string {
  const { firstName, itemSummary, tenant } = opts;
  return [
    `Hi ${firstName || "there"},`,
    "",
    buildIntro(opts),
    "",
    itemSummary,
    "",
    "Pick up where you left off — your selection is pre-filled at this link:",
    trackedUrl,
    "",
    `— The team at ${tenant.name}`,
    "",
    "---",
    "Don't want these reminders? Unsubscribe with one click:",
    unsubscribeUrl,
  ].join("\n");
}

function buildHtmlBody(opts: SendOpts, trackedUrl: string, pixelUrl: string, unsubscribeUrl: string): string {
  const { firstName, itemSummary, tenant } = opts;
  const itemsHtml = itemSummary
    .split("\n")
    .map(line => `<div>${escapeHtml(line)}</div>`)
    .join("");
  return [
    `<p>Hi ${escapeHtml(firstName || "there")},</p>`,
    `<p>${escapeHtml(buildIntro(opts))}</p>`,
    `<div style="margin:12px 0">${itemsHtml}</div>`,
    `<p>Pick up where you left off — your selection is pre-filled:</p>`,
    `<p><a href="${escapeHtml(trackedUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Resume your cart</a></p>`,
    `<p style="color:#6b7280;font-size:12px">Or copy this link: ${escapeHtml(trackedUrl)}</p>`,
    `<p>— The team at ${escapeHtml(tenant.name)}</p>`,
    `<p style="color:#6b7280;font-size:12px">Don't want these reminders? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>.</p>`,
    `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:none" />`,
  ].join("");
}

function unsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET (or SESSION_SECRET) must be set to sign unsubscribe tokens");
  }
  return secret;
}

export function signUnsubscribeToken(tenantId: number, email: string): string {
  const normalized = (email || "").trim().toLowerCase();
  const payload = `${tenantId}:${normalized}`;
  const sig = crypto.createHmac("sha256", unsubscribeSecret()).update(payload).digest("base64url").slice(0, 24);
  return Buffer.from(`${payload}:${sig}`, "utf8").toString("base64url");
}

export function verifyUnsubscribeToken(token: string): { tenantId: number; email: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts[parts.length - 1];
    const email = parts.slice(1, -1).join(":");
    const tenantId = parseInt(parts[0], 10);
    if (!Number.isFinite(tenantId) || !email) return null;
    const expected = crypto.createHmac("sha256", unsubscribeSecret()).update(`${tenantId}:${email}`).digest("base64url").slice(0, 24);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { tenantId, email };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(tenantId: number, email: string): string {
  const token = signUnsubscribeToken(tenantId, email);
  return `${appBaseUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function sendOne(opts: SendOpts): Promise<{ status: "sent" | "skipped_no_provider" | "failed" | "skipped_unsubscribed"; errorMsg?: string }> {
  if (await storage.isEmailUnsubscribed(opts.tenant.id, opts.recipientEmail)) {
    await storage.recordCartReminder({
      tenantId: opts.tenant.id,
      kind: opts.kind,
      cartId: opts.cartId,
      paymentId: opts.paymentId,
      stage: opts.stage,
      recipientEmail: opts.recipientEmail,
      emailStatus: "skipped_unsubscribed",
      errorMsg: null,
      triggeredBy: opts.triggeredBy,
      actorUserId: opts.actorUserId,
    });
    return { status: "skipped_unsubscribed" };
  }
  const subject = buildSubject(opts.kind, opts.stage, opts.tenant.name);
  const trackingToken = randomUUID();
  const trackedUrl = buildTrackedClickUrl(trackingToken);
  const pixelUrl = buildTrackingPixelUrl(trackingToken);
  const unsubscribeUrl = buildUnsubscribeUrl(opts.tenant.id, opts.recipientEmail);
  const body = buildTextBody(opts, trackedUrl, unsubscribeUrl);
  const html = buildHtmlBody(opts, trackedUrl, pixelUrl, unsubscribeUrl);
  const emailRes = await sendEmail({
    tenantId: opts.tenant.id,
    to: opts.recipientEmail,
    subject,
    body,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  await storage.recordCartReminder({
    tenantId: opts.tenant.id,
    kind: opts.kind,
    cartId: opts.cartId,
    paymentId: opts.paymentId,
    stage: opts.stage,
    recipientEmail: opts.recipientEmail,
    emailStatus: emailRes.status,
    errorMsg: emailRes.errorMsg ?? null,
    triggeredBy: opts.triggeredBy,
    actorUserId: opts.actorUserId,
    trackingToken,
  });
  return { status: emailRes.status, errorMsg: emailRes.errorMsg };
}

export function buildResumeUrl(tenant: Tenant, cartId: string | null): string {
  const path = cartId ? `/cart?resumeCartId=${encodeURIComponent(cartId)}` : "/cart";
  if (tenant.customDomain && tenant.domainVerified) {
    return `https://${tenant.customDomain}${path}`;
  }
  return `${appBaseUrl()}/site/${tenant.slug}${path}`;
}

function summarizeCartItems(items: Array<{ package?: { name?: string } | null; offering?: { name?: string } | null; quantity?: number }>): string {
  if (!items || items.length === 0) return "(your selected items)";
  return items.map(it => {
    const name = it.package?.name || "Course";
    const off = it.offering?.name ? ` — ${it.offering.name}` : "";
    const qty = (it.quantity ?? 1) > 1 ? ` × ${it.quantity}` : "";
    return `• ${name}${off}${qty}`;
  }).join("\n");
}

interface RunResult {
  tenantId: number;
  abandonedSent: number;
  pendingCashSent: number;
  failed: number;
  skipped: number;
}

export async function runCartRemindersForTenant(
  tenant: Tenant,
  opts?: { force?: boolean; triggeredBy?: "cron" | "manual"; actorUserId?: string | null },
): Promise<RunResult> {
  const enabled = opts?.force ? true : !!tenant.cartReminderEnabled;
  const result: RunResult = { tenantId: tenant.id, abandonedSent: 0, pendingCashSent: 0, failed: 0, skipped: 0 };
  if (!enabled) return result;

  const stage1Hours = tenant.cartReminderHoursStage1 ?? DEFAULT_STAGE1_HOURS;
  const stage2Hours = tenant.cartReminderHoursStage2 ?? DEFAULT_STAGE2_HOURS;
  const triggeredBy = opts?.triggeredBy ?? "cron";
  const now = Date.now();

  const stages = await storage.getCartReminderStagesByTenant(tenant.id);

  // Abandoned carts
  const carts = await storage.listAbandonedCarts(tenant.id);
  for (const c of carts) {
    const cust = (c.customerSnapshotJson as any) || {};
    const email = (cust.email || "").trim();
    if (!email) { result.skipped++; continue; }
    const ageHours = (now - new Date(c.updatedAt as any).getTime()) / 3600_000;
    const sent = stages.byCartId.get(c.id)?.stagesSent || [];
    let stageToSend: 1 | 2 | null = null;
    // Strict 1 -> 2 sequence: stage 2 only after stage 1 has been sent.
    if (!sent.includes(1) && ageHours >= stage1Hours) stageToSend = 1;
    else if (sent.includes(1) && !sent.includes(2) && ageHours >= stage2Hours) stageToSend = 2;
    if (!stageToSend) continue;
    try {
      const res = await sendOne({
        tenant,
        kind: "abandoned_cart",
        stage: stageToSend,
        cartId: c.id,
        paymentId: null,
        recipientEmail: email,
        firstName: cust.firstName || "",
        itemSummary: summarizeCartItems(c.items as any),
        resumeUrl: buildResumeUrl(tenant, c.id),
        triggeredBy,
        actorUserId: opts?.actorUserId ?? null,
      });
      if (res.status === "sent" || res.status === "skipped_no_provider") result.abandonedSent++;
      else if (res.status === "skipped_unsubscribed") result.skipped++;
      else result.failed++;
    } catch (err) {
      console.error(`[CartReminders] cart ${c.id} failed:`, err);
      result.failed++;
    }
  }

  // Pending cash payments
  const pending = await storage.listPendingCashPayments(tenant.id);
  for (const p of pending) {
    const cust = p.enrollment || (p.cartCustomer as any) || null;
    const email = (cust?.email || "").trim();
    if (!email) { result.skipped++; continue; }
    const ageHours = (now - new Date(p.createdAt as any).getTime()) / 3600_000;
    const sent = stages.byPaymentId.get(p.id)?.stagesSent || [];
    let stageToSend: 1 | 2 | null = null;
    // Strict 1 -> 2 sequence: stage 2 only after stage 1 has been sent.
    if (!sent.includes(1) && ageHours >= stage1Hours) stageToSend = 1;
    else if (sent.includes(1) && !sent.includes(2) && ageHours >= stage2Hours) stageToSend = 2;
    if (!stageToSend) continue;
    const items = p.cartItems && p.cartItems.length > 0
      ? summarizeCartItems(p.cartItems as any)
      : (p.enrollment ? `• Enrollment #${p.enrollment.id}` : "(your selected items)");
    try {
      const res = await sendOne({
        tenant,
        kind: "pending_cash",
        stage: stageToSend,
        cartId: p.cartId,
        paymentId: p.id,
        recipientEmail: email,
        firstName: cust?.firstName || "",
        itemSummary: items,
        resumeUrl: buildResumeUrl(tenant, p.cartId),
        triggeredBy,
        actorUserId: opts?.actorUserId ?? null,
      });
      if (res.status === "sent" || res.status === "skipped_no_provider") result.pendingCashSent++;
      else if (res.status === "skipped_unsubscribed") result.skipped++;
      else result.failed++;
    } catch (err) {
      console.error(`[CartReminders] payment ${p.id} failed:`, err);
      result.failed++;
    }
  }

  return result;
}

export async function runCartRemindersAllTenants(): Promise<{ tenantsProcessed: number; totalAbandoned: number; totalPendingCash: number; totalFailed: number }> {
  const tenants = await storage.getAllTenants();
  let processed = 0;
  let totalAbandoned = 0;
  let totalPendingCash = 0;
  let totalFailed = 0;
  for (const t of tenants) {
    if (!t.cartReminderEnabled) continue;
    processed++;
    const r = await runCartRemindersForTenant(t);
    totalAbandoned += r.abandonedSent;
    totalPendingCash += r.pendingCashSent;
    totalFailed += r.failed;
    if (r.abandonedSent + r.pendingCashSent + r.failed > 0) {
      console.log(`[CartReminders] Tenant ${t.id} (${t.name}): abandoned=${r.abandonedSent} pending_cash=${r.pendingCashSent} failed=${r.failed}`);
    }
  }
  return { tenantsProcessed: processed, totalAbandoned, totalPendingCash, totalFailed };
}

export async function sendCartReminderManual(params: {
  tenantId: number;
  kind: Kind;
  cartId?: string | null;
  paymentId?: number | null;
  actorUserId: string;
}): Promise<{ ok: true; status: string } | { ok: false; reason: string }> {
  const tenant = await storage.getTenant(params.tenantId);
  if (!tenant) return { ok: false, reason: "tenant_not_found" };

  if (params.kind === "abandoned_cart") {
    if (!params.cartId) return { ok: false, reason: "cart_id_required" };
    const carts = await storage.listAbandonedCarts(params.tenantId);
    const c = carts.find(x => x.id === params.cartId);
    if (!c) return { ok: false, reason: "cart_not_found" };
    const cust = (c.customerSnapshotJson as any) || {};
    const email = (cust.email || "").trim();
    if (!email) return { ok: false, reason: "no_email" };
    const stages = await storage.getCartReminderStagesByTenant(params.tenantId);
    const sent = stages.byCartId.get(c.id)?.stagesSent || [];
    const stage: 1 | 2 = sent.includes(1) ? 2 : 1;
    const res = await sendOne({
      tenant,
      kind: "abandoned_cart",
      stage,
      cartId: c.id,
      paymentId: null,
      recipientEmail: email,
      firstName: cust.firstName || "",
      itemSummary: summarizeCartItems(c.items as any),
      resumeUrl: buildResumeUrl(tenant, c.id),
      triggeredBy: "manual",
      actorUserId: params.actorUserId,
    });
    return { ok: true, status: res.status };
  }

  if (!params.paymentId) return { ok: false, reason: "payment_id_required" };
  const list = await storage.listPendingCashPayments(params.tenantId);
  const p = list.find(x => x.id === params.paymentId);
  if (!p) return { ok: false, reason: "payment_not_found" };
  const cust = p.enrollment || (p.cartCustomer as any) || null;
  const email = (cust?.email || "").trim();
  if (!email) return { ok: false, reason: "no_email" };
  const stages = await storage.getCartReminderStagesByTenant(params.tenantId);
  const sent = stages.byPaymentId.get(p.id)?.stagesSent || [];
  const stage: 1 | 2 = sent.includes(1) ? 2 : 1;
  const items = p.cartItems && p.cartItems.length > 0
    ? summarizeCartItems(p.cartItems as any)
    : (p.enrollment ? `• Enrollment #${p.enrollment.id}` : "(your selected items)");
  const res = await sendOne({
    tenant,
    kind: "pending_cash",
    stage,
    cartId: p.cartId,
    paymentId: p.id,
    recipientEmail: email,
    firstName: cust?.firstName || "",
    itemSummary: items,
    resumeUrl: buildResumeUrl(tenant, p.cartId),
    triggeredBy: "manual",
    actorUserId: params.actorUserId,
  });
  return { ok: true, status: res.status };
}
