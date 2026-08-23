import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_OWNED_MODEL_CATALOG,
  AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
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

function certifiedMediaPricing({ providerId, capability, model }) {
  return {
    ...certifiedPricing(providerId),
    provider: providerId,
    capability,
    model,
    metadata: {
      ...certifiedPricing(providerId).metadata,
      human_quality_certified: true,
      human_quality_evidence_contract:
        AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
      certified_capability: capability,
      certified_model: model,
      human_quality_reviewer: "media-certification-reviewer",
      human_quality_reviewed_at: "2026-08-23T05:00:00.000Z",
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

test("ACE-Step is runtime compatible for owned music only", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-audio"].models[
    "ACE-Step/Ace-Step1.5"
  ];
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.capabilities, ["ai.music.generate"]);
  assert.equal(model.ace_step_lm_enabled, false);

  const music = ownedModelCertification({
    provider: provider("avantiqo-audio", "ACE-Step/Ace-Step1.5"),
    capability: "ai.music.generate",
  });
  const sfx = ownedModelCertification({
    provider: provider("avantiqo-audio", "ACE-Step/Ace-Step1.5"),
    capability: "ai.sfx.generate",
  });
  assert.equal(music.eligible, true);
  assert.equal(sfx.eligible, false);
});

test("market-parity owned pricing cannot route before benchmark economics certification", () => {
  const result = ownedPricingCertification({
    provider: "avantiqo-audio",
    pricing: {
      id: "pricing-market-parity",
      provider: "avantiqo-audio",
      metadata: {
        pricing_status: "MARKET_PARITY_READY",
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

test("owned media pricing requires explicit human quality certification", () => {
  const result = ownedPricingCertification({
    provider: "avantiqo-image",
    capability: "ai.image.generate",
    pricing: {
      ...certifiedPricing("avantiqo-image"),
      capability: "ai.image.generate",
      model: "Qwen/Qwen-Image",
    },
  });
  assert.equal(result.eligible, false);
  assert.equal(result.media_human_quality_required, true);
  assert.ok(result.failed_checks.includes("human_quality_certified"));
  assert.ok(result.failed_checks.includes("human_quality_evidence_contract"));
  assert.ok(result.failed_checks.includes("certified_capability_bound"));
  assert.ok(result.failed_checks.includes("certified_model_bound"));
});

test("owned media pricing requires exact reviewed capability and model bindings", () => {
  const capability = "ai.video.lipsync";
  const model = "ByteDance/LatentSync-1.6";
  const valid = ownedPricingCertification({
    provider: "avantiqo-video",
    capability,
    pricing: certifiedMediaPricing({
      providerId: "avantiqo-video",
      capability,
      model,
    }),
  });
  assert.equal(valid.eligible, true);

  const mismatched = certifiedMediaPricing({
    providerId: "avantiqo-video",
    capability,
    model,
  });
  mismatched.metadata.certified_model = "different/model";
  const rejected = ownedPricingCertification({
    provider: "avantiqo-video",
    capability,
    pricing: mismatched,
  });
  assert.equal(rejected.eligible, false);
  assert.ok(rejected.failed_checks.includes("certified_model_bound"));
});

test("owned media execution passes only with licensed model and bound human review evidence", () => {
  const capability = "ai.image.generate";
  const model = "Qwen/Qwen-Image";
  const result = ownedExecutionCertification({
    provider: provider("avantiqo-image", model),
    capability,
    pricing: certifiedMediaPricing({
      providerId: "avantiqo-image",
      capability,
      model,
    }),
  });
  assert.equal(result.eligible, true);
  assert.equal(result.economics.checks.human_quality_certified, true);
  assert.equal(result.economics.checks.certified_capability_bound, true);
  assert.equal(result.economics.checks.certified_model_bound, true);
});
