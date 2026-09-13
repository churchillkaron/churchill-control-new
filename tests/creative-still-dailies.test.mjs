import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCreativeStillDailies,
} from "../lib/creative/stills/runtime/CreativeStillDailiesRuntime.js";

function evidence(score = 97) {
  return {
    scores: {
      identity_score: score,
      product_fidelity_score: score,
      place_specificity_score: score,
      composition_score: score,
      visual_hierarchy_score: score,
    },
    identity_preserved: true,
    product_preserved: true,
    synthetic_artifacts_absent: true,
  };
}

test("still dailies approve a render that matches required intent", () => {
  const result = evaluateCreativeStillDailies({
    intent: { identity_expected: true, product_expected: true, place_specificity_required: true },
    evidence: evidence(97),
  });
  assert.equal(result.passed, true);
  assert.equal(result.verdict, "APPROVE_TAKE");
});

test("beautiful but wrong render is sent to repair", () => {
  const value = evidence(98);
  value.scores.identity_score = 91;
  value.scores.composition_score = 92;
  const result = evaluateCreativeStillDailies({
    intent: { identity_expected: true, composition_required: true },
    evidence: value,
  });
  assert.equal(result.passed, false);
  assert.equal(result.verdict, "REPAIR_TAKE");
  assert.ok(result.failures.includes("DAILIES_IDENTITY_MISMATCH"));
  assert.ok(result.failures.includes("DAILIES_COMPOSITION_MISMATCH"));
});
