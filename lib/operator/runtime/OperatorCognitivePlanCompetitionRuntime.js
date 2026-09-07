import { buildOperatorIntelligencePlan } from "./OperatorIntelligencePlanGraphRuntime.js";

export const OPERATOR_COGNITIVE_PLAN_COMPETITION_CONTRACT =
  "AVANTIQO_OPERATOR_COGNITIVE_PLAN_COMPETITION_V1";

const MAX_APPROACH_CANDIDATES = 4;

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

function candidateId(candidate = {}, index = 0) {
  return text(candidate?.id || candidate?.approach_id, 120) ||
    `approach_${index + 1}`;
}

function planFitness(plan = {}) {
  const source = object(plan);
  const steps = list(source.steps);
  if (source.valid !== true || !steps.length) {
    return {
      score: 0,
      evidence_steps: 0,
      verification_steps: 0,
      mutating_steps: 0,
      high_risk_steps: 0,
      critical_risk_steps: 0,
      irreversible_steps: 0,
      complexity_penalty: 0,
    };
  }

  const evidenceSteps = steps.filter((step) =>
    ["evidence", "research", "read"].includes(text(step?.kind, 80).toLowerCase()),
  ).length;
  const verificationSteps = steps.filter((step) =>
    text(step?.kind, 80).toLowerCase() === "verification" ||
    list(step?.verification?.criteria).length > 0,
  ).length;
  const mutatingSteps = steps.filter((step) => step?.mutates === true).length;
  const highRiskSteps = steps.filter(
    (step) => text(step?.risk, 40).toLowerCase() === "high",
  ).length;
  const criticalRiskSteps = steps.filter(
    (step) => text(step?.risk, 40).toLowerCase() === "critical",
  ).length;
  const irreversibleSteps = steps.filter((step) => step?.irreversible === true).length;
  const completionCriteria = list(source.completion_criteria).length;
  const complexityPenalty = Math.max(0, steps.length - 8) * 2;

  const score = Math.max(
    0,
    Math.min(
      100,
      60 +
        Math.min(15, evidenceSteps * 3) +
        Math.min(15, verificationSteps * 3) +
        Math.min(10, completionCriteria * 2) -
        mutatingSteps * 2 -
        highRiskSteps * 6 -
        criticalRiskSteps * 12 -
        irreversibleSteps * 6 -
        complexityPenalty,
    ),
  );

  return {
    score,
    evidence_steps: evidenceSteps,
    verification_steps: verificationSteps,
    mutating_steps: mutatingSteps,
    high_risk_steps: highRiskSteps,
    critical_risk_steps: criticalRiskSteps,
    irreversible_steps: irreversibleSteps,
    complexity_penalty: complexityPenalty,
  };
}

function compileCandidate({ candidate, brief, goal, index }) {
  const source = object(candidate);
  const candidateGoal = text(source.goal, 1200) || goal;
  const candidateBrief = {
    ...object(brief),
    ...source,
    goal: candidateGoal,
    completion_test: source.completion_test ?? brief?.completion_test,
    plan_steps: list(source.plan_steps),
  };
  const plan = buildOperatorIntelligencePlan({
    goal: candidateGoal,
    brief: candidateBrief,
    plan_steps: candidateBrief.plan_steps,
    max_replans: source.max_replans ?? brief?.max_replans,
  });
  return {
    id: candidateId(source, index),
    label: text(source.label || source.name, 240) || null,
    rationale: text(source.rationale, 1000) || null,
    index,
    valid: plan.valid === true && list(plan.steps).length > 0,
    plan,
    fitness: planFitness(plan),
  };
}

function compareCandidates(left, right) {
  if (left.valid !== right.valid) return left.valid ? -1 : 1;
  if (right.fitness.score !== left.fitness.score) {
    return right.fitness.score - left.fitness.score;
  }
  if (left.fitness.irreversible_steps !== right.fitness.irreversible_steps) {
    return left.fitness.irreversible_steps - right.fitness.irreversible_steps;
  }
  if (left.fitness.critical_risk_steps !== right.fitness.critical_risk_steps) {
    return left.fitness.critical_risk_steps - right.fitness.critical_risk_steps;
  }
  if (left.fitness.high_risk_steps !== right.fitness.high_risk_steps) {
    return left.fitness.high_risk_steps - right.fitness.high_risk_steps;
  }
  if (left.fitness.mutating_steps !== right.fitness.mutating_steps) {
    return left.fitness.mutating_steps - right.fitness.mutating_steps;
  }
  if (list(left.plan.steps).length !== list(right.plan.steps).length) {
    return list(left.plan.steps).length - list(right.plan.steps).length;
  }
  return left.index - right.index;
}

function compactCandidate(candidate, rank) {
  return {
    rank,
    id: candidate.id,
    label: candidate.label,
    valid: candidate.valid,
    plan_id: candidate.plan?.plan_id || null,
    score: candidate.fitness.score,
    fitness: candidate.fitness,
    issue_codes: list(candidate.plan?.issues)
      .map((issue) => text(issue?.code, 180))
      .filter(Boolean)
      .slice(0, 16),
  };
}

export function competeOperatorCognitivePlans({
  brief = {},
  goal = null,
  approach_candidates = null,
} = {}) {
  const source = object(brief);
  const cleanGoal = text(goal || source.goal || source.interpretation, 1200);
  const candidates = list(approach_candidates ?? source.approach_candidates)
    .slice(0, MAX_APPROACH_CANDIDATES)
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate, index) =>
      compileCandidate({ candidate, brief: source, goal: cleanGoal, index }),
    );
  const ranked = [...candidates].sort(compareCandidates);
  const selected = ranked.find((candidate) => candidate.valid) || null;

  return {
    contract: OPERATOR_COGNITIVE_PLAN_COMPETITION_CONTRACT,
    applied: candidates.length > 0,
    policy: "DETERMINISTIC_EVIDENCE_VERIFICATION_RISK_FITNESS_V1",
    candidate_count: candidates.length,
    valid_candidate_count: candidates.filter((candidate) => candidate.valid).length,
    selected_candidate_id: selected?.id || null,
    selected_plan: selected?.plan || null,
    model_score_used: false,
    authorization_effect: "NONE",
    ranked_candidates: ranked.map((candidate, index) =>
      compactCandidate(candidate, index + 1),
    ),
    governance: {
      planning_only: true,
      model_scores_ignored: true,
      invalid_candidates_cannot_win: true,
      deterministic_tie_breaking: true,
      normal_operator_governance_required: true,
      execution_authority: "NONE",
    },
  };
}

export const OperatorCognitivePlanCompetitionRuntime = Object.freeze({
  contract: OPERATOR_COGNITIVE_PLAN_COMPETITION_CONTRACT,
  compete: competeOperatorCognitivePlans,
});
