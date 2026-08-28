/**
 * Cloudflare for SaaS — Custom Hostnames API client.
 *
 * Each verified tenant domain gets `portal.<domain>` registered as a custom
 * hostname on our zone. Cloudflare then terminates TLS for it and routes the
 * traffic to our fallback origin (the portal-proxy Worker), which forwards
 * to the Railway service. Schools only need one CNAME:
 *   portal.<their-domain>  CNAME  <PORTAL_CNAME_TARGET>
 *
 * Env: CLOUDFLARE_API_TOKEN (Zone → SSL and Certificates → Edit),
 *      CLOUDFLARE_ZONE_ID, PORTAL_CNAME_TARGET.
 * When the token/zone are missing every call is a no-op that returns null,
 * so the app keeps working without the automation.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

export interface CustomHostname {
  id: string;
  hostname: string;
  /** Hostname ownership status: pending | active | moved | deleted | ... */
  status: string;
  /** Certificate status: initializing | pending_validation | pending_issuance | active | ... */
  sslStatus: string | null;
  verificationErrors: string[];
}

interface CfEnvelope<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: T;
}

interface CfCustomHostname {
  id: string;
  hostname: string;
  status: string;
  ssl?: { status?: string; validation_errors?: Array<{ message: string }> } | null;
  verification_errors?: string[];
}

export function getCloudflareSaasConfig(): { token: string; zoneId: string; cnameTarget: string } | null {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const cnameTarget = process.env.PORTAL_CNAME_TARGET?.trim();
  if (!token || !zoneId || !cnameTarget) return null;
  return { token, zoneId, cnameTarget };
}

export function isCloudflareSaasConfigured(): boolean {
  return getCloudflareSaasConfig() !== null;
}

function toCustomHostname(r: CfCustomHostname): CustomHostname {
  const sslErrors = (r.ssl?.validation_errors ?? []).map((e) => e.message);
  return {
    id: r.id,
    hostname: r.hostname,
    status: r.status,
    sslStatus: r.ssl?.status ?? null,
    verificationErrors: [...(r.verification_errors ?? []), ...sslErrors],
  };
}

async function cfRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getCloudflareSaasConfig();
  if (!cfg) throw new Error("Cloudflare for SaaS is not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(`${API_BASE}/zones/${cfg.zoneId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await resp.json().catch(() => ({}))) as CfEnvelope<T>;
    if (!resp.ok || !json.success) {
      const msg = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${resp.status}`;
      const err = new Error(`Cloudflare API ${method} ${path} failed: ${msg}`) as Error & { status?: number; codes?: number[] };
      err.status = resp.status;
      err.codes = (json.errors ?? []).map((e) => e.code);
      throw err;
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function findCustomHostname(hostname: string): Promise<CustomHostname | null> {
  const list = await cfRequest<CfCustomHostname[]>("GET", `/custom_hostnames?hostname=${encodeURIComponent(hostname)}&per_page=5`);
  const match = (list ?? []).find((h) => h.hostname.toLowerCase() === hostname.toLowerCase());
  return match ? toCustomHostname(match) : null;
}

export async function getCustomHostname(id: string): Promise<CustomHostname | null> {
  try {
    const r = await cfRequest<CfCustomHostname>("GET", `/custom_hostnames/${encodeURIComponent(id)}`);
    return r ? toCustomHostname(r) : null;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Create (or reuse) the custom hostname. HTTP DCV lets the cert issue as soon as the CNAME resolves. */
export async function createCustomHostname(hostname: string): Promise<CustomHostname> {
  const existing = await findCustomHostname(hostname);
  if (existing) return existing;
  const r = await cfRequest<CfCustomHostname>("POST", "/custom_hostnames", {
    hostname,
    ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
  });
  return toCustomHostname(r);
}

export async function deleteCustomHostname(id: string): Promise<void> {
  try {
    await cfRequest<unknown>("DELETE", `/custom_hostnames/${encodeURIComponent(id)}`);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return;
    throw err;
  }
}
