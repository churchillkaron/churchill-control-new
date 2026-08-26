import { createHash } from "node:crypto";

export const OPERATOR_INTELLIGENCE_PLAN_GRAPH_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_PLAN_GRAPH_V1";

const MAX_STEPS = 18;
const MAX_DEPENDENCIES = 8;
const DEFAULT_MAX_REPLANS = 3;
const MAX_REPLANS = 6;
const STEP_KINDS = new Set([
  "evidence",
  "research",
  "read",
  "analysis",
  "decision",
  "action_candidate",
  "verification",
  "recovery",
]);
const HIGH_RISK = new Set(["high", "critical"]);
const TERMINAL_SUCCESS = new Set(["completed", "verified", "skipped_not_required"]);
const TERMINAL_FAILURE = new Set(["failed", "blocked"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function uniqueText(values, limit = 160) {
  const output = [];
  const seen = new Set();
  for (const value of list(values)) {
    const clean = text(value, limit);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function normalizedStepId(value, index) {
  const clean = text(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return clean || `step-${index + 1}`;
}

function normalizedKind(value) {
  const clean = text(value, 80).toLowerCase();
  return STEP_KINDS.has(clean) ? clean : "analysis";
}

function normalizedRisk(value) {
  const clean = text(value, 40).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(clean)
    ? clean
    : "low";
}

function normalizedVerification(value = {}, mutates = false) {
  const source = object(value);
  const criteria = uniqueText(
    source.criteria || source.completion_criteria || source.tests || [],
    500,
  ).slice(0, 10);
  return {
    required: source.required === true || mutates || criteria.length > 0,
    capability_key: text(source.capability_key, 300) || null,
    criteria,
    evidence_required: uniqueText(source.evidence_required, 300).slice(0, 8),
  };
}

function normalizedRollback(value = {}, { mutates, reversible }) {
  const source = object(value);
  const strategy = text(source.strategy || source.plan, 1000) || null;
  return {
    available: source.available === true || (mutates && reversible && Boolean(strategy)),
    strategy,
  };
}

function normalizeCandidateValidation(value = {}) {
  const source = object(value);
  return {
    validated: source.validated === true || source.candidate_only === true,
    payload_complete: source.payload_complete === true,
    missing_required_fields: uniqueText(source.missing_required_fields, 160).slice(0, 20),
    normal_operator_governance_required:
      source.normal_operator_governance_required !== false,
  };
}

function normalizePlanStep(value = {}, index = 0) {
  const source = object(value);
  const kind = normalizedKind(source.kind || source.type);
  const capabilityKey = text(source.capability_key, 300) || null;
  const mutates = source.mutates === true || kind === "action_candidate";
  const reversible = source.reversible === true;
  const risk = normalizedRisk(source.risk);
  const irreversible = source.irreversible === true || (mutates && reversible === false);
  const candidateValidation = normalizeCandidateValidation(
    source.candidate_validation || source.action_candidate || {},
  );
  const verification = normalizedVerification(source.verification, mutates);
  const rollback = normalizedRollback(source.rollback, { mutates, reversible });
  return {
    id: normalizedStepId(source.id, index),
    title: text(source.title || source.description, 500) || `Plan step ${index + 1}`,
    kind,
    depends_on: uniqueText(source.depends_on, 120).slice(0, MAX_DEPENDENCIES),
    capability_key: capabilityKey,
    payload: object(source.payload),
    mutates,
    risk,
    reversible,
    irreversible,
    requires_confirmation:
      source.requires_confirmation === true || mutates || irreversible || HIGH_RISK.has(risk),
    candidate_validation: candidateValidation,
    evidence_needed: uniqueText(source.evidence_needed, 400).slice(0, 10),
    expected_output: text(source.expected_output, 800) || null,
    verification,
    rollback,
    retry_budget: boundedInteger(source.retry_budget, mutates ? 0 : 1, 0, 3),
    status: "planned",
  };
}

function fallbackPlanSteps(brief = {}) {
  const source = object(brief);
  const evidence = uniqueText(source.evidence_needed, 500).slice(0, 8);
  const completion = uniqueText(
    Array.isArray(source.completion_test)
      ? source.completion_test
      : source.completion_test
        ? [source.completion_test]
        : [],
    500,
  ).slice(0, 8);
  const steps = evidence.map((item, index) => ({
    id: `evidence-${index + 1}`,
    title: item,
    kind: "evidence",
    depends_on: [],
    mutates: false,
    evidence_needed: [item],
    expected_output: "Current verified evidence sufficient to resolve this planning dependency.",
    verification: {
      required: true,
      criteria: ["Evidence source and freshness are verified."],
    },
  }));
  if (completion.length) {
    steps.push({
      id: "completion-verification",
      title: "Verify completion criteria",
      kind: "verification",
      depends_on: steps.map((step) => step.id),
      mutates: false,
      verification: {
        required: true,
        criteria: completion,
      },
      expected_output: "Completion is proven by explicit verification evidence.",
    });
  }
  return steps;
}

function graphOrder(steps) {
  const ids = new Set(steps.map((step) => step.id));
  const indegree = new Map(steps.map((step) => [step.id, 0]));
  const children = new Map(steps.map((step) => [step.id, []]));
  const missingDependencies = [];
  const selfDependencies = [];

  for (const step of steps) {
    for (const dependency of step.depends_on) {
      if (dependency === step.id) {
        selfDependencies.push({ step_id: step.id, dependency });
        continue;
      }
      if (!ids.has(dependency)) {
        missingDependencies.push({ step_id: step.id, dependency });
        continue;
      }
      indegree.set(step.id, (indegree.get(step.id) || 0) + 1);
      children.get(dependency).push(step.id);
    }
  }

  const queue = steps
    .filter((step) => (indegree.get(step.id) || 0) === 0)
    .map((step) => step.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const child of children.get(id) || []) {
      const next = (indegree.get(child) || 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  return {
    order,
    has_cycle: order.length !== steps.length,
    missing_dependencies: missingDependencies,
    self_dependencies: selfDependencies,
  };
}

function stepSafetyIssues(step) {
  const issues = [];
  if (!step.mutates) return issues;
  if (!step.capability_key) {
    issues.push({ code: "MUTATION_CAPABILITY_KEY_REQUIRED", step_id: step.id });
  }
  if (step.candidate_validation.validated !== true) {
    issues.push({ code: "MUTATION_ACTION_CANDIDATE_VALIDATION_REQUIRED", step_id: step.id });
  }
  if (step.candidate_validation.payload_complete !== true) {
    issues.push({
      code: "MUTATION_PAYLOAD_INCOMPLETE",
      step_id: step.id,
      missing_required_fields: step.candidate_validation.missing_required_fields,
    });
  }
  if (!step.verification.required || !step.verification.criteria.length) {
    issues.push({ code: "MUTATION_COMPLETION_VERIFICATION_REQUIRED", step_id: step.id });
  }
  if (step.irreversible && step.rollback.available === true) {
    issues.push({ code: "IRREVERSIBLE_STEP_CANNOT_CLAIM_ROLLBACK", step_id: step.id });
  }
  return issues;
}

function planFingerprint({ goal, revision, steps }) {
  const stable = JSON.stringify({
    goal,
    revision,
    steps: steps.map((step) => ({
      id: step.id,
      kind: step.kind,
      depends_on: step.depends_on,
      capability_key: step.capability_key,
      mutates: step.mutates,
      risk: step.risk,
      irreversible: step.irreversible,
      verification: step.verification,
    })),
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function planIssues(steps, graph) {
  const issues = [];
  if (!steps.length) issues.push({ code: "PLAN_REQUIRES_AT_LEAST_ONE_STEP" });
  const ids = steps.map((step) => step.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  for (const id of duplicateIds) {
    issues.push({ code: "DUPLICATE_STEP_ID", step_id: id });
  }
  for (const item of graph.missing_dependencies) {
    issues.push({ code: "MISSING_STEP_DEPENDENCY", ...item });
  }
  for (const item of graph.self_dependencies) {
    issues.push({ code: "SELF_STEP_DEPENDENCY", ...item });
  }
  if (graph.has_cycle) issues.push({ code: "PLAN_DEPENDENCY_CYCLE" });
  for (const step of steps) issues.push(...stepSafetyIssues(step));
  return issues;
}

function normalizedCompletionCriteria(brief = {}) {
  const source = object(brief);
  const raw = Array.isArray(source.completion_test)
    ? source.completion_test
    : source.completion_test
      ? [source.completion_test]
      : [];
  return uniqueText(raw, 600).slice(0, 12);
}

export function buildOperatorIntelligencePlan({
  goal,
  brief = {},
  plan_steps = null,
  revision = 0,
  max_replans = DEFAULT_MAX_REPLANS,
  parent_plan_id = null,
  replan_reason = null,
} = {}) {
  const source = object(brief);
  const cleanGoal = text(goal || source.goal || source.interpretation, 1200);
  if (!cleanGoal) throw new Error("OPERATOR_INTELLIGENCE_PLAN_GOAL_REQUIRED");

  const requestedSteps = list(plan_steps ?? source.plan_steps);
  const rawSteps = requestedSteps.length ? requestedSteps : fallbackPlanSteps(source);
  const steps = rawSteps.slice(0, MAX_STEPS).map(normalizePlanStep);
  const graph = graphOrder(steps);
  const issues = planIssues(steps, graph);
  const cleanRevision = boundedInteger(revision, 0, 0, MAX_REPLANS);
  const maxReplans = boundedInteger(max_replans, DEFAULT_MAX_REPLANS, 0, MAX_REPLANS);
  const planId = `plan-${planFingerprint({ goal: cleanGoal, revision: cleanRevision, steps })}`;
  const completionCriteria = normalizedCompletionCriteria(source);

  return {
    contract: OPERATOR_INTELLIGENCE_PLAN_GRAPH_CONTRACT,
    plan_id: planId,
    parent_plan_id: text(parent_plan_id, 160) || null,
    revision: cleanRevision,
    max_replans: maxReplans,
    replan_reason: text(replan_reason, 800) || null,
    goal: cleanGoal,
    valid: issues.length === 0,
    issues,
    steps,
    execution_order: graph.order,
    completion_criteria: completionCriteria,
    budgets: {
      max_steps: MAX_STEPS,
      max_replans: maxReplans,
      automatic_mutating_steps: 0,
      uncontrolled_retries: 0,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      plan_requires_at_least_one_step: true,
      mutation_requires_registered_candidate: true,
      mutation_requires_complete_payload: true,
      mutation_requires_normal_operator_governance: true,
      high_risk_requires_confirmation: true,
      irreversible_actions_never_auto_execute: true,
      verification_required_for_mutation_completion: true,
      memory_never_authorizes_writes: true,
      raw_reasoning_persisted: false,
    },
  };
}

function normalizeObservation(value = {}) {
  const source = object(value);
  const status = text(source.status, 60).toLowerCase();
  return {
    step_id: text(source.step_id || source.id, 120),
    status: [
      "planned",
      "ready",
      "in_progress",
      "completed",
      "verified",
      "failed",
      "blocked",
      "skipped_not_required",
    ].includes(status)
      ? status
      : "planned",
    verification_status: ["pass", "fail", "unknown", "not_required"].includes(
      text(source.verification_status, 40).toLowerCase(),
    )
      ? text(source.verification_status, 40).toLowerCase()
      : "unknown",
    evidence: uniqueText(source.evidence, 800).slice(0, 10),
    error: text(source.error, 800) || null,
    attempts: boundedInteger(source.attempts, 0, 0, 20),
  };
}

export function assessOperatorIntelligencePlan({ plan = {}, observations = [] } = {}) {
  const source = object(plan);
  const steps = list(source.steps).map((step, index) => normalizePlanStep(step, index));
  const observationByStep = new Map(
    list(observations)
      .map(normalizeObservation)
      .filter((observation) => observation.step_id)
      .map((observation) => [observation.step_id, observation]),
  );
  const stateByStep = new Map();
  for (const step of steps) {
    stateByStep.set(step.id, observationByStep.get(step.id) || {
      step_id: step.id,
      status: "planned",
      verification_status: "unknown",
      evidence: [],
      error: null,
      attempts: 0,
    });
  }

  const completedIds = new Set(
    [...stateByStep.values()]
      .filter((state) => TERMINAL_SUCCESS.has(state.status))
      .map((state) => state.step_id),
  );
  const failedIds = new Set(
    [...stateByStep.values()]
      .filter((state) => TERMINAL_FAILURE.has(state.status))
      .map((state) => state.step_id),
  );

  const ready = [];
  const blocked = [];
  for (const step of steps) {
    const state = stateByStep.get(step.id);
    if (TERMINAL_SUCCESS.has(state.status) || TERMINAL_FAILURE.has(state.status) || state.status === "in_progress") {
      continue;
    }
    const failedDependencies = step.depends_on.filter((id) => failedIds.has(id));
    if (failedDependencies.length) {
      blocked.push({
        step_id: step.id,
        reason: "FAILED_DEPENDENCY",
        dependencies: failedDependencies,
      });
      continue;
    }
    if (step.depends_on.every((id) => completedIds.has(id))) ready.push(step.id);
  }

  const proofGaps = [];
  for (const step of steps) {
    const state = stateByStep.get(step.id);
    if (!TERMINAL_SUCCESS.has(state.status)) continue;
    if (step.verification.required && state.verification_status !== "pass") {
      proofGaps.push({
        step_id: step.id,
        reason: "VERIFICATION_PROOF_MISSING",
        verification_status: state.verification_status,
      });
    }
    if (step.mutates && !state.evidence.length) {
      proofGaps.push({ step_id: step.id, reason: "MUTATION_COMPLETION_EVIDENCE_MISSING" });
    }
  }

  const failed = [...failedIds];
  const allTerminalSuccess = steps.length > 0 && steps.every((step) =>
    TERMINAL_SUCCESS.has(stateByStep.get(step.id)?.status),
  );
  const completionProven = Boolean(
    source.valid !== false &&
    allTerminalSuccess &&
    failed.length === 0 &&
    blocked.length === 0 &&
    proofGaps.length === 0,
  );
  const requiresReplan = !completionProven && (failed.length > 0 || blocked.length > 0);

  return {
    contract: OPERATOR_INTELLIGENCE_PLAN_GRAPH_CONTRACT,
    plan_id: text(source.plan_id, 160) || null,
    revision: boundedInteger(source.revision, 0, 0, MAX_REPLANS),
    status: completionProven
      ? "COMPLETION_PROVEN"
      : requiresReplan
        ? "REPLAN_REQUIRED"
        : "IN_PROGRESS",
    completion_proven: completionProven,
    ready_step_ids: ready,
    completed_step_ids: [...completedIds],
    failed_step_ids: failed,
    blocked_steps: blocked,
    verification_proof_gaps: proofGaps,
    requires_replan: requiresReplan,
    observations: [...stateByStep.values()],
    governance: {
      completion_requires_evidence: true,
      mutation_completion_requires_verification: true,
      failure_cannot_be_reported_as_success: true,
      blocked_dependencies_cannot_be_skipped_silently: true,
    },
  };
}

function completedStepSignature(step) {
  return JSON.stringify({
    id: step.id,
    kind: step.kind,
    title: step.title,
    capability_key: step.capability_key,
    mutates: step.mutates,
  });
}

export function reviseOperatorIntelligencePlan({
  plan = {},
  revised_steps = [],
  observations = [],
  replan_reason = null,
} = {}) {
  const source = object(plan);
  const assessment = assessOperatorIntelligencePlan({ plan: source, observations });
  if (assessment.completion_proven) {
    return {
      status: "REPLAN_NOT_REQUIRED_COMPLETION_ALREADY_PROVEN",
      plan: source,
      assessment,
    };
  }

  const revision = boundedInteger(source.revision, 0, 0, MAX_REPLANS);
  const maxReplans = boundedInteger(source.max_replans, DEFAULT_MAX_REPLANS, 0, MAX_REPLANS);
  if (revision >= maxReplans) {
    return {
      status: "REPLAN_BUDGET_EXHAUSTED",
      plan: source,
      assessment,
      blocked: true,
    };
  }

  const oldSteps = list(source.steps).map((step, index) => normalizePlanStep(step, index));
  const completedIds = new Set(assessment.completed_step_ids);
  const oldById = new Map(oldSteps.map((step) => [step.id, step]));
  const candidateSteps = list(revised_steps).map((step, index) => normalizePlanStep(step, index));
  const candidateById = new Map(candidateSteps.map((step) => [step.id, step]));
  const historyIssues = [];
  for (const id of completedIds) {
    const before = oldById.get(id);
    const after = candidateById.get(id);
    if (!after) {
      historyIssues.push({ code: "COMPLETED_STEP_REMOVED_DURING_REPLAN", step_id: id });
      continue;
    }
    if (completedStepSignature(before) !== completedStepSignature(after)) {
      historyIssues.push({ code: "COMPLETED_STEP_REWRITTEN_DURING_REPLAN", step_id: id });
    }
  }
  if (historyIssues.length) {
    return {
      status: "REPLAN_REJECTED_COMPLETED_HISTORY_MUTATION",
      plan: source,
      assessment,
      issues: historyIssues,
      blocked: true,
    };
  }

  const revised = buildOperatorIntelligencePlan({
    goal: source.goal,
    brief: { completion_test: source.completion_criteria },
    plan_steps: candidateSteps,
    revision: revision + 1,
    max_replans: maxReplans,
    parent_plan_id: source.plan_id,
    replan_reason:
      text(replan_reason, 800) ||
      (assessment.failed_step_ids.length
        ? `Failed steps: ${assessment.failed_step_ids.join(", ")}`
        : "Plan state requires bounded replanning."),
  });

  return {
    status: revised.valid ? "REPLAN_ACCEPTED" : "REPLAN_INVALID",
    plan: revised,
    previous_assessment: assessment,
    preserved_completed_step_ids: [...completedIds],
    blocked: revised.valid !== true,
  };
}

export const OperatorIntelligencePlanGraphRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_PLAN_GRAPH_CONTRACT,
  build: buildOperatorIntelligencePlan,
  assess: assessOperatorIntelligencePlan,
  revise: reviseOperatorIntelligencePlan,
});
