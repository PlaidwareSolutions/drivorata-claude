import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { payments, type Payment, type TenantPaymentSettings } from "@shared/schema";
import { storage } from "../storage";
import {
  HOSTED_PAYMENT_URL,
  getHostedPaymentToken,
  getTransaction,
  verifyAuthnetSignature,
  type AuthnetTransaction,
} from "./authorizenet-adapter";
import { AUTHNET_TOKEN_TTL_MS, authnetCredentials, authnetHostedUrls } from "./card-checkout";
import { completeProviderPayment } from "./complete-payment";

// The two Authorize.net endpoints: the page that hands the customer to the
// hosted payment form, and the webhook that tells us the payment went through.

interface AuthnetMeta {
  returnUrl: string;
  cancelUrl: string;
  description: string;
  customerEmail: string | null;
  token?: string;
  tokenIssuedAt?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;text-align:center;color:#111}a,button{font-size:1rem}button{padding:.7rem 1.4rem;border-radius:.5rem;border:0;background:#111;color:#fff;cursor:pointer}</style></head><body>${body}</body></html>`;
}

async function paymentByReference(reference: string, tenantId?: number): Promise<Payment | undefined> {
  const where = tenantId != null
    ? and(eq(payments.reference, reference), eq(payments.tenantId, tenantId))
    : eq(payments.reference, reference);
  const [p] = await db.select().from(payments).where(where);
  return p;
}

/** GET /pay/:reference — auto-submits the hosted payment form for an Authorize.net checkout. */
export async function renderAuthnetPayPage(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  try {
    const reference = String(req.params.reference || "").trim().toUpperCase();
    const payment = reference ? await paymentByReference(reference) : undefined;
    const meta = ((payment?.metadataJson as any)?.authnet || null) as AuthnetMeta | null;
    if (!payment || payment.provider !== "AUTHORIZE_NET" || !meta) {
      return res.status(404).type("html").send(page("Checkout not found", `<h1>Checkout not found</h1><p>This payment link isn't valid. Please start your enrollment again.</p>`));
    }
    if (payment.status === "COMPLETED") return res.redirect(303, meta.returnUrl);
    if (payment.status !== "PENDING" && payment.status !== "CREATED") {
      return res.status(410).type("html").send(page("Checkout expired", `<h1>This checkout has expired</h1><p>No payment was taken. Please start your enrollment again.</p><p><a href="${escapeHtml(meta.cancelUrl)}">Back to the school</a></p>`));
    }

    const settings = await storage.getTenantPaymentSettings(payment.tenantId);
    const creds = authnetCredentials(settings);
    if (!creds) throw new Error(`Authorize.net not configured for tenant ${payment.tenantId}`);

    let token = meta.token;
    const fresh = meta.tokenIssuedAt && Date.now() - new Date(meta.tokenIssuedAt).getTime() < AUTHNET_TOKEN_TTL_MS;
    if (!token || !fresh) {
      token = await getHostedPaymentToken(creds, {
        amountCents: payment.amountCents,
        invoiceNumber: reference,
        description: meta.description,
        customerEmail: meta.customerEmail,
        ...authnetHostedUrls(reference),
      });
      await storage.updatePayment(payment.id, {
        metadataJson: { ...((payment.metadataJson as any) || {}), authnet: { ...meta, token, tokenIssuedAt: new Date().toISOString() } },
      } as any);
    }

    const action = HOSTED_PAYMENT_URL[creds.mode];
    res.type("html").send(page(
      "Secure payment",
      `<h1>Taking you to secure payment…</h1><p>Payments are processed by Authorize.net.</p>` +
      `<form id="pay" method="post" action="${action}"><input type="hidden" name="token" value="${escapeHtml(token)}"><noscript><button type="submit">Continue to payment</button></noscript></form>` +
      `<script>document.getElementById("pay").submit();</script>`,
    ));
  } catch (err) {
    console.error("[AuthnetPay] failed:", err instanceof Error ? err.message : err);
    res.status(502).type("html").send(page("Payment unavailable", `<h1>Payment is temporarily unavailable</h1><p>No payment was taken. Please try again in a few minutes, or call the school.</p>`));
  }
}

/**
 * GET /pay/:reference/return and /pay/:reference/cancel — where Authorize.net
 * sends the customer back to; forwards to the storefront's own URLs.
 */
export async function redirectAuthnetReturn(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  const reference = String(req.params.reference || "").trim().toUpperCase();
  const payment = reference ? await paymentByReference(reference) : undefined;
  const meta = ((payment?.metadataJson as any)?.authnet || null) as AuthnetMeta | null;
  if (!payment || payment.provider !== "AUTHORIZE_NET" || !meta) {
    return res.status(404).type("html").send(page("Checkout not found", `<h1>Checkout not found</h1>`));
  }
  return res.redirect(303, req.path.endsWith("/cancel") ? meta.cancelUrl : meta.returnUrl);
}

// Events that mean money was captured. A fraud-held payment becomes paid when
// the merchant approves it in Authorize.net.
const PAID_EVENTS = new Set(["net.authorize.payment.authcapture.created", "net.authorize.payment.fraud.approved"]);

/** Which school's Signature Key signed this notification (Authorize.net doesn't say whose it is). */
async function signerOf(raw: Buffer, signature: string | undefined): Promise<TenantPaymentSettings | null> {
  const all = await storage.getAllTenantPaymentSettings();
  return all.find((s) => s.authnetEnabled && s.authnetSignatureKey && verifyAuthnetSignature(raw, signature, s.authnetSignatureKey)) ?? null;
}

/** Complete our payment for a paid Authorize.net transaction; returns why not, if not. */
export async function applyAuthnetTransaction(tenantId: number, tx: AuthnetTransaction): Promise<string> {
  if (!tx.paid) return `not paid (${tx.status})`;
  if (!tx.invoiceNumber) return "no invoice number";
  const payment = await paymentByReference(tx.invoiceNumber, tenantId);
  if (!payment || payment.provider !== "AUTHORIZE_NET") return `no Authorize.net payment ${tx.invoiceNumber}`;
  if (payment.status === "COMPLETED") return "already completed";
  if (tx.amountCents !== payment.amountCents) {
    console.error(`[AuthnetWebhook] amount mismatch on ${tx.invoiceNumber}: charged ${tx.amountCents}, expected ${payment.amountCents}`);
    return "amount mismatch";
  }
  const r = await completeProviderPayment(payment.id, {
    providerPaymentId: tx.transId,
    completedAt: tx.submittedAt ?? new Date(),
    raw: { transaction: tx },
  });
  return r.completed ? "completed" : "already completed";
}

/** POST /api/webhooks/authorizenet */
export async function handleAuthnetWebhook(req: Request, res: Response) {
  const raw = (req as any).rawBody;
  if (!Buffer.isBuffer(raw)) return res.status(400).json({ message: "Missing raw body" });
  const signer = await signerOf(raw, req.get("x-anet-signature"));
  if (!signer) {
    console.error("[AuthnetWebhook] signature did not match any school's Signature Key");
    return res.status(401).json({ message: "Invalid signature" });
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid JSON" });
  }
  const type = String(event?.eventType || "");
  const transId = event?.payload?.entityName === "transaction" ? String(event?.payload?.id || "") : "";
  if (!transId) return res.json({ received: true });

  try {
    if (type === "net.authorize.payment.fraud.held") {
      console.warn(`[AuthnetWebhook] transaction ${transId} held by fraud filters — approve or decline it in Authorize.net`);
      return res.json({ received: true, held: true });
    }
    if (!PAID_EVENTS.has(type)) return res.json({ received: true });

    const creds = authnetCredentials(signer);
    if (!creds) return res.json({ received: true });
    // Trust only what Authorize.net returns for the id, not the notification body.
    const tx = await getTransaction(creds, transId);
    const outcome = await applyAuthnetTransaction(signer.tenantId, tx);
    if (outcome !== "completed" && outcome !== "already completed") {
      console.warn(`[AuthnetWebhook] ${type} ${transId}: ${outcome}`);
    }
    return res.json({ received: true, outcome });
  } catch (err) {
    console.error("[AuthnetWebhook] processing failed:", err instanceof Error ? err.message : err);
    // A 5xx makes Authorize.net retry (3 min, then 8 h, then 48 h).
    return res.status(500).json({ message: "Processing failed" });
  }
}
