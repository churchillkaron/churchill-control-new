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

function authoritativeVerificationInput(objective) {
  const source = text(objective, 12000);
  const match = source.match(/authoritative verification command is\s+([^.]*)\./i);
  if (!match) return null;
  const tokens = text(match[1], 2000).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return { command: tokens[0], args: tokens.slice(1) };
}

function packagePrompt({ objective, objectiveContext, state, callNumber, budget }) {
  const compact = compactCodeAIMissionStateForPlanner(state);
  const criteria = objectiveCriteria(objectiveContext);
  const actionPolicy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: objectiveContext,
    state,
  });
  const hasCurrentSourceEvidence =
    compact.current_source_changes.length > 0 ||
    compact.evidence.some((entry) => entry.action === "read");
  const repairGuidance = compact.latest_failed_verification
    ? [
        "A post-edit verification failed. This is a repair pass, not a discovery pass.",
        "Use current_source_changes as authoritative edited source and latest_failed_verification as the immediate defect signal.",
        "Do not reread stale pre-edit source when current edited source exists.",
        "Return one coherent repair package with all required corrections together; verification and diff are controller-owned finalization when omitted.",
      ].join(" ")
    : null;
  const phaseGuidance = actionPolicy.discovery_locked
    ? [
        "DISCOVERY IS COMPLETE AND LOCKED FOR THIS CALL.",
        "Declared evidence is already loaded. Do not ask for more context and do not return search/read.",
        "Implement now. The first model-supplied operation must be apply_files containing the coherent source edits together.",
      ].join(" ")
    : hasCurrentSourceEvidence
      ? "Current source evidence is already available. Prefer one coherent implementation package instead of another discovery round."
      : "Evidence is not yet sufficient. Use one broad batched discovery package rather than one-file micro-steps.";
  const outputExample = actionPolicy.discovery_locked
    ? `Return exactly one JSON object shaped like: {"contract":"${CODE_AI_WORK_PACKAGE_CONTRACT}","phase":"implementation","summary":"coherent implementation","operations":[{"action":"apply_files","description":"apply complete coherent repair","input":{"files":[{"path":"relative/path","content":"complete final file content"}]}},{"action":"verify","description":"run authoritative verification","input":{"command":"node","args":["path/to/test.mjs"]}},{"action":"diff","description":"review final diff","input":{}}]}`
    : `Return exactly one JSON object shaped like: {"contract":"${CODE_AI_WORK_PACKAGE_CONTRACT}","phase":"discovery","summary":"broad discovery","operations":[{"action":"search","description":"find relevant source","input":{"mode":"literal","query":"symbol"}},{"action":"read","description":"read relevant source","input":{"file_path":"relative/path","start_line":1,"end_line":1200}}]}`;

  return buildCodeAIWorkPackagePromptTransport({
    sections: [
      "You are the engineering reasoning worker inside Avantiqo Code AI. Avantiqo owns execution, sandboxing, mutation controls, verification, wallet, provider governance and safety.",
      "Produce one BATCHED engineering work package, not commentary and not one tiny next action.",
      `REASONING CALL ${callNumber} OF ${budget}. Minimize future reasoning calls.`,
      `MISSION: ${text(objective, 5000)}`,
      criteria.length
        ? `COMPLETION CRITERIA: ${JSON.stringify(criteria)}`
        : "COMPLETION CRITERIA: none explicitly bound.",
      phaseGuidance,
      repairGuidance,
      actionPolicy.discovery_locked
        ? "A discovery-only package is invalid forward progress and will be rejected by the controller."
        : "If discovery is required, batch multiple search/read operations in one package.",
      "When evidence is sufficient, apply all coherent edits in one apply_files operation with complete final file contents. The deterministic controller may append the authoritative verification and final diff without another reasoning call.",
      "Do not research the web for ordinary repository work. Do not push, deploy, publish, mutate databases, access secrets, or use shell escape commands.",
      `Allowed package actions for THIS call: ${actionPolicy.allowed_actions.join(", ")}.`,
      `Maximum model-supplied operations in one package: ${MAX_PACKAGE_OPERATIONS}.`,
      outputExample,
    ],
    compact_state: compact,
    objective_context: objectiveContext,
  });
}

function workPackageControl(state, budget) {
  const source = object(state?.work_package_control);
  return {
    contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
    reasoning_call_budget: resolveCodeAIReasoningCallBudget(
      source.reasoning_call_budget || budget,
    ),
    reasoning_calls_used: nonNegativeInteger(source.reasoning_calls_used),
    pending_reasoning_call: nonNegativeInteger(source.pending_reasoning_call) || null,
    packages_executed: nonNegativeInteger(source.packages_executed),
    operations_executed: nonNegativeInteger(source.operations_executed),
  };
}

function withControl(state, control) {
  return { ...object(state), work_package_control: control };
}

function plannerExecutionInput({ context, objective, objectiveContext, state, callNumber, budget }) {
  const actionPolicy = resolveCodeAIWorkPackageActionPolicy({
    objective_context: objectiveContext,
    state,
  });
  const prompt = packagePrompt({
    objective,
    objectiveContext,
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
        deterministic_authoritative_verification_controller_owned: true,
        deterministic_final_diff_controller_owned: true,
        current_edited_source_reinjected_on_repair: true,
        failed_verification_reinjected_on_repair: true,
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
      owned_orchestration: true,
      raw_reasoning_persisted: false,
    },
  };
}

async function initialInspect({ objective, objectiveContext, repositoryUrl, ref, resumeState, timeoutMs }) {
  if (resumeState?.base_commit) {
    return {
      ...resumeState,
      objective_context: normalizedObjectiveContext(
        resumeState.objective_context || objectiveContext,
      ),
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
    state: {
      ...object(state),
      status: "blocked",
      blockers: [reason],
    },
    reasoning_calls: nonNegativeInteger(state?.work_package_control?.reasoning_calls_used),
  };
}

export async function executeBatchedAutonomousCodeMissionV2({
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
  const objectiveContext = normalizedObjectiveContext(
    objective_context || resume_state?.objective_context,
  );

  let state;
  try {
    state = await initialInspect({
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
  state = withControl(state, control);
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
    control = {
      ...control,
      reasoning_calls_used: callNumber,
      pending_reasoning_call: callNumber,
    };
    state = withControl(state, control);
  }

  let planned;
  try {
    planned = await executeCodeAIPlannerRequest({
      execution_input: plannerExecutionInput({
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
    return blocked(state, text(error?.message || error, 2000));
  }

  if (planned.pending) {
    state = {
      ...state,
      status: "planner_pending",
      planner_pending: planned.pending_execution,
      work_package_control: {
        ...control,
        pending_reasoning_call: callNumber,
      },
    };
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
      authoritative_verification: authoritativeVerificationInput(goal),
    });
    const forbidden = workPackage.operations
      .map((operation) => operation.action)
      .filter((action) => !actionPolicy.allowed_actions.includes(action));
    if (forbidden.length) {
      throw new Error(
        `CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE:${[...new Set(forbidden)].join(",")}`,
      );
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
      usage_id: planned.result?.usage?.id || planned.result?.billing?.usage?.id || null,
      phase: workPackage.phase,
      summary: workPackage.summary,
      operation_count: workPackage.operations.length,
      operation_actions: workPackage.operations.map((operation) => operation.action),
      controller_normalizations: list(workPackage.controller_normalizations),
      phase_allowed_actions: actionPolicy.allowed_actions,
      discovery_locked: actionPolicy.discovery_locked,
      all_declared_evidence_loaded: actionPolicy.all_declared_evidence_loaded,
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

  let execution;
  try {
    execution = await executeCodeAIMission({
      objective: goal,
      repository_url: repositoryUrl,
      ref: text(ref, 160) || "main",
      operations,
      resume_state: state,
      timeout_ms,
    });
  } catch (error) {
    return blocked(state, text(error?.message || error, 2000));
  }

  control = {
    ...control,
    packages_executed: control.packages_executed + 1,
    operations_executed:
      control.operations_executed + operations.filter((operation) =>
        list(execution.state?.completed_operation_ids).includes(operation.id)
      ).length,
  };
  state = {
    ...execution.state,
    objective_context: objectiveContext,
    work_package_control: control,
  };

  if (execution.success && completionEligible(state)) {
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
  if (execution.status === "replan_required") {
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
    status: execution.status || "repair_required",
    reason: execution.reason || "CODE_AI_BATCHED_MORE_REASONING_REQUIRED",
    state,
    reasoning_calls: control.reasoning_calls_used,
  };
}

export const CodeAIWorkPackageRuntimeV2 = Object.freeze({
  contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  work_package_contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  prompt_contract: CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
  max_package_operations: MAX_PACKAGE_OPERATIONS,
  execute: executeBatchedAutonomousCodeMissionV2,
  parse: parseCodeAIWorkPackage,
  compactStateForPlanner: compactCodeAIMissionStateForPlanner,
  resolveActionPolicy: resolveCodeAIWorkPackageActionPolicy,
});

export default CodeAIWorkPackageRuntimeV2;
