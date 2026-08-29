# portal-proxy Worker

Fallback origin for **Cloudflare for SaaS** custom hostnames (`portal.<school-domain>`).

Railway's edge routes by `Host` and only serves hostnames registered on the
service, and Cloudflare's Origin-Rules Host override is Enterprise-only — so
this Worker re-addresses custom-hostname traffic to the Railway service host
while forwarding the original host and visitor IP to the app.

## One-time zone setup (dashboard)

1. **SSL/TLS → Overview**: mode **Full** (Railway requirement for proxied domains).
2. **Cloudflare for SaaS** (SSL/TLS → Custom Hostnames): enable.
3. **Fallback origin**: create a proxied *originless* record
   `saas.drivorata.com  AAAA  100::` and set it as the fallback origin.
   Schools CNAME `portal` to this name (`PORTAL_CNAME_TARGET`).
4. **Workers Routes**: deploying adds `*/*` → `drivorata-portal-proxy`.
   Add explicit **Worker: None** routes for `drivorata.com/*` and
   `www.drivorata.com/*` so platform traffic never takes the extra hop.
5. Create an API token (Zone → SSL and Certificates → Edit) for the app's
   `CLOUDFLARE_API_TOKEN`; note the zone id for `CLOUDFLARE_ZONE_ID`.

## Prerequisite: Cloudflare for SaaS must be enabled

Until the zone has the Cloudflare for SaaS entitlement, two things fail with
misleading errors:

| Symptom | Real cause |
|---|---|
| `POST /zones/{id}/custom_hostnames` → `1404 No quota has been allocated for this zone` | SaaS not enabled |
| `wrangler deploy` → `Some triggers failed to deploy` (script uploads, route does not) | the `*/*` route pattern requires SaaS |

Enable it at **SSL/TLS → Custom Hostnames → Enable Cloudflare for SaaS**
(100 hostnames are included on Free/Pro/Business), then set the fallback origin
to `saas.drivorata.com`.

### Validating before the entitlement exists

Deploy with a concrete hostname pattern instead of `*/*` and point a proxied
test record at it — this exercises the identical code path:

```sh
# temporary: a proxied AAAA 100:: record named portal-test
routes = [{ pattern = "portal-test.drivorata.com/*", zone_name = "drivorata.com" }]
```

Remove the test record and restore `*/*` once SaaS is on.

## Deploy

```sh
cd infra/cloudflare/portal-proxy
npm install
# set ORIGIN_HOST in wrangler.toml to the Railway service hostname
npx wrangler secret put PORTAL_PROXY_SECRET   # same value as the app's PORTAL_PROXY_SECRET
npx wrangler deploy
```

## How a request flows

```
browser → portal.school.com (SaaS hostname, CNAME → saas.drivorata.com)
        → Worker: Host := ORIGIN_HOST, X-Forwarded-Host := portal.school.com,
                  X-Portal-Client-IP := CF-Connecting-IP, X-Portal-Proxy-Secret
        → Railway → app (server/lib/request.ts trusts the forwarded values only
                         when the secret matches)
```

Cookies are host-only (`portal.school.com`), redirects are relative, so
sessions and navigation stay on the customer host.
