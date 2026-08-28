import { executeCodeAIMission } from "./CodeAIMissionRuntime.js";
import { executeCodeAIPlannerRequest } from "./CodeAIPlannerExecutionRuntime.js";
import {
  parseCodeAIWorkPackage,
  compactCodeAIMissionStateForPlanner,
  resolveCodeAIWorkPackageActionPolicy,
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
} from "./CodeAIWorkPackageCoreRuntime.js";
import {
  buildCodeAIWorkPackagePromptTransport,
  CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
} from "./CodeAIWorkPackagePromptRuntime.js";
import {
  assertCodeAIReasoningCallAllowed,
  resolveCodeAIReasoningCallBudget,
} from "./CodeAIPlannerSpendPolicy.js";
import { publishCodeAILiveProgress } from "./CodeAILiveProgressRuntime.js";

const PLANNER_SERVICE_ID = "ai.code.debug";
const PLANNER_CAPABILITY = "ai.code.debug";
const MAX_PACKAGE_OPERATIONS = 12;

function text(value, maximum = 120000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizedObjectiveContext(value) {
  const source = object(value);
  return {
    repository_head_observed: text(source.repository_head_observed, 160) || null,
    selection_contract: text(source.selection_contract, 160) || null,
    evidence_backed: source.evidence_backed === true,
    evidence_path_1: text(source.evidence_path_1, 1000) || null,
    evidence_path_2: text(source.evidence_path_2, 1000) || null,
    evidence_path_3: text(source.evidence_path_3, 1000) || null,
    evidence_path_4: text(source.evidence_path_4, 1000) || null,
    authoritative_verification_command:
      text(source.authoritative_verification_command, 300) || null,
    authoritative_verification_args: list(source.authoritative_verification_args)
      .slice(0, 24)
      .map((item) => text(item, 500))
      .filter(Boolean),
    allowed_edit_paths: list(source.allowed_edit_paths)
      .slice(0, 80)
      .map((item) => text(item, 1000))
      .filter(Boolean),
    completion_criterion_1: text(source.completion_criterion_1, 700) || null,
    completion_criterion_2: text(source.completion_criterion_2, 700) || null,
    completion_criterion_3: text(source.completion_criterion_3, 700) || null,
    completion_criterion_4: text(source.completion_criterion_4, 700) || null,
    completion_criterion_5: text(source.completion_criterion_5, 700) || null,
    completion_criterion_6: text(source.completion_criterion_6, 700) || null,
    authority: "CONTEXT_ONLY",
    authorization_effect: "NONE",
  };
}

function objectiveCriteria(value) {
  const source = normalizedObjectiveContext(value);
  return [
    source.completion_criterion_1,
    source.completion_criterion_2,
    source.completion_criterion_3,
    source.completion_criterion_4,
    source.completion_criterion_5,
    source.completion_criterion_6,
  ].filter(Boolean);
}

function legacyAuthoritativeVerificationInput(objective) {
  const source = text(objective, 12000);
  const marker = "authoritative verification command is";
  const lower = source.toLowerCase();
  const markerIndex = lower.indexOf(marker);
  if (markerIndex < 0) return null;
  let candidate = source.slice(markerIndex + marker.length).trim();
  const stopPhrases = [
    " Only these source files may be edited:",
    " Use the source evidence",
    " Apply coherent edits",
    " Do not push",
    " Do not deploy",
    "\n",
  ];
  const stopIndexes = stopPhrases
    .map((phrase) => candidate.indexOf(phrase))
    .filter((index) => index >= 0);
  if (stopIndexes.length) candidate = candidate.slice(0, Math.min(...stopIndexes));
  candidate = candidate.replace(/\.\s*$/, "").trim();
  const tokens = text(candidate, 2000).split(/\s+/).filter(Boolean);
  return tokens.length ? { command: tokens[0], args: tokens.slice(1) } : null;
}

function authoritativeVerificationInput(objective, objectiveContext) {
  const source = normalizedObjectiveContext(objectiveContext);
  if (source.authoritative_verification_command) {
    return {
      command: source.authoritative_verification_command,
      args: source.authoritative_verification_args,
      source: "STRUCTURED_OBJECTIVE_CONTEXT",
    };
  }
  const legacy = legacyAuthoritativeVerificationInput(objective);
  return legacy ? { ...legacy, source: "LEGACY_OBJECTIVE_TEXT" } : null;
}

async function safeProgress(context, state, event) {
  try {
    await publishCodeAILiveProgress({ context, state, event });
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_LIVE_PROGRESS_PUBLISH_FAILED",
      reason: text(error?.message || error, 300),
      mission_execution_blocked: false,
      secrets_printed: false,
    }));
  }
}

function promptTransport({ objective, objectiveContext, state, callNumber, budget }) {
  const compact = compactCodeAIMissionStateForPlanner(state);
  const normalizedContext = normalizedObjectiveContext(objectiveContext);
  const criteria = objectiveCriteria(normalizedContext);
  const authoritativeVerification = authoritativeVerificationInput(objective, normalizedContext);
  const actionPolicy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: normalizedContext,
    state,
  });
  const repair = Boolean(compact.latest_failed_verification);
  const currentEvidence =
    compact.current_source_changes.length > 0 ||
    compact.evidence.some((entry) => entry.action === "read") ||
    list(compact.source_read_evidence).some((entry) => entry.action === "read");
  const phaseGuidance = actionPolicy.discovery_locked
    ? "DISCOVERY IS LOCKED. Declared evidence is already loaded. Do not ask for more context. Do not search or read. Implement now; the first operation must be apply_files with all coherent edits together."
    : currentEvidence
      ? "Current source evidence is already available. Prefer one coherent implementation package instead of another discovery round."
      : "Use one broad discovery package if evidence is insufficient. Batch the useful searches and reads together.";
  const repairGuidance = repair
    ? "This is a repair pass. Use current_source_changes, durable declared source evidence, and latest_failed_verification. Do not reread stale source. Derive the correction from the exact observed verifier failure, apply one coherent repair, verify, then review diff."
    : null;
  const outputExample = actionPolicy.discovery_locked
    ? `Return exactly one JSON object shaped like: {"contract":"${CODE_AI_WORK_PACKAGE_CONTRACT}","phase":"implementation","summary":"coherent implementation","operations":[{"action":"apply_files","description":"apply coherent repair","input":{"files":[{"path":"relative/path","content":"complete final file content"}]}},{"action":"verify","description":"verify","input":{"command":"node","args":["path/to/test.mjs"]}},{"action":"diff","description":"review diff","input":{}}]}`
    : `Return exactly one JSON object shaped like: {"contract":"${CODE_AI_WORK_PACKAGE_CONTRACT}","phase":"discovery","summary":"broad discovery","operations":[{"action":"search","description":"find source","input":{"mode":"literal","query":"symbol"}},{"action":"read","description":"read source","input":{"file_path":"relative/path","start_line":1,"end_line":1200}}]}`;

  return {
    actionPolicy,
    prompt: buildCodeAIWorkPackagePromptTransport({
      sections: [
        "You are the engineering reasoning worker inside Avantiqo Code AI. Avantiqo owns execution, sandboxing, mutation controls, verification, wallet, provider governance and safety.",
        "Produce one BATCHED engineering work package. Do not provide commentary or ask the owner for context that Avantiqo can obtain itself.",
        `REASONING CALL ${callNumber} OF ${budget}. Minimize future reasoning calls.`,
        `MISSION: ${text(objective, 5000)}`,
        criteria.length ? `COMPLETION CRITERIA: ${JSON.stringify(criteria)}` : "COMPLETION CRITERIA: none explicitly bound.",
        authoritativeVerification
          ? `CONTROLLER AUTHORITATIVE VERIFICATION: ${JSON.stringify({ command: authoritativeVerification.command, args: authoritativeVerification.args })}. This exact command is authoritative; do not shorten, infer, or rewrite its path.`
          : null,
        normalizedContext.allowed_edit_paths.length
          ? `CONTROLLER ALLOWED EDIT PATHS: ${JSON.stringify(normalizedContext.allowed_edit_paths)}.`
          : null,
        phaseGuidance,
        repairGuidance,
        "When source evidence is sufficient, make all coherent edits together. Verification and final diff may be appended deterministically by the controller without another reasoning call.",
        "Do not research the web for ordinary repository work. Do not push, deploy, publish, mutate databases, access secrets, or use shell escape commands.",
        `Allowed package actions for THIS call: ${actionPolicy.allowed_actions.join(", ")}.`,
        `Maximum model-supplied operations in one package: ${MAX_PACKAGE_OPERATIONS}.`,
        outputExample,
      ],
      compact_state: compact,
      objective_context: normalizedContext,
    }),
  };
}

function workPackageControl(state, budget) {
  const source = object(state?.work_package_control);
  return {
    contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
    reasoning_call_budget: resolveCodeAIReasoningCallBudget(source.reasoning_call_budget || budget),
    reasoning_calls_used: nonNegativeInteger(source.reasoning_calls_used),
    pending_reasoning_call: nonNegativeInteger(source.pending_reasoning_call) || null,
    packages_executed: nonNegativeInteger(source.packages_executed),
    operations_executed: nonNegativeInteger(source.operations_executed),
  };
}

function plannerInput({ context, objective, objectiveContext, state, callNumber, budget }) {
  const normalizedContext = normalizedObjectiveContext(objectiveContext);
  const authoritativeVerification = authoritativeVerificationInput(objective, normalizedContext);
  const { actionPolicy, prompt } = promptTransport({
    objective,
    objectiveContext: normalizedContext,
    state,
    callNumber,
    budget,
  });
  return {
    organization_id: context.organizationId,
    party_id: text(context?.metadata?.partyId || context.partyId, 200) || null,
    entity_id: text(context.entityId, 200) || null,
    service_id: PLANNER_SERVICE_ID,
    capability: PLANNER_CAPABILITY,
    category: "CODE_AI_BATCHED_AUTONOMY",
    input: {
      contract: "AVANTIQO_CODE_ENGINE_V1",
      capability: PLANNER_CAPABILITY,
      instruction: prompt.instruction,
      structured_specification: {
        code_ai_batched_autonomy_contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
        work_package_contract: CODE_AI_WORK_PACKAGE_CONTRACT,
        work_package_prompt_contract: CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
        work_package_instruction_chars: prompt.instruction_chars,
        work_package_instruction_max_chars: prompt.max_instruction_chars,
        worker_instruction_hard_limit_chars: prompt.worker_instruction_hard_limit_chars,
        worker_instruction_headroom_chars: prompt.headroom_to_worker_limit_chars,
        work_package_state_compaction_profile: prompt.state_profile,
        reasoning_call_number: callNumber,
        reasoning_call_budget: budget,
        max_package_operations: MAX_PACKAGE_OPERATIONS,
        allowed_package_actions: actionPolicy.allowed_actions,
        discovery_locked: actionPolicy.discovery_locked,
        all_declared_evidence_loaded: actionPolicy.all_declared_evidence_loaded,
        authoritative_verification: authoritativeVerification
          ? { command: authoritativeVerification.command, args: authoritativeVerification.args }
          : null,
        allowed_edit_paths: normalizedContext.allowed_edit_paths,
        deterministic_authoritative_verification_controller_owned: true,
        deterministic_final_diff_controller_owned: true,
        raw_reasoning_persisted: false,
      },
      quantity: 1,
    },
    metadata: {
      code_ai_autonomy_contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      code_ai_mission_id: state?.mission_id || null,
      code_ai_iteration: callNumber,
      code_ai_reasoning_call: callNumber,
      code_ai_reasoning_call_budget: budget,
      code_ai_batched_work_packages: true,
      code_ai_discovery_locked: actionPolicy.discovery_locked,
      code_ai_work_package_prompt_contract: CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
      code_ai_work_package_instruction_chars: prompt.instruction_chars,
      code_ai_worker_instruction_headroom_chars: prompt.headroom_to_worker_limit_chars,
      code_ai_structured_authoritative_verification: Boolean(authoritativeVerification),
      owned_orchestration: true,
      raw_reasoning_persisted: false,
    },
  };
}

async function initialState({ objective, objectiveContext, repositoryUrl, ref, resumeState, timeoutMs }) {
  if (resumeState?.base_commit) {
    return {
      ...resumeState,
      objective_context: normalizedObjectiveContext(resumeState.objective_context || objectiveContext),
    };
  }
  const inspected = await executeCodeAIMission({
    objective,
    repository_url: repositoryUrl,
    ref,
    operations: [{
      id: "batched_initial_inspect",
      action: "inspect",
      description: "Establish repository head and repository guidance before batched reasoning.",
      input: {},
    }],
    resume_state: null,
    timeout_ms: timeoutMs,
  });
  if (!inspected.success && inspected.status !== "completed") {
    throw new Error(inspected.reason || "CODE_AI_BATCHED_INITIAL_INSPECTION_FAILED");
  }
  return {
    ...inspected.state,
    objective_context: normalizedObjectiveContext(objectiveContext),
  };
}

function completionEligible(state) {
  const source = object(state);
  const changed = list(source.files_changed).length > 0;
  const verified = list(source.verification).some((entry) => entry?.passed === true);
  const hasDiff = Boolean(text(source.patch, 1));
  return text(source.status, 100) === "completed" && (!changed || (verified && hasDiff));
}

function blocked(state, reason) {
  return {
    success: false,
    contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
    status: "blocked",
    reason,
    state: { ...object(state), status: "blocked", blockers: [reason] },
    reasoning_calls: nonNegativeInteger(state?.work_package_control?.reasoning_calls_used),
  };
}

function operationEvent(operation, callNumber, status, state, reason = null) {
  const input = object(operation?.input);
  return {
    phase: status === "running" ? "OPERATION_RUNNING" : status === "completed" ? "OPERATION_COMPLETED" : "OPERATION_FAILED",
    status,
    mission_id: state?.mission_id || null,
    reasoning_call: callNumber,
    operation_id: operation?.id || null,
    action: operation?.action || null,
    description: operation?.description || null,
    files_changed: list(state?.files_changed),
    command: text(input.command, 300) || null,
    command_args: list(input.args),
    exit_code: list(state?.tests).slice(-1)[0]?.exit_code ?? null,
    verification_passed: list(state?.verification).slice(-1)[0]?.passed,
    reason,
  };
}

export async function executeBatchedAutonomousCodeMissionLive({
  context = {},
  objective,
  objective_context = null,
  repository_url,
  ref = "main",
  resume_state = null,
  reasoning_call_budget = null,
  timeout_ms = null,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 200);
  const goal = text(objective, 5000);
  const repositoryUrl = text(repository_url, 1000);
  if (!organizationId) throw new Error("CODE_AI_BATCHED_ORGANIZATION_REQUIRED");
  if (!goal) throw new Error("CODE_AI_BATCHED_OBJECTIVE_REQUIRED");
  if (!repositoryUrl) throw new Error("CODE_AI_BATCHED_REPOSITORY_REQUIRED");
  const objectiveContext = normalizedObjectiveContext(objective_context || resume_state?.objective_context);

  let state;
  try {
    state = await initialState({
      objective: goal,
      objectiveContext,
      repositoryUrl,
      ref: text(ref, 160) || "main",
      resumeState: resume_state,
      timeoutMs: timeout_ms,
    });
  } catch (error) {
    return blocked(resume_state || {}, text(error?.message || error, 2000));
  }

  let control = workPackageControl(state, reasoning_call_budget);
  state = { ...state, work_package_control: control };
  if (completionEligible(state) && !state.planner_pending) {
    return {
      success: true,
      contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      status: "completed",
      reason: null,
      summary: "Batched Code AI mission completed with observed verification and diff evidence.",
      state,
      reasoning_calls: control.reasoning_calls_used,
    };
  }

  const resumingPending = Boolean(state.planner_pending);
  const callNumber = resumingPending
    ? control.pending_reasoning_call || control.reasoning_calls_used || 1
    : control.reasoning_calls_used + 1;
  if (!resumingPending) {
    try {
      assertCodeAIReasoningCallAllowed({
        call_number: callNumber,
        budget: control.reasoning_call_budget,
      });
    } catch (error) {
      return blocked(state, text(error?.message || error, 2000));
    }
    control = { ...control, reasoning_calls_used: callNumber, pending_reasoning_call: callNumber };
    state = { ...state, work_package_control: control };
  }

  await safeProgress(context, state, {
    phase: "PLANNING",
    status: "running",
    mission_id: state.mission_id,
    reasoning_call: callNumber,
    description: "Preparing the next coherent engineering work package from current evidence.",
    files_changed: list(state.files_changed),
  });

  let planned;
  try {
    planned = await executeCodeAIPlannerRequest({
      execution_input: plannerInput({
        context: { ...context, organizationId },
        objective: goal,
        objectiveContext,
        state,
        callNumber,
        budget: control.reasoning_call_budget,
      }),
      pending_execution: state.planner_pending || null,
    });
  } catch (error) {
    await safeProgress(context, state, {
      phase: "PLANNING_FAILED",
      status: "failed",
      mission_id: state.mission_id,
      reasoning_call: callNumber,
      reason: text(error?.message || error, 700),
    });
    return blocked(state, text(error?.message || error, 2000));
  }

  if (planned.pending) {
    state = {
      ...state,
      status: "planner_pending",
      planner_pending: planned.pending_execution,
      work_package_control: { ...control, pending_reasoning_call: callNumber },
    };
    await safeProgress(context, state, {
      phase: "PLANNER_PENDING",
      status: "running",
      mission_id: state.mission_id,
      reasoning_call: callNumber,
      description: "Owned Code model is still producing the engineering package.",
    });
    return {
      success: false,
      contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      status: "planner_pending",
      reason: "CODE_AI_BATCHED_PLANNER_PENDING",
      state,
      reasoning_calls: control.reasoning_calls_used,
    };
  }

  const actionPolicy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: objectiveContext,
    state,
  });
  let workPackage;
  try {
    workPackage = parseCodeAIWorkPackage(planned.output, {
      authoritative_verification: authoritativeVerificationInput(goal, objectiveContext),
    });
    const forbidden = workPackage.operations
      .map((operation) => operation.action)
      .filter((action) => !actionPolicy.allowed_actions.includes(action));
    if (forbidden.length) {
      throw new Error(`CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE:${[...new Set(forbidden)].join(",")}`);
    }
    if (
      actionPolicy.discovery_locked &&
      !workPackage.operations.some((operation) => operation.action === "apply_files")
    ) {
      throw new Error("CODE_AI_WORK_PACKAGE_IMPLEMENTATION_REQUIRED_AFTER_SEEDED_DISCOVERY");
    }
  } catch (error) {
    return blocked(state, text(error?.message || error, 2000));
  }

  control = { ...control, pending_reasoning_call: null };
  state = {
    ...state,
    planner_pending: null,
    work_package_control: control,
    evidence: [...list(state.evidence), {
      at: new Date().toISOString(),
      kind: "batched_reasoning_package",
      reasoning_call: callNumber,
      provider: planned.result?.provider || null,
      model: planned.result?.model || null,
      phase: workPackage.phase,
      summary: workPackage.summary,
      operation_count: workPackage.operations.length,
      operation_actions: workPackage.operations.map((operation) => operation.action),
      discovery_locked: actionPolicy.discovery_locked,
      all_declared_evidence_loaded: actionPolicy.all_declared_evidence_loaded,
      authoritative_verification_source:
        authoritativeVerificationInput(goal, objectiveContext)?.source || null,
      contains_source_content: false,
      contains_raw_reasoning: false,
    }].slice(-120),
  };

  const operations = workPackage.operations.map((operation, index) => ({
    id: `batch_${callNumber}_${String(index + 1).padStart(2, "0")}_${operation.action}`,
    action: operation.action,
    description: operation.description,
    input: operation.input,
  }));

  let execution = null;
  let completedThisPackage = 0;
  for (const operation of operations) {
    await safeProgress(context, state, operationEvent(operation, callNumber, "running", state));
    try {
      execution = await executeCodeAIMission({
        objective: goal,
        repository_url: repositoryUrl,
        ref: text(ref, 160) || "main",
        operations: [operation],
        resume_state: state,
        timeout_ms,
      });
    } catch (error) {
      await safeProgress(context, state, operationEvent(
        operation,
        callNumber,
        "failed",
        state,
        text(error?.message || error, 700),
      ));
      return blocked(state, text(error?.message || error, 2000));
    }

    state = {
      ...execution.state,
      objective_context: objectiveContext,
      work_package_control: control,
    };
    if (list(state.completed_operation_ids).includes(operation.id)) completedThisPackage += 1;

    const expectedIntermediateVerification =
      operation.action === "apply_files" && execution.status === "verification_required";
    const failed = execution.success !== true && !expectedIntermediateVerification;
    await safeProgress(
      context,
      state,
      operationEvent(
        operation,
        callNumber,
        failed ? "failed" : "completed",
        state,
        failed ? execution.reason : null,
      ),
    );
    if (failed) {
      control = {
        ...control,
        packages_executed: control.packages_executed + 1,
        operations_executed: control.operations_executed + completedThisPackage,
      };
      state = { ...state, work_package_control: control };
      return {
        success: false,
        contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
        status: execution.status || "repair_required",
        reason: execution.reason || "CODE_AI_BATCHED_MORE_REASONING_REQUIRED",
        state,
        reasoning_calls: control.reasoning_calls_used,
      };
    }
  }

  control = {
    ...control,
    packages_executed: control.packages_executed + 1,
    operations_executed: control.operations_executed + completedThisPackage,
  };
  state = { ...state, work_package_control: control };

  const completed = Boolean(execution?.success && completionEligible(state));
  await safeProgress(context, state, {
    phase: completed ? "MISSION_COMPLETED" : "PACKAGE_COMPLETED",
    status: completed ? "completed" : state.status || "running",
    mission_id: state.mission_id,
    reasoning_call: callNumber,
    description: completed
      ? "Engineering mission completed with verification and final diff evidence."
      : "Work package completed; controller is evaluating the remaining completion gaps.",
    files_changed: list(state.files_changed),
    verification_passed: list(state.verification).some((entry) => entry?.passed === true),
  });

  if (completed) {
    return {
      success: true,
      contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      status: "completed",
      reason: null,
      summary: workPackage.summary || "Batched Code AI mission completed.",
      state,
      reasoning_calls: control.reasoning_calls_used,
    };
  }
  if (execution?.status === "replan_required") {
    return {
      success: false,
      contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
      status: "replan_required",
      reason: execution.reason,
      state,
      reasoning_calls: control.reasoning_calls_used,
    };
  }
  return {
    success: false,
    contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
    status: state.status || execution?.status || "repair_required",
    reason: execution?.reason || "CODE_AI_BATCHED_MORE_REASONING_REQUIRED",
    state,
    reasoning_calls: control.reasoning_calls_used,
  };
}

export const CodeAIWorkPackageRuntimeLive = Object.freeze({
  contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  work_package_contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  prompt_contract: CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
  max_package_operations: MAX_PACKAGE_OPERATIONS,
  live_progress: true,
  execute: executeBatchedAutonomousCodeMissionLive,
  parse: parseCodeAIWorkPackage,
  compactStateForPlanner: compactCodeAIMissionStateForPlanner,
  resolveActionPolicy: resolveCodeAIWorkPackageActionPolicy,
});

export default CodeAIWorkPackageRuntimeLive;
