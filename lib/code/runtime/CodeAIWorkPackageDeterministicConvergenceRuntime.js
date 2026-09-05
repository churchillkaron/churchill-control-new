import { executeCodeAIMission } from "./CodeAIMissionRuntime.js";
import {
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
} from "./CodeAIWorkPackageCoreRuntime.js";
import {
  executeBatchedAutonomousCodeMissionLive,
  CodeAIWorkPackageRuntimeLive,
} from "./CodeAIWorkPackageRuntimeLive.js";
import { publishCodeAILiveProgress } from "./CodeAILiveProgressRuntime.js";
import {
  planCodeAIDeterministicVerificationGates,
  CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
} from "./CodeAIDeterministicVerificationPlanRuntime.js";
import {
  assessCodeAIWorldClassQuality,
} from "./CodeAIWorldClassQualityPolicy.js";

export const CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT =
  "AVANTIQO_CODE_AI_DETERMINISTIC_CONVERGENCE_V1";

function text(value, maximum = 120000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function time(value) {
  const parsed = Date.parse(text(value, 120));
  return Number.isFinite(parsed) ? parsed : 0;
}

function reasoningCalls(state) {
  const parsed = Number(state?.work_package_control?.reasoning_calls_used);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function authoritativeVerification(value) {
  const source = object(value);
  const command = text(source.authoritative_verification_command, 300);
  const args = list(source.authoritative_verification_args)
    .slice(0, 24)
    .map((item) => text(item, 500))
    .filter(Boolean);
  return command ? { command, args } : null;
}

function latestCompletedMutationAt(state) {
  let latest = 0;
  for (const entry of list(state?.evidence)) {
    if (text(entry?.kind, 120) !== "operation") continue;
    if (text(entry?.status, 80) !== "completed") continue;
    const action = text(entry?.action, 80);
    if (!["apply_files", "delete_files", "rename_files"].includes(action)) continue;
    latest = Math.max(latest, time(entry?.at));
  }
  return latest;
}

function latestFiniteTest(state) {
  const tests = list(state?.tests);
  for (let index = tests.length - 1; index >= 0; index -= 1) {
    const entry = object(tests[index]);
    const exitCode = Number(entry.exit_code);
    if (!Number.isFinite(exitCode)) continue;
    return {
      at: time(entry.at),
      operation_id: text(entry.operation_id, 200) || null,
      command: text(entry.command, 300) || null,
      args: list(entry.args).slice(0, 24).map((item) => text(item, 500)),
      exit_code: exitCode,
    };
  }
  return null;
}

function latestCompletedDiffAt(state) {
  let latest = 0;
  for (const entry of list(state?.evidence)) {
    if (
      text(entry?.kind, 120) === "operation" &&
      text(entry?.action, 80) === "diff" &&
      text(entry?.status, 80) === "completed"
    ) {
      latest = Math.max(latest, time(entry?.at));
    }
  }
  return latest;
}

function changedImplementationPresent(state) {
  return (
    list(state?.source_changes).length > 0 ||
    list(state?.files_changed).length > 0 ||
    Boolean(text(state?.patch, 1))
  );
}

function freshOwnerSteeringReasoningRequired(state) {
  return (
    text(state?.owner_intervention?.status, 80) === "CLAIMED" &&
    state?.owner_intervention?.fresh_reasoning_required === true &&
    Boolean(text(state?.owner_intervention?.claim_id, 120))
  );
}

function convergenceSnapshot(state) {
  const mutationAt = latestCompletedMutationAt(state);
  const latestTest = latestFiniteTest(state);
  const diffAt = latestCompletedDiffAt(state);
  const freshTest = Boolean(latestTest && (!mutationAt || latestTest.at >= mutationAt));
  const freshPassedVerification = Boolean(freshTest && latestTest.exit_code === 0);
  const freshFailedVerification = Boolean(freshTest && latestTest.exit_code !== 0);
  const freshDiff = Boolean(diffAt && (!mutationAt || diffAt >= mutationAt));
  return {
    mutation_at: mutationAt,
    latest_test: latestTest,
    diff_at: diffAt,
    fresh_passed_verification: freshPassedVerification,
    fresh_failed_verification: freshFailedVerification,
    fresh_diff: freshDiff,
  };
}

async function safeProgress(context, state, event) {
  try {
    await publishCodeAILiveProgress({ context, state, event });
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_DETERMINISTIC_CONVERGENCE_PROGRESS_FAILED",
      reason: text(error?.message || error, 300),
      mission_execution_blocked: false,
      provider_execution_submitted: false,
      reasoning_call_consumed: false,
      wallet_mutation_performed: false,
      secrets_printed: false,
    }));
  }
}

function completedWithoutReasoning(state, snapshot, quality) {
  const completedState = {
    ...object(state),
    status: "completed",
    blockers: [],
    current_operation_id: null,
    planner_pending: null,
    updated_at: new Date().toISOString(),
  };
  return {
    success: true,
    contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
    status: "completed",
    reason: null,
    summary:
      "Existing implementation already has fresh world-class verification and final diff evidence; no additional reasoning call was required.",
    state: completedState,
    reasoning_calls: reasoningCalls(completedState),
    deterministic_convergence: {
      contract: CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT,
      verification_plan_contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
      performed: true,
      mode: "EXISTING_FRESH_WORLDCLASS_EVIDENCE",
      provider_execution_submitted: false,
      reasoning_call_consumed: false,
      source_mutation_performed: false,
      verification_passed: snapshot.fresh_passed_verification,
      final_diff_fresh: snapshot.fresh_diff,
      worldclass_quality_verified: quality?.verified === true,
      verification_family_count: Number(quality?.fresh_verification_family_count || 0),
    },
  };
}

function mergedMissionState(previous, executionState, objectiveContext) {
  return {
    ...object(previous),
    ...object(executionState),
    objective_context: object(previous?.objective_context || objectiveContext),
    work_package_control: object(previous?.work_package_control),
    employee_mission: previous?.employee_mission || null,
    planner_pending: null,
  };
}

function closureOperations({ state, verifier, suffix }) {
  const plan = planCodeAIDeterministicVerificationGates({
    state,
    authoritative_verification: verifier,
  });
  const independent = list(plan.operations).map((operation, index) => ({
    ...operation,
    id: `deterministic_closure_${suffix}_independent_${index + 1}`,
  }));
  return {
    plan,
    operations: [
      {
        id: `deterministic_closure_${suffix}_verify`,
        action: "verify",
        description:
          "Controller-owned authoritative semantic verification after the latest implementation; no model reasoning required.",
        input: {
          command: verifier.command,
          args: verifier.args,
        },
      },
      ...independent,
      {
        id: `deterministic_closure_${suffix}_diff`,
        action: "diff",
        description:
          "Controller-owned final diff review after all deterministic verification gates; no model reasoning required.",
        input: {},
      },
    ],
  };
}

async function deterministicClosure({
  context,
  objective,
  objectiveContext,
  repositoryUrl,
  ref,
  state,
  verifier,
  timeoutMs,
}) {
  const callsBefore = reasoningCalls(state);
  const suffix = String(list(state?.tests).length + 1).padStart(3, "0");
  const closure = closureOperations({ state, verifier, suffix });

  await safeProgress(context, state, {
    phase: "DETERMINISTIC_CONVERGENCE",
    status: "running",
    mission_id: state?.mission_id || null,
    reasoning_call: callsBefore,
    description:
      "Closing semantic verification, independent risk-appropriate checks and final diff deterministically before considering another reasoning call.",
    command: verifier.command,
    command_args: verifier.args,
    independent_verification_gate_count: closure.plan.planned_independent_gate_count,
    planned_verification_families: closure.plan.planned_families,
    expected_required_gate_count_satisfied:
      closure.plan.expected_required_gate_count_satisfied === true,
    files_changed: list(state?.files_changed),
  });

  const execution = await executeCodeAIMission({
    objective,
    repository_url: repositoryUrl,
    ref,
    operations: closure.operations,
    resume_state: state,
    timeout_ms: timeoutMs,
  });
  const merged = mergedMissionState(state, execution.state, objectiveContext);
  const callsAfter = reasoningCalls(merged);
  if (callsAfter !== callsBefore) {
    throw new Error(
      `CODE_AI_DETERMINISTIC_CONVERGENCE_REASONING_MUTATION:${callsBefore}:${callsAfter}`,
    );
  }

  const executionPassed = execution.success === true && execution.status === "completed";
  const quality = assessCodeAIWorldClassQuality(merged);
  const passed = executionPassed && quality.verified === true;
  await safeProgress(context, merged, {
    phase: passed ? "DETERMINISTIC_CONVERGENCE_COMPLETED" : "DETERMINISTIC_CONVERGENCE_FAILED",
    status: passed ? "completed" : execution.status || "verification_required",
    mission_id: merged?.mission_id || null,
    reasoning_call: callsAfter,
    description: passed
      ? "Semantic verification, independent quality gates and final diff passed without another Code reasoning call."
      : executionPassed
        ? "Deterministic checks passed but the world-class quality gate still requires repository-specific verification evidence."
        : "A deterministic verification gate failed; a real repair reasoning call is now justified.",
    command: verifier.command,
    command_args: verifier.args,
    verification_passed: passed,
    worldclass_quality_verified: quality.verified === true,
    verification_family_count: Number(quality.fresh_verification_family_count || 0),
    required_verification_gates: Number(quality.required_verification_gates || 0),
    files_changed: list(merged?.files_changed),
    reason: execution.reason || (quality.verified ? null : list(quality.blockers).join("|")),
  });

  return {
    ...object(execution),
    success: passed,
    status: passed
      ? "completed"
      : executionPassed
        ? "verification_required"
        : execution.status,
    reason: passed
      ? null
      : executionPassed
        ? list(quality.blockers)[0] || "CODE_AI_WORLDCLASS_ADDITIONAL_VERIFICATION_REQUIRED"
        : execution.reason,
    contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
    state: {
      ...merged,
      ...(passed
        ? { status: "completed", blockers: [] }
        : executionPassed
          ? {
              status: "verification_required",
              blockers: list(quality.blockers),
            }
          : {}),
    },
    reasoning_calls: callsAfter,
    deterministic_convergence: {
      contract: CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT,
      verification_plan_contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
      verification_plan: closure.plan,
      performed: true,
      mode: passed
        ? "MULTI_GATE_VERIFY_AND_DIFF_PASSED"
        : executionPassed
          ? "SAFE_GATES_EXHAUSTED_REPOSITORY_SPECIFIC_VERIFICATION_REQUIRED"
          : "VERIFY_FAILED_REPAIR_REQUIRED",
      provider_execution_submitted: false,
      reasoning_call_consumed: false,
      source_mutation_performed: false,
      verification_passed: passed,
      final_diff_fresh: executionPassed,
      worldclass_quality_verified: quality.verified === true,
      verification_family_count: Number(quality.fresh_verification_family_count || 0),
      required_verification_gates: Number(quality.required_verification_gates || 0),
    },
  };
}

export async function executeBatchedAutonomousCodeMissionWithDeterministicConvergence({
  context = {},
  objective,
  objective_context = null,
  repository_url,
  ref = "main",
  resume_state = null,
  reasoning_call_budget = null,
  timeout_ms = null,
} = {}) {
  const state = object(resume_state);
  const objectiveContext = object(objective_context || state.objective_context);
  const verifier = authoritativeVerification(objectiveContext);
  const hasImplementation = changedImplementationPresent(state);
  const ownerSteeringRequiresFreshReasoning = freshOwnerSteeringReasoningRequired(state);

  if (
    state.base_commit &&
    hasImplementation &&
    !state.planner_pending &&
    verifier &&
    !ownerSteeringRequiresFreshReasoning
  ) {
    const snapshot = convergenceSnapshot(state);
    const quality = assessCodeAIWorldClassQuality(state);

    if (
      snapshot.fresh_passed_verification &&
      snapshot.fresh_diff &&
      Boolean(text(state.patch, 1)) &&
      quality.verified === true
    ) {
      await safeProgress(context, state, {
        phase: "DETERMINISTIC_CONVERGENCE_COMPLETED",
        status: "completed",
        mission_id: state?.mission_id || null,
        reasoning_call: reasoningCalls(state),
        description:
          "Fresh world-class verification and final diff already exist after the latest edit; skipping another model call.",
        files_changed: list(state?.files_changed),
        verification_passed: true,
        verification_family_count: Number(quality.fresh_verification_family_count || 0),
        required_verification_gates: Number(quality.required_verification_gates || 0),
      });
      return completedWithoutReasoning(state, snapshot, quality);
    }

    if (!snapshot.fresh_failed_verification) {
      return deterministicClosure({
        context,
        objective: text(objective, 5000),
        objectiveContext,
        repositoryUrl: text(repository_url, 1000),
        ref: text(ref, 160) || "main",
        state,
        verifier,
        timeoutMs: timeout_ms,
      });
    }
  }

  return executeBatchedAutonomousCodeMissionLive({
    context,
    objective,
    objective_context: objectiveContext,
    repository_url,
    ref,
    resume_state,
    reasoning_call_budget,
    timeout_ms,
  });
}

export const CodeAIWorkPackageDeterministicConvergenceRuntime = Object.freeze({
  contract: CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT,
  batched_contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  verification_plan_contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
  live_progress: true,
  owner_steering_fresh_reasoning_bypasses_deterministic_short_circuit: true,
  execute: executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
  live_runtime: CodeAIWorkPackageRuntimeLive,
});

export default CodeAIWorkPackageDeterministicConvergenceRuntime;
