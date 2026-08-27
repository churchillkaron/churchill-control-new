import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligenceDecisionOutcome,
  OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionOutcomeAssessmentRuntime.js";

function contract(overrides = {}) {
  return {
    contract: "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1",
    status: "OUTCOME_CONTRACT_READY",
    outcome_contract_ready: true,
    criteria: [
      { id: "success", kind: "success", required: true, signal: "Throughput", comparator: "gte", expected_value: 100, observation_source: "verified-metric" },
      { id: "warning", kind: "warning", required: true, signal: "Error rate warning", comparator: "gte", expected_value: 0.03, observation_source: "verified-metric" },
      { id: "failure", kind: "failure", required: true, signal: "Error rate failure", comparator: "gte", expected_value: 0.08, observation_source: "verified-metric" },
    ],
    review_policy: { review_on_warning: true, review_on_failure: true },
    ...overrides,
  };
}

function observation(criterion_id, observed_value, overrides = {}) {
  return {
    id: `obs-${criterion_id}`,
    criterion_id,
    observation_source: "verified-metric",
    observed_value,
    verified: true,
    current: true,
    evidence_ids: [`ev-${criterion_id}`],
    ...overrides,
  };
}

test("verified outcome success requires all required criteria to be conclusively resolved", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", 120),
      observation("warning", 0.01),
      observation("failure", 0.01),
    ],
  });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT);
  assert.equal(result.status, "OUTCOME_SUCCEEDED");
  assert.equal(result.decision_success_proven, true);
  assert.equal(result.completion_proven, false);
  assert.equal(result.governance.authorizes_business_actions, false);
  assert.equal(result.governance.grants_learning_promotion, false);
});

test("verified failure criterion dominates otherwise successful evidence", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", 120),
      observation("warning", 0.01),
      observation("failure", 0.10),
    ],
  });
  assert.equal(result.status, "OUTCOME_FAILED");
  assert.equal(result.decision_success_proven, false);
  assert.deepEqual(result.triggered_failure_criterion_ids, ["failure"]);
  assert.equal(result.review_required, true);
  assert.equal(result.governance.triggers_recovery, false);
});

test("warning blocks success even when success criterion passes", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", 120),
      observation("warning", 0.04),
      observation("failure", 0.01),
    ],
  });
  assert.equal(result.status, "OUTCOME_WARNING");
  assert.deepEqual(result.triggered_warning_criterion_ids, ["warning"]);
  assert.equal(result.decision_success_proven, false);
  assert.equal(result.review_required, true);
});

test("missing or unverified observation remains inconclusive", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", 120),
      observation("warning", 0.01, { verified: false }),
    ],
  });
  assert.equal(result.status, "OUTCOME_INCONCLUSIVE");
  assert.equal(result.decision_success_proven, false);
  assert.ok(result.inconclusive_criterion_ids.includes("warning"));
  assert.ok(result.inconclusive_criterion_ids.includes("failure"));
});

test("wrong observation source cannot prove a criterion", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", 120, { observation_source: "model-claim" }),
      observation("warning", 0.01),
      observation("failure", 0.01),
    ],
  });
  assert.equal(result.status, "OUTCOME_INCONCLUSIVE");
  const success = result.criterion_results.find((row) => row.id === "success");
  assert.ok(success?.issues.includes("OBSERVATION_SOURCE_MISMATCH"));
});

test("conflicting verified observations never produce success", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", 120, { id: "success-pass" }),
      observation("success", 80, { id: "success-fail" }),
      observation("warning", 0.01),
      observation("failure", 0.01),
    ],
  });
  assert.equal(result.status, "OUTCOME_INCONCLUSIVE");
  const success = result.criterion_results.find((row) => row.id === "success");
  assert.ok(success?.issues.includes("CONFLICTING_VERIFIED_OBSERVATIONS"));
});

test("numeric comparators do not coerce model strings into numbers", () => {
  const result = assessOperatorIntelligenceDecisionOutcome({
    outcome_contract: contract(),
    observations: [
      observation("success", "120"),
      observation("warning", 0.01),
      observation("failure", 0.01),
    ],
  });
  assert.equal(result.status, "OUTCOME_INCONCLUSIVE");
  const success = result.criterion_results.find((row) => row.id === "success");
  assert.ok(success?.issues.includes("NUMERIC_COMPARATOR_REQUIRES_FINITE_NUMBERS"));
});

test("planning tool exposes verified outcome assessment without execution, recovery or learning authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V12/);
  assert.match(source, /"assess_outcome"/);
  assert.match(source, /decision_outcome_assessment_contract/);
  assert.match(source, /deterministic_verified_outcome_assessment/);
  assert.match(source, /outcome_success_is_not_plan_completion/);
  assert.match(source, /outcome_assessment_never_triggers_recovery_or_learning_promotion/);
  assert.match(source, /executes_business_actions: false/);
});
