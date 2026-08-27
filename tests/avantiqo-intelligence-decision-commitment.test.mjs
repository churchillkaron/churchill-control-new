import assert from "node:assert/strict";
import test from "node:test";
import {
  assessOperatorIntelligenceDecisionCommitment,
  OPERATOR_INTELLIGENCE_DECISION_COMMITMENT_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionCommitmentRuntime.js";

function base(overrides = {}) {
  return {
    decision: { candidate_id: "option-a", mutates: false, irreversible: false },
    readiness: { status: "READY_FOR_RECOMMENDATION", decision_ready: true },
    validity: { status: "VALID_WITHIN_POLICY", decision_valid_now: true },
    uncertainty_priority: { status: "NO_UNRESOLVED_UNCERTAINTY" },
    contingency: { status: "CONTINGENCY_READY", contingency_ready: true },
    outcome_contract: { status: "OUTCOME_CONTRACT_READY", outcome_contract_ready: true },
    outcome_assessment: {},
    decision_critical: true,
    ...overrides,
  };
}

test("valid ready governed decision can remain committed without execution authority", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base());
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_COMMITMENT_CONTRACT);
  assert.equal(result.status, "COMMIT_CURRENT_DECISION");
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
  assert.equal(result.commitment_policy.commitment_is_not_execution_authority, true);
});

test("verified invalidation abandons current decision when no validated fallback exists", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    validity: { status: "INVALIDATED_BY_VERIFIED_CHANGE", decision_valid_now: false },
    progress: { effort_spent: 1000, cost_spent: 50000, steps_completed: 9, total_steps: 10 },
  }));
  assert.equal(result.status, "ABANDON_CURRENT_DECISION");
  assert.equal(result.reason, "VERIFIED_DECISION_INVALIDATION");
  assert.equal(result.commitment_policy.sunk_cost_never_increases_commitment, true);
  assert.equal(result.commitment_policy.completed_work_never_rescues_an_invalid_decision, true);
});

test("verified failure switches only to explicit validated decision-ready fallback for planning", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    outcome_assessment: { status: "OUTCOME_FAILED", decision_success_proven: false },
    fallback_candidate: { candidate_id: "option-b", validated: true, decision_ready: true },
  }));
  assert.equal(result.status, "SWITCH_TO_FALLBACK");
  assert.equal(result.fallback_selected_for_planning, "option-b");
  assert.equal(result.governance.fallback_switch_is_cognitive_only, true);
  assert.equal(result.governance.switches_business_state, false);
});

test("already applied mutating invalidated decision escalates instead of auto rollback", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    decision: { candidate_id: "option-a", mutates: true, irreversible: false, already_applied: true },
    validity: { status: "INVALIDATED_BY_VERIFIED_CHANGE", decision_valid_now: false },
    fallback_candidate: { candidate_id: "option-b", validated: true, decision_ready: true },
  }));
  assert.equal(result.status, "ESCALATE_TO_HUMAN");
  assert.equal(result.governance.performs_rollback, false);
  assert.equal(result.commitment_policy.abandonment_is_not_rollback_authority, true);
});

test("warning pauses and revalidates before continued commitment", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    outcome_assessment: { status: "OUTCOME_WARNING" },
  }));
  assert.equal(result.status, "PAUSE_AND_REVALIDATE");
  assert.equal(result.reason, "VERIFIED_OUTCOME_WARNING");
});

test("human-only uncertainty escalates before lower priority concerns", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    uncertainty_priority: { status: "HUMAN_DECISION_REQUIRED" },
    contingency: { status: "CRITICAL_CONTINGENCY_GAPS", contingency_ready: false },
  }));
  assert.equal(result.status, "ESCALATE_TO_HUMAN");
  assert.equal(result.reason, "HUMAN_ONLY_DECISION_UNCERTAINTY");
});

test("decision-relevant uncertainty blocks commitment until resolved", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    uncertainty_priority: { status: "RESOLVE_NEXT", next_action: "RESOLVE_VIA_LIVE_READ" },
  }));
  assert.equal(result.status, "RESOLVE_UNCERTAINTY_FIRST");
  assert.equal(result.next_action, "RESOLVE_VIA_LIVE_READ");
});

test("critical decision without ready outcome contract cannot remain committed", () => {
  const result = assessOperatorIntelligenceDecisionCommitment(base({
    outcome_contract: { status: "OUTCOME_CONTRACT_GAPS", outcome_contract_ready: false },
  }));
  assert.equal(result.status, "PAUSE_AND_REVALIDATE");
  assert.equal(result.reason, "DECISION_CRITICAL_OUTCOME_CONTRACT_NOT_READY");
});
