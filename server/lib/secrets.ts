import crypto from "crypto";

// Encryption at rest for third-party credentials (payment processor keys).
// AES-256-GCM with PAYMENT_SECRETS_KEY (32 bytes, base64 or hex). Stored form:
//   enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>
// Values without the prefix are legacy plain text and are returned as-is, so
// rows written before encryption keep working and are upgraded on boot.
// Losing the key only means re-entering the processor keys in the admin.

const PREFIX = "enc:v1:";

function loadKey(): Buffer | null {
  const raw = process.env.PAYMENT_SECRETS_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PAYMENT_SECRETS_KEY must be 32 bytes (base64 or hex)");
  return key;
}

export function secretsKeyConfigured(): boolean {
  return loadKey() !== null;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts when a key is configured; otherwise returns the value unchanged. */
export function encryptSecret(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "" || isEncrypted(value)) return value;
  const key = loadKey();
  if (!key) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (!isEncrypted(value)) return value;
  const key = loadKey();
  if (!key) throw new Error("PAYMENT_SECRETS_KEY is not set but encrypted payment credentials exist");
  const [iv, tag, ct] = value!.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** The tenant_payment_settings columns that hold secrets. */
export const PAYMENT_SECRET_COLUMNS = [
  "stripeSecretKey",
  "stripeWebhookSecret",
  "paypalClientSecret",
  "authnetTransactionKey",
  "authnetSignatureKey",
] as const;

export function mapSecrets<T extends Record<string, any>>(row: T, fn: (v: string | null | undefined) => string | null | undefined): T {
  const out: Record<string, any> = { ...row };
  for (const c of PAYMENT_SECRET_COLUMNS) {
    if (c in out) out[c] = fn(out[c]);
  }
  return out as T;
}
