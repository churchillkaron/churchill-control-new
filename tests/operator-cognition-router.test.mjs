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

test("keeps lightweight non-strategic turn fast", () => {
  const result = routeOperatorCognition({
    message: "thanks",
    source: "text",
    capabilities: [],
  });

  assert.equal(result.path, "fast");
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
