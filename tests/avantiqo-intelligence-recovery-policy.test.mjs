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

const GOVERNED_OUTCOME_CONTRACT = "AVANTIQO_GOVERNED_TOOL_OUTCOME_V1";
const READ_CAPABILITY = "platform.example.read";

function readStep(overrides = {}) {
  return {
    id: "read-current-state",
    title: "Read current state",
    kind: "read",
    depends_on: [],
    capability_key: READ_CAPABILITY,
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

function receipt({
  plan,
  id = "tool-call-1",
  stepId = "read-current-state",
  binding = READ_CAPABILITY,
  outcome = "failed",
  code = "UPSTREAM_UNAVAILABLE",
  mutates = false,
  planId = plan?.plan_id,
} = {}) {
  return {
    contract: GOVERNED_OUTCOME_CONTRACT,
    tool_call_id: id,
    tool_name: "operator_live_read",
    binding_key: binding,
    plan_id: planId || null,
    plan_step_id: stepId || null,
    outcome,
    code: outcome === "succeeded" ? null : code,
    mutates,
    reasoning_turn: 1,
    raw_result_persisted: false,
    raw_error_persisted: false,
  };
}

function failedObservation(overrides = {}) {
  return {
    step_id: "read-current-state",
    status: "failed",
    verification_status: "fail",
    tool_call_id: "tool-call-1",
    failure_code: "UPSTREAM_UNAVAILABLE",
    attempts: 1,
    ...overrides,
  };
}

test("recovery policy exposes the canonical contract", () => {
  assert.equal(
    OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
    "AVANTIQO_OPERATOR_INTELLIGENCE_RECOVERY_POLICY_V1",
  );
});

test("known transient non-mutating governed failure retries within explicit budget", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Read current state and continue safely",
    plan_steps: [readStep({ retry_budget: 2 }), analysisStep()],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [failedObservation()],
    governed_tool_outcomes: [receipt({ plan })],
  });

  assert.equal(assessment.status, "RETRY_REQUIRED");
  assert.equal(assessment.retry_required, true);
  assert.equal(assessment.requires_replan, false);
  assert.deepEqual(assessment.retry_step_ids, ["read-current-state"]);
  assert.equal(assessment.recovery_decisions[0]?.governed_attempts, 1);
  assert.equal(assessment.recovery_decisions[0]?.remaining_retries, 2);
  assert.equal(assessment.recovery_decisions[0]?.failure_code_attested, true);
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "ATTESTED_TRANSIENT_NON_MUTATING_FAILURE_RETRY_ALLOWED",
  );
  assert.equal(assessment.governance.retries_are_bounded, true);
  assert.equal(assessment.governance.governed_attempt_history_controls_retry_budget, true);
});

test("model-provided transient code cannot authorize retry without governed attestation", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Reject invented retry authority",
    plan_steps: [readStep({ retry_budget: 3 })],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [failedObservation({ failure_code: "TIMEOUT" })],
    governed_tool_outcomes: [],
  });

  assert.equal(assessment.retry_required, false);
  assert.equal(assessment.requires_replan, true);
  assert.equal(assessment.recovery_decisions[0]?.failure_code, null);
  assert.equal(assessment.recovery_decisions[0]?.claimed_failure_code, "TIMEOUT");
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "GOVERNED_TOOL_OUTCOME_NOT_FOUND",
  );
});

test("missing or mismatched governed plan-step binding never authorizes retry", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Fail closed on plan binding",
    plan_steps: [readStep({ retry_budget: 3 })],
  });
  const cases = [
    {
      governed: receipt({ plan, planId: null }),
      reason: "GOVERNED_PLAN_STEP_BINDING_REQUIRED",
    },
    {
      governed: receipt({ plan, planId: "plan-other" }),
      reason: "GOVERNED_PLAN_STEP_BINDING_MISMATCH",
    },
    {
      governed: receipt({ plan, stepId: "other-step" }),
      reason: "GOVERNED_PLAN_STEP_BINDING_MISMATCH",
    },
  ];

  for (const item of cases) {
    const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
      plan,
      observations: [failedObservation({ failure_code: "TIMEOUT" })],
      governed_tool_outcomes: [item.governed],
    });
    assert.equal(assessment.retry_required, false);
    assert.equal(assessment.recovery_decisions[0]?.retry_allowed, false);
    assert.equal(assessment.recovery_decisions[0]?.reason, item.reason);
  }
});

test("governed outcome overrides a conflicting model failure code", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Trust governed failure evidence over model claims",
    plan_steps: [readStep({ retry_budget: 3 })],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [failedObservation({ failure_code: "TIMEOUT" })],
    governed_tool_outcomes: [receipt({ plan, code: "PERMISSION_DENIED" })],
  });

  assert.equal(assessment.retry_required, false);
  assert.equal(assessment.recovery_decisions[0]?.claimed_failure_code, "TIMEOUT");
  assert.equal(assessment.recovery_decisions[0]?.failure_code, "PERMISSION_DENIED");
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "FAILURE_CODE_NOT_RETRYABLE",
  );
});

test("missing capability binding, mismatched binding and succeeded receipts never authorize retry", () => {
  const cases = [
    {
      step: readStep({ capability_key: null }),
      receiptOptions: {},
      reason: "STEP_CAPABILITY_BINDING_REQUIRED",
    },
    {
      step: readStep(),
      receiptOptions: { binding: "platform.other.read" },
      reason: "GOVERNED_TOOL_OUTCOME_BINDING_MISMATCH",
    },
    {
      step: readStep(),
      receiptOptions: { outcome: "succeeded" },
      reason: "GOVERNED_TOOL_OUTCOME_NOT_FAILURE",
    },
  ];

  for (const item of cases) {
    const plan = buildOperatorIntelligencePlan({
      goal: "Fail closed on invalid retry binding",
      plan_steps: [item.step],
    });
    const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
      plan,
      observations: [failedObservation({ failure_code: "TIMEOUT" })],
      governed_tool_outcomes: [receipt({ plan, ...item.receiptOptions })],
    });
    assert.equal(assessment.retry_required, false);
    assert.equal(assessment.recovery_decisions[0]?.retry_allowed, false);
    assert.equal(assessment.recovery_decisions[0]?.reason, item.reason);
  }
});

test("governance, unknown and blocked governed failures cannot auto-retry", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Do not loop on non-transient failure",
    plan_steps: [readStep({ retry_budget: 3 })],
  });

  const cases = [
    {
      observation: failedObservation({ failure_code: "PERMISSION_DENIED" }),
      governed: receipt({ plan, code: "PERMISSION_DENIED" }),
    },
    {
      observation: failedObservation({ failure_code: "SOMETHING_UNCLASSIFIED" }),
      governed: receipt({ plan, code: "SOMETHING_UNCLASSIFIED" }),
    },
    {
      observation: failedObservation({
        status: "blocked",
        failure_code: "UPSTREAM_UNAVAILABLE",
      }),
      governed: receipt({ plan, outcome: "blocked", code: "UPSTREAM_UNAVAILABLE" }),
    },
  ];

  for (const item of cases) {
    const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
      plan,
      observations: [item.observation],
      governed_tool_outcomes: [item.governed],
    });
    assert.equal(assessment.retry_required, false);
    assert.equal(assessment.requires_replan, true);
    assert.equal(assessment.recovery_decisions[0]?.retry_allowed, false);
  }
});

test("mutating steps are never auto-retried even with attested transient codes and retry budget", () => {
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
      tool_call_id: "tool-call-write",
      failure_code: "TIMEOUT",
      attempts: 1,
    }],
    governed_tool_outcomes: [receipt({
      plan,
      id: "tool-call-write",
      stepId: "apply-change",
      binding: "finance.example.write",
      code: "TIMEOUT",
      mutates: true,
    })],
  });

  assert.equal(assessment.retry_required, false);
  assert.equal(assessment.requires_replan, true);
  assert.equal(assessment.recovery_decisions[0]?.retry_allowed, false);
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "MUTATING_STEP_NEVER_AUTO_RETRIED",
  );
});

test("governed second failure exhausts one-retry budget even when model still claims attempts one", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Stop retry loops from real governed history",
    plan_steps: [readStep({ retry_budget: 1 })],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [failedObservation({
      tool_call_id: "tool-call-2",
      failure_code: "NETWORK_TIMEOUT",
      attempts: 1,
    })],
    governed_tool_outcomes: [
      receipt({ plan, id: "tool-call-1", code: "NETWORK_TIMEOUT" }),
      receipt({ plan, id: "tool-call-2", code: "NETWORK_TIMEOUT" }),
    ],
  });

  assert.equal(assessment.retry_required, false);
  assert.equal(assessment.requires_replan, true);
  assert.equal(assessment.recovery_decisions[0]?.claimed_attempts, 1);
  assert.equal(assessment.recovery_decisions[0]?.governed_attempts, 2);
  assert.equal(assessment.recovery_decisions[0]?.remaining_retries, 0);
  assert.equal(
    assessment.recovery_decisions[0]?.reason,
    "RETRY_BUDGET_EXHAUSTED",
  );
});

test("same capability on another step does not consume this step retry budget", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Keep retry accounting step exact",
    plan_steps: [
      readStep({ retry_budget: 1 }),
      readStep({ id: "read-other-state", title: "Read other state", retry_budget: 1 }),
    ],
  });
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [failedObservation()],
    governed_tool_outcomes: [
      receipt({ plan, id: "other-call", stepId: "read-other-state" }),
      receipt({ plan, id: "tool-call-1", stepId: "read-current-state" }),
    ],
  });

  assert.equal(assessment.retry_required, true);
  assert.equal(assessment.recovery_decisions[0]?.governed_attempts, 1);
  assert.equal(assessment.recovery_decisions[0]?.remaining_retries, 1);
});

test("replanning is deterministically deferred while an attested safe retry remains", () => {
  const plan = buildOperatorIntelligencePlan({
    goal: "Retry first, then replan only if needed",
    plan_steps: [readStep({ retry_budget: 2 })],
  });
  const revised = reviseOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations: [failedObservation({ failure_code: "SERVICE_UNAVAILABLE" })],
    governed_tool_outcomes: [receipt({ plan, code: "SERVICE_UNAVAILABLE" })],
    revised_steps: [readStep({ id: "replacement-read" })],
  });

  assert.equal(revised.status, "REPLAN_DEFERRED_RETRY_REQUIRED");
  assert.equal(revised.blocked, false);
  assert.deepEqual(revised.retry_step_ids, ["read-current-state"]);
  assert.equal(revised.plan.plan_id, plan.plan_id);
});

test("canonical planning tool is wired to attested deterministic recovery policy", () => {
  const source = fs.readFileSync(
    new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /OperatorIntelligenceRecoveryPolicyRuntime/);
  assert.match(source, /assessOperatorIntelligencePlanWithRecoveryPolicy/);
  assert.match(source, /reviseOperatorIntelligencePlanWithRecoveryPolicy/);
  assert.match(source, /governed_tool_outcomes/);
  assert.match(source, /retry_requires_governed_outcome_attestation: true/);
  assert.match(source, /model_failure_codes_never_authorize_retry: true/);
  assert.match(source, /deterministic_bounded_recovery: true/);
  assert.match(source, /mutating_steps_never_auto_retry: true/);
});
