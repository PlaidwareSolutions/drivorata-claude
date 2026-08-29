import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { getClientIp, getRequestBaseUrl, isPortalProxyRequest, platformBaseUrl } from "../lib/request";
import { portalHostnameFor } from "../cloudflare/portal-hostnames";

function fakeReq(opts: { headers?: Record<string, string>; ip?: string; protocol?: string }): Request {
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    get: (name: string) => headers[name.toLowerCase()],
    ip: opts.ip ?? "127.0.0.1",
    protocol: opts.protocol ?? "https",
  } as unknown as Request;
}

beforeEach(() => {
  delete process.env.PORTAL_PROXY_SECRET;
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.APP_BASE_URL;
});

test("getClientIp falls back to req.ip and ignores X-Forwarded-For", () => {
  const req = fakeReq({ ip: "10.0.0.7", headers: { "x-forwarded-for": "1.2.3.4" } });
  assert.equal(getClientIp(req), "10.0.0.7");
});

test("getClientIp honours CLIENT_IP_HEADER when configured", () => {
  process.env.CLIENT_IP_HEADER = "x-real-ip";
  const req = fakeReq({ ip: "10.0.0.7", headers: { "x-real-ip": "203.0.113.9" } });
  assert.equal(getClientIp(req), "203.0.113.9");
  assert.equal(getClientIp(fakeReq({ ip: "10.0.0.7" })), "10.0.0.7");
});

test("portal proxy headers are trusted only with the shared secret", () => {
  process.env.PORTAL_PROXY_SECRET = "s3cret-value";
  const spoofed = fakeReq({
    ip: "10.0.0.7",
    headers: { "x-portal-client-ip": "9.9.9.9", "x-forwarded-host": "evil.example", host: "drivorata.com" },
  });
  assert.equal(isPortalProxyRequest(spoofed), false);
  assert.equal(getClientIp(spoofed), "10.0.0.7");
  assert.equal(getRequestBaseUrl(spoofed), "https://drivorata.com");

  const viaWorker = fakeReq({
    ip: "10.0.0.7",
    headers: {
      "x-portal-proxy-secret": "s3cret-value",
      "x-portal-client-ip": "198.51.100.4",
      "x-forwarded-host": "portal.school.com",
      host: "drivorata-production.up.railway.app",
    },
  });
  assert.equal(isPortalProxyRequest(viaWorker), true);
  assert.equal(getClientIp(viaWorker), "198.51.100.4");
  assert.equal(getRequestBaseUrl(viaWorker), "https://portal.school.com");
});

test("getRequestBaseUrl uses the request host, or the platform origin for Railway-internal hosts", () => {
  assert.equal(getRequestBaseUrl(fakeReq({ headers: { host: "drivorata.com" } })), "https://drivorata.com");
  assert.equal(getRequestBaseUrl(fakeReq({ headers: { host: "localhost:5000" }, protocol: "http" })), "http://localhost:5000");
  process.env.APP_BASE_URL = "https://drivorata.com/";
  assert.equal(platformBaseUrl(), "https://drivorata.com");
  assert.equal(getRequestBaseUrl(fakeReq({ headers: { host: "drivorata-production.up.railway.app" } })), "https://drivorata.com");
  assert.equal(getRequestBaseUrl(fakeReq({ headers: {} })), "https://drivorata.com");
});

test("portalHostnameFor normalises the custom domain", () => {
  assert.equal(portalHostnameFor("www.School.com"), "portal.school.com");
  assert.equal(portalHostnameFor("https://school.com/"), "portal.school.com");
  assert.equal(portalHostnameFor(""), null);
  assert.equal(portalHostnameFor(null), null);
});
