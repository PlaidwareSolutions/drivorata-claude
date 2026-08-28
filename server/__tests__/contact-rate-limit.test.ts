process.env.TEST_AUTH_BYPASS = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-contact-rate-limit";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import { AddressInfo } from "net";
import { eq, inArray } from "drizzle-orm";

import { registerRoutes } from "../routes";
import { db } from "../db";
import { tenants, contactSubmissions } from "@shared/schema";

let server: Server;
let baseUrl: string;
let tenantId: number;
let tenantSlug: string;

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) =>
    server.listen({ port: 0, host: "127.0.0.1" }, () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

before(async () => {
  await startServer();
  const ts = Date.now();
  tenantSlug = `contact-rl-${ts}`;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `Contact RL ${ts}`, slug: tenantSlug, active: true })
    .returning();
  tenantId = tenant.id;
});

after(async () => {
  if (tenantId) {
    await db.delete(contactSubmissions).where(eq(contactSubmissions.tenantId, tenantId));
    await db.delete(tenants).where(inArray(tenants.id, [tenantId]));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function submit(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/public/tenant/${tenantSlug}/contact`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("honeypot field silently 204s and does not create a submission", async () => {
  const before = await db
    .select()
    .from(contactSubmissions)
    .where(eq(contactSubmissions.tenantId, tenantId));
  const res = await submit({
    name: "Bot",
    email: "bot@example.com",
    message: "spam",
    website: "http://spam.example",
  });
  assert.equal(res.status, 204);
  const after = await db
    .select()
    .from(contactSubmissions)
    .where(eq(contactSubmissions.tenantId, tenantId));
  assert.equal(after.length, before.length, "honeypot submission must not be persisted");
});

test("submissions faster than minimum elapsed time silently 204", async () => {
  const before = await db
    .select()
    .from(contactSubmissions)
    .where(eq(contactSubmissions.tenantId, tenantId));
  const res = await submit({
    name: "Bot",
    email: "bot@example.com",
    message: "spam",
    elapsedMs: 100,
  });
  assert.equal(res.status, 204);
  const after = await db
    .select()
    .from(contactSubmissions)
    .where(eq(contactSubmissions.tenantId, tenantId));
  assert.equal(after.length, before.length, "fast submission must not be persisted");
});

test("per-IP rate limit returns 429 after 5 submissions in the window", async () => {
  // Fresh slug → fresh in-memory bucket would still be keyed by IP, but the
  // bucket persists across tests. To make this deterministic regardless of
  // prior history, we just assert that within a tight burst we eventually
  // get a 429 within the next 6 attempts (5 allowed + 1 over).
  let saw429 = false;
  for (let i = 0; i < 7; i++) {
    const res = await submit({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      message: `Hello ${i}`,
      elapsedMs: 5000,
    });
    if (res.status === 429) {
      saw429 = true;
      break;
    }
    assert.equal(res.status, 201, `attempt ${i} expected 201, got ${res.status}`);
  }
  assert.equal(saw429, true, "expected a 429 within 7 rapid submissions");
});

test("rate limit uses req.ip — when no trusted proxy is set, x-forwarded-for is ignored", async () => {
  // Production runs behind Replit's proxy with `trust proxy: 1`, so the
  // proxy's rewritten X-Forwarded-For becomes req.ip (the real client IP).
  // To prove the handler doesn't read the raw header itself, spin up a
  // second app where trust proxy is disabled. Spoofed XFF values must NOT
  // change req.ip in this configuration, so all requests from loopback
  // share one rate-limit bucket and the 6th attempt must be 429.
  const app2 = express();
  app2.use(express.json());
  const server2 = createServer(app2);
  await registerRoutes(server2, app2);
  app2.set("trust proxy", false);
  await new Promise<void>((resolve) =>
    server2.listen({ port: 0, host: "127.0.0.1" }, () => resolve()),
  );
  try {
    const addr = server2.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}/api/public/tenant/${tenantSlug}/contact`;
    let saw429 = false;
    for (let i = 0; i < 7; i++) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Each attempt rotates a different fake client IP. With trust
          // proxy disabled, the server must ignore this and key off the
          // real connection IP (127.0.0.1).
          "x-forwarded-for": `203.0.113.${i + 1}`,
        },
        body: JSON.stringify({
          name: `Spoof ${i}`,
          email: `spoof${i}@example.com`,
          message: `attempt ${i}`,
          elapsedMs: 5000,
        }),
      });
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    assert.equal(
      saw429,
      true,
      "spoofed x-forwarded-for must not let an attacker bypass the rate limit",
    );
  } finally {
    await new Promise<void>((resolve) => server2.close(() => resolve()));
  }
});
