import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_OWNED_MODEL_CATALOG,
  ownedExecutionCertification,
  ownedModelCertification,
  ownedPricingCertification,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

function provider(id, model) {
  return {
    id,
    metadata: {
      configured_foundation_model: model,
      configured_model: model,
      foundation_models: model ? [model] : [],
    },
  };
}

function certifiedPricing(providerId) {
  return {
    id: "pricing-certified",
    provider: providerId,
    metadata: {
      pricing_status: "PRODUCTION_CERTIFIED",
      owned_inference: true,
      benchmark_certified: true,
      economics_certified: true,
      model_license_verified: true,
      recalibration_required: false,
    },
  };
}

test("owned intelligence model is approved only for declared capabilities", () => {
  const result = ownedModelCertification({
    provider: provider(
      "avantiqo-intelligence",
      "Qwen/Qwen3-30B-A3B-Thinking-2507",
    ),
    capability: "ai.reasoning.execute",
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.approved_models, [
    "Qwen/Qwen3-30B-A3B-Thinking-2507",
  ]);
});

test("owned image model requires exact approved model identity", () => {
  const approved = ownedModelCertification({
    provider: provider("avantiqo-image", "Qwen/Qwen-Image"),
    capability: "ai.image.generate",
  });
  const unknown = ownedModelCertification({
    provider: provider("avantiqo-image", "some/unreviewed-model"),
    capability: "ai.image.generate",
  });
  assert.equal(approved.eligible, true);
  assert.equal(unknown.eligible, false);
  assert.equal(
    unknown.reason,
    "OWNED_FOUNDATION_MODEL_NOT_APPROVED_FOR_CAPABILITY",
  );
});

test("audio candidate is not falsely certified before matching runtime exists", () => {
  assert.equal(
    AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].candidates[
      "ACE-Step/Ace-Step1.5"
    ].runtime_compatible,
    false,
  );
  const result = ownedModelCertification({
    provider: provider("avantiqo-audio", "ACE-Step/Ace-Step1.5"),
    capability: "ai.music.generate",
  });
  assert.equal(result.eligible, false);
});

test("provisional owned pricing cannot route to production", () => {
  const result = ownedPricingCertification({
    provider: "avantiqo-intelligence",
    pricing: {
      id: "pricing-provisional",
      provider: "avantiqo-intelligence",
      metadata: {
        pricing_status: "PROVISIONAL_MEASURED_BASELINE",
        owned_inference: true,
        benchmark_certified: false,
        economics_certified: false,
        model_license_verified: true,
        recalibration_required: true,
      },
    },
  });
  assert.equal(result.eligible, false);
  assert.ok(result.failed_checks.includes("pricing_status"));
  assert.ok(result.failed_checks.includes("benchmark_certified"));
  assert.ok(result.failed_checks.includes("economics_certified"));
  assert.ok(result.failed_checks.includes("recalibration_clear"));
});

test("owned execution requires both model and economics certification", () => {
  const result = ownedExecutionCertification({
    provider: provider(
      "avantiqo-code",
      "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    ),
    capability: "ai.code.generate",
    pricing: certifiedPricing("avantiqo-code"),
  });
  assert.equal(result.eligible, true);

  const rejected = ownedExecutionCertification({
    provider: provider(
      "avantiqo-code",
      "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    ),
    capability: "ai.code.generate",
    pricing: {
      ...certifiedPricing("avantiqo-code"),
      metadata: {
        ...certifiedPricing("avantiqo-code").metadata,
        economics_certified: false,
      },
    },
  });
  assert.equal(rejected.eligible, false);
});
