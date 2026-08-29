import assert from "node:assert/strict";
import test from "node:test";

import {
  ownedExecutionCertification,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const provider = {
  id: "avantiqo-intelligence",
  metadata: {
    configured_foundation_model: "Qwen/Qwen3-30B-A3B-Thinking-2507",
    foundation_models: [
      "Qwen/Qwen3-30B-A3B-Thinking-2507",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
    ],
  },
};

function certifiedPricing(capability, model) {
  return {
    id: `${capability}:${model}`,
    provider: "avantiqo-intelligence",
    capability,
    model,
    active: true,
    metadata: {
      pricing_status: "PRODUCTION_CERTIFIED",
      owned_inference: true,
      benchmark_certified: true,
      economics_certified: true,
      model_license_verified: true,
      recalibration_required: false,
      production_routing_allowed: true,
    },
  };
}

test("fast text lane certifies the exact Instruct model", () => {
  const result = ownedExecutionCertification({
    provider,
    capability: "ai.text.generate",
    pricing: certifiedPricing(
      "ai.text.generate",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
    ),
  });
  assert.equal(result.eligible, true);
  assert.equal(result.economics.checks.intelligence_pricing_model_bound, true);
});

test("deep reasoning lane certifies the exact Thinking model", () => {
  const result = ownedExecutionCertification({
    provider,
    capability: "ai.reasoning.execute",
    pricing: certifiedPricing(
      "ai.reasoning.execute",
      "Qwen/Qwen3-30B-A3B-Thinking-2507",
    ),
  });
  assert.equal(result.eligible, true);
  assert.equal(result.economics.checks.intelligence_pricing_model_bound, true);
});

test("Instruct model cannot certify the deep reasoning capability", () => {
  const result = ownedExecutionCertification({
    provider,
    capability: "ai.reasoning.execute",
    pricing: certifiedPricing(
      "ai.reasoning.execute",
      "Qwen/Qwen3-30B-A3B-Instruct-2507",
    ),
  });
  assert.equal(result.eligible, false);
  assert.equal(result.economics.checks.intelligence_pricing_model_bound, false);
});

test("unknown Intelligence pricing model cannot piggyback on another configured model", () => {
  const result = ownedExecutionCertification({
    provider,
    capability: "ai.text.generate",
    pricing: certifiedPricing(
      "ai.text.generate",
      "some-unapproved-model",
    ),
  });
  assert.equal(result.eligible, false);
  assert.equal(result.economics.checks.intelligence_pricing_model_bound, false);
});
