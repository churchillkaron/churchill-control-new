import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { operatorRecommendationEvidenceFingerprint } from "../lib/operator/runtime/OperatorRecommendationEvidenceFingerprintRuntime.js";
import { assessOperatorIntelligenceDecisionValidity } from "../lib/operator/runtime/OperatorIntelligenceDecisionValidityRuntime.js";

const state = fs.readFileSync("lib/operator/contracts/OperatorRecommendationState.js", "utf8");
const legacy = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeLegacy.js", "utf8");
const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");

test("recommendation evidence fingerprint is deterministic without persisting raw evidence", () => {
  const first = operatorRecommendationEvidenceFingerprint({ b: 2, a: { y: 4, x: 3 } });
  const second = operatorRecommendationEvidenceFingerprint({ a: { x: 3, y: 4 }, b: 2 });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(legacy, /result_fingerprint: operatorRecommendationEvidenceFingerprint\(step\?\.evidence/);
  assert.match(state, /result_fingerprint/);
  assert.doesNotMatch(state, /raw_evidence:/);
});

test("refresh compares the exact compact evidence fingerprint", () => {
  assert.match(turn, /const nextFingerprint = operatorRecommendationEvidenceFingerprint\(observed\?\.evidence/);
  assert.match(turn, /previousFingerprint && nextFingerprint !== previousFingerprint/);
  assert.match(turn, /changedDependencyIds\.push/);
});

test("materially changed evidence becomes a verified validity condition", () => {
  assert.match(turn, /status:\s*"changed"/);
  assert.match(turn, /verified:\s*true/);
  assert.match(turn, /validity_conditions:/);
  const now = new Date().toISOString();
  const assessment = assessOperatorIntelligenceDecisionValidity({
    decision: { candidate_id: "recommendation-1", status: "SELECTED", decided_at: now },
    evidence_dependencies: [{
      id: "evidence-1", required: true, verified: true, current: true, superseded: false,
      volatility: "dynamic", observed_at: now,
    }],
    validity_conditions: [{
      id: "evidence_changed:evidence-1", required: true, verified: true, status: "changed",
      volatility: "dynamic", observed_at: now,
    }],
    now,
  });
  assert.equal(assessment.status, "INVALIDATED_BY_VERIFIED_CHANGE");
  assert.equal(assessment.requires_replan, true);
  assert.equal(assessment.decision_valid_now, false);
});

test("changed recommendation evidence cannot become execution authority", () => {
  assert.match(turn, /if \(!refreshed \|\| refreshed\.assessment\?\.decision_valid_now !== true\)/);
  assert.match(turn, /mutation_executed:\s*false/);
  assert.match(turn, /execution_authorized:\s*false/);
});
