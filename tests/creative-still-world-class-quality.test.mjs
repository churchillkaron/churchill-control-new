import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCreativeStillWorldClassQuality } from "../lib/creative/stills/runtime/CreativeStillWorldClassQualityRuntime.js";

function evidence(score = 97) {
  return { passed: true, scores: { overall_score: score, composition_score: score, depth_score: score, lighting_quality_score: score, material_realism_score: score, production_design_score: score, visual_hierarchy_score: score, place_specificity_score: score, scale_readability_score: score, artifact_score: score, identity_score: score, product_fidelity_score: score }, synthetic_artifacts_absent: true, unexpected_text_or_watermark_absent: true, identity_preserved: true, product_preserved: true, failures: [], repair_instructions: [] };
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
