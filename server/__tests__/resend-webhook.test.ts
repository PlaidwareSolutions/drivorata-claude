import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import { verifyResendSignature } from "../resend-webhook";

function makeValidSig(opts: {
  secret: string;
  svixId: string;
  svixTimestamp: string;
  rawBody: string;
}): string {
  const base64Part = opts.secret.startsWith("whsec_") ? opts.secret.slice("whsec_".length) : opts.secret;
  const key = Buffer.from(base64Part, "base64");
  const signed = `${opts.svixId}.${opts.svixTimestamp}.${opts.rawBody}`;
  return `v1,${crypto.createHmac("sha256", key).update(signed).digest("base64")}`;
}

const SECRET = "whsec_" + Buffer.from("super-secret-bytes-for-test").toString("base64");

test("verifyResendSignature accepts a correctly signed payload", () => {
  const now = 1_700_000_000_000;
  const svixId = "msg_123";
  const svixTimestamp = String(Math.floor(now / 1000));
  const rawBody = JSON.stringify({ type: "email.bounced", data: { email_id: "abc", to: ["x@y.com"] } });
  const svixSignature = makeValidSig({ secret: SECRET, svixId, svixTimestamp, rawBody });

  assert.equal(
    verifyResendSignature({ secret: SECRET, svixId, svixTimestamp, svixSignature, rawBody, now }),
    true,
  );
});

test("verifyResendSignature rejects a tampered body", () => {
  const now = 1_700_000_000_000;
  const svixId = "msg_123";
  const svixTimestamp = String(Math.floor(now / 1000));
  const rawBody = JSON.stringify({ type: "email.bounced", data: {} });
  const svixSignature = makeValidSig({ secret: SECRET, svixId, svixTimestamp, rawBody });

  assert.equal(
    verifyResendSignature({
      secret: SECRET,
      svixId,
      svixTimestamp,
      svixSignature,
      rawBody: rawBody + "x",
      now,
    }),
    false,
  );
});

test("verifyResendSignature rejects stale timestamps", () => {
  const now = 1_700_000_000_000;
  const svixId = "msg_123";
  const svixTimestamp = String(Math.floor(now / 1000) - 60 * 60); // 1h ago
  const rawBody = "{}";
  const svixSignature = makeValidSig({ secret: SECRET, svixId, svixTimestamp, rawBody });

  assert.equal(
    verifyResendSignature({ secret: SECRET, svixId, svixTimestamp, svixSignature, rawBody, now }),
    false,
  );
});

test("verifyResendSignature rejects wrong secret", () => {
  const now = 1_700_000_000_000;
  const svixId = "msg_123";
  const svixTimestamp = String(Math.floor(now / 1000));
  const rawBody = "{}";
  const svixSignature = makeValidSig({ secret: SECRET, svixId, svixTimestamp, rawBody });

  const otherSecret = "whsec_" + Buffer.from("different-secret").toString("base64");
  assert.equal(
    verifyResendSignature({ secret: otherSecret, svixId, svixTimestamp, svixSignature, rawBody, now }),
    false,
  );
});

test("verifyResendSignature accepts when one of multiple signatures matches", () => {
  const now = 1_700_000_000_000;
  const svixId = "msg_123";
  const svixTimestamp = String(Math.floor(now / 1000));
  const rawBody = "{}";
  const goodSig = makeValidSig({ secret: SECRET, svixId, svixTimestamp, rawBody });
  const svixSignature = `v1,deadbeef== ${goodSig}`;

  assert.equal(
    verifyResendSignature({ secret: SECRET, svixId, svixTimestamp, svixSignature, rawBody, now }),
    true,
  );
});
