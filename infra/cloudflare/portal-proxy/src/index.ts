export interface Env {
  ORIGIN_HOST: string;
  PLATFORM_HOSTS: string;
  /** Shared secret; the app only trusts X-Forwarded-Host / X-Portal-Client-IP when it matches. */
  PORTAL_PROXY_SECRET?: string;
}

const HOP_BY_HOP = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

function isPlatformHost(host: string, env: Env): boolean {
  const h = host.toLowerCase();
  return env.PLATFORM_HOSTS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((p) => (p.startsWith(".") ? h.endsWith(p) : h === p));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = url.host;

    // Platform hostnames (and anything on our own zone) go straight to origin.
    if (isPlatformHost(host, env)) return fetch(request);

    // Tenant portal hostname: re-address to the Railway service host.
    const originUrl = new URL(url.toString());
    originUrl.protocol = "https:";
    originUrl.host = env.ORIGIN_HOST;

    const headers = new Headers(request.headers);
    for (const h of HOP_BY_HOP) headers.delete(h);
    headers.set("X-Forwarded-Host", host);
    headers.set("X-Forwarded-Proto", "https");
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (clientIp) headers.set("X-Portal-Client-IP", clientIp);
    if (env.PORTAL_PROXY_SECRET) headers.set("X-Portal-Proxy-Secret", env.PORTAL_PROXY_SECRET);

    const init: RequestInit = {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      // Never follow redirects here: the browser must see them (they are
      // relative, so they stay on the portal host).
      redirect: "manual",
    };

    const upstream = await fetch(originUrl.toString(), init);

    // Pass the response through untouched (Set-Cookie included). If the app
    // ever emits an absolute Location on the origin host, map it back.
    const respHeaders = new Headers(upstream.headers);
    const location = respHeaders.get("location");
    if (location) {
      try {
        const loc = new URL(location, originUrl);
        if (loc.host.toLowerCase() === env.ORIGIN_HOST.toLowerCase()) {
          loc.host = host;
          loc.protocol = "https:";
          respHeaders.set("location", loc.toString());
        }
      } catch {
        /* leave as-is */
      }
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: respHeaders });
  },
};
