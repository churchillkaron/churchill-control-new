import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligencePlan,
  buildOperatorIntelligencePlan,
  reviseOperatorIntelligencePlan,
} from "../lib/operator/runtime/OperatorIntelligencePlanGraphRuntime.js";

function safeReadStep(overrides = {}) {
  return { id: "read-current-state", title: "Read current state", kind: "read", depends_on: [], mutates: false, verification: { required: true, criteria: ["Current scoped evidence was returned."] }, ...overrides };
}
function validatedMutationStep(overrides = {}) {
  return { id: "apply-change", title: "Apply governed change", kind: "action_candidate", depends_on: ["read-current-state"], capability_key: "finance.example.write", payload: { value: 1 }, mutates: true, risk: "medium", reversible: true, candidate_validation: { validated: true, payload_complete: true, missing_required_fields: [], normal_operator_governance_required: true }, verification: { required: true, criteria: ["Live read proves the intended change exists."] }, rollback: { available: true, strategy: "Restore the previous verified value through the registered rollback path." }, ...overrides };
}

test("plan graph orders dependencies and never auto-executes mutations", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Change a governed setting safely", brief: { completion_test: "Live evidence proves the final state." }, plan_steps: [safeReadStep(), validatedMutationStep()] });
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.execution_order, ["read-current-state", "apply-change"]);
  assert.equal(plan.budgets.automatic_mutating_steps, 0);
  assert.equal(plan.governance.planning_only, true);
  assert.equal(plan.governance.mutation_requires_normal_operator_governance, true);
});

test("empty plan graphs are invalid at the core planner boundary", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Reject empty planning", brief: {}, plan_steps: [] });
  assert.equal(plan.valid, false);
  assert.equal(plan.steps.length, 0);
  assert.ok(plan.issues.some((issue) => issue.code === "PLAN_REQUIRES_AT_LEAST_ONE_STEP"));
  assert.equal(plan.governance.plan_requires_at_least_one_step, true);
});

test("mutation steps require exact candidate validation, payload completeness and verification", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Unsafe mutation should be rejected", plan_steps: [{ id: "unsafe-change", title: "Unsafe change", kind: "action_candidate", mutates: true, risk: "high", candidate_validation: { validated: false, payload_complete: false, missing_required_fields: ["organization_id"] }, verification: { required: false, criteria: [] } }] });
  assert.equal(plan.valid, false);
  const codes = plan.issues.map((issue) => issue.code);
  assert.ok(codes.includes("MUTATION_CAPABILITY_KEY_REQUIRED"));
  assert.ok(codes.includes("MUTATION_ACTION_CANDIDATE_VALIDATION_REQUIRED"));
  assert.ok(codes.includes("MUTATION_PAYLOAD_INCOMPLETE"));
  assert.ok(codes.includes("MUTATION_COMPLETION_VERIFICATION_REQUIRED"));
});

test("dependency cycles are rejected", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Reject cyclic planning", plan_steps: [safeReadStep({ id: "a", depends_on: ["b"] }), safeReadStep({ id: "b", depends_on: ["a"] })] });
  assert.equal(plan.valid, false);
  assert.ok(plan.issues.some((issue) => issue.code === "PLAN_DEPENDENCY_CYCLE"));
});

test("completion is not proven without required verification evidence", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Verify before completion", plan_steps: [safeReadStep()] });
  const incomplete = assessOperatorIntelligencePlan({ plan, observations: [{ step_id: "read-current-state", status: "completed", verification_status: "unknown", evidence: ["read returned data"] }] });
  assert.equal(incomplete.completion_proven, false);
  assert.ok(incomplete.verification_proof_gaps.length > 0);
  const complete = assessOperatorIntelligencePlan({ plan, observations: [{ step_id: "read-current-state", status: "verified", verification_status: "pass", evidence: ["verified current state"] }] });
  assert.equal(complete.status, "COMPLETION_PROVEN");
  assert.equal(complete.completion_proven, true);
});

test("failed dependencies require replan and block dependent steps", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Handle a failed prerequisite", plan_steps: [safeReadStep(), validatedMutationStep()] });
  const assessment = assessOperatorIntelligencePlan({ plan, observations: [{ step_id: "read-current-state", status: "failed", verification_status: "fail", error: "live read unavailable" }] });
  assert.equal(assessment.status, "REPLAN_REQUIRED");
  assert.equal(assessment.requires_replan, true);
  assert.deepEqual(assessment.failed_step_ids, ["read-current-state"]);
  assert.equal(assessment.blocked_steps[0]?.step_id, "apply-change");
});

test("bounded replanning cannot rewrite completed history", () => {
  const plan = buildOperatorIntelligencePlan({ goal: "Preserve completed work", max_replans: 2, plan_steps: [safeReadStep(), validatedMutationStep()] });
  const observations = [{ step_id: "read-current-state", status: "verified", verification_status: "pass", evidence: ["current state verified"] }, { step_id: "apply-change", status: "failed", verification_status: "fail", error: "write rejected by governance" }];
  const rejected = reviseOperatorIntelligencePlan({ plan, observations, revised_steps: [safeReadStep({ title: "Rewrite completed history" }), validatedMutationStep({ id: "replacement-change" })] });
  assert.equal(rejected.status, "REPLAN_REJECTED_COMPLETED_HISTORY_MUTATION");
  assert.equal(rejected.blocked, true);
});

test("planning runtime exposes decision cognition including structured provenance without execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V8/);
  assert.match(source, /operator_plan_graph/);
  assert.match(source, /buildOperatorIntelligencePlan/);
  assert.match(source, /assessOperatorIntelligencePlan/);
  assert.match(source, /reviseOperatorIntelligencePlan/);
  assert.match(source, /deliberateOperatorIntelligenceDecision/);
  assert.match(source, /stressTestOperatorIntelligenceDecision/);
  assert.match(source, /assessOperatorIntelligenceDecisionValidity/);
  assert.match(source, /prioritizeOperatorIntelligenceUncertainties/);
  assert.match(source, /assessOperatorIntelligenceDecisionReadiness/);
  assert.match(source, /buildOperatorIntelligenceDecisionProvenance/);
  assert.match(source, /deterministic_structured_decision_provenance/);
  assert.match(source, /raw_chain_of_thought_never_required_or_persisted/);
  assert.match(source, /recommendations_are_not_execution_authority/);
  assert.match(source, /planning-only/);
  assert.match(source, /never executes business actions/);
  assert.match(source, /normal Operator governance/);
});
