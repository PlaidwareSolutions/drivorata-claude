import crypto from "crypto";

// Authorize.net — the gateway behind Chase merchant accounts — via Accept
// Hosted: Authorize.net's own payment page, so card data never touches us.
// Flow: get a form token (valid 15 min) → POST it to the hosted page →
// Authorize.net redirects back to our return URL with NO result attached, so
// the outcome comes from its signed webhook, with a transaction lookup by
// invoice number as the safety net (reconcile job, checkout-status).
// API reference: https://developer.authorize.net/api/reference/

export type AuthnetMode = "sandbox" | "production";

export interface AuthnetCredentials {
  apiLoginId: string;
  transactionKey: string;
  mode: AuthnetMode;
}

const API_URL: Record<AuthnetMode, string> = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api",
};

export const HOSTED_PAYMENT_URL: Record<AuthnetMode, string> = {
  sandbox: "https://test.authorize.net/payment/payment",
  production: "https://accept.authorize.net/payment/payment",
};

export function authnetMode(value: string | null | undefined): AuthnetMode {
  return value === "production" ? "production" : "sandbox";
}

export class AuthnetError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

type ApiCall = (mode: AuthnetMode, body: Record<string, unknown>) => Promise<any>;

const realApiCall: ApiCall = async (mode, body) => {
  const res = await fetch(API_URL[mode], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  // Authorize.net prefixes its JSON with a byte-order mark.
  const text = (await res.text()).replace(/^﻿/, "");
  if (!res.ok) throw new AuthnetError(`Authorize.net HTTP ${res.status}`);
  return JSON.parse(text);
};

let apiCall: ApiCall = realApiCall;
export function __setAuthnetApiForTests(fn: ApiCall): void {
  apiCall = fn;
}
export function __resetAuthnetApiForTests(): void {
  apiCall = realApiCall;
}

async function request(creds: AuthnetCredentials, name: string, fields: Record<string, unknown>): Promise<any> {
  const body = {
    [name]: {
      merchantAuthentication: { name: creds.apiLoginId, transactionKey: creds.transactionKey },
      ...fields,
    },
  };
  const out = await apiCall(creds.mode, body);
  const msgs = out?.messages;
  if (msgs?.resultCode !== "Ok") {
    const m = msgs?.message?.[0];
    throw new AuthnetError(m ? `${m.code}: ${m.text}` : "Authorize.net request failed", m?.code);
  }
  return out;
}

export async function testAuthnetConnection(creds: AuthnetCredentials): Promise<{ ok: boolean; error?: string }> {
  try {
    await request(creds, "authenticateTestRequest", {});
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Authorize.net credentials were rejected" };
  }
}

export interface HostedPageInput {
  amountCents: number;
  /** Our checkout reference; ≤ 20 chars (Authorize.net invoiceNumber limit). */
  invoiceNumber: string;
  /** One readable line: class, location, date, reference (≤ 255). */
  description: string;
  customerEmail?: string | null;
  returnUrl: string;
  cancelUrl: string;
}

/** A form token for Authorize.net's hosted payment page (valid 15 minutes). */
export async function getHostedPaymentToken(creds: AuthnetCredentials, input: HostedPageInput): Promise<string> {
  const json = (v: unknown) => JSON.stringify(v);
  const out = await request(creds, "getHostedPaymentPageRequest", {
    refId: input.invoiceNumber.slice(0, 20),
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: (input.amountCents / 100).toFixed(2),
      order: { invoiceNumber: input.invoiceNumber.slice(0, 20), description: input.description.slice(0, 255) },
      ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
      // Our own confirmation email is the receipt; Authorize.net's is off.
      transactionSettings: { setting: [{ settingName: "emailCustomer", settingValue: "false" }] },
    },
    hostedPaymentSettings: {
      setting: [
        {
          settingName: "hostedPaymentReturnOptions",
          // No receipt page: straight back to the storefront's thank-you page.
          settingValue: json({ showReceipt: false, url: input.returnUrl, urlText: "Continue", cancelUrl: input.cancelUrl, cancelUrlText: "Cancel" }),
        },
        { settingName: "hostedPaymentButtonOptions", settingValue: json({ text: "Pay" }) },
        { settingName: "hostedPaymentPaymentOptions", settingValue: json({ cardCodeRequired: true, showCreditCard: true, showBankAccount: false }) },
        { settingName: "hostedPaymentBillingAddressOptions", settingValue: json({ show: true, required: false }) },
        { settingName: "hostedPaymentCustomerOptions", settingValue: json({ showEmail: false, requiredEmail: false, addPaymentProfile: false }) },
        { settingName: "hostedPaymentOrderOptions", settingValue: json({ show: true }) },
      ],
    },
  });
  if (!out.token) throw new AuthnetError("Authorize.net returned no payment page token");
  return out.token as string;
}

export interface AuthnetTransaction {
  transId: string;
  status: string;
  invoiceNumber: string | null;
  amountCents: number;
  submittedAt: Date | null;
  /** Money is captured: approved and either settled or awaiting the nightly batch. */
  paid: boolean;
}

// Statuses where the charge went through. capturedPendingSettlement is the
// normal state until the nightly batch; FDS* = held by the fraud filters,
// not paid until the merchant approves it.
const PAID_STATUSES = new Set(["capturedPendingSettlement", "settledSuccessfully"]);

function toTransaction(t: any): AuthnetTransaction {
  const amount = Number(t.authAmount ?? t.settleAmount ?? 0);
  return {
    transId: String(t.transId),
    status: String(t.transactionStatus ?? ""),
    invoiceNumber: t.order?.invoiceNumber ?? t.invoiceNumber ?? null,
    amountCents: Math.round(amount * 100),
    submittedAt: t.submitTimeUTC ? new Date(t.submitTimeUTC) : null,
    paid: PAID_STATUSES.has(String(t.transactionStatus ?? "")),
  };
}

export async function getTransaction(creds: AuthnetCredentials, transId: string): Promise<AuthnetTransaction> {
  const out = await request(creds, "getTransactionDetailsRequest", { transId });
  return toTransaction(out.transaction);
}

/**
 * Find the transaction for one of our invoice numbers among recent activity:
 * unsettled transactions plus batches settled in the last `days` days. Used
 * when no webhook told us the transaction id. A paid one wins over declines.
 */
export async function findTransactionByInvoice(
  creds: AuthnetCredentials,
  invoiceNumber: string,
  days = 3,
): Promise<AuthnetTransaction | null> {
  const matches: AuthnetTransaction[] = [];
  const unsettled = await request(creds, "getUnsettledTransactionListRequest", {
    sorting: { orderBy: "submitTimeUTC", orderDescending: true },
    paging: { limit: 1000, offset: 1 },
  });
  for (const t of unsettled.transactions ?? []) {
    if (t.invoiceNumber === invoiceNumber) matches.push(toTransaction(t));
  }
  if (!matches.some((m) => m.paid)) {
    const now = new Date();
    const from = new Date(now.getTime() - days * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 19);
    const batches = await request(creds, "getSettledBatchListRequest", {
      firstSettlementDate: iso(from),
      lastSettlementDate: iso(now),
    });
    for (const b of batches.batchList ?? []) {
      const list = await request(creds, "getTransactionListRequest", {
        batchId: b.batchId,
        sorting: { orderBy: "submitTimeUTC", orderDescending: true },
        paging: { limit: 1000, offset: 1 },
      });
      for (const t of list.transactions ?? []) {
        if (t.invoiceNumber === invoiceNumber) matches.push(toTransaction(t));
      }
    }
  }
  return matches.find((m) => m.paid) ?? matches[0] ?? null;
}

/**
 * Check `X-ANET-Signature` ("sha512=<HEX>"): HMAC-SHA512 of the exact raw body
 * with the Signature Key. Published examples disagree on whether the key is
 * used as text or hex-decoded, so both are accepted.
 */
export function verifyAuthnetSignature(rawBody: Buffer | string, header: string | undefined, signatureKey: string): boolean {
  if (!header || !signatureKey) return false;
  const sent = header.trim().replace(/^sha512=/i, "").toUpperCase();
  if (!/^[0-9A-F]{128}$/.test(sent)) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  const keys: Buffer[] = [Buffer.from(signatureKey, "utf8")];
  if (/^[0-9a-fA-F]+$/.test(signatureKey) && signatureKey.length % 2 === 0) keys.push(Buffer.from(signatureKey, "hex"));
  const want = Buffer.from(sent, "hex");
  return keys.some((k) => {
    const got = crypto.createHmac("sha512", k).update(body).digest();
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}
