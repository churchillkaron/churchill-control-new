import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
  assessOperatorIntelligencePlanWithRecoveryPolicy,
  reviseOperatorIntelligencePlanWithRecoveryPolicy,
} from "../lib/operator/runtime/OperatorIntelligenceRecoveryPolicyRuntime.js";
import {
  buildOperatorIntelligencePlan,
} from "../lib/operator/runtime/OperatorIntelligencePlanGraphRuntime.js";

function readStep(overrides = {}) {
  return {
    id: "read-current-state",
    title: "Read current state",
    kind: "read",
    depends_on: [],
    mutates: false,
    retry_budget: 1,
    verification: {
      required: true,
      criteria: ["Current scoped evidence was returned."],
    },
    ...overrides,
  };
}

function analysisStep(overrides = {}) {
  return {
    id: "analyze-state",
    title: "Analyze current state",
    kind: "analysis",
    depends_on: ["read-current-state"],
    mutates: false,
    retry_budget: 1,
    verification: { required: false, criteria: [] },
    ...overrides,
  };
}

function mutationStep(overrides = {}) {
  return {
    id: "apply-change",
    title: "Apply governed change",
    kind: "action_candidate",
    depends_on: [],
    capability_key: "finance.example.write",
    payload: { value: 1 },
    mutates: true,
    retry_budget: 3,
    risk: "medium",
    reversible: true,
    candidate_validation: {
      validated: true,
      payload_complete: true,
      missing_required_fields: [],
      normal_operator_governance_required: true,
    },
    verification: {
      required: true,
      criteria: ["Live read proves the intended change exists."],
    },
    rollback: {
      available: true,
      strategy: "Restore the previous verified value.",
    },
    ...overrides,
  };
}

test("recovery policy exposes the canonical contract", () => {
  assert.equal(
    OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
    "AVANTIQO_OPERATOR_INTELLIGENCE_RECOVERY_POLICY_V1",
  );
});

test("known transient non-mutating failure retries within explicit budget", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Read current state and continue safely",
    plan_steps: [readStep({ retry_budget: 2 }), analysisStep()],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [{
      step_id: "read-current-state",
      status: "failed",
      verification_status: "fail",
      failure_code: "UPSTREAM_UNAVAILABLE",
      attempts: 1,
    }],
  });

  assert.equal(assessment.status, "RETRY_REQUIRED");
  assert.equal(assessment.retry_required, true);
  assert.equal(assessment.requires_replan, false);
  assert.deepEqual(assessment.retry_step_ids, ["read-current-state"]);
  assert.equal(assessment.recovery_decisions[0]?.remaining_retries, 2);
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "TRANSIENT_NON_MUTATING_FAILURE_RETRY_ALLOWED",
  );
  assert.equal(assessment.governance.retries_are_bounded, true);
});

test("governance, unknown and blocked failures cannot auto-retry", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Do not loop on non-transient failure",
    plan_steps: [readStep({ retry_budget: 3 })],
  });

  for (const observation of [
    {
      step_id: "read-current-state",
      status: "failed",
      failure_code: "PERMISSION_DENIED",
      attempts: 1,
    },
    {
      step_id: "read-current-state",
      status: "failed",
      failure_code: "SOMETHING_UNCLASSIFIED",
      attempts: 1,
    },
    {
      step_id: "read-current-state",
      status: "blocked",
      failure_code: "UPSTREAM_UNAVAILABLE",
      attempts: 1,
    },
  ]) {
    const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
      plan,
      observations: [observation],
    });
    assert.equal(assessment.retry_required, false);
    assert.equal(assessment.requires_replan, true);
    assert.equal(assessment.recovery_decisions[0]?.retry_allowed, false);
  }
});

test("mutating steps are never auto-retried even with transient codes and retry budget", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Never repeat a write automatically",
    plan_steps: [mutationStep()],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [{
      step_id: "apply-change",
      status: "failed",
      verification_status: "fail",
      failure_code: "TIMEOUT",
      attempts: 1,
    }],
  });

  assert.equal(assessment.retry_required, false);
  assert.equal(assessment.requires_replan, true);
  assert.equal(assessment.recovery_decisions[0]?.retry_allowed, false);
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "MUTATING_STEP_NEVER_AUTO_RETRIED",
  );
});

test("retry budget exhaustion forces replan instead of an unbounded retry loop", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Stop retry loops",
    plan_steps: [readStep({ retry_budget: 1 })],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [{
      step_id: "read-current-state",
      status: "failed",
      verification_status: "fail",
      failure_code: "NETWORK_TIMEOUT",
      attempts: 2,
    }],
  });

  assert.equal(assessment.retry_required, false);
  assert.equal(assessment.requires_replan, true);
  assert.equal(assessment.recovery_decisions[0]?.remaining_retries, 0);
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "RETRY_BUDGET_EXHAUSTED",
  );
});

test("replanning is deterministically deferred while a safe retry remains", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Retry first, then replan only if needed",
    plan_steps: [readStep({ retry_budget: 2 })],
  });
  const revised = reviseOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [{
      step_id: "read-current-state",
      status: "failed",
      verification_status: "fail",
      failure_code: "SERVICE_UNAVAILABLE",
      attempts: 1,
    }],
    revised_steps: [readStep({ id: "replacement-read" })],
  });

  assert.equal(revised.status, "REPLAN_DEFERRED_RETRY_REQUIRED");
  assert.equal(revised.blocked, false);
  assert.deepEqual(revised.retry_step_ids, ["read-current-state"]);
  assert.equal(revised.plan.plan_id, plan.plan_id);
});

test("canonical planning tool is wired to deterministic recovery policy", () => {
  const source = fs.readFileSync(
    new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /OperatorIntelligenceRecoveryPolicyRuntime/);
  assert.match(source, /assessOperatorIntelligencePlanWithRecoveryPolicy/);
  assert.match(source, /reviseOperatorIntelligencePlanWithRecoveryPolicy/);
  assert.match(source, /deterministic_bounded_recovery: true/);
  assert.match(source, /mutating_steps_never_auto_retry: true/);
});