import {
  executeBatchedAutonomousCodeMission,
  CodeAIWorkPackageRuntime,
} from "./CodeAIWorkPackageRuntime.js";
import {
  resolveCodeAIReasoningCallBudget,
} from "./CodeAIPlannerSpendPolicy.js";
import {
  assessCodeAIWorldClassQuality,
} from "./CodeAIWorldClassQualityPolicy.js";
import {
  projectCodeProductCompletionCriteria,
} from "./CodeProductCompletionCriteriaRuntime.js";

export const CODE_AI_EMPLOYEE_RUNTIME_CONTRACT =
  "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1";
export const CODE_AI_EMPLOYEE_MISSION_CONTRACT =
  "AVANTIQO_CODE_AI_EMPLOYEE_MISSION_V1";

const DEFAULT_MAX_EMPLOYEE_PASSES = 8;
const MAX_EMPLOYEE_PASSES = 16;
const MAX_EVIDENCE_ITEMS = 120;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function boundedEmployeePasses(value) {
  const parsed = integer(value, DEFAULT_MAX_EMPLOYEE_PASSES);
  if (parsed <= 0) return DEFAULT_MAX_EMPLOYEE_PASSES;
  return Math.min(MAX_EMPLOYEE_PASSES, parsed);
}

function successfulVerification(state) {
  return list(state?.verification).some((entry) => entry?.passed === true);
}

function finalDiffObserved(state) {
  const source = object(state);
  if (!text(source.patch, 1)) return false;
  return list(source.evidence).some((entry) =>
    text(entry?.kind, 120) === "operation" &&
    text(entry?.action, 80) === "diff" &&
    text(entry?.status, 80) === "completed"
  );
}

function objectiveCompletionCriteria(value) {
  const context = object(value);
  return [
    context.completion_criterion_1,
    context.completion_criterion_2,
    context.completion_criterion_3,
    context.completion_criterion_4,
    context.completion_criterion_5,
    context.completion_criterion_6,
  ].map((criterion) => text(criterion, 700)).filter(Boolean);
}

function criterionMarker(index) {
  return `[criterion:C${index + 1}]`;
}

export function bindCodeAIEmployeeProductCompletionEvidence(state = {}) {
  const source = object(state);
  const criteria = objectiveCompletionCriteria(source.objective_context);
  if (!criteria.length) return source;

  const byCriterion = new Map(criteria.map((criterion) => [criterion, new Set()]));
  for (const entry of list(source.evidence)) {
    if (
      entry?.kind !== "product_completion_criteria_evidence" ||
      entry?.verified !== true
    ) continue;
    for (const item of list(entry.criteria_evidence)) {
      const criterion = text(item?.criterion, 700);
      const target = byCriterion.get(criterion);
      if (!target) continue;
      for (const operationId of list(item?.evidence_operation_ids)) {
        const normalized = text(operationId, 200);
        if (normalized) target.add(normalized);
      }
    }
  }

  let markerEvidenceObserved = false;
  for (const entry of list(source.evidence)) {
    if (
      entry?.kind !== "operation" ||
      text(entry?.status, 80) !== "completed"
    ) continue;
    const operationId = text(entry?.operation_id, 200);
    const description = text(entry?.description, 4000);
    if (!operationId || !description) continue;
    criteria.forEach((criterion, index) => {
      if (!description.includes(criterionMarker(index))) return;
      byCriterion.get(criterion)?.add(operationId);
      markerEvidenceObserved = true;
    });
  }

  if (!markerEvidenceObserved) return source;

  const criteriaEvidence = criteria
    .map((criterion) => ({
      criterion,
      evidence_operation_ids: [...(byCriterion.get(criterion) || [])].slice(0, 12),
    }))
    .filter((item) => item.evidence_operation_ids.length > 0);

  return {
    ...source,
    evidence: [
      ...list(source.evidence),
      {
        at: new Date().toISOString(),
        kind: "product_completion_criteria_evidence",
        contract: "AVANTIQO_CODE_AI_EMPLOYEE_CRITERIA_EVIDENCE_V1",
        verified: true,
        criteria_count: criteria.length,
        criteria_evidence: criteriaEvidence,
        marker_contract: "[criterion:Cn]",
        operation_evidence_observed: true,
        authorization_effect: "NONE",
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

export function assessCodeAIEmployeeCompletion(state = {}) {
  const source = object(state);
  const filesChanged = [...new Set(list(source.files_changed).map((item) => text(item, 1000)).filter(Boolean))];
  const changed = filesChanged.length > 0;
  const verified = successfulVerification(source);
  const diffObserved = finalDiffObserved(source);
  const lowLevelCompleted = text(source.status, 100) === "completed";
  const worldClass = assessCodeAIWorldClassQuality(source);
  const productCompletion = projectCodeProductCompletionCriteria(source);

  const blockers = [];
  if (!changed) blockers.push("CODE_AI_EMPLOYEE_IMPLEMENTATION_REQUIRED");
  if (changed && !verified) blockers.push("CODE_AI_EMPLOYEE_SUCCESSFUL_VERIFICATION_REQUIRED");
  if (changed && !diffObserved) blockers.push("CODE_AI_EMPLOYEE_FINAL_DIFF_REVIEW_REQUIRED");
  if (changed && worldClass.verified !== true) blockers.push(...list(worldClass.blockers));
  if (productCompletion.required && productCompletion.verified !== true) {
    blockers.push("CODE_AI_EMPLOYEE_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED");
  }
  if (!lowLevelCompleted) blockers.push(`CODE_AI_EMPLOYEE_LOW_LEVEL_STATUS_${text(source.status, 100) || "UNKNOWN"}`);

  return {
    contract: "AVANTIQO_CODE_AI_EMPLOYEE_COMPLETION_V1",
    complete: blockers.length === 0,
    changed,
    verified,
    final_diff_observed: diffObserved,
    low_level_completed: lowLevelCompleted,
    files_changed: filesChanged,
    worldclass_quality: worldClass,
    product_completion_criteria: productCompletion,
    blockers: [...new Set(blockers)],
  };
}

function normalizeEmployeeState(state, ownerIntent, passNumber, completion = null) {
  const source = object(state);
  const previous = object(source.employee_mission);
  const quality = completion?.worldclass_quality || source.worldclass_quality || null;
  const productCompletion =
    completion?.product_completion_criteria || source.product_completion_criteria || null;
  return {
    ...source,
    worldclass_quality: quality,
    product_completion_criteria: productCompletion,
    employee_completion: completion || source.employee_completion || null,
    employee_mission: {
      contract: CODE_AI_EMPLOYEE_MISSION_CONTRACT,
      owner_intent: text(previous.owner_intent || ownerIntent, 5000),
      employee_passes_used: Math.max(integer(previous.employee_passes_used, 0), passNumber),
      continue_until_verified_complete: true,
      ask_owner_only_for_material_decision: true,
      micro_step_planning_forbidden: true,
      batched_work_packages_required: true,
      deterministic_verification_required: true,
      worldclass_quality_required: true,
      product_completion_criteria_required: true,
      raw_reasoning_persisted: false,
    },
  };
}

function reopenForEmployeeProgress(state, ownerIntent, passNumber, completion = null) {
  const assessed = completion || assessCodeAIEmployeeCompletion(state);
  return normalizeEmployeeState({
    ...object(state),
    status: "running",
    blockers: [],
    current_operation_id: null,
    updated_at: new Date().toISOString(),
    evidence: [
      ...list(state?.evidence),
      {
        at: new Date().toISOString(),
        kind: "employee_controller",
        status: "continue_until_verified_complete",
        reason: assessed.changed
          ? "CODE_AI_EMPLOYEE_QUALITY_OR_VERIFICATION_INCOMPLETE"
          : "CODE_AI_EMPLOYEE_DISCOVERY_IS_NOT_COMPLETION",
        employee_pass: passNumber,
        completion_blockers: assessed.blockers,
        required_next_actions: list(assessed.worldclass_quality?.required_next_actions),
        product_completion_criteria_verified:
          assessed.product_completion_criteria?.verified === true,
        provider_execution_submitted: false,
        wallet_mutation_performed: false,
        source_mutation_performed: false,
        raw_reasoning_persisted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  }, ownerIntent, passNumber, assessed);
}

function employeeResult(result, state, passNumber) {
  const evidenceBoundState = bindCodeAIEmployeeProductCompletionEvidence(state);
  const completion = assessCodeAIEmployeeCompletion(evidenceBoundState);
  const normalizedState = normalizeEmployeeState(
    evidenceBoundState,
    evidenceBoundState?.employee_mission?.owner_intent,
    passNumber,
    completion,
  );
  return {
    ...object(result),
    contract: CODE_AI_EMPLOYEE_RUNTIME_CONTRACT,
    employee_contract: CODE_AI_EMPLOYEE_MISSION_CONTRACT,
    employee_passes: passNumber,
    employee_completion: completion,
    worldclass_quality: completion.worldclass_quality,
    product_completion_criteria: completion.product_completion_criteria,
    state: normalizedState,
  };
}

function employeePassObjective(goal, completion, objectiveContext) {
  const criteria = objectiveCompletionCriteria(objectiveContext);
  const parts = [goal];
  if (criteria.length) {
    parts.push(
      "BOUND PRODUCT COMPLETION CRITERIA. These are mandatory engineering outcomes, not optional suggestions.",
      ...criteria.map((criterion, index) =>
        `C${index + 1}: ${criterion}`
      ),
      "When a package operation provides observed evidence for a criterion, include its exact short marker in that operation description: [criterion:C1], [criterion:C2], etc. One operation may contain multiple markers. Do not mark a criterion unless that operation genuinely provides evidence for it.",
    );
  }
  if (completion && completion.complete !== true) {
    const blockers = list(completion.blockers);
    if (blockers.length) {
      parts.push(
        "EMPLOYEE COMPLETION GAPS FROM THE GOVERNED CONTROLLER:",
        ...blockers.map((blocker) => `- ${text(blocker, 1200)}`),
      );
    }
    if (list(completion.worldclass_quality?.required_next_actions).length) {
      parts.push(
        `Required next action types: ${list(completion.worldclass_quality.required_next_actions).join(", ")}.`,
      );
    }
    const criteriaProjection = object(completion.product_completion_criteria);
    if (criteriaProjection.required && criteriaProjection.verified !== true) {
      const missingCriteria = list(criteriaProjection.criteria_evidence)
        .filter((item) => !list(item?.evidence_operation_ids).length)
        .map((item) => text(item?.criterion, 700))
        .filter(Boolean);
      if (missingCriteria.length) {
        parts.push(
          "Product completion criteria still missing observed operation evidence:",
          ...missingCriteria.map((criterion) => `- ${criterion}`),
        );
      }
    }
    parts.push(
      "Do not restart satisfied investigation. Use the current repository evidence and close these exact gaps in one coherent work package when possible.",
    );
  }
  return parts.join("\n");
}

export async function executeCodeAIEmployeeMission({
  context = {},
  objective,
  owner_intent = null,
  objective_context = null,
  repository_url,
  ref = "main",
  resume_state = null,
  reasoning_call_budget = null,
  max_employee_passes = DEFAULT_MAX_EMPLOYEE_PASSES,
  timeout_ms = null,
} = {}) {
  const goal = text(objective, 5000);
  const ownerIntent = text(owner_intent || objective, 5000);
  const repositoryUrl = text(repository_url, 1000);
  if (!text(context.organizationId || context.organization_id, 200)) {
    throw new Error("CODE_AI_EMPLOYEE_ORGANIZATION_REQUIRED");
  }
  if (!goal) throw new Error("CODE_AI_EMPLOYEE_OBJECTIVE_REQUIRED");
  if (!ownerIntent) throw new Error("CODE_AI_EMPLOYEE_OWNER_INTENT_REQUIRED");
  if (!repositoryUrl) throw new Error("CODE_AI_EMPLOYEE_REPOSITORY_REQUIRED");

  const budget = resolveCodeAIReasoningCallBudget(reasoning_call_budget);
  const maximumPasses = boundedEmployeePasses(max_employee_passes);
  let state = resume_state
    ? bindCodeAIEmployeeProductCompletionEvidence(
        normalizeEmployeeState(resume_state, ownerIntent, 0),
      )
    : null;
  let lastResult = null;

  for (let pass = 1; pass <= maximumPasses; pass += 1) {
    const completionBefore = state ? assessCodeAIEmployeeCompletion(state) : null;
    if (completionBefore?.complete === true) {
      return employeeResult({
        success: true,
        status: "completed",
        reason: null,
      }, normalizeEmployeeState(state, ownerIntent, pass - 1, completionBefore), pass - 1);
    }

    if (state && text(state.status, 100) === "completed") {
      state = reopenForEmployeeProgress(state, ownerIntent, pass, completionBefore);
    } else if (state) {
      state = normalizeEmployeeState(state, ownerIntent, pass, completionBefore);
    }

    const passObjective = employeePassObjective(
      goal,
      completionBefore,
      objective_context || state?.objective_context || null,
    );
    lastResult = await executeBatchedAutonomousCodeMission({
      context,
      objective: passObjective,
      objective_context: objective_context || state?.objective_context || null,
      repository_url: repositoryUrl,
      ref: text(ref, 160) || "main",
      resume_state: state,
      reasoning_call_budget: budget,
      timeout_ms,
    });

    state = bindCodeAIEmployeeProductCompletionEvidence(
      normalizeEmployeeState(lastResult?.state || state || {}, ownerIntent, pass),
    );

    if (text(lastResult?.status, 100) === "planner_pending") {
      return employeeResult(lastResult, state, pass);
    }

    const completion = assessCodeAIEmployeeCompletion(state);
    state = normalizeEmployeeState(state, ownerIntent, pass, completion);
    if (lastResult?.success === true && completion.complete === true) {
      return employeeResult({
        ...lastResult,
        success: true,
        status: "completed",
        reason: null,
      }, state, pass);
    }

    const usedReasoningCalls = integer(
      state?.work_package_control?.reasoning_calls_used,
      integer(lastResult?.reasoning_calls, 0),
    );
    if (usedReasoningCalls >= budget) {
      return employeeResult({
        ...lastResult,
        success: false,
        status: "blocked",
        reason: `CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED:${usedReasoningCalls}:${budget}`,
      }, state, pass);
    }

    const status = text(lastResult?.status, 100);
    if (
      lastResult?.success !== true &&
      status !== "completed" &&
      status !== "repair_required" &&
      status !== "verification_required" &&
      status !== "review_required" &&
      status !== "replan_required" &&
      status !== "running"
    ) {
      return employeeResult(lastResult, state, pass);
    }

    state = reopenForEmployeeProgress(state, ownerIntent, pass, completion);
  }

  return employeeResult({
    ...(lastResult || {}),
    success: false,
    status: "blocked",
    reason: `CODE_AI_EMPLOYEE_PASS_BUDGET_EXHAUSTED:${maximumPasses}`,
  }, state || {}, maximumPasses);
}

export const CodeAIEmployeeRuntime = Object.freeze({
  contract: CODE_AI_EMPLOYEE_RUNTIME_CONTRACT,
  mission_contract: CODE_AI_EMPLOYEE_MISSION_CONTRACT,
  default_reasoning_call_budget: 4,
  max_employee_passes: MAX_EMPLOYEE_PASSES,
  work_package_contract: CodeAIWorkPackageRuntime.work_package_contract,
  max_package_operations: CodeAIWorkPackageRuntime.max_package_operations,
  completion: assessCodeAIEmployeeCompletion,
  bindProductCompletionEvidence: bindCodeAIEmployeeProductCompletionEvidence,
  execute: executeCodeAIEmployeeMission,
});
