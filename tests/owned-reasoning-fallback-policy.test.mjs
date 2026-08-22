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

function allowedDecision(overrides = {}) {
  return ownedReasoningFallbackDecision({
    error: providerError(OWNED_REASONING_PROVIDER_ID, OWNED_REASONING_CAPABILITY),
    capability: OWNED_REASONING_CAPABILITY,
    providerPolicy: {},
    ...overrides,
  });
}

test("allows one governed fallback after owned deep reasoning failure", () => {
  const result = allowedDecision();

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
  const result = allowedDecision({
    providerPolicy: {
      blocked_providers: [OWNED_REASONING_PROVIDER_ID],
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OWNED_PROVIDER_ALREADY_EXCLUDED");
});

test("honors an explicit provider policy that disables owned reasoning failover", () => {
  const result = allowedDecision({
    providerPolicy: {
      allow_owned_reasoning_fallback: false,
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OWNED_REASONING_FALLBACK_DISABLED");
});

test("prevents a third provider attempt from a fallback turn", () => {
  const result = allowedDecision({
    metadata: {
      provider_failover: {
        attempt: 2,
      },
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "FALLBACK_ATTEMPT_ALREADY_CONSUMED");
});

test("fallback input starts a fresh metered attempt and excludes the owned provider", () => {
  const decision = allowedDecision({
    providerPolicy: {
      blocked_providers: ["disabled-provider"],
    },
  });
  const result = buildOwnedReasoningFallbackInput({
    input: {
      organization_id: "org-1",
      service_id: "ai.reasoning.execute",
      provider_id: OWNED_REASONING_PROVIDER_ID,
      provider_policy: {
        blocked_providers: ["disabled-provider"],
      },
      metadata: {
        operation: "REASON_TURN",
      },
    },
    decision,
    failedUsageId: "usage-owned-1",
    failedProvider: OWNED_REASONING_PROVIDER_ID,
    failedModel: "qwen-thinking",
  });

  assert.equal(result.provider_id, null);
  assert.deepEqual(result.provider_policy.blocked_providers, [
    "disabled-provider",
    OWNED_REASONING_PROVIDER_ID,
  ]);
  assert.deepEqual(result.metadata.provider_failover, {
    kind: "owned_reasoning_provider_failover",
    attempt: 2,
    chain_id: "usage-owned-1",
    previous_usage_id: "usage-owned-1",
    previous_provider: OWNED_REASONING_PROVIDER_ID,
    previous_model: "qwen-thinking",
    reason: "OWNED_REASONING_PROVIDER_FAILED",
    owned_provider_excluded: true,
  });
});

test("fallback evidence links the failed usage to the successful second usage", () => {
  const evidence = ownedReasoningFallbackEvidence({
    failedUsageId: "usage-owned-1",
    failedProvider: OWNED_REASONING_PROVIDER_ID,
    failedModel: "qwen-thinking",
    decision: allowedDecision(),
    result: {
      provider: "openai",
      model: "fallback-model",
      usage: { id: "usage-fallback-2" },
      pending: false,
    },
  });

  assert.deepEqual(evidence, {
    occurred: true,
    kind: "owned_reasoning_provider_failover",
    reason: "OWNED_REASONING_PROVIDER_FAILED",
    from: {
      provider: OWNED_REASONING_PROVIDER_ID,
      model: "qwen-thinking",
      usage_id: "usage-owned-1",
      status: "FAILED",
    },
    to: {
      provider: "openai",
      model: "fallback-model",
      usage_id: "usage-fallback-2",
      status: "SUCCESS",
    },
  });
});
