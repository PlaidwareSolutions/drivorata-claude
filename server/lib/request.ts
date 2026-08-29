import { timingSafeEqual } from "crypto";
import type { Request } from "express";

/**
 * Request-derived values that depend on the proxy chain in front of the app.
 *
 * Production topology: Cloudflare (DNS proxy) -> Railway edge -> app. Tenant
 * portal hostnames (portal.<school>) additionally pass through our Cloudflare
 * Worker, which authenticates itself with a shared secret header and forwards
 * the customer hostname and the visitor IP.
 */

const PORTAL_PROXY_SECRET_HEADER = "x-portal-proxy-secret";
const PORTAL_CLIENT_IP_HEADER = "x-portal-client-ip";

/** True when the request arrived via the portal-proxy Worker (valid shared secret). */
export function isPortalProxyRequest(req: Request): boolean {
  const secret = process.env.PORTAL_PROXY_SECRET?.trim();
  if (!secret) return false;
  const provided = req.get(PORTAL_PROXY_SECRET_HEADER);
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Best available client IP for rate limiting.
 *
 * Precedence:
 *   1. Worker-forwarded visitor IP (only when the proxy secret validates)
 *   2. `CLIENT_IP_HEADER` if configured (e.g. `x-real-ip`, which Railway's edge
 *      overwrites with the true client / CF-Connecting-IP address)
 *   3. `req.ip` (honours Express `trust proxy`)
 */
export function getClientIp(req: Request): string {
  if (isPortalProxyRequest(req)) {
    const ip = req.get(PORTAL_CLIENT_IP_HEADER)?.trim();
    if (ip) return ip;
  }
  const headerName = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (headerName) {
    const v = req.get(headerName)?.split(",")[0]?.trim();
    if (v) return v;
  }
  return req.ip || "unknown";
}

/** Canonical platform origin (emails, referral links), no trailing slash. */
export function platformBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || "https://drivorata.com").replace(/\/+$/, "");
}

function isInternalHost(host: string): boolean {
  const name = host.split(":")[0].toLowerCase();
  return /\.railway\.app$/.test(name) || /\.railway\.internal$/.test(name);
}

/**
 * Origin to build absolute URLs the *current visitor* must come back to
 * (checkout success/cancel, PayPal return).
 *
 * - Requests proxied by the portal Worker keep the customer hostname
 *   (X-Forwarded-Host) so the visitor lands where their session cookie lives.
 *   The header is only honoured when the Worker's secret validates, so it
 *   cannot be spoofed into a redirect to an attacker host.
 * - Otherwise the request Host is used, unless it is a Railway-internal
 *   hostname, in which case the canonical platform origin is used.
 */
export function getRequestBaseUrl(req: Request): string {
  if (isPortalProxyRequest(req)) {
    const forwarded = req.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwarded) return `https://${forwarded}`;
  }
  const host = req.get("host");
  if (!host || isInternalHost(host)) return platformBaseUrl();
  return `${req.protocol}://${host}`;
}
