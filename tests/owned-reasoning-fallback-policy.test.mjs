import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOwnedReasoningFallbackInput,
  ownedReasoningFallbackDecision,
  ownedReasoningFallbackEvidence,
  OWNED_REASONING_PROVIDER_ID,
  OWNED_REASONING_CAPABILITY,
} from "../lib/platform/service-runtime/execution/OwnedReasoningFallbackPolicy.js";

function providerError(provider, capability) {
  const error = new Error("provider failed");
  Object.defineProperty(error, "__provider_id", { value: provider });
  Object.defineProperty(error, "__provider_capability", { value: capability });
  return error;
}

function decision(providerPolicy = {}, metadata = {}) {
  return ownedReasoningFallbackDecision({
    error: providerError(OWNED_REASONING_PROVIDER_ID, OWNED_REASONING_CAPABILITY),
    capability: OWNED_REASONING_CAPABILITY,
    providerPolicy,
    metadata,
  });
}

test("owned reasoning fails closed unless fallback is explicitly enabled", () => {
  const result = decision();
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OWNED_REASONING_FALLBACK_NOT_EXPLICITLY_ENABLED");
});

test("explicit fallback opt-in permits one bounded alternative attempt", () => {
  const result = decision({ allow_owned_reasoning_fallback: true });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.provider_policy.blocked_providers, [OWNED_REASONING_PROVIDER_ID]);
});

test("explicit fallback remains bounded by provider, capability, allowlist and attempt count", () => {
  const external = ownedReasoningFallbackDecision({
    error: providerError("openai", OWNED_REASONING_CAPABILITY),
    capability: OWNED_REASONING_CAPABILITY,
    providerPolicy: { allow_owned_reasoning_fallback: true },
  });
  assert.equal(external.reason, "FAILED_PROVIDER_NOT_OWNED_REASONING");

  const pinned = decision({ allow_owned_reasoning_fallback: true, allowed_providers: [OWNED_REASONING_PROVIDER_ID] });
  assert.equal(pinned.reason, "NO_ALLOWED_FALLBACK_PROVIDER");

  const loop = decision({ allow_owned_reasoning_fallback: true }, { provider_failover: { attempt: 2 } });
  assert.equal(loop.reason, "FALLBACK_ATTEMPT_ALREADY_CONSUMED");
});

test("fallback input creates a fresh metered attempt and evidence chain", () => {
  const approved = decision({ allow_owned_reasoning_fallback: true });
  const input = buildOwnedReasoningFallbackInput({
    input: { provider_id: OWNED_REASONING_PROVIDER_ID, metadata: {} },
    decision: approved,
    failedUsageId: "usage-owned-1",
    failedProvider: OWNED_REASONING_PROVIDER_ID,
    failedModel: "qwen-thinking",
  });
  assert.equal(input.provider_id, null);
  assert.equal(input.metadata.provider_failover.attempt, 2);
  assert.equal(input.metadata.provider_failover.previous_usage_id, "usage-owned-1");

  const evidence = ownedReasoningFallbackEvidence({
    failedUsageId: "usage-owned-1",
    failedProvider: OWNED_REASONING_PROVIDER_ID,
    failedModel: "qwen-thinking",
    decision: approved,
    result: { provider: "alternate", model: "fallback-model", usage: { id: "usage-fallback-2" } },
  });
  assert.equal(evidence.reason, "OWNED_REASONING_PROVIDER_FAILED");
  assert.equal(evidence.to.usage_id, "usage-fallback-2");
});
