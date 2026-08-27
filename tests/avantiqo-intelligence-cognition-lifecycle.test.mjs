import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligenceCognitionLifecycle,
  OPERATOR_INTELLIGENCE_COGNITION_LIFECYCLE_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceCognitionLifecycleRuntime.js";

function complete(overrides = {}) {
  return {
    goal_constraint_result: { status: "CONSISTENCY_PROVEN", consistency_proven: true },
    evidence_state: { status: "EVIDENCE_READY", evidence_ready: true },
    deliberation_result: { status: "SELECTED_FOR_PLANNING", selected_candidate: { id: "option-a" } },
    robustness_result: { status: "ROBUST_ACROSS_TESTED_SCENARIOS" },
    validity_result: { status: "VALID_WITHIN_POLICY", decision_valid_now: true },
    uncertainty_priority_result: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    readiness_result: { status: "READY_FOR_RECOMMENDATION", decision_ready: true },
    provenance_result: { status: "PROVENANCE_COMPLETE" },
    contingency_result: { status: "CONTINGENCY_READY", contingency_ready: true },
    outcome_contract_result: { status: "OUTCOME_CONTRACT_READY", outcome_contract_ready: true },
    outcome_assessment_result: { status: "OUTCOME_SUCCEEDED" },
    commitment_result: { status: "COMMIT_CURRENT_DECISION" },
    decision_critical: true,
    ...overrides,
  };
}

test("complete cognition lifecycle is explicit and never execution authority", () => {
  const result = assessOperatorIntelligenceCognitionLifecycle(complete());
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_COGNITION_LIFECYCLE_CONTRACT);
  assert.equal(result.status, "COGNITION_LIFECYCLE_COMPLETE");
  assert.equal(result.lifecycle_complete, true);
  assert.equal(result.next_required_stage, null);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
  assert.equal(result.governance.lifecycle_completion_is_not_execution_authority, true);
});

test("goal constraints are the first required cognition gate", () => {
  const result = assessOperatorIntelligenceCognitionLifecycle({});
  assert.equal(result.status, "COGNITION_STAGE_REQUIRED");
  assert.equal(result.next_required_stage, "GOAL_CONSTRAINTS");
  assert.equal(result.next_action, "ASSESS_GOAL_CONSTRAINTS");
});

test("later-stage output cannot skip unresolved earlier stage", () => {
  const result = assessOperatorIntelligenceCognitionLifecycle(complete({
    evidence_state: {},
  }));
  assert.equal(result.status, "COGNITION_STAGE_ORDER_VIOLATION");
  assert.equal(result.next_required_stage, "EVIDENCE");
  assert.ok(result.skipped_later_stage_ids.includes("DELIBERATION"));
  assert.ok(result.skipped_later_stage_ids.includes("COMMITMENT"));
  assert.equal(result.lifecycle_policy.later_stage_presence_never_proves_earlier_stage_completion, true);
});

test("invalid current decision blocks lifecycle before uncertainty and readiness", () => {
  const result = assessOperatorIntelligenceCognitionLifecycle(complete({
    validity_result: { status: "INVALIDATED_BY_VERIFIED_CHANGE", decision_valid_now: false },
  }));
  assert.equal(result.lifecycle_complete, false);
  assert.equal(result.next_required_stage, "VALIDITY");
  assert.equal(result.next_action, "VALIDATE_DECISION_CURRENTNESS");
});

test("unresolved decision-relevant uncertainty blocks readiness acceptance", () => {
  const result = assessOperatorIntelligenceCognitionLifecycle(complete({
    uncertainty_priority_result: { status: "RESOLVE_NEXT" },
  }));
  assert.equal(result.next_required_stage, "UNCERTAINTY");
  assert.equal(result.status, "COGNITION_STAGE_ORDER_VIOLATION");
});

test("outcome assessment must precede final commitment or reconsideration", () => {
  const result = assessOperatorIntelligenceCognitionLifecycle(complete({
    outcome_assessment_result: {},
  }));
  assert.equal(result.next_required_stage, "OUTCOME_ASSESSMENT");
  assert.ok(result.skipped_later_stage_ids.includes("COMMITMENT"));
  assert.equal(result.lifecycle_policy.verified_outcome_precedes_final_commitment_reconsideration, true);
});

test("planning V14 exposes lifecycle coordinator while preserving V13 compatibility", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V14/);
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V13/);
  assert.match(source, /"assess_lifecycle"/);
  assert.match(source, /cognition_lifecycle_contract/);
  assert.match(source, /assessOperatorIntelligenceCognitionLifecycle/);
  assert.match(source, /earlier_unresolved_stage_blocks_later_stage_acceptance/);
  assert.match(source, /lifecycle_completion_is_not_execution_authority/);
  assert.match(source, /executes_business_actions: false/);
});
