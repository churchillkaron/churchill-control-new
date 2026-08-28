import { executeCodeAIMission } from "./CodeAIMissionRuntime.js";
import { executeCodeAIPlannerRequest } from "./CodeAIPlannerExecutionRuntime.js";
import {
  assertCodeAIReasoningCallAllowed,
  resolveCodeAIReasoningCallBudget,
} from "./CodeAIPlannerSpendPolicy.js";

export const CODE_AI_WORK_PACKAGE_CONTRACT = "AVANTIQO_CODE_AI_WORK_PACKAGE_V1";
export const CODE_AI_BATCHED_AUTONOMY_CONTRACT = "AVANTIQO_CODE_AI_BATCHED_AUTONOMY_V1";
export const CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT = "AVANTIQO_CODE_AI_WORK_PACKAGE_CONTROL_V1";

const PLANNER_SERVICE_ID = "ai.code.debug";
const PLANNER_CAPABILITY = "ai.code.debug";
const MAX_PACKAGE_OPERATIONS = 12;
const MAX_PLANNER_OUTPUT_CHARS = 120000;
const ALLOWED_PACKAGE_ACTIONS = new Set([
  "search",
  "read",
  "apply_files",
  "run",
  "verify",
  "diff",
]);

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

function stripFence(value) {
  let raw = text(value, MAX_PLANNER_OUTPUT_CHARS);
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) raw = raw.slice(fence.length).replace(/^json\s*/i, "");
  if (raw.endsWith(fence)) raw = raw.slice(0, -fence.length).trim();
  return raw;
}

export function parseCodeAIWorkPackage(value) {
  const raw = stripFence(value);
  if (!raw) throw new Error("CODE_AI_WORK_PACKAGE_OUTPUT_REQUIRED");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CODE_AI_WORK_PACKAGE_JSON_INVALID");
  }
  const packageObject = object(parsed);
  if (text(packageObject.contract, 160) !== CODE_AI_WORK_PACKAGE_CONTRACT) {
    throw new Error("CODE_AI_WORK_PACKAGE_CONTRACT_INVALID");
  }
  const rawOperations = list(packageObject.operations);
  if (!rawOperations.length) throw new Error("CODE_AI_WORK_PACKAGE_OPERATIONS_REQUIRED");
  if (rawOperations.length > MAX_PACKAGE_OPERATIONS) {
    throw new Error(`CODE_AI_WORK_PACKAGE_OPERATION_LIMIT_EXCEEDED:${rawOperations.length}`);
  }
  const operations = rawOperations.map((candidate, index) => {
    const item = object(candidate);
    const action = text(item.action, 80).toLowerCase();
    if (!ALLOWED_PACKAGE_ACTIONS.has(action)) {
      throw new Error(`CODE_AI_WORK_PACKAGE_ACTION_UNSUPPORTED:${action || "missing"}`);
    }
    return {
      action,
      description: text(item.description, 1200) || `Batched ${action}`,
      input: object(item.input),
      package_index: index + 1,
    };
  });
  const mutationIndexes = operations
    .map((operation, index) => operation.action === "apply_files" ? index : -1)
    .filter((index) => index >= 0);
  const verificationIndexes = operations
    .map((operation, index) => operation.action === "verify" ? index : -1)
    .filter((index) => index >= 0);
  const diffIndexes = operations
    .map((operation, index) => operation.action === "diff" ? index : -1)
    .filter((index) => index >= 0);
  if (mutationIndexes.length) {
    const lastMutation = Math.max(...mutationIndexes);
    if (!verificationIndexes.some((index) => index > lastMutation)) {
      throw new Error("CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION");
    }
    if (!diffIndexes.some((index) => index > lastMutation)) {
      throw new Error("CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_DIFF");
    }
  }
  return {
    contract: CODE_AI_WORK_PACKAGE_CONTRACT,
    phase: text(packageObject.phase, 80).toLowerCase() || "engineering",
    summary: text(packageObject.summary, 2000),
    operations,
  };
}

function compactOperationEvidence(entry) {
  const source = object(entry);
  const result = object(source.result);
  const action = text(source.action, 80);
  if (action === "read") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        file_path: text(result.file_path || result.path, 1000),
        start_line: result.start_line ?? null,
        end_line: result.end_line ?? null,
        total_lines: result.total_lines ?? null,
        content: text(result.content, 10000),
      },
    };
  }
  if (action === "search") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        mode: text(result.mode, 80),
        query: text(result.query, 1000),
        match_count: result.match_count ?? null,
        matches: list(result.matches).slice(0, 40).map((item) => text(item, 1200)),
      },
    };
  }
  if (action === "verify" || action === "run") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        command: text(result.command, 300),
        args: list(result.args).slice(0, 24).map((item) => text(item, 500)),
        cwd: text(result.cwd, 1000),
        exit_code: result.exit_code ?? null,
        stdout: text(result.stdout, 3000),
        stderr: text(result.stderr, 3000),
      },
    };
  }
  if (action === "diff") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        status: list(result.status).slice(0, 40),
        patch: text(result.patch, 12000),
        patch_bytes: result.patch_bytes ?? null,
      },
    };
  }
  return {
    operation_id: text(source.operation_id, 200),
    action,
    status: text(source.status, 80),
    result: JSON.stringify(result).slice(0, 5000),
  };
}

function compactMissionState(state) {
  const source = object(state);
  return {
    mission_id: text(source.mission_id, 200) || null,
    base_commit: text(source.base_commit, 160) || null,
    status: text(source.status, 100) || null,
    files_changed: list(source.files_changed).slice(-40),
    completed_operation_ids: list(source.completed_operation_ids).slice(-60),
    repository_guidance: {
      contract: text(source.repository_guidance?.contract, 160) || null,
      instructions_text: text(source.repository_guidance?.instructions_text, 5000),
      verification_commands_text: text(source.repository_guidance?.verification_commands_text, 2500),
      ci_workflows_text: text(source.repository_guidance?.ci_workflows_text, 1400),
      monorepo_summary: text(source.repository_guidance?.monorepo_summary, 800),
    },
    tests: list(source.tests).slice(-8).map((item) => ({
      operation_id: text(item?.operation_id, 200),
      command: text(item?.command, 300),
      args: list(item?.args).slice(0, 20),
      exit_code: item?.exit_code ?? null,
      stdout: text(item?.stdout, 2000),
      stderr: text(item?.stderr, 2000),
    })),
    verification: list(source.verification).slice(-8),
    failures: list(source.failures).slice(-6).map((item) => ({
      operation_id: text(item?.operation_id, 200),
      action: text(item?.action, 80),
      message: text(item?.message, 1800),
    })),
    patch: text(source.patch, 14000) || null,
    evidence: list(source.evidence)
      .filter((entry) => text(entry?.kind, 120) === "operation")
      .slice(-18)
      .map(compactOperationEvidence),
  };
}

function packagePrompt({ objective, objectiveContext, state, callNumber, budget }) {
  const compact = compactMissionState(state);
  const criteria = objectiveCriteria(objectiveContext);
  const hasCurrentSourceEvidence = compact.evidence.some((entry) => entry.action === "read");
  const phaseGuidance = hasCurrentSourceEvidence
    ? "You have current source evidence. Prefer one coherent implementation package: apply all required file changes together, then run the exact relevant verification and inspect the final diff in the SAME package. Do not split a coherent system change into one-file micro-steps."
    : "You do not yet have enough current source evidence. Produce one broad discovery package that searches and reads all likely relevant files in a single package. Do not mutate source until the needed source has been observed.";
  const instruction = [
    "You are the engineering reasoning worker inside Avantiqo Code AI. Avantiqo owns execution, sandboxing, mutation controls, verification, wallet, provider governance and safety.",
    "Your job is to produce a BATCHED engineering work package, not one tiny next action.",
    `REASONING CALL ${callNumber} OF ${budget}. Minimize future reasoning calls.`,
    `MISSION: ${text(objective, 5000)}`,
    criteria.length ? `COMPLETION CRITERIA: ${JSON.stringify(criteria)}` : "COMPLETION CRITERIA: none explicitly bound.",
    phaseGuidance,
    "Use multiple search/read operations in one discovery package when needed.",
    "When source evidence is sufficient, apply all coherent edits in one apply_files operation with complete final file contents, followed by verification and diff in the same package.",
    "If verification has already passed after the latest edits and the final diff is observed, do not reopen investigation; return a minimal non-mutating final evidence package only if needed.",
    "Do not research the web for ordinary repository work. Do not push, deploy, publish, mutate databases, access secrets, or use shell escape commands.",
    `Allowed package actions: ${[...ALLOWED_PACKAGE_ACTIONS].join(", ")}.`,
    `Maximum operations in one package: ${MAX_PACKAGE_OPERATIONS}.`,
    `Return exactly one JSON object: {"contract":"${CODE_AI_WORK_PACKAGE_CONTRACT}","phase":"discovery|implementation|repair|finalization","summary":"...","operations":[{"action":"read","description":"...","input":{...}}]}`,
    "CURRENT OBSERVED STATE:",
    JSON.stringify(compact),
  ].join("\n\n");
  if (instruction.length > 60000) {
    throw new Error(`CODE_AI_WORK_PACKAGE_PROMPT_TOO_LARGE:${instruction.length}`);
  }
  return instruction;
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
  const instruction = packagePrompt({
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
      instruction,
      structured_specification: {
        code_ai_batched_autonomy_contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
        work_package_contract: CODE_AI_WORK_PACKAGE_CONTRACT,
        reasoning_call_number: callNumber,
        reasoning_call_budget: budget,
        max_package_operations: MAX_PACKAGE_OPERATIONS,
        allowed_package_actions: [...ALLOWED_PACKAGE_ACTIONS],
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
      owned_orchestration: true,
      raw_reasoning_persisted: false,
    },
  };
}

async function initialInspect({ objective, objectiveContext, repositoryUrl, ref, resumeState, timeoutMs }) {
  if (resumeState?.base_commit) return {
    ...resumeState,
    objective_context: normalizedObjectiveContext(resumeState.objective_context || objectiveContext),
  };
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

export async function executeBatchedAutonomousCodeMission({
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

  let workPackage;
  try {
    workPackage = parseCodeAIWorkPackage(planned.output);
  } catch (error) {
    return blocked(state, text(error?.message || error, 2000));
  }
  control = {
    ...control,
    pending_reasoning_call: null,
  };
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

export const CodeAIWorkPackageRuntime = Object.freeze({
  contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  work_package_contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  max_package_operations: MAX_PACKAGE_OPERATIONS,
  allowed_package_actions: [...ALLOWED_PACKAGE_ACTIONS],
  execute: executeBatchedAutonomousCodeMission,
  parse: parseCodeAIWorkPackage,
});
