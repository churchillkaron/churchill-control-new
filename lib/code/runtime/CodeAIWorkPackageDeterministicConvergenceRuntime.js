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
    if (!["apply_files", "replace_range", "delete_files", "rename_files"].includes(action)) continue;
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

function normalizedSearchQuery(value) {
  return text(value, 2000)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'`]/g, "")
    .trim();
}

function searchMatchPath(value) {
  const match = text(value, 1600).match(
    /^([^:\n]+?\.(?:[cm]?[jt]sx?|json|md|sql|css|scss|sass|less|html?|ya?ml|toml|py|rb|go|rs|java|kt|swift|php|sh|bash|zsh))(?:[:\s]|$)/i,
  );
  return match ? text(match[1], 1000) : "";
}

function deterministicDiscoveryRegex(query) {
  const stop = new Set([
    "about", "after", "again", "against", "before", "bounded", "code", "current",
    "exact", "existing", "from", "into", "latest", "mission", "only", "real",
    "repository", "same", "strict", "the", "this", "with", "without",
  ]);
  const tokens = normalizedSearchQuery(query)
    .replace(/[-_/]+/g, " ")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stop.has(token));
  const unique = [...new Set(tokens)].slice(0, 8);
  return unique.map((token) => token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|");
}

function preferredDiscoveryPath(paths = []) {
  const ranked = [...new Set(list(paths).map((value) => text(value, 1000)).filter(Boolean))];
  return ranked.sort((left, right) => {
    const score = (value) => {
      if (/^(app|lib)\//.test(value) && !/^tests?\//.test(value)) return 0;
      if (/^scripts\//.test(value)) return 1;
      if (/^tests?\//.test(value)) return 3;
      return 2;
    };
    return score(left) - score(right) || left.localeCompare(right);
  })[0] || null;
}

function discoveryStagnationSnapshot(state) {
  const completed = list(state?.evidence).filter((entry) =>
    text(entry?.kind, 120) === "operation" &&
    text(entry?.status, 80) === "completed"
  );
  const recent = completed.slice(-8);
  const searches = recent.filter((entry) => text(entry?.action, 80) === "search");
  const reads = recent.filter((entry) => text(entry?.action, 80) === "read");
  const latestSearch = searches.at(-1) || null;
  const latestQuery = normalizedSearchQuery(latestSearch?.result?.query);
  const equivalentSearchCount = latestQuery
    ? searches.filter((entry) => normalizedSearchQuery(entry?.result?.query) === latestQuery).length
    : 0;
  const candidatePaths = [];
  for (let index = searches.length - 1; index >= 0; index -= 1) {
    for (const match of list(searches[index]?.result?.matches)) {
      const path = searchMatchPath(match);
      if (path && !candidatePaths.includes(path)) candidatePaths.push(path);
      if (candidatePaths.length >= 8) break;
    }
    if (candidatePaths.length >= 8) break;
  }
  return {
    repeated: searches.length >= 2 && equivalentSearchCount >= 2 && reads.length === 0,
    latest_query: latestQuery || null,
    recent_search_count: searches.length,
    equivalent_search_count: equivalentSearchCount,
    candidate_paths: candidatePaths,
  };
}

async function deterministicDiscoveryConvergence({
  context,
  objective,
  objectiveContext,
  repositoryUrl,
  ref,
  state,
  timeoutMs,
  snapshot,
}) {
  const callsBefore = reasoningCalls(state);
  let convergenceState = state;
  let targetPath = preferredDiscoveryPath(snapshot.candidate_paths);
  if (!targetPath) {
    const fallbackRegex = deterministicDiscoveryRegex(snapshot.latest_query);
    if (fallbackRegex) {
      await safeProgress(context, state, {
        phase: "DETERMINISTIC_DISCOVERY_KEYWORD_RECOVERY",
        status: "running",
        mission_id: state?.mission_id || null,
        reasoning_call: callsBefore,
        description: "The repeated literal search returned no real path. I’m converting it into a bounded keyword search across the tracked repository so I can resolve the owning source file without another model call.",
        files_changed: list(state?.files_changed),
      });
      const searchOperationId = `deterministic_discovery_search_${String(callsBefore).padStart(3, "0")}`;
      const searchExecution = await executeCodeAIMission({
        objective,
        repository_url: repositoryUrl,
        ref,
        operations: [{
          id: searchOperationId,
          action: "search",
          description: "Controller-owned keyword recovery for repeated empty literal repository discovery.",
          input: { mode: "regex", query: fallbackRegex },
        }],
        resume_state: state,
        timeout_ms: timeoutMs,
        workspace_target: objectiveContext?.workspace_target || null,
        organization_id: objectiveContext?.organization_id || null,
        device_id: objectiveContext?.device_id || null,
        device_session_id: objectiveContext?.device_session_id || null,
        control_context: context,
      });
      convergenceState = mergedMissionState(state, searchExecution.state, objectiveContext);
      const recoveredSnapshot = discoveryStagnationSnapshot(convergenceState);
      targetPath = preferredDiscoveryPath(recoveredSnapshot.candidate_paths);
    }
  }
  if (!targetPath) {
    const blockedState = {
      ...object(convergenceState),
      status: "blocked",
      blockers: ["CODE_AI_DISCOVERY_STAGNATION_NO_REAL_TARGET"],
      planner_pending: null,
      current_operation_id: null,
      updated_at: new Date().toISOString(),
    };
    await safeProgress(context, blockedState, {
      phase: "DETERMINISTIC_DISCOVERY_STAGNATION",
      status: "blocked",
      mission_id: blockedState?.mission_id || null,
      reasoning_call: callsBefore,
      description: "Repository discovery repeated without establishing a real readable target. Code stopped instead of spending another planning cycle on the same search.",
      reason: "CODE_AI_DISCOVERY_STAGNATION_NO_REAL_TARGET",
      files_changed: list(blockedState?.files_changed),
    });
    return {
      success: false,
      contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      status: "blocked",
      reason: "CODE_AI_DISCOVERY_STAGNATION_NO_REAL_TARGET",
      state: blockedState,
      reasoning_calls: callsBefore,
      deterministic_convergence: {
        contract: CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT,
        performed: true,
        mode: "DISCOVERY_STAGNATION_NO_REAL_TARGET",
        provider_execution_submitted: false,
        reasoning_call_consumed: false,
        source_mutation_performed: false,
      },
    };
  }

  await safeProgress(context, convergenceState, {
    phase: "DETERMINISTIC_DISCOVERY_CONVERGENCE",
    status: "running",
    mission_id: convergenceState?.mission_id || null,
    reasoning_call: callsBefore,
    description: `Code repeated the same repository discovery. I’m opening the real matched file ${targetPath} now instead of spending another planning cycle on the same search.`,
    file_path: targetPath,
    files_changed: list(convergenceState?.files_changed),
  });

  const operationId = `deterministic_discovery_read_${String(callsBefore).padStart(3, "0")}`;
  const execution = await executeCodeAIMission({
    objective,
    repository_url: repositoryUrl,
    ref,
    operations: [{
      id: operationId,
      action: "read",
      description: "Controller-owned bounded read of a real path discovered by repeated repository search; no model reasoning required.",
      input: { file_path: targetPath, start_line: 1, end_line: 240 },
    }],
    resume_state: state,
    timeout_ms: timeoutMs,
    workspace_target: objectiveContext?.workspace_target || null,
    organization_id: objectiveContext?.organization_id || null,
    device_id: objectiveContext?.device_id || null,
    device_session_id: objectiveContext?.device_session_id || null,
    control_context: context,
  });
  const merged = mergedMissionState(state, execution.state, objectiveContext);
  const callsAfter = reasoningCalls(merged);
  if (callsAfter !== callsBefore) {
    throw new Error(`CODE_AI_DETERMINISTIC_DISCOVERY_REASONING_MUTATION:${callsBefore}:${callsAfter}`);
  }
  const convergedState = {
    ...merged,
    status: "replan_required",
    blockers: [],
    planner_pending: null,
    current_operation_id: null,
    updated_at: new Date().toISOString(),
  };
  await safeProgress(context, convergedState, {
    phase: "DETERMINISTIC_DISCOVERY_CONVERGED",
    status: "running",
    mission_id: convergedState?.mission_id || null,
    reasoning_call: callsAfter,
    description: `I opened ${targetPath} from the real search results. The next planning step now has source evidence and cannot repeat the same discovery as its only action.`,
    file_path: targetPath,
    files_changed: list(convergedState?.files_changed),
  });
  return {
    success: true,
    contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
    status: "replan_required",
    reason: null,
    state: convergedState,
    reasoning_calls: callsAfter,
    deterministic_convergence: {
      contract: CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT,
      performed: true,
      mode: "DISCOVERY_SEARCH_TO_REAL_READ",
      provider_execution_submitted: false,
      reasoning_call_consumed: false,
      source_mutation_performed: false,
      target_path: targetPath,
      equivalent_search_count: snapshot.equivalent_search_count,
    },
  };
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
  if (context?.metadata?.codeAIIsolatedCandidateTrial === true) {
    return {
      persisted: false,
      reason: "CODE_AI_ISOLATED_CANDIDATE_DETERMINISTIC_PROGRESS_SUPPRESSED",
    };
  }
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
    workspace_target: objectiveContext?.workspace_target || null,
    organization_id: objectiveContext?.organization_id || null,
    device_id: objectiveContext?.device_id || null,
    device_session_id: objectiveContext?.device_session_id || null,
    control_context: context,
  });
  const merged = mergedMissionState(state, execution.state, objectiveContext);
  const callsAfter = reasoningCalls(merged);
  if (text(execution?.status, 80) === "stopped") {
    await safeProgress(context, merged, {
      phase: "OWNER_STOPPED",
      status: "stopped",
      mission_id: merged?.mission_id || null,
      reasoning_call: callsAfter,
      description: "Deterministic verification closure stopped at the next repository-operation boundary on owner request.",
      reason: "CODE_AI_OWNER_STOP_REQUESTED",
      files_changed: list(merged?.files_changed),
    });
    return {
      ...object(execution),
      contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      state: merged,
      owner_stop_applied: true,
      source_mutation_performed: false,
      commit_performed: false,
      production_deploy_performed: false,
      deterministic_convergence: {
        contract: CODE_AI_DETERMINISTIC_CONVERGENCE_CONTRACT,
        verification_plan_contract: CODE_AI_DETERMINISTIC_VERIFICATION_PLAN_CONTRACT,
        performed: true,
        mode: "OWNER_STOPPED_AT_SAFE_BOUNDARY",
        provider_execution_submitted: false,
        reasoning_call_consumed: false,
        source_mutation_performed: false,
      },
    };
  }
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
  local_compute_required = false,
  infrastructure_policy = null,
  timeout_ms = null,
} = {}) {
  const state = object(resume_state);
  const objectiveContext = object(objective_context || state.objective_context);
  const verifier = authoritativeVerification(objectiveContext);
  const hasImplementation = changedImplementationPresent(state);
  const ownerSteeringRequiresFreshReasoning = freshOwnerSteeringReasoningRequired(state);
  const discoveryStagnation = discoveryStagnationSnapshot(state);

  if (
    state.base_commit &&
    !state.planner_pending &&
    !hasImplementation &&
    discoveryStagnation.repeated &&
    !ownerSteeringRequiresFreshReasoning
  ) {
    return deterministicDiscoveryConvergence({
      context,
      objective: text(objective, 5000),
      objectiveContext,
      repositoryUrl: text(repository_url, 1000),
      ref: text(ref, 160) || "main",
      state,
      timeoutMs: timeout_ms,
      snapshot: discoveryStagnation,
    });
  }

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
    local_compute_required: local_compute_required === true,
    infrastructure_policy: local_compute_required === true ? "local_only" : infrastructure_policy,
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
