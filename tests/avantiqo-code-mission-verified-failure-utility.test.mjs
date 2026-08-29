import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
  buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation,
  recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility,
} from "../lib/intelligence/runtime/AvantiqoCodeMissionVerifiedFailureUtilityRuntime.js";

const HEAD = "d".repeat(40);

function missionContext({ head = HEAD, withKnowledge = true } = {}) {
  return {
    contract: "AVANTIQO_INTELLIGENCE_CODE_MISSION_V1",
    status: "READY_FOR_CODE",
    mission: {
      id: "mission-verified-failure-utility",
      objective: "Apply a verified implementation and repair it until deterministic verification passes.",
    },
    repository_context: {
      repository_url: "https://github.com/churchillkaron/churchill-control-new.git",
      ref: "main",
      head_sha: head,
      observed_at: "2026-08-29T05:00:00.000Z",
    },
    learned_knowledge: {
      evaluated: true,
      status: withKnowledge ? "REUSED_VERIFIED_KNOWLEDGE" : "NO_RELEVANT_VERIFIED_KNOWLEDGE",
      knowledge: withKnowledge ? [{
        id: "released-knowledge-1",
        subject: "Verified repair pattern",
        content: "Reuse the current architecture and close deterministic verification gaps before completion.",
        verification_status: "HYBRID_VERIFIED_PLATFORM_KNOWLEDGE",
        reusable: true,
        provenance: {
          topic_key: "code:verified-repair-pattern",
          source: "avantiqo_explicit_final_knowledge_release",
        },
      }] : [],
      freshness_checked: true,
      evidence_graph_checked: true,
      knowledge_authorizes_execution: false,
    },
  };
}

function failedVerificationState({
  head = HEAD,
  status = "running",
  blocker = "CODE_AI_VERIFICATION_FAILED:node:1",
  includeChanges = true,
  laterSuccess = false,
  plannerPending = null,
} = {}) {
  const failedAt = "2026-08-29T05:10:00.000Z";
  const verification = [{
    at: failedAt,
    operation_id: "batch_4_02_verify",
    passed: false,
  }];
  const tests = [{
    at: failedAt,
    operation_id: "batch_4_02_verify",
    command: "node",
    args: ["tests/example.test.mjs"],
    exit_code: 1,
    stdout: "",
    stderr: "AssertionError",
  }];
  if (laterSuccess) {
    verification.push({
      at: "2026-08-29T05:11:00.000Z",
      operation_id: "batch_4_03_verify",
      passed: true,
    });
    tests.push({
      at: "2026-08-29T05:11:00.000Z",
      operation_id: "batch_4_03_verify",
      command: "node",
      args: ["tests/example.test.mjs"],
      exit_code: 0,
      stdout: "ok",
      stderr: "",
    });
  }
  return {
    base_commit: head,
    status,
    blockers: blocker ? [blocker] : [],
    files_changed: includeChanges ? ["lib/example.js"] : [],
    source_changes: includeChanges ? [{
      path: "lib/example.js",
      operation: "write",
      content: "export const value = 1;",
    }] : [],
    patch: includeChanges ? "diff --git a/lib/example.js b/lib/example.js" : null,
    tests,
    verification,
    failures: [{
      at: failedAt,
      operation_id: "batch_4_02_verify",
      action: "verify",
      message: "CODE_AI_VERIFICATION_FAILED:node:1",
    }],
    work_package_control: {
      reasoning_call_budget: 4,
      reasoning_calls_used: 4,
      packages_executed: 4,
    },
    planner_pending: plannerPending,
  };
}

function employeeCompletion() {
  return {
    contract: "AVANTIQO_CODE_AI_EMPLOYEE_COMPLETION_V1",
    complete: false,
    changed: true,
    verified: false,
    final_diff_observed: false,
    low_level_completed: false,
    blockers: ["CODE_AI_EMPLOYEE_SUCCESSFUL_VERIFICATION_REQUIRED"],
  };
}

function passBudgetFailure(overrides = {}) {
  return {
    contract: "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1",
    success: false,
    status: "blocked",
    reason: "CODE_AI_EMPLOYEE_PASS_BUDGET_EXHAUSTED:8",
    employee_completion: employeeCompletion(),
    state: failedVerificationState(),
    ...overrides,
  };
}

test("pass-budget exhausted mission with unresolved deterministic verification failure becomes verified negative utility", () => {
  const projected = buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
    mission_context: missionContext(),
    code_result: passBudgetFailure(),
  });

  assert.equal(projected.contract, AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT);
  assert.equal(projected.applicable, true);
  assert.equal(projected.status, "READY_FOR_VERIFIED_FAILURE_UTILITY_FEEDBACK");
  assert.equal(projected.execution.status, "failed");
  assert.equal(projected.execution.capability.key, "platform.code_ai_autonomous.execute");
  assert.match(projected.execution.reason, /CODE_AI_VERIFIED_UNSUCCESSFUL_COMPLETION:CODE_AI_VERIFICATION_FAILED/);
  assert.equal(projected.evidence.failure_mode, "PASS_BUDGET_EXHAUSTED");
  assert.equal(projected.evidence.deterministic_verification.exit_code, 1);
  assert.equal(projected.decision.knowledge_reuse.reused, true);
  assert.equal(projected.governance.provider_or_scheduler_failure_eligible, false);
  assert.equal(projected.governance.causal_attribution_allowed, false);
  assert.equal(projected.governance.automatic_knowledge_promotion, false);
  assert.equal(projected.governance.automatic_training_effect, "NONE");
});

test("reasoning-budget exhaustion qualifies only when the preserved state is still verification repair", () => {
  const qualifying = passBudgetFailure({
    reason: "CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED:4:4",
    state: failedVerificationState({ status: "repair_required" }),
  });
  const projected = buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
    mission_context: missionContext(),
    code_result: qualifying,
  });
  assert.equal(projected.applicable, true);
  assert.equal(projected.evidence.failure_mode, "REASONING_BUDGET_EXHAUSTED");

  const infrastructureBlocked = passBudgetFailure({
    reason: "CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED:4:4",
    state: failedVerificationState({
      status: "blocked",
      blocker: "CODE_AI_PLANNER_PROVIDER_FAILED",
    }),
  });
  const rejected = buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
    mission_context: missionContext(),
    code_result: infrastructureBlocked,
  });
  assert.equal(rejected.applicable, false);
  assert.ok(rejected.blockers.includes("REASONING_EXHAUSTION_MUST_END_IN_REPAIR_REQUIRED_STATE"));
  assert.ok(rejected.blockers.includes("REASONING_EXHAUSTION_VERIFICATION_BLOCKER_REQUIRED"));
});

test("later successful verification cancels negative utility eligibility", () => {
  const projected = buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
    mission_context: missionContext(),
    code_result: passBudgetFailure({
      state: failedVerificationState({ laterSuccess: true }),
    }),
  });
  assert.equal(projected.applicable, false);
  assert.ok(projected.blockers.includes("LATEST_FAILED_DETERMINISTIC_VERIFICATION_REQUIRED"));
});

test("provider, planner, repository movement, and no-change outcomes never become negative utility", () => {
  const cases = [
    passBudgetFailure({
      reason: "CODE_AI_PLANNER_PROVIDER_FAILED",
      state: failedVerificationState({ status: "blocked", blocker: "CODE_AI_PLANNER_PROVIDER_FAILED" }),
    }),
    passBudgetFailure({
      reason: "CODE_AI_BATCHED_PLANNER_PENDING",
      state: failedVerificationState({ plannerPending: { id: "pending" } }),
    }),
    passBudgetFailure({
      state: failedVerificationState({ head: "e".repeat(40) }),
    }),
    passBudgetFailure({
      state: failedVerificationState({ includeChanges: false }),
    }),
  ];

  for (const codeResult of cases) {
    const projected = buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
      mission_context: missionContext(),
      code_result: codeResult,
    });
    assert.equal(projected.applicable, false);
  }
});

test("verified negative utility recording is deterministic and observational only", async () => {
  let calls = 0;
  let captured = null;
  const recorder = async (input) => {
    calls += 1;
    captured = input;
    return {
      written: true,
      outcome: "VERIFIED_FAILURE",
      memory_key: "knowledge-utility:deterministic",
      receipt_fingerprint: "receipt-negative",
      idempotent_observation: true,
    };
  };

  const first = await recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility({
    mission_context: missionContext(),
    code_result: passBudgetFailure(),
    recorder,
  });
  const second = await recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility({
    mission_context: missionContext(),
    code_result: passBudgetFailure(),
    recorder,
  });

  assert.equal(calls, 2);
  assert.equal(first.status, "VERIFIED_FAILURE_UTILITY_FEEDBACK_RECORDED");
  assert.equal(second.status, "VERIFIED_FAILURE_UTILITY_FEEDBACK_RECORDED");
  assert.equal(first.outcome, "VERIFIED_FAILURE");
  assert.equal(first.idempotent_observation, true);
  assert.equal(captured.observation_key, second.memory_key ? captured.observation_key : captured.observation_key);
  assert.match(captured.observation_key, /^verified-code-knowledge-utility:platform\.code_ai_autonomous\.execute:/);
  assert.equal(captured.execution.status, "failed");
  assert.equal(captured.decision.knowledge_reuse.reused, true);
});

test("mission without reused knowledge performs no negative utility write", async () => {
  let calls = 0;
  const result = await recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility({
    mission_context: missionContext({ withKnowledge: false }),
    code_result: passBudgetFailure(),
    recorder: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.written, false);
  assert.equal(result.status, "NOT_APPLICABLE_NO_REUSED_KNOWLEDGE");
});
