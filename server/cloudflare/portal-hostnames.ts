import { storage } from "../storage";
import type { Tenant } from "@shared/schema";
import {
  createCustomHostname,
  deleteCustomHostname,
  getCloudflareSaasConfig,
  getCustomHostname,
  isCloudflareSaasConfigured,
} from "./custom-hostnames";

/**
 * Keeps a tenant's staff-portal hostname (portal.<customDomain>) in sync
 * with Cloudflare for SaaS:
 *   - verified custom domain and no hostname yet  -> create
 *   - verified and hostname exists                -> refresh status
 *   - domain removed / unverified but hostname    -> delete
 * Never throws for Cloudflare failures; the result carries an `error` so the
 * admin UI can show it. Persists id/status on the tenant row.
 */

export interface PortalHostnameState {
  configured: boolean;
  hostname: string | null;
  cnameTarget: string | null;
  id: string | null;
  status: string | null;
  sslStatus: string | null;
  ready: boolean;
  verificationErrors: string[];
  checkedAt: string | null;
  error: string | null;
}

export function portalHostnameFor(customDomain: string | null | undefined): string | null {
  if (!customDomain) return null;
  const base = customDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return base ? `portal.${base}` : null;
}

function baseState(tenant: Tenant): PortalHostnameState {
  const cfg = getCloudflareSaasConfig();
  return {
    configured: cfg !== null,
    hostname: portalHostnameFor(tenant.customDomain),
    cnameTarget: cfg?.cnameTarget ?? null,
    id: tenant.portalHostnameId ?? null,
    status: tenant.portalHostnameStatus ?? null,
    sslStatus: null,
    ready: false,
    verificationErrors: [],
    checkedAt: tenant.portalHostnameCheckedAt ? new Date(tenant.portalHostnameCheckedAt).toISOString() : null,
    error: null,
  };
}

export async function syncPortalHostname(tenantId: number): Promise<PortalHostnameState> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  const state = baseState(tenant);
  if (!isCloudflareSaasConfigured()) {
    if (tenant.portalHostnameId || tenant.portalHostnameStatus) {
      // Automation was switched off; keep the stored values but say so.
      state.error = "Cloudflare for SaaS automation is not configured on this deployment";
    }
    return state;
  }

  const wanted = tenant.domainVerified ? portalHostnameFor(tenant.customDomain) : null;
  const now = new Date();

  try {
    // Hostname no longer wanted (domain removed, changed, or un-verified)
    if (!wanted) {
      if (tenant.portalHostnameId) {
        await deleteCustomHostname(tenant.portalHostnameId);
        await storage.updateTenant(tenantId, { portalHostnameId: null, portalHostnameStatus: null, portalHostnameCheckedAt: now });
      }
      return { ...state, id: null, status: null, checkedAt: now.toISOString() };
    }

    // Existing hostname: refresh, but recreate if it points at a different name (domain changed)
    let record = tenant.portalHostnameId ? await getCustomHostname(tenant.portalHostnameId) : null;
    if (record && record.hostname.toLowerCase() !== wanted) {
      await deleteCustomHostname(record.id);
      record = null;
    }
    if (!record) record = await createCustomHostname(wanted);

    const ready = record.status === "active" && record.sslStatus === "active";
    await storage.updateTenant(tenantId, {
      portalHostnameId: record.id,
      portalHostnameStatus: ready ? "active" : `${record.status}/${record.sslStatus ?? "unknown"}`,
      portalHostnameCheckedAt: now,
    });
    return {
      ...state,
      hostname: record.hostname,
      id: record.id,
      status: record.status,
      sslStatus: record.sslStatus,
      ready,
      verificationErrors: record.verificationErrors,
      checkedAt: now.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[portal-hostname] sync failed for tenant ${tenantId}:`, message);
    return { ...state, error: message };
  }
}
