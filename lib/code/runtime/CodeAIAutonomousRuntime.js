import {
  codeAIGuardedActionFingerprint,
  normalizeCodeAIGuardedActionInput,
} from "./CodeAIAutonomyActionIdentity.js";
import { executeCodeAIMission } from "./CodeAIMissionRuntime.js";
import { executeCodeAIPlannerRequest } from "./CodeAIPlannerExecutionRuntime.js";
import { buildCodeAIPlannerPromptTransport } from "./CodeAIPlannerPromptRuntime.js";
import { parseCodeAIPlannerOutput } from "./CodeAIPlannerDecisionParser.js";
import { runOperatorWebResearch } from "@/lib/platform/research/runtime/OperatorWebResearchRuntime";

const CONTRACT = "AVANTIQO_CODE_AI_AUTONOMOUS_RUNTIME_V1";
const AUTONOMY_CONTROL_CONTRACT = "AVANTIQO_CODE_AI_AUTONOMY_CONTROL_V1";
const PLANNER_CAPABILITY = "ai.code.debug";
const PLANNER_SERVICE_ID = "ai.code.debug";
const DEFAULT_MAX_ITERATIONS = 16;
const MAX_ITERATIONS = 24;
const MAX_PLANNER_OUTPUT = 24000;
const MAX_GUARDED_ACTION_HISTORY = 80;
const MAX_SOURCE_READ_EVIDENCE = 8;
const MAX_DUPLICATE_REJECTION_STREAK = 3;
const MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2;
const MAX_PRODUCTIVE_CONVERGENCE_RESERVE = 4;
const MAX_FINALIZATION_ATTEMPT_RESERVE = 2;
const TRANSIENT_WORKSPACE_RETRY_LIMIT = 1;
const DUPLICATE_GUARDED_ACTIONS = new Set(["read", "search", "run"]);
const ALLOWED_ACTIONS = new Set([
  "inspect",
  "search",
  "read",
  "apply_files",
  "run",
  "verify",
  "diff",
  "research",
  "complete",
  "block",
]);

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedIterations(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_MAX_ITERATIONS;
  return Math.min(MAX_ITERATIONS, parsed);
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isTransientWorkspaceTermination(error) {
  const message = text(error?.message || error, 2000).toLowerCase();
  return message === "terminated" || /^sandbox(?:\s+[a-z0-9_-]+)*\s+terminated$/.test(message);
}

function normalizedReadInput(input) {
  return normalizeCodeAIGuardedActionInput("read", input);
}

function normalizedActionInput(action, input) {
  return normalizeCodeAIGuardedActionInput(action, input);
}

function actionFingerprint(action, input) {
  return codeAIGuardedActionFingerprint(action, input);
}

function recoveredPlannerIterations(state) {
  const logicalIterations = new Set();
  const legacyExecutionKeys = new Set();
  let anonymousCompleted = 0;
  for (const entry of list(state?.evidence)) {
    const kind = text(entry?.kind, 120);
    if (kind !== "autonomous_planner" && kind !== "autonomous_planner_pending") continue;
    const iteration = nonNegativeInteger(entry?.iteration);
    if (iteration > 0) {
      logicalIterations.add(iteration);
      continue;
    }
    const usageId = text(entry?.usage_id, 240);
    const providerJobId = text(entry?.provider_job_id, 240);
    if (usageId) legacyExecutionKeys.add(`usage:${usageId}`);
    else if (providerJobId) legacyExecutionKeys.add(`job:${providerJobId}`);
    else if (kind === "autonomous_planner") anonymousCompleted += 1;
  }
  return logicalIterations.size + legacyExecutionKeys.size + anonymousCompleted;
}

function recoveredProductivePlannerIterations(state) {
  const logicalIterations = new Set();
  for (const entry of list(state?.evidence)) {
    const kind = text(entry?.kind, 120);
    if (kind === "operation") {
      const operationId = text(entry?.operation_id, 200);
      const match = /^autonomy_(\d+)_/.exec(operationId);
      if (match) logicalIterations.add(Number(match[1]));
      continue;
    }
    if (kind === "governed_research" || kind === "governed_research_failure") {
      const iteration = nonNegativeInteger(entry?.iteration);
      if (iteration > 0) logicalIterations.add(iteration);
    }
  }
  return logicalIterations.size;
}

function productiveIterationLimit(state, maximum) {
  const changed =
    list(state?.source_changes).length > 0 ||
    list(state?.files_changed).length > 0;
  const reserve = changed ? MAX_PRODUCTIVE_CONVERGENCE_RESERVE : 0;
  return Math.min(
    MAX_ITERATIONS - MAX_FINALIZATION_ATTEMPT_RESERVE,
    maximum + reserve,
  );
}

function missionFinalizationEligible(state) {
  const changed =
    list(state?.source_changes).length > 0 ||
    list(state?.files_changed).length > 0;
  const verified = list(state?.verification).some((item) => item?.passed === true);
  return text(state?.status, 100) === "completed" && (!changed || verified);
}

function consumeProductiveIteration(control) {
  return {
    ...control,
    productive_planner_iterations_used:
      nonNegativeInteger(control?.productive_planner_iterations_used) + 1,
  };
}

function normalizedGuardedActionHistory(value) {
  return list(value)
    .map((entry) => {
      const action = text(entry?.action, 80);
      const hasNormalizedInput = entry?.normalized_input && typeof entry.normalized_input === "object";
      return {
        action,
        fingerprint: text(entry?.fingerprint, 128),
        normalized_input: hasNormalizedInput
          ? normalizedActionInput(action, entry.normalized_input)
          : null,
        operation_id: text(entry?.operation_id, 200) || null,
        evidence_revision: nonNegativeInteger(entry?.evidence_revision),
        source_revision: nonNegativeInteger(entry?.source_revision),
        status: text(entry?.status, 80) || "completed",
      };
    })
    .filter((entry) =>
      DUPLICATE_GUARDED_ACTIONS.has(entry.action) &&
      entry.fingerprint,
    )
    .slice(-MAX_GUARDED_ACTION_HISTORY);
}

function normalizedAutonomyControl(state, maximum) {
  const source = object(state?.autonomy_control);
  let plannerIterationsUsed = Math.max(
    nonNegativeInteger(source.planner_iterations_used),
    recoveredPlannerIterations(state),
  );
  let pendingPlannerIteration = state?.planner_pending
    ? nonNegativeInteger(source.pending_planner_iteration)
    : 0;
  if (state?.planner_pending && pendingPlannerIteration <= 0) {
    pendingPlannerIteration = Math.max(plannerIterationsUsed, 1);
  }
  if (pendingPlannerIteration > plannerIterationsUsed) {
    plannerIterationsUsed = pendingPlannerIteration;
  }
  const recoveredDuplicateProgress = trailingDuplicateRejectionProgress(state);
  const sourceDuplicateStreak = nonNegativeInteger(source.duplicate_rejection_streak);
  const sourceDuplicateAction = text(source.last_duplicate_action, 80) || null;
  const recoveredDuplicateAvailable =
    recoveredDuplicateProgress.streak > 0 &&
    DUPLICATE_GUARDED_ACTIONS.has(recoveredDuplicateProgress.action);
  return {
    contract: AUTONOMY_CONTROL_CONTRACT,
    max_iterations: maximum,
    planner_iterations_used: plannerIterationsUsed,
    productive_planner_iterations_used: Math.max(
      nonNegativeInteger(source.productive_planner_iterations_used),
      recoveredProductivePlannerIterations(state),
    ),
    pending_planner_iteration: pendingPlannerIteration || null,
    evidence_revision: nonNegativeInteger(source.evidence_revision),
    source_revision: nonNegativeInteger(source.source_revision),
    duplicate_rejection_streak: recoveredDuplicateAvailable
      ? recoveredDuplicateProgress.streak
      : sourceDuplicateStreak,
    last_duplicate_action: recoveredDuplicateAvailable
      ? recoveredDuplicateProgress.action
      : sourceDuplicateAction,
    suppressed_action_rejection_streak: nonNegativeInteger(source.suppressed_action_rejection_streak),
    last_suppressed_action: text(source.last_suppressed_action, 80) || null,
    guarded_actions: normalizedGuardedActionHistory(source.guarded_actions),
  };
}

function withAutonomyControl(state, control) {
  return {
    ...object(state),
    autonomy_control: control,
  };
}

function resetDuplicateProgress(control) {
  return {
    ...control,
    duplicate_rejection_streak: 0,
    last_duplicate_action: null,
  };
}

function recordDuplicateProgress(control, action) {
  const normalizedAction = text(action, 80);
  const sameAction = text(control?.last_duplicate_action, 80) === normalizedAction;
  return {
    ...control,
    duplicate_rejection_streak: sameAction
      ? nonNegativeInteger(control?.duplicate_rejection_streak) + 1
      : 1,
    last_duplicate_action: normalizedAction || null,
  };
}

function plannerInspectionRequired(state) {
  const source = object(state);
  if (!text(source.base_commit, 120)) return true;
  if (text(source.status, 100) === "replan_required") return true;
  return !text(source.repository_guidance?.contract, 160);
}

function plannerAllowedActions(state) {
  const control = object(state?.autonomy_control);
  const streak = nonNegativeInteger(control.duplicate_rejection_streak);
  const repeatedAction = text(control.last_duplicate_action, 80);
  let allowedActions = [...ALLOWED_ACTIONS];
  if (!plannerInspectionRequired(state)) {
    allowedActions = allowedActions.filter((action) => action !== "inspect");
  }
  if (streak < 1 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {
    return allowedActions;
  }
  return allowedActions.filter((action) => action !== repeatedAction);
}

function resetSuppressedActionRejection(control) {
  return {
    ...control,
    suppressed_action_rejection_streak: 0,
    last_suppressed_action: null,
  };
}

function recordSuppressedActionRejection(control, action) {
  const normalizedAction = text(action, 80);
  const sameAction = text(control?.last_suppressed_action, 80) === normalizedAction;
  return {
    ...control,
    suppressed_action_rejection_streak: sameAction
      ? nonNegativeInteger(control?.suppressed_action_rejection_streak) + 1
      : 1,
    last_suppressed_action: normalizedAction || null,
  };
}

function advanceEvidenceRevision(control) {
  return {
    ...control,
    evidence_revision: nonNegativeInteger(control?.evidence_revision) + 1,
  };
}

function advanceSourceRevision(control) {
  return {
    ...control,
    source_revision: nonNegativeInteger(control?.source_revision) + 1,
  };
}

function recordGuardedAction(control, decision, operationId, status) {
  if (!DUPLICATE_GUARDED_ACTIONS.has(decision.action)) return control;
  const entry = {
    action: decision.action,
    fingerprint: actionFingerprint(decision.action, decision.input),
    normalized_input: normalizedActionInput(decision.action, decision.input),
    operation_id: operationId,
    evidence_revision: nonNegativeInteger(control?.evidence_revision),
    source_revision: nonNegativeInteger(control?.source_revision),
    status: text(status, 80) || "completed",
  };
  return {
    ...control,
    guarded_actions: [...normalizedGuardedActionHistory(control?.guarded_actions), entry]
      .slice(-MAX_GUARDED_ACTION_HISTORY),
  };
}

function readRangeCovered(previousInput, requestedInput) {
  const previous = normalizedReadInput(previousInput);
  const requested = normalizedReadInput(requestedInput);
  return Boolean(
    previous.file_path &&
    previous.file_path === requested.file_path &&
    previous.start_line <= requested.start_line &&
    previous.end_line >= requested.end_line
  );
}

function duplicateActionGuard(control, decision) {
  if (!DUPLICATE_GUARDED_ACTIONS.has(decision.action)) return null;
  const normalizedInput = normalizedActionInput(decision.action, decision.input);
  const fingerprint = actionFingerprint(decision.action, decision.input);
  const currentEvidenceRevision = nonNegativeInteger(control?.evidence_revision);
  const currentSourceRevision = nonNegativeInteger(control?.source_revision);
  const duplicate = [...normalizedGuardedActionHistory(control?.guarded_actions)]
    .reverse()
    .find((entry) => {
      if (decision.action === "read") {
        if (entry.action !== "read" || entry.source_revision !== currentSourceRevision) return false;
        if (entry.fingerprint === fingerprint) return true;
        return Boolean(
          entry.normalized_input &&
          readRangeCovered(entry.normalized_input, normalizedInput)
        );
      }
      return (
        entry.evidence_revision === currentEvidenceRevision &&
        entry.fingerprint === fingerprint
      );
    });
  if (!duplicate) return null;
  const matchMode = duplicate.fingerprint === fingerprint
    ? "EXACT_FINGERPRINT"
    : "READ_RANGE_COVERED";
  return {
    reason: "CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_WITHOUT_NEW_EVIDENCE",
    action: decision.action,
    fingerprint,
    duplicate_match_mode: matchMode,
    duplicate_of_operation_id: duplicate.operation_id,
    evidence_revision: currentEvidenceRevision,
    source_revision: currentSourceRevision,
  };
}

function trailingDuplicateRejectionProgress(state) {
  let streak = 0;
  let action = null;
  for (const entry of [...list(state?.evidence)].reverse()) {
    const kind = text(entry?.kind, 120);
    const status = text(entry?.status, 120);
    if (kind === "autonomy_guard" && status === "rejected_duplicate_action") {
      const entryAction = text(entry?.action, 80);
      if (!DUPLICATE_GUARDED_ACTIONS.has(entryAction)) break;
      if (!action) {
        action = entryAction;
        streak = 1;
        continue;
      }
      if (entryAction === action) {
        streak += 1;
        continue;
      }
      break;
    }
    if (kind === "autonomous_planner" || kind === "autonomous_planner_pending") {
      continue;
    }
    if (streak > 0) break;
  }
  return { streak, action };
}

function normalizedObjectiveContext(value) {
  const source = object(value);
  const score = Number(source.selection_score);
  return {
    repository_head_observed:
      text(source.repository_head_observed, 160) || null,
    selection_contract: text(source.selection_contract, 160) || null,
    selected_candidate_id: text(source.selected_candidate_id, 120) || null,
    selection_score: Number.isFinite(score) ? score : null,
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

function objectiveCompletionCriteria(value) {
  const context = normalizedObjectiveContext(value);
  return [
    context.completion_criterion_1,
    context.completion_criterion_2,
    context.completion_criterion_3,
    context.completion_criterion_4,
    context.completion_criterion_5,
    context.completion_criterion_6,
  ].filter(Boolean);
}

function validatedCompletionCriteriaEvidence(state, input) {
  const criteria = objectiveCompletionCriteria(state?.objective_context);
  if (!criteria.length) {
    return {
      valid: true,
      criteria: [],
      evidence: [],
      reason: null,
    };
  }

  const allowedCriteria = new Set(criteria);
  const observedOperationIds = new Set([
    ...list(state?.completed_operation_ids)
      .map((item) => text(item, 200))
      .filter(Boolean),
    ...list(state?.verification)
      .map((item) => text(item?.operation_id, 200))
      .filter(Boolean),
  ]);
  const supplied = list(object(input).criteria_evidence);
  if (!supplied.length) {
    return {
      valid: false,
      criteria,
      evidence: [],
      reason: "CODE_AI_AUTONOMOUS_COMPLETION_CRITERIA_EVIDENCE_REQUIRED",
    };
  }

  const byCriterion = new Map();
  for (const item of supplied) {
    const criterion = text(item?.criterion, 700);
    if (!allowedCriteria.has(criterion)) {
      return {
        valid: false,
        criteria,
        evidence: [],
        reason: "CODE_AI_AUTONOMOUS_COMPLETION_CRITERION_NOT_BOUND",
      };
    }
    const evidenceOperationIds = [...new Set(
      list(item?.evidence_operation_ids)
        .map((operationId) => text(operationId, 200))
        .filter(Boolean),
    )].slice(0, 12);
    if (!evidenceOperationIds.length) {
      return {
        valid: false,
        criteria,
        evidence: [],
        reason:
          "CODE_AI_AUTONOMOUS_COMPLETION_CRITERION_OPERATION_EVIDENCE_REQUIRED",
      };
    }
    if (evidenceOperationIds.some((operationId) => !observedOperationIds.has(operationId))) {
      return {
        valid: false,
        criteria,
        evidence: [],
        reason: "CODE_AI_AUTONOMOUS_COMPLETION_CRITERION_OPERATION_UNKNOWN",
      };
    }
    const existing = byCriterion.get(criterion) || [];
    byCriterion.set(
      criterion,
      [...new Set([...existing, ...evidenceOperationIds])].slice(0, 12),
    );
  }

  const missing = criteria.filter((criterion) => !byCriterion.has(criterion));
  if (missing.length) {
    return {
      valid: false,
      criteria,
      evidence: [],
      reason: "CODE_AI_AUTONOMOUS_COMPLETION_CRITERIA_INCOMPLETE",
    };
  }

  return {
    valid: true,
    criteria,
    evidence: criteria.map((criterion) => ({
      criterion,
      evidence_operation_ids: byCriterion.get(criterion),
    })),
    reason: null,
  };
}

function parsePlannerDecision(value) {
  const { parsed, normalization } = parseCodeAIPlannerOutput(value, {
    maxChars: MAX_PLANNER_OUTPUT,
  });
  const decision = object(parsed);
  const action = text(decision.action, 80).toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`CODE_AI_AUTONOMOUS_ACTION_UNSUPPORTED:${action || "missing"}`);
  }
  return {
    action,
    description: text(decision.description, 1200),
    input: object(decision.input),
    reason: text(decision.reason, 2000),
    planner_output_normalization: normalization,
  };
}

function compactState(state = {}) {
  const source = object(state);
  const control = object(source.autonomy_control);
  const maximum = nonNegativeInteger(control.max_iterations);
  const used = nonNegativeInteger(control.planner_iterations_used);
  const productiveUsed = nonNegativeInteger(control.productive_planner_iterations_used);
  const productiveLimit = productiveIterationLimit(source, maximum);
  const currentSourceRevision = nonNegativeInteger(control.source_revision);
  const currentReadOperationIds = new Set(
    normalizedGuardedActionHistory(control.guarded_actions)
      .filter((entry) =>
        entry.action === "read" &&
        entry.source_revision === currentSourceRevision &&
        entry.operation_id
      )
      .map((entry) => entry.operation_id),
  );
  const sourceReadEvidence = list(source.evidence)
    .filter((entry) =>
      text(entry?.kind, 120) === "operation" &&
      text(entry?.action, 80) === "read" &&
      text(entry?.status, 80) === "completed" &&
      currentReadOperationIds.has(text(entry?.operation_id, 200))
    )
    .slice(-MAX_SOURCE_READ_EVIDENCE);
  const rejectedDuplicateActions = list(source.evidence)
    .filter((entry) =>
      text(entry?.kind, 120) === "autonomy_guard" &&
      text(entry?.status, 120) === "rejected_duplicate_action" &&
      nonNegativeInteger(entry?.source_revision) === currentSourceRevision
    )
    .slice(-6)
    .map((entry) => ({
      iteration: nonNegativeInteger(entry?.iteration),
      action: text(entry?.action, 80),
      reason: text(entry?.reason, 300),
      duplicate_match_mode: text(entry?.duplicate_match_mode, 120),
      duplicate_of_operation_id: text(entry?.duplicate_of_operation_id, 200) || null,
      source_revision: nonNegativeInteger(entry?.source_revision),
    }));
  return {
    mission_id: text(source.mission_id, 200),
    objective: text(source.objective, 4000),
    objective_context: normalizedObjectiveContext(source.objective_context),
    base_commit: text(source.base_commit, 120),
    status: text(source.status, 100),
    current_operation_id: text(source.current_operation_id, 200) || null,
    completed_operation_ids: list(source.completed_operation_ids).slice(-24),
    files_changed: list(source.files_changed).slice(-40),
    tests: list(source.tests).slice(-8).map((item) => ({
      operation_id: item?.operation_id || null,
      command: item?.command || null,
      args: list(item?.args).slice(0, 20),
      exit_code: item?.exit_code,
      stdout: text(item?.stdout, 5000),
      stderr: text(item?.stderr, 5000),
    })),
    failures: list(source.failures).slice(-8),
    repairs: list(source.repairs).slice(-8),
    blockers: list(source.blockers).slice(-8),
    verification: list(source.verification).slice(-8),
    source_read_evidence: sourceReadEvidence,
    rejected_duplicate_actions: rejectedDuplicateActions,
    duplicate_rejection_streak: nonNegativeInteger(control.duplicate_rejection_streak),
    evidence: list(source.evidence).slice(-12),
    patch_present: Boolean(text(source.patch, 1)),
    source_change_count: list(source.source_changes).length,
    autonomy_control: {
      contract: text(control.contract, 160) || AUTONOMY_CONTROL_CONTRACT,
      planner_iterations_used: used,
      max_iterations: maximum,
      remaining_iterations: Math.max(0, productiveLimit - productiveUsed),
      planner_attempt_limit: MAX_ITERATIONS,
      remaining_planner_attempts: Math.max(0, MAX_ITERATIONS - used),
      productive_planner_iterations_used: productiveUsed,
      productive_iteration_limit: productiveLimit,
      remaining_productive_iterations: Math.max(0, productiveLimit - productiveUsed),
      post_edit_convergence_reserve_active: productiveLimit > maximum,
      pending_planner_iteration:
        nonNegativeInteger(control.pending_planner_iteration) || null,
      evidence_revision: nonNegativeInteger(control.evidence_revision),
      source_revision: currentSourceRevision,
      duplicate_rejection_streak: nonNegativeInteger(control.duplicate_rejection_streak),
      last_duplicate_action: text(control.last_duplicate_action, 80) || null,
      suppressed_action_rejection_streak: nonNegativeInteger(control.suppressed_action_rejection_streak),
      last_suppressed_action: text(control.last_suppressed_action, 80) || null,
      allowed_actions: plannerAllowedActions(source),
      recent_guarded_actions: normalizedGuardedActionHistory(control.guarded_actions)
        .slice(-8),
    },
    planner_pending: source.planner_pending
      ? {
          provider: source.planner_pending.provider,
          provider_job_id: source.planner_pending.provider_job_id,
          usage_id: source.planner_pending.usage_id,
        }
      : null,
  };
}

function appendEvidence(state, entry) {
  const source = object(state);
  return {
    ...source,
    evidence: [...list(source.evidence), entry].slice(-120),
    updated_at: new Date().toISOString(),
  };
}

function plannerEvidence(result, iteration, decision) {
  return {
    at: new Date().toISOString(),
    kind: "autonomous_planner",
    iteration,
    provider: result?.provider || null,
    model: result?.model || null,
    usage_id: result?.usage?.id || result?.billing?.usage?.id || null,
    decision: {
      action: decision.action,
      description: decision.description,
      reason: decision.reason,
      output_normalization: decision.planner_output_normalization || null,
    },
  };
}

function plannerExecutionInput({ context, objective, state, iteration }) {
  const allowedActions = plannerAllowedActions(state);
  const transport = buildCodeAIPlannerPromptTransport({
    objective,
    iteration,
    state: compactState(state),
    repository_guidance: state?.repository_guidance,
    allowed_actions: allowedActions,
    autonomy_contract: CONTRACT,
  });
  return {
    organization_id: context.organizationId,
    party_id: text(context?.metadata?.partyId || context.partyId, 200) || null,
    entity_id: text(context.entityId, 200) || null,
    service_id: PLANNER_SERVICE_ID,
    capability: PLANNER_CAPABILITY,
    category: "CODE_AI_AUTONOMY",
    input: {
      contract: "AVANTIQO_CODE_ENGINE_V1",
      capability: PLANNER_CAPABILITY,
      instruction: transport.instruction,
      structured_specification: transport.structured_specification,
      quantity: 1,
    },
    metadata: {
      code_ai_autonomy_contract: CONTRACT,
      code_ai_mission_id: state?.mission_id || null,
      code_ai_iteration: iteration,
      planner_prompt_contract: transport.contract,
      planner_instruction_chars: transport.instruction_chars,
      planner_instruction_max_chars: transport.structured_specification.planner_instruction_max_chars,
      planner_state_chars: transport.state_chars,
      worker_instruction_headroom_chars: transport.headroom_to_worker_limit_chars,
      product_objective_provenance_present:
        Boolean(text(state?.objective_context?.selection_contract, 160)),
      product_completion_criteria_count:
        objectiveCompletionCriteria(state?.objective_context).length,
      product_objective_provenance_authorization_effect: "NONE",
      owned_orchestration: true,
      raw_reasoning_persisted: false,
    },
  };
}

async function planNext({ context, objective, state, iteration }) {
  const execution = await executeCodeAIPlannerRequest({
    execution_input: plannerExecutionInput({ context, objective, state, iteration }),
    pending_execution: state?.planner_pending || null,
  });
  if (execution.pending) return execution;
  return {
    ...execution,
    decision: parsePlannerDecision(execution.output),
  };
}

async function executeResearch({ context, objective, input }) {
  return runOperatorWebResearch({
    context,
    payload: {
      query: text(input.query, 4000),
      objective: text(input.objective || objective, 2000),
      preferred_domains: list(input.preferred_domains).slice(0, 10),
      freshness_days: input.freshness_days ?? null,
      minimum_sources: input.minimum_sources ?? 2,
      max_sources: input.max_sources ?? 8,
      search_context_size: input.search_context_size || "high",
    },
  });
}

function initialMissionInput({
  objective,
  objectiveContext,
  repositoryUrl,
  ref,
  resumeState,
}) {
  if (resumeState) {
    return {
      ...resumeState,
      objective_context: normalizedObjectiveContext(
        resumeState.objective_context || objectiveContext,
      ),
    };
  }
  return {
    objective,
    objective_context: normalizedObjectiveContext(objectiveContext),
    repository_url: repositoryUrl,
    ref,
  };
}

function blockedResult(state, reason, iterations) {
  return {
    success: false,
    contract: CONTRACT,
    status: "blocked",
    reason,
    state: {
      ...state,
      status: "blocked",
      blockers: [reason],
      updated_at: new Date().toISOString(),
    },
    iterations,
  };
}

export async function executeAutonomousCodeMission({
  context = {},
  objective,
  objective_context = null,
  repository_url,
  ref = "main",
  resume_state = null,
  max_iterations = DEFAULT_MAX_ITERATIONS,
  timeout_ms = null,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 200);
  const goal = text(objective, 4000);
  const repositoryUrl = text(repository_url, 500);
  const objectiveContext = normalizedObjectiveContext(
    objective_context || resume_state?.objective_context,
  );
  if (!organizationId) throw new Error("CODE_AI_AUTONOMOUS_ORGANIZATION_REQUIRED");
  if (!goal) throw new Error("CODE_AI_AUTONOMOUS_OBJECTIVE_REQUIRED");
  if (!repositoryUrl) throw new Error("CODE_AI_AUTONOMOUS_REPOSITORY_REQUIRED");

  const maximum = boundedIterations(max_iterations);
  let state = initialMissionInput({
    objective: goal,
    objectiveContext,
    repositoryUrl,
    ref: text(ref, 160) || "main",
    resumeState: resume_state,
  });

  if (!state.base_commit) {
    try {
      const initial = await executeCodeAIMission({
        objective: goal,
        repository_url: repositoryUrl,
        ref: text(ref, 160) || "main",
        operations: [{
          id: "autonomy_initial_inspect",
          action: "inspect",
          description: "Establish the repository head, package manager and tracked-file baseline before planning changes.",
          input: {},
        }],
        resume_state: null,
        timeout_ms,
      });
      state = {
        ...initial.state,
        objective_context: objectiveContext,
      };
      state = appendEvidence(state, {
        kind: "product_objective_provenance",
        ...objectiveContext,
      });
      if (!initial.success && initial.status !== "completed") {
        return {
          success: false,
          contract: CONTRACT,
          status: initial.status,
          reason: initial.reason || "CODE_AI_AUTONOMOUS_INITIAL_INSPECTION_FAILED",
          state,
          iterations: 0,
        };
      }
    } catch (error) {
      return blockedResult(state, text(error?.message || error, 2000), 0);
    }
  }

  let control = normalizedAutonomyControl(state, maximum);
  state = withAutonomyControl(state, control);

  while (true) {
    const resumingPending = Boolean(state.planner_pending);
    let iteration;

    if (resumingPending) {
      control = normalizedAutonomyControl(state, maximum);
      iteration = control.pending_planner_iteration || control.planner_iterations_used || 1;
      control = {
        ...control,
        planner_iterations_used: Math.max(control.planner_iterations_used, iteration),
        pending_planner_iteration: iteration,
      };
      state = withAutonomyControl(state, control);
    } else {
      if (control.planner_iterations_used >= MAX_ITERATIONS) {
        return blockedResult(
          state,
          "CODE_AI_AUTONOMOUS_PLANNER_ATTEMPT_LIMIT_EXHAUSTED",
          control.planner_iterations_used,
        );
      }
      const productiveLimit = productiveIterationLimit(state, maximum);
      if (
        nonNegativeInteger(control.productive_planner_iterations_used) >= productiveLimit &&
        !missionFinalizationEligible(state)
      ) {
        return blockedResult(
          state,
          "CODE_AI_AUTONOMOUS_ITERATION_BUDGET_EXHAUSTED",
          control.planner_iterations_used,
        );
      }
      iteration = control.planner_iterations_used + 1;
      control = {
        ...control,
        planner_iterations_used: iteration,
        pending_planner_iteration: iteration,
      };
      state = withAutonomyControl(state, control);
    }

    let planned;
    try {
      planned = await planNext({
        context: { ...context, organizationId },
        objective: goal,
        state,
        iteration,
      });
    } catch (error) {
      control = {
        ...control,
        pending_planner_iteration: resumingPending ? iteration : null,
      };
      state = withAutonomyControl(state, control);
      state = appendEvidence(state, {
        at: new Date().toISOString(),
        kind: "autonomous_planner_failure",
        iteration,
        error: text(error?.message || error, 2000),
      });
      return blockedResult(
        state,
        text(error?.message || error, 2000),
        control.planner_iterations_used,
      );
    }

    if (planned.pending) {
      control = {
        ...control,
        pending_planner_iteration: iteration,
      };
      state = {
        ...state,
        status: "planner_pending",
        planner_pending: planned.pending_execution,
        autonomy_control: control,
        blockers: [],
        updated_at: new Date().toISOString(),
      };
      state = appendEvidence(state, {
        at: new Date().toISOString(),
        kind: "autonomous_planner_pending",
        iteration,
        provider: planned.pending_execution?.provider || null,
        provider_job_id: planned.pending_execution?.provider_job_id || null,
        usage_id: planned.pending_execution?.usage_id || null,
        stale_queue_recovery_count:
          Number(planned.pending_execution?.stale_queue_recovery_count || 0),
        recovered_from_provider_job_id:
          planned.pending_execution?.recovered_from_provider_job_id || null,
      });
      return {
        success: false,
        contract: CONTRACT,
        status: "planner_pending",
        reason: "CODE_AI_AUTONOMOUS_PLANNER_PENDING",
        state,
        iterations: control.planner_iterations_used,
      };
    }

    control = {
      ...control,
      pending_planner_iteration: null,
    };
    state = {
      ...state,
      planner_pending: null,
      autonomy_control: control,
    };
    const { decision } = planned;
    state = appendEvidence(state, plannerEvidence(planned.result, iteration, decision));

    const currentAllowedActions = plannerAllowedActions(state);
    if (!currentAllowedActions.includes(decision.action)) {
      control = recordSuppressedActionRejection(control, decision.action);
      state = withAutonomyControl(state, control);
      state = appendEvidence(state, {
        at: new Date().toISOString(),
        kind: "autonomy_guard",
        iteration,
        status: "rejected_suppressed_action",
        reason: "CODE_AI_AUTONOMOUS_ACTION_NOT_CURRENTLY_ALLOWED",
        action: decision.action,
        allowed_actions: currentAllowedActions,
        suppressed_action_rejection_streak:
          nonNegativeInteger(control.suppressed_action_rejection_streak),
      });
      if (
        nonNegativeInteger(control.suppressed_action_rejection_streak) >=
        MAX_SUPPRESSED_ACTION_REJECTION_STREAK
      ) {
        return blockedResult(
          state,
          `CODE_AI_AUTONOMOUS_SUPPRESSED_ACTION_STREAK_EXCEEDED:${decision.action}:${control.suppressed_action_rejection_streak}`,
          control.planner_iterations_used,
        );
      }
      continue;
    }
    control = resetSuppressedActionRejection(control);
    state = withAutonomyControl(state, control);

    if (decision.action === "complete") {
      const criteriaEvidence = validatedCompletionCriteriaEvidence(
        state,
        decision.input,
      );
      if (!criteriaEvidence.valid) {
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "autonomy_guard",
          iteration,
          status: "rejected_completion",
          reason: criteriaEvidence.reason,
          product_completion_criteria_count: criteriaEvidence.criteria.length,
        });
        continue;
      }
      if (criteriaEvidence.criteria.length) {
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "product_completion_criteria_evidence",
          verified: true,
          criteria_count: criteriaEvidence.criteria.length,
          criteria_evidence: criteriaEvidence.evidence,
          authorization_effect: "NONE",
        });
      }

      const changed = list(state.source_changes).length > 0 || list(state.files_changed).length > 0;
      const verified = list(state.verification).some((item) => item?.passed === true);
      if (changed && !verified) {
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "autonomy_guard",
          iteration,
          status: "rejected_completion",
          reason: "CODE_AI_AUTONOMOUS_CHANGED_MISSION_REQUIRES_VERIFICATION",
        });
        continue;
      }
      if (text(state.status, 100) !== "completed") {
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "autonomy_guard",
          iteration,
          status: "rejected_completion",
          reason: `CODE_AI_AUTONOMOUS_MISSION_NOT_COMPLETE:${text(state.status, 100)}`,
        });
        continue;
      }
      return {
        success: true,
        contract: CONTRACT,
        status: "completed",
        summary: decision.description || "Code AI mission completed with observed verification evidence.",
        state,
        iterations: control.planner_iterations_used,
      };
    }

    if (decision.action === "block") {
      return blockedResult(
        state,
        decision.description || decision.reason || "CODE_AI_AUTONOMOUS_BLOCKED",
        control.planner_iterations_used,
      );
    }

    if (decision.action === "research") {
      control = consumeProductiveIteration(resetDuplicateProgress(control));
      state = withAutonomyControl(state, control);
      try {
        const research = await executeResearch({
          context: { ...context, organizationId },
          objective: goal,
          input: decision.input,
        });
        control = advanceEvidenceRevision(control);
        state = withAutonomyControl(state, control);
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "governed_research",
          iteration,
          query: research?.query || decision.input.query || null,
          answer: text(research?.answer, 8000),
          claims: list(research?.claims).slice(0, 20),
          sources: list(research?.sources).slice(0, 12),
          uncertainty: list(research?.uncertainty).slice(0, 12),
          governance: research?.governance || null,
        });
      } catch (error) {
        control = advanceEvidenceRevision(control);
        state = withAutonomyControl(state, control);
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "governed_research_failure",
          iteration,
          query: decision.input.query || null,
          error: text(error?.message || error, 2000),
        });
      }
      continue;
    }

    const duplicate = duplicateActionGuard(control, decision);
    if (duplicate) {
      control = recordDuplicateProgress(control, decision.action);
      state = withAutonomyControl(state, control);
      state = appendEvidence(state, {
        at: new Date().toISOString(),
        kind: "autonomy_guard",
        iteration,
        status: "rejected_duplicate_action",
        ...duplicate,
      });
      const duplicateRejectionStreak = nonNegativeInteger(control.duplicate_rejection_streak);
      if (duplicateRejectionStreak >= MAX_DUPLICATE_REJECTION_STREAK) {
        return blockedResult(
          state,
          `CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_STREAK_EXCEEDED:${duplicateRejectionStreak}`,
          control.planner_iterations_used,
        );
      }
      continue;
    }

    control = consumeProductiveIteration(resetDuplicateProgress(control));
    state = withAutonomyControl(state, control);

    const operationId = `autonomy_${iteration}_${decision.action}`;
    const executeOperation = () => executeCodeAIMission({
      objective: goal,
      repository_url: repositoryUrl,
      ref: text(ref, 160) || "main",
      operations: [{
        id: operationId,
        action: decision.action,
        description: decision.description || `Autonomous ${decision.action}`,
        input: decision.input,
      }],
      resume_state: state,
      timeout_ms,
    });
    let execution;
    let transientWorkspaceRetries = 0;
    while (!execution) {
      try {
        execution = await executeOperation();
      } catch (error) {
        if (
          transientWorkspaceRetries < TRANSIENT_WORKSPACE_RETRY_LIMIT &&
          isTransientWorkspaceTermination(error)
        ) {
          transientWorkspaceRetries += 1;
          state = appendEvidence(state, {
            at: new Date().toISOString(),
            kind: "autonomous_execution_retry",
            iteration,
            operation_id: operationId,
            error: text(error?.message || error, 2000),
            retry_attempt: transientWorkspaceRetries,
            retry_limit: TRANSIENT_WORKSPACE_RETRY_LIMIT,
            same_operation_retried: true,
            new_planner_request_submitted: false,
          });
          continue;
        }
        state = appendEvidence(state, {
          at: new Date().toISOString(),
          kind: "autonomous_execution_failure",
          iteration,
          operation_id: operationId,
          error: text(error?.message || error, 2000),
          transient_workspace_retries: transientWorkspaceRetries,
        });
        return blockedResult(
          state,
          text(error?.message || error, 2000),
          control.planner_iterations_used,
        );
      }
    }

    const operationObserved =
      execution.success === true ||
      text(execution?.failed_operation?.id, 200) === operationId ||
      list(execution?.state?.completed_operation_ids).includes(operationId);
    control = advanceEvidenceRevision(control);
    if (execution.success === true && decision.action === "apply_files") {
      control = advanceSourceRevision(control);
    } else if (execution.status === "replan_required") {
      control = advanceSourceRevision(control);
    }
    if (operationObserved) {
      control = recordGuardedAction(
        control,
        decision,
        operationId,
        execution.success ? "completed" : "failed",
      );
    }
    state = {
      ...execution.state,
      objective_context: objectiveContext,
      autonomy_control: control,
    };

    if (!execution.success) {
      state = appendEvidence(state, {
        at: new Date().toISOString(),
        kind: "autonomous_observation",
        iteration,
        operation_id: operationId,
        status: execution.status,
        reason: execution.reason || null,
        repair_expected: execution.status === "repair_required",
        replan_expected: execution.status === "replan_required",
      });
    }
  }
}

export const CodeAIAutonomousRuntime = Object.freeze({
  contract: CONTRACT,
  autonomy_control_contract: AUTONOMY_CONTROL_CONTRACT,
  max_iterations: MAX_ITERATIONS,
  max_planner_attempts: MAX_ITERATIONS,
  productive_convergence_reserve: MAX_PRODUCTIVE_CONVERGENCE_RESERVE,
  finalization_attempt_reserve: MAX_FINALIZATION_ATTEMPT_RESERVE,
  max_duplicate_rejection_streak: MAX_DUPLICATE_REJECTION_STREAK,
  source_read_evidence_limit: MAX_SOURCE_READ_EVIDENCE,
  duplicate_guarded_actions: [...DUPLICATE_GUARDED_ACTIONS],
  execute: executeAutonomousCodeMission,
});
