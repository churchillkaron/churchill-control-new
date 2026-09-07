import { buildOperatorIntelligencePlan } from "./OperatorIntelligencePlanGraphRuntime.js";

export const OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT =
  "AVANTIQO_OPERATOR_OWNED_COGNITIVE_PLAN_V1";

const MAX_PLAN_CANDIDATES = 5;

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

function compactIssue(issue = {}) {
  const source = object(issue);
  return {
    code: text(source.code, 180) || "UNKNOWN_PLAN_ISSUE",
    step_id: text(source.step_id, 120) || null,
    dependency: text(source.dependency, 120) || null,
    missing_required_fields: list(source.missing_required_fields)
      .map((item) => text(item, 160))
      .filter(Boolean)
      .slice(0, 20),
  };
}

function compactPlan(plan = {}) {
  const source = object(plan);
  return {
    contract: source.contract || null,
    plan_id: source.plan_id || null,
    revision: Number(source.revision || 0),
    valid: source.valid === true,
    goal: text(source.goal, 1200) || null,
    execution_order: list(source.execution_order).slice(0, 18),
    completion_criteria: list(source.completion_criteria).slice(0, 12),
    issues: list(source.issues).map(compactIssue).slice(0, 24),
    steps: list(source.steps).slice(0, 18).map((step) => ({
      id: text(step?.id, 120) || null,
      title: text(step?.title, 500) || null,
      kind: text(step?.kind, 80) || null,
      depends_on: list(step?.depends_on).slice(0, 8),
      capability_key: text(step?.capability_key, 300) || null,
      mutates: step?.mutates === true,
      risk: text(step?.risk, 40) || null,
      irreversible: step?.irreversible === true,
      requires_confirmation: step?.requires_confirmation === true,
      candidate_validation: object(step?.candidate_validation),
      evidence_needed: list(step?.evidence_needed).slice(0, 10),
      expected_output: text(step?.expected_output, 800) || null,
      verification: object(step?.verification),
      rollback: object(step?.rollback),
      retry_budget: Number(step?.retry_budget || 0),
    })),
    budgets: object(source.budgets),
    governance: object(source.governance),
  };
}

function candidateInputs(source = {}) {
  const explicit = list(source.plan_candidates)
    .slice(0, MAX_PLAN_CANDIDATES)
    .map((candidate, index) => {
      const item = object(candidate);
      return {
        candidate_id:
          text(item.candidate_id || item.id || item.name, 120) ||
          `candidate-${index + 1}`,
        index,
        source: item,
        plan_steps: list(item.plan_steps).slice(0, 18),
      };
    })
    .filter((candidate) => candidate.plan_steps.length > 0);

  if (explicit.length) return explicit;

  const legacySteps = list(source.plan_steps).slice(0, 18);
  if (!legacySteps.length) return [];
  return [
    {
      candidate_id: "primary",
      index: 0,
      source,
      plan_steps: legacySteps,
    },
  ];
}

function scoreCandidatePlan(plan = {}) {
  const governedPlan = object(plan);
  const steps = list(governedPlan.steps);
  if (governedPlan.valid !== true || !steps.length) {
    return {
      score: -100000,
      metrics: {
        valid: false,
        steps: steps.length,
        mutations: 0,
        high_risk_steps: 0,
        irreversible_steps: 0,
        completion_criteria: list(governedPlan.completion_criteria).length,
        verification_criteria: 0,
        evidence_requirements: 0,
        validated_mutations: 0,
      },
    };
  }

  const mutations = steps.filter((step) => step?.mutates === true);
  const highRiskSteps = steps.filter((step) =>
    ["high", "critical"].includes(text(step?.risk, 40).toLowerCase()),
  );
  const criticalSteps = steps.filter(
    (step) => text(step?.risk, 40).toLowerCase() === "critical",
  );
  const irreversibleSteps = steps.filter((step) => step?.irreversible === true);
  const completionCriteria = list(governedPlan.completion_criteria).length;
  const verificationCriteria = steps.reduce(
    (total, step) => total + list(step?.verification?.criteria).length,
    0,
  );
  const verificationEvidence = steps.reduce(
    (total, step) => total + list(step?.verification?.evidence_required).length,
    0,
  );
  const evidenceRequirements = steps.reduce(
    (total, step) => total + list(step?.evidence_needed).length,
    0,
  );
  const validatedMutations = mutations.filter(
    (step) =>
      step?.candidate_validation?.validated === true &&
      step?.candidate_validation?.payload_complete === true,
  ).length;
  const explicitOutputs = steps.filter((step) => Boolean(text(step?.expected_output, 800))).length;

  const score =
    1000 +
    completionCriteria * 30 +
    verificationCriteria * 18 +
    verificationEvidence * 10 +
    evidenceRequirements * 6 +
    validatedMutations * 24 +
    explicitOutputs * 4 -
    steps.length * 3 -
    mutations.length * 8 -
    highRiskSteps.length * 25 -
    criticalSteps.length * 25 -
    irreversibleSteps.length * 55;

  return {
    score,
    metrics: {
      valid: true,
      steps: steps.length,
      mutations: mutations.length,
      high_risk_steps: highRiskSteps.length,
      irreversible_steps: irreversibleSteps.length,
      completion_criteria: completionCriteria,
      verification_criteria: verificationCriteria,
      evidence_requirements: evidenceRequirements + verificationEvidence,
      validated_mutations: validatedMutations,
    },
  };
}

function compileCandidate({ candidate, goal, source }) {
  const candidateSource = object(candidate.source);
  const brief = {
    ...source,
    ...candidateSource,
    goal,
    plan_candidates: undefined,
    plan_steps: candidate.plan_steps,
  };
  const plan = buildOperatorIntelligencePlan({
    goal,
    brief,
    plan_steps: candidate.plan_steps,
    max_replans: candidateSource.max_replans ?? source.max_replans,
  });
  const governedPlan = compactPlan(plan);
  const scoring = scoreCandidatePlan(governedPlan);
  return {
    candidate_id: candidate.candidate_id,
    index: candidate.index,
    recommended_approach:
      text(candidateSource.recommended_approach || candidateSource.approach, 1200) || null,
    governed_plan: governedPlan,
    score: scoring.score,
    metrics: scoring.metrics,
  };
}

function selectCandidate(compiled = []) {
  const ranked = [...compiled].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.index - right.index;
  });
  return ranked.find((candidate) => candidate.governed_plan.valid === true) || ranked[0] || null;
}

function competitionSummary(compiled = [], selected = null) {
  return {
    mode: compiled.length > 1 ? "DETERMINISTIC_COMPETITION" : "SINGLE_PLAN_COMPATIBILITY",
    candidate_count: compiled.length,
    valid_candidate_count: compiled.filter((candidate) => candidate.governed_plan.valid === true).length,
    selected_candidate_id: selected?.candidate_id || null,
    selected_candidate_index: Number.isInteger(selected?.index) ? selected.index : null,
    candidates: compiled.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      index: candidate.index,
      valid: candidate.governed_plan.valid === true,
      score: candidate.score,
      metrics: candidate.metrics,
      issues: candidate.governed_plan.issues,
    })),
  };
}

export function compileOwnedCognitivePlan(brief = {}) {
  const source = object(brief);
  const goal = text(source.goal || source.interpretation, 1200);

  if (!goal) {
    return {
      contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
      status: "PLAN_REJECTED_GOAL_REQUIRED",
      planning_complete: false,
      execution_guidance_allowed: false,
      governed_plan: null,
      plan_competition: null,
      issues: [{ code: "COGNITIVE_PLAN_GOAL_REQUIRED" }],
      governance: {
        planning_only: true,
        execution_authority: "NONE",
        invalid_plan_blocks_execution_guidance: true,
        memory_never_authorizes_writes: true,
        raw_reasoning_persisted: false,
      },
    };
  }

  const candidates = candidateInputs(source);
  if (!candidates.length) {
    return {
      contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
      status: "PLAN_NOT_MATERIALIZED",
      planning_complete: false,
      execution_guidance_allowed: false,
      governed_plan: null,
      plan_competition: {
        mode: "NO_PLAN_CANDIDATES",
        candidate_count: 0,
        valid_candidate_count: 0,
        selected_candidate_id: null,
        selected_candidate_index: null,
        candidates: [],
      },
      issues: [{ code: "COGNITIVE_PLAN_STEPS_REQUIRED" }],
      governance: {
        planning_only: true,
        execution_authority: "NONE",
        invalid_plan_blocks_execution_guidance: true,
        memory_never_authorizes_writes: true,
        raw_reasoning_persisted: false,
      },
    };
  }

  const compiled = candidates.map((candidate) =>
    compileCandidate({ candidate, goal, source }),
  );
  const selected = selectCandidate(compiled);
  const governedPlan = selected?.governed_plan || null;
  const valid = governedPlan?.valid === true && governedPlan.steps.length > 0;

  return {
    contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
    status: valid ? "PLAN_VALIDATED" : "PLAN_REJECTED_INVALID_GRAPH",
    planning_complete: valid,
    execution_guidance_allowed: valid,
    governed_plan: governedPlan,
    plan_competition: competitionSummary(compiled, selected),
    issues: governedPlan?.issues || [{ code: "COGNITIVE_PLAN_STEPS_REQUIRED" }],
    governance: {
      planning_only: true,
      execution_authority: "NONE",
      candidate_validation_is_not_authorization: true,
      normal_operator_governance_required: true,
      invalid_plan_blocks_execution_guidance: true,
      completion_claim_requires_plan_verification: true,
      deterministic_plan_selection: true,
      plan_competition_never_grants_execution_authority: true,
      memory_never_authorizes_writes: true,
      raw_reasoning_persisted: false,
    },
  };
}

export function attachOwnedCognitivePlan(brief = {}) {
  const source = object(brief);
  const cognitivePlan = compileOwnedCognitivePlan(source);
  return {
    ...source,
    plan_steps: undefined,
    plan_candidates: undefined,
    cognitive_plan: cognitivePlan,
    governed_plan: cognitivePlan.governed_plan,
    planning_complete: cognitivePlan.planning_complete,
    execution_guidance_allowed: cognitivePlan.execution_guidance_allowed,
  };
}

export const OperatorOwnedCognitivePlanRuntime = Object.freeze({
  contract: OPERATOR_OWNED_COGNITIVE_PLAN_CONTRACT,
  compile: compileOwnedCognitivePlan,
  attach: attachOwnedCognitivePlan,
});
