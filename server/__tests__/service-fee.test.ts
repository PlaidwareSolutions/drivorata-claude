import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeServiceFeeCents,
  isServiceFeeProvider,
  MAX_SERVICE_FEE_BPS,
  MAX_SERVICE_FEE_FLAT_CENTS,
} from "@shared/service-fee";

test("computeServiceFeeCents returns 0 for non-card providers regardless of fee config", () => {
  assert.equal(computeServiceFeeCents(10000, 300, "CASH", 500), 0);
  assert.equal(computeServiceFeeCents(10000, 300, "EXTERNAL", 500), 0);
  assert.equal(computeServiceFeeCents(10000, 300, null, 500), 0);
});

test("computeServiceFeeCents returns 0 for non-positive subtotal", () => {
  assert.equal(computeServiceFeeCents(0, 300, "STRIPE", 500), 0);
  assert.equal(computeServiceFeeCents(-1, 300, "STRIPE", 500), 0);
});

test("computeServiceFeeCents: percentage only (legacy behavior preserved)", () => {
  // 3% of $100.00 = $3.00 = 300 cents
  assert.equal(computeServiceFeeCents(10000, 300, "STRIPE"), 300);
  assert.equal(computeServiceFeeCents(10000, 300, "PAYPAL"), 300);
  // No flat → unchanged
  assert.equal(computeServiceFeeCents(10000, 300, "STRIPE", 0), 300);
  assert.equal(computeServiceFeeCents(10000, 300, "STRIPE", null), 300);
});

test("computeServiceFeeCents: flat only (no percentage)", () => {
  // $5.00 flat on a $100 subtotal
  assert.equal(computeServiceFeeCents(10000, 0, "STRIPE", 500), 500);
  assert.equal(computeServiceFeeCents(10000, null, "PAYPAL", 500), 500);
});

test("computeServiceFeeCents: both pct + flat combine additively", () => {
  // 3% of $100 + $5 flat = $3 + $5 = $8 = 800 cents
  assert.equal(computeServiceFeeCents(10000, 300, "STRIPE", 500), 800);
  // 2.5% of $200 + $1.50 flat = $5 + $1.50 = $6.50 = 650 cents
  assert.equal(computeServiceFeeCents(20000, 250, "PAYPAL", 150), 650);
});

test("computeServiceFeeCents: neither pct nor flat → 0", () => {
  assert.equal(computeServiceFeeCents(10000, 0, "STRIPE", 0), 0);
  assert.equal(computeServiceFeeCents(10000, null, "PAYPAL", null), 0);
});

test("computeServiceFeeCents: bps clamped to MAX_SERVICE_FEE_BPS", () => {
  // bps over cap → capped to 10% (1000 bps)
  const overCapped = computeServiceFeeCents(10000, 99999, "STRIPE", 0);
  const atCap = computeServiceFeeCents(10000, MAX_SERVICE_FEE_BPS, "STRIPE", 0);
  assert.equal(overCapped, atCap);
  assert.equal(atCap, 1000); // 10% of $100 = $10
});

test("computeServiceFeeCents: flat clamped to MAX_SERVICE_FEE_FLAT_CENTS", () => {
  // flat over cap → capped to $100 (10000 cents)
  const overCapped = computeServiceFeeCents(10000, 0, "STRIPE", 999999);
  assert.equal(overCapped, MAX_SERVICE_FEE_FLAT_CENTS);
});

test("computeServiceFeeCents: negative inputs treated as zero", () => {
  assert.equal(computeServiceFeeCents(10000, -300, "STRIPE", -500), 0);
});

test("isServiceFeeProvider only matches STRIPE/PAYPAL", () => {
  assert.equal(isServiceFeeProvider("STRIPE"), true);
  assert.equal(isServiceFeeProvider("PAYPAL"), true);
  assert.equal(isServiceFeeProvider("CASH"), false);
  assert.equal(isServiceFeeProvider("EXTERNAL"), false);
  assert.equal(isServiceFeeProvider(null), false);
  assert.equal(isServiceFeeProvider(undefined), false);
});
