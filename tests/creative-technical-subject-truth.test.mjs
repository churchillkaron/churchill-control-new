import assert from "node:assert/strict";
import test from "node:test";

import { CreativeTechnicalSubjectTruthRuntime } from "../lib/creative/quality/runtime/CreativeTechnicalSubjectTruthRuntime.js";

function grounded(evidence = {}) {
  return {
    hero_asset_truth: { mode: "REFERENCE_GROUNDED_CLASS", exact_geometry_claimed: false, limitations: ["No manufacturer CAD available."] },
    technical_truth_evidence: evidence,
  };
}

test("real technical subject cannot reach production from name recognition alone", () => {
  const result = CreativeTechnicalSubjectTruthRuntime.evaluate(grounded({
    sources: [{ uri: "source://one", claim: "Generic aircraft reference." }],
    validated_facts: ["it flies"],
    prohibited_confusions: [],
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_TECHNICAL_TRUTH_MINIMUM_SOURCES_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_TECHNICAL_TRUTH_VALIDATED_FACTS_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_TECHNICAL_TRUTH_PROHIBITED_CONFUSIONS_REQUIRED"));
});
test("multi-source class/configuration evidence passes without claiming proprietary exact geometry", () => {
  const result = CreativeTechnicalSubjectTruthRuntime.evaluate(grounded({
    sources: [
      { uri: "source://manufacturer", claim: "Twin-engine upper fuselage and wheeled landing gear define the class." },
      { uri: "source://operator", claim: "Offshore transport role requires the documented rotor and landing configuration." },
    ],
    validated_facts: ["twin-engine upper fuselage", "wheeled landing gear", "articulated main rotor and transmission"],
    prohibited_confusions: ["light single-engine skid helicopter", "small skid-equipped utility twin"],
  }));
  assert.equal(result.passed, true);
});

test("exact source-locked hero does not pretend public research is its geometry source", () => {
  const result = CreativeTechnicalSubjectTruthRuntime.evaluate({
    hero_asset_truth: { mode: "SOURCE_LOCKED_EXACT", reference_asset_ids: ["asset-1"], exact_geometry_claimed: true },
  });
  assert.equal(result.passed, true);
});
