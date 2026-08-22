import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ownedReasoningFallbackDecision,
  OWNED_REASONING_PROVIDER_ID,
  OWNED_REASONING_CAPABILITY,
} from "../lib/platform/service-runtime/execution/OwnedReasoningFallbackPolicy.js";

function providerError(provider, capability) {
  const error = new Error("provider failed");
  Object.defineProperty(error, "__provider_id", {
    value: provider,
    enumerable: false,
  });
  Object.defineProperty(error, "__provider_capability", {
    value: capability,
    enumerable: false,
  });
  return error;
}

test("allows one governed fallback after owned deep reasoning failure", () => {
  const result = ownedReasoningFallbackDecision({
    error: providerError(OWNED_REASONING_PROVIDER_ID, OWNED_REASONING_CAPABILITY),
    capability: OWNED_REASONING_CAPABILITY,
    providerPolicy: {},
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(result.provider_policy.blocked_providers, [OWNED_REASONING_PROVIDER_ID]);
});

test("does not fallback external provider failure", () => {
  const result = ownedReasoningFallbackDecision({
    error: providerError("openai", OWNED_REASONING_CAPABILITY),
    capability: OWNED_REASONING_CAPABILITY,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "FAILED_PROVIDER_NOT_OWNED_REASONING");
});

test("does not fallback non-reasoning capabilities", () => {
  const result = ownedReasoningFallbackDecision({
    error: providerError(OWNED_REASONING_PROVIDER_ID, "ai.text.generate"),
    capability: "ai.text.generate",
  });

  assert.equal(result.allowed, false);
});

test("prevents fallback loops when owned provider is already excluded", () => {
  const result = ownedReasoningFallbackDecision({
    error: providerError(OWNED_REASONING_PROVIDER_ID, OWNED_REASONING_CAPABILITY),
    capability: OWNED_REASONING_CAPABILITY,
    providerPolicy: {
      blocked_providers: [OWNED_REASONING_PROVIDER_ID],
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OWNED_PROVIDER_ALREADY_EXCLUDED");
});
