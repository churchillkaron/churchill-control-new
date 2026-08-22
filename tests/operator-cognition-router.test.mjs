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
    assert.equal(result.reason, "CONSEQUENTIAL_IMPERATIVE");
  });
}

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
