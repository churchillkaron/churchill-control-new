import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreativeStillProviderPolicy,
} from "../lib/creative/stills/runtime/CreativeStillProviderPolicyRuntime.js";
import {
  rankProviders,
} from "../lib/platform/service-runtime/providers/ProviderIntelligenceResolver.js";

test("ordinary still generation prioritizes cost and speed after qualification", () => {
  const policy = buildCreativeStillProviderPolicy({ capability: "ai.image.generate" });
  assert.equal(policy.execution_mode, "FAST_COST_QUALIFIED");
  assert.equal(policy.minimum_quality_score, 86);
  assert.ok(policy.selection_weights.cost > policy.selection_weights.quality);
});

test("identity-critical still work raises quality and reliability requirements", () => {
  const policy = buildCreativeStillProviderPolicy({
    capability: "ai.image.generate",
    input: { requirements: { expected_contract: { identity_expected: true } } },
  });
  assert.equal(policy.execution_mode, "QUALITY_QUALIFIED");
  assert.equal(policy.minimum_quality_score, 90);
  assert.equal(policy.minimum_reliability_score, 92);
  assert.ok(policy.selection_weights.quality > policy.selection_weights.cost);
});

test("provider ranking rejects cheap candidates below the required quality floor", () => {
  const ranked = rankProviders([
    { provider: "cheap", model: "a", quality_score: 82, reliability_score: 99, speed_score: 99, customer_price: 1 },
    { provider: "qualified", model: "b", quality_score: 92, reliability_score: 96, speed_score: 78, customer_price: 2 },
  ], {
    minimum_quality_score: 90,
    minimum_reliability_score: 92,
    selection_weights: { quality: 5, reliability: 3, cost: 1.5, speed: 0.5 },
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].provider, "qualified");
});

test("non-image tasks receive no still provider policy", () => {
  const policy = buildCreativeStillProviderPolicy({ capability: "ai.music.generate" });
  assert.deepEqual(policy, {});
});
