import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 connection (S3-compatible API).
 *
 * All configuration comes from the environment. The client is created lazily
 * so the server (and the test-suite) boots without R2 credentials — routes
 * that need storage answer 503 until it is configured.
 */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Optional public origin for the bucket (custom domain), no trailing slash. */
  publicBaseUrl: string | null;
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function isObjectStorageConfigured(): boolean {
  return getR2Config() !== null;
}

let cached: { client: S3Client; bucket: string; publicBaseUrl: string | null } | null = null;

export function getR2(): { client: S3Client; bucket: string; publicBaseUrl: string | null } | null {
  if (cached) return cached;
  const cfg = getR2Config();
  if (!cfg) return null;
  cached = {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    }),
    bucket: cfg.bucket,
    publicBaseUrl: cfg.publicBaseUrl,
  };
  return cached;
}

/** Test hook: drop the cached client so env changes are picked up. */
export function resetR2ClientForTests(): void {
  cached = null;
}
