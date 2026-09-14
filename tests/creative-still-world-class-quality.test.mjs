import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCreativeStillWorldClassQuality } from "../lib/creative/stills/runtime/CreativeStillWorldClassQualityRuntime.js";

function evidence(score = 97) {
  return { passed: true, scores: { overall_score: score, composition_score: score, depth_score: score, lighting_quality_score: score, material_realism_score: score, production_design_score: score, visual_hierarchy_score: score, place_specificity_score: score, scale_readability_score: score, artifact_score: score, identity_score: score, product_fidelity_score: score, typography_score: score, editorial_hierarchy_score: score, spacing_rhythm_score: score, negative_space_score: score, hero_dominance_score: score, alignment_precision_score: score, crop_discipline_score: score, palette_restraint_score: score, clutter_control_score: score }, synthetic_artifacts_absent: true, unexpected_text_or_watermark_absent: true, identity_preserved: true, product_preserved: true, failures: [], repair_instructions: [] };
}

test("world-class still passes only when every critical visual dimension clears the floor", () => {
  const result = evaluateCreativeStillWorldClassQuality({ evidence: evidence(97), requirements: { identity_required: true, product_required: true } });
  assert.equal(result.passed, true);
  assert.equal(result.weakest_score, 97);
});

test("strong average cannot hide weak composition", () => {
  const value = evidence(98);
  value.scores.composition_score = 91;
  const result = evaluateCreativeStillWorldClassQuality({ evidence: value });
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("composition")));
});


test("premium graphic benchmark rejects weak typography even when generic visual scores pass", () => {
  const value = evidence(98);
  value.scores.typography_score = 92;
  const result = evaluateCreativeStillWorldClassQuality({ evidence: value, requirements: { premium_graphic_benchmark_required: true } });
  assert.equal(result.passed, false);
  assert.equal(result.premium_graphic_benchmark.benchmark_id, "PREMIUM_EDITORIAL_AUTOMOTIVE_MINIMUM_V1");
  assert.ok(result.failures.some((failure) => failure.includes("typography")));
});

test("premium graphic benchmark requires disciplined spacing hierarchy and restraint", () => {
  const result = evaluateCreativeStillWorldClassQuality({ evidence: evidence(98), requirements: { premium_graphic_benchmark_required: true } });
  assert.equal(result.passed, true);
  assert.equal(result.premium_graphic_benchmark.scores.alignment, 98);
  assert.equal(result.premium_graphic_benchmark.scores.clutter_control, 98);
});
