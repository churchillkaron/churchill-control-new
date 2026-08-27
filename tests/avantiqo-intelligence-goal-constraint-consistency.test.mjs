import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessOperatorIntelligenceGoalConstraintConsistency,
  OPERATOR_INTELLIGENCE_GOAL_CONSTRAINT_CONSISTENCY_CONTRACT,
} from "../lib/operator/runtime/OperatorIntelligenceGoalConstraintConsistencyRuntime.js";

function goals() {
  return [
    { id: "company", title: "Protect durable company value" },
    { id: "finance", parent_id: "company", title: "Improve finance efficiency" },
    { id: "invoice", parent_id: "finance", title: "Improve invoice workflow" },
  ];
}

function hardConstraint(overrides = {}) {
  return {
    id: "budget-cap",
    goal_id: "company",
    key: "monthly_cost",
    operator: "max",
    value: 1000,
    hard: true,
    inheritable: true,
    verified: true,
    current: true,
    source: "governance.budget_policy",
    ...overrides,
  };
}

function alignments() {
  return [
    { id: "a1", parent_goal_id: "company", child_goal_id: "finance", status: "supports", verified: true, current: true, source: "governance.goal_registry" },
    { id: "a2", parent_goal_id: "finance", child_goal_id: "invoice", status: "compatible", verified: true, current: true, source: "governance.goal_registry" },
  ];
}

function subjectClaim(value = 900) {
  return {
    id: "claim-cost",
    key: "monthly_cost",
    value,
    verified: true,
    current: true,
    source: "finance.verified_cost_projection",
  };
}

test("verified hierarchy and inherited hard constraint can prove consistency without execution authority", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint()],
    alignment_assertions: alignments(),
    subject: { id: "plan-a", kind: "plan", claims: [subjectClaim()] },
  });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_GOAL_CONSTRAINT_CONSISTENCY_CONTRACT);
  assert.equal(result.status, "CONSISTENCY_PROVEN");
  assert.equal(result.consistency_proven, true);
  assert.deepEqual(result.goal_chain.map((row) => row.id), ["company", "finance", "invoice"]);
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
});

test("child may tighten but never weaken an inherited hard maximum", () => {
  const tightened = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint(), hardConstraint({ id: "child-cap", goal_id: "invoice", value: 800 })],
    alignment_assertions: alignments(),
    subject: { claims: [subjectClaim(750)] },
  });
  assert.equal(tightened.status, "CONSISTENCY_PROVEN");

  const weakened = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint(), hardConstraint({ id: "child-cap", goal_id: "invoice", value: 1500 })],
    alignment_assertions: alignments(),
    subject: { claims: [subjectClaim(900)] },
  });
  assert.equal(weakened.status, "HARD_CONSTRAINT_CONFLICT");
  assert.equal(weakened.hard_constraint_weakening_conflicts[0]?.code, "CHILD_ATTEMPTS_TO_WEAKEN_HARD_CONSTRAINT");
});

test("verified subject violation of inherited hard constraint rejects current plan for planning", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint()],
    alignment_assertions: alignments(),
    subject: { claims: [subjectClaim(1200)] },
  });
  assert.equal(result.status, "HARD_CONSTRAINT_VIOLATION");
  assert.equal(result.consistency_proven, false);
  assert.equal(result.hard_constraint_violations[0]?.code, "SUBJECT_VIOLATES_EFFECTIVE_CONSTRAINT");
});

test("unverified hard constraint fails closed instead of being silently ignored", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint({ verified: false })],
    alignment_assertions: alignments(),
    subject: { claims: [subjectClaim()] },
  });
  assert.equal(result.status, "HARD_CONSTRAINT_VERIFICATION_REQUIRED");
  assert.equal(result.consistency_proven, false);
});

test("parent child goal conflict blocks descendant planning", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint()],
    alignment_assertions: [
      alignments()[0],
      { id: "conflict", parent_goal_id: "finance", child_goal_id: "invoice", status: "conflicts", verified: true, current: true, source: "governance.goal_registry" },
    ],
    subject: { claims: [subjectClaim()] },
  });
  assert.equal(result.status, "GOAL_CONFLICT");
  assert.equal(result.verified_goal_conflicts[0]?.child_goal_id, "invoice");
});

test("missing verified subject proof cannot prove hard-constraint consistency", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint()],
    alignment_assertions: alignments(),
    subject: { claims: [] },
  });
  assert.equal(result.status, "CONSTRAINT_PROOF_REQUIRED");
  assert.equal(result.constraint_proof_gaps[0]?.code, "VERIFIED_CURRENT_SUBJECT_CLAIM_REQUIRED");
});

test("invalid hierarchy cycle fails before local optimization", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: [
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ],
    target_goal_id: "a",
    constraints: [],
    alignment_assertions: [],
    subject: {},
  });
  assert.equal(result.status, "GOAL_HIERARCHY_INVALID");
  assert.ok(result.hierarchy_issues.includes("GOAL_HIERARCHY_CYCLE"));
});

test("lower-level optimization never overrides higher-level hard constraints", () => {
  const result = assessOperatorIntelligenceGoalConstraintConsistency({
    goals: goals(),
    target_goal_id: "invoice",
    constraints: [hardConstraint()],
    alignment_assertions: alignments(),
    subject: {
      kind: "decision",
      constraint_violations: ["Would exceed company-approved budget"],
      claims: [subjectClaim(900)],
    },
  });
  assert.equal(result.status, "HARD_CONSTRAINT_VIOLATION");
  assert.equal(result.consistency_policy.local_progress_never_overrides_ancestor_constraints, true);
  assert.equal(result.consistency_policy.lower_level_optimization_never_overrides_higher_level_hard_constraints, true);
  assert.equal(result.governance.hierarchy_consistency_is_not_execution_authority, true);
});

test("planning V13 exposes hierarchical consistency without mutation authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V13/);
  assert.match(source, /"assess_goal_constraints"/);
  assert.match(source, /goal_constraint_consistency_contract/);
  assert.match(source, /deterministic_hierarchical_goal_constraint_consistency/);
  assert.match(source, /hard_ancestor_constraints_inherit_downward/);
  assert.match(source, /rewrites_parent_goals: false/);
  assert.match(source, /waives_hard_constraints: false/);
  assert.match(source, /executes_business_actions: false/);
});
