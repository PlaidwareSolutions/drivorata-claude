import { test } from "node:test";
import assert from "node:assert/strict";

import { extractReplyToken, stripQuotedReply } from "../inbound-email-webhook";

test("extractReplyToken finds reply+<token>@... and ignores other recipients", () => {
  assert.equal(extractReplyToken(["admin@school.com", "reply+aBc_123@contact.plaidware.com"]), "aBc_123");
  assert.equal(extractReplyToken(["nope@x.com"]), null);
  assert.equal(extractReplyToken([]), null);
});

test("extractReplyToken is case-insensitive on the prefix", () => {
  assert.equal(extractReplyToken(["REPLY+xyz@example.com"]), "xyz");
});

test("stripQuotedReply trims an `On … wrote:` quoted block", () => {
  const body =
    "Sounds good, thanks!\n\n" +
    "On 2026-04-20 12:00, Drivorata wrote:\n" +
    "> Hi Alice, here are your hours…";
  assert.equal(stripQuotedReply(body), "Sounds good, thanks!");
});

test("stripQuotedReply trims a leading `>` quoted block", () => {
  const body = "Yes please\n\n> previous message\n> more quoted";
  assert.equal(stripQuotedReply(body), "Yes please");
});

test("stripQuotedReply returns the original body when no quote markers are present", () => {
  const body = "Just a plain reply with no quote.";
  assert.equal(stripQuotedReply(body), "Just a plain reply with no quote.");
});
