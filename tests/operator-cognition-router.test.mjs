import { test } from "node:test";
import assert from "node:assert/strict";

import { routeOperatorCognition } from "../lib/operator/runtime/OperatorCognitionRouter.js";

const deepFollowUps = [
  "why?",
  "why not?",
  "how so?",
  "then what?",
  "and then?",
  "what next?",
  "what about the other option?",
  "are you sure?",
  "is that really best?",
  "explain that",
  "tell me more",
  "challenge this",
];

for (const message of deepFollowUps) {
  test(`routes strategic follow-up to deep cognition: ${message}`, () => {
    const result = routeOperatorCognition({
      message,
      source: "text",
      capabilities: [],
    });

    assert.equal(result.path, "deep");
    assert.equal(result.reason, "DELIBERATIVE_PARTNER_TURN");
  });
}

for (const message of [
  "fix it",
  "do this",
  "deploy it",
  "approve it",
  "pay it",
  "send it",
  "publish this",
  "merge it",
  "delete this",
  "fixa det",
  "betala den",
]) {
  test(`routes consequential imperative to deep cognition: ${message}`, () => {
    const result = routeOperatorCognition({
      message,
      source: "text",
      capabilities: [],
    });

    assert.equal(result.path, "deep");
    assert.equal(result.reason, "CONSEQUENTIAL_IMPERATIVE_UNRESOLVED");
  });
}


const customerReceiptCapability = {
  key: "finance.customer_receipt.post",
  name: "Post customer receipt",
  domain: "Finance",
  capability: "Customer Receipt",
  action: "Post",
  mode: "execute",
  risk: "high",
  transactional: true,
  requires_confirmation: true,
  operator_aliases: [
    "mark invoice paid",
    "record invoice payment",
    "post customer receipt",
    "receive customer payment",
  ],
  operator_examples: [
    "mark the latest invoice paid",
    "mark invoice paid on 8 sep 2026",
  ],
};

test("routes one clear governed invoice payment action to fast structured selection", () => {
  const result = routeOperatorCognition({
    message: "mark invoice paid on 8 sep 2026",
    source: "text",
    capabilities: [customerReceiptCapability],
  });

  assert.equal(result.path, "fast");
  assert.equal(result.reason, "REGISTERED_ROUTINE_ACTION");
});

test("keeps uncertain invoice payment decision on deep cognition", () => {
  const result = routeOperatorCognition({
    message: "I am not sure, should we mark this invoice paid?",
    source: "text",
    capabilities: [customerReceiptCapability],
  });

  assert.equal(result.path, "deep");
});

test("routes uncertain high-consequence request to deep cognition", () => {
  const result = routeOperatorCognition({
    message: "I think maybe we should release this to production",
    source: "text",
    capabilities: [],
  });

  assert.equal(result.path, "deep");
  assert.equal(result.reason, "MATERIAL_UNCERTAINTY");
});

test("keeps lightweight non-strategic turn fast", () => {
  const result = routeOperatorCognition({
    message: "thanks",
    source: "text",
    capabilities: [],
  });

  assert.equal(result.path, "fast");
});

test("keeps simple conversational status phrase fast without matching actions", () => {
  const result = routeOperatorCognition({
    message: "good morning",
    source: "text",
    capabilities: [],
  });

  assert.equal(result.path, "fast");
  assert.equal(result.reason, "FAST_EXECUTIVE_TURN");
});

test("voice model reasoning remains single-pass deep", () => {
  const result = routeOperatorCognition({
    message: "can you help with this",
    source: "voice",
    capabilities: [],
  });

  assert.equal(result.path, "deep");
  assert.equal(result.reason, "VOICE_REASONING_SINGLE_PASS");
});
