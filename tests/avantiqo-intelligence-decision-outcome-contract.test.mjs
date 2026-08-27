import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildOperatorIntelligenceDecisionOutcomeContract,
  OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionOutcomeContractRuntime.js";

function decision(overrides = {}) {
  return { candidate_id: "option-a", mutates: false, irreversible: false, ...overrides };
}

function criterion(kind, overrides = {}) {
  const defaults = kind === "success"
    ? { id: "success-1", signal: "verified_margin_delta", comparator: "gte", expected_value: 5 }
    : kind === "failure"
      ? { id: "failure-1", signal: "verified_margin_delta", comparator: "lt", expected_value: 0 }
      : { id: "warning-1", signal: "verified_margin_delta", comparator: "lt", expected_value: 3 };
  return {
    ...defaults,
    kind,
    unit: "percent",
    observation_source: "finance.verified_margin_read",
    verification_criteria: ["Current verified finance read proves the observed value."],
    ...overrides,
  };
}

function reviewPolicy(overrides = {}) {
  return {
    planned_review_trigger: "next_verified_observation",
    review_on_warning: true,
    review_on_failure: true,
    review_on_invalidation_trigger: true,
    ...overrides,
  };
}

function contingency(overrides = {}) {
  return {
    failure_modes: [
      { id: "margin-reversal", severity: "high", decision_invalidating: true },
    ],
    ...overrides,
  };
}

function provenance(overrides = {}) {
  return {
    invalidation_triggers: [{ id: "margin-reversal", type: "SCENARIO_SENSITIVITY", reasons: [] }],
    ...overrides,
  };
}

test("outcome contract is falsifiable, observable, reviewable and never claims success", () => {
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: decision(),
    criteria: [
      criterion("success", { failure_mode_ids: ["margin-reversal"] }),
      criterion("warning"),
      criterion("failure", { failure_mode_ids: ["margin-reversal"] }),
    ],
    review_policy: reviewPolicy(),
    provenance: provenance(),
    contingency: contingency(),
    decision_critical: true,
  });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT);
  assert.equal(result.status, "OUTCOME_CONTRACT_READY");
  assert.equal(result.outcome_contract_ready, true);
  assert.equal(result.outcome_policy.outcome_contract_must_be_falsifiable, true);
  assert.equal(result.outcome_policy.outcome_contract_readiness_is_not_outcome_success, true);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.schedules_monitoring, false);
  assert.equal(result.governance.outcome_contract_does_not_claim_success, true);
});

test("decision-critical contract requires both success and failure criteria", () => {
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: decision(),
    criteria: [criterion("success")],
    review_policy: reviewPolicy(),
    decision_critical: true,
  });
  assert.equal(result.status, "OUTCOME_CONTRACT_GAPS");
  assert.ok(result.issues.includes("FAILURE_CRITERION_REQUIRED"));
});

test("criteria require observable source and verification boundary", () => {
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: decision(),
    criteria: [
      criterion("success", { observation_source: "", verification_criteria: [] }),
      criterion("failure"),
    ],
    review_policy: reviewPolicy(),
  });
  assert.equal(result.status, "OUTCOME_CONTRACT_GAPS");
  assert.ok(result.issues.includes("OUTCOME_CRITERION_GAPS"));
  assert.ok(result.criteria[0]?.issues.includes("OBSERVATION_SOURCE_REQUIRED"));
  assert.ok(result.criteria[0]?.issues.includes("OUTCOME_VERIFICATION_CRITERIA_REQUIRED"));
});

test("identical success and failure tests are rejected", () => {
  const shared = {
    signal: "verified_state",
    comparator: "eq",
    expected_value: "ready",
    observation_source: "operator.verified_state_read",
    verification_criteria: ["Verified current state equals ready."],
  };
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: decision(),
    criteria: [criterion("success", shared), criterion("failure", { ...shared, id: "failure-same" })],
    review_policy: reviewPolicy(),
  });
  assert.equal(result.status, "OUTCOME_CONTRACT_GAPS");
  assert.ok(result.issues.includes("SUCCESS_FAILURE_CRITERIA_CONFLICT"));
});

test("critical decision requires planned and failure/invalidation review triggers", () => {
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: decision(),
    criteria: [criterion("success"), criterion("failure")],
    review_policy: {},
    provenance: provenance(),
    decision_critical: true,
  });
  assert.equal(result.status, "OUTCOME_CONTRACT_GAPS");
  assert.ok(result.issues.includes("PLANNED_REVIEW_TRIGGER_REQUIRED"));
  assert.ok(result.issues.includes("FAILURE_REVIEW_TRIGGER_REQUIRED"));
  assert.ok(result.issues.includes("INVALIDATION_REVIEW_TRIGGER_REQUIRED"));
});

test("high or critical contingency failure modes must map to outcome criteria", () => {
  const result = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: decision(),
    criteria: [criterion("success"), criterion("failure")],
    review_policy: reviewPolicy(),
    provenance: provenance(),
    contingency: contingency(),
  });
  assert.equal(result.status, "OUTCOME_CONTRACT_GAPS");
  assert.deepEqual(result.unmapped_contingency_failure_mode_ids, ["margin-reversal"]);
  assert.ok(result.issues.includes("MATERIAL_CONTINGENCY_FAILURE_MODE_NOT_OUTCOME_MAPPED"));
});

test("planning tool exposes outcome contracts without gaining execution or monitoring authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V12/);
  assert.match(source, /"build_outcome_contract"/);
  assert.match(source, /decision_outcome_contract/);
  assert.match(source, /deterministic_falsifiable_outcome_contract/);
  assert.match(source, /outcome_contract_readiness_is_not_outcome_success/);
  assert.match(source, /schedules_monitoring: false/);
  assert.match(source, /executes_business_actions: false/);
});
