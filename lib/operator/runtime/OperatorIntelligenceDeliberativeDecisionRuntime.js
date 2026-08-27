export const OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_V1";

const MAX_CANDIDATES = 12;
const MAX_EVIDENCE = 24;
const MAX_UNCERTAINTIES = 16;
const RISK = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const ORDINAL = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, decisive: 4 });
const COST = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
const LATENCY = Object.freeze({ immediate: 0, short: 1, medium: 2, long: 3 });
const EVIDENCE_KINDS = new Set(["research", "read", "analysis", "evidence"]);
const ACTION_KINDS = new Set(["action", "recommendation", "defer", "ask_human"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueText(values, limit = 240) {
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

function normalizedEnum(value, allowed, fallback) {
  const clean = text(value, 80).toLowerCase();
  return Object.prototype.hasOwnProperty.call(allowed, clean) ? clean : fallback;
}

function normalizedKind(value) {
  const clean = text(value, 80).toLowerCase();
  if (EVIDENCE_KINDS.has(clean) || ACTION_KINDS.has(clean)) return clean;
  return "analysis";
}

function normalizeEvidence(value = {}, index = 0) {
  const source = object(value);
  const verificationStatus = text(source.verification_status, 40).toLowerCase();
  const outcome = text(source.outcome, 40).toLowerCase();
  const trusted = source.trusted === true || source.verified === true || (
    verificationStatus === "pass" && ["", "succeeded", "success", "completed", "verified"].includes(outcome)
  );
  return {
    id: text(source.id || source.evidence_id, 160) || `evidence-${index + 1}`,
    trusted,
    current: source.current !== false,
    source_class: text(source.source_class || source.type, 80) || null,
  };
}

function normalizeUncertainty(value = {}, index = 0) {
  const source = object(value);
  return {
    id: text(source.id || source.question, 160) || `uncertainty-${index + 1}`,
    critical: source.critical === true || text(source.severity, 40).toLowerCase() === "critical",
    resolved: source.resolved === true,
  };
}

function normalizeCandidate(value = {}, index = 0) {
  const source = object(value);
  const kind = normalizedKind(source.kind || source.type);
  const mutates = source.mutates === true || kind === "action";
  const reversible = source.reversible === true;
  const irreversible = source.irreversible === true || (mutates && !reversible);
  const risk = normalizedEnum(source.risk, RISK, "low");
  const validation = object(source.candidate_validation || source.validation);
  const verification = object(source.verification);
  const constraintViolations = uniqueText(
    source.constraint_violations || source.violates_constraints,
    300,
  ).slice(0, 12);
  const evidenceIds = uniqueText(source.evidence_ids || source.supporting_evidence_ids, 160).slice(0, 16);
  const unknownDependencies = uniqueText(source.unknown_dependencies, 240).slice(0, 12);
  return {
    id: text(source.id, 160) || `candidate-${index + 1}`,
    title: text(source.title || source.description, 500) || `Candidate ${index + 1}`,
    kind,
    mutates,
    capability_key: text(source.capability_key, 300) || null,
    reversible,
    irreversible,
    risk,
    cost: normalizedEnum(source.cost, COST, "low"),
    latency: normalizedEnum(source.latency, LATENCY, "short"),
    goal_progress: normalizedEnum(source.goal_progress, ORDINAL, "low"),
    information_gain: normalizedEnum(source.information_gain, ORDINAL, "none"),
    evidence_ids: evidenceIds,
    unknown_dependencies: unknownDependencies,
    constraint_violations: constraintViolations,
    requires_human: source.requires_human === true || irreversible || RISK[risk] >= RISK.high,
    candidate_validation: {
      validated: validation.validated === true || validation.candidate_only === true,
      payload_complete: validation.payload_complete === true,
    },
    verification: {
      required: verification.required === true || mutates,
      criteria: uniqueText(verification.criteria || verification.completion_criteria, 400).slice(0, 10),
    },
  };
}

function trustedEvidenceStats(candidate, evidenceById) {
  const referenced = candidate.evidence_ids
    .map((id) => evidenceById.get(id))
    .filter(Boolean);
  const trusted = referenced.filter((item) => item.trusted && item.current);
  return {
    referenced_count: referenced.length,
    trusted_current_count: trusted.length,
    unsupported_reference_count: candidate.evidence_ids.length - referenced.length,
  };
}

function candidateIssues(candidate) {
  const issues = [];
  if (candidate.constraint_violations.length) {
    issues.push("CONSTRAINT_VIOLATION");
  }
  if (candidate.mutates) {
    if (!candidate.capability_key) issues.push("MUTATION_CAPABILITY_KEY_REQUIRED");
    if (!candidate.candidate_validation.validated) issues.push("MUTATION_CANDIDATE_VALIDATION_REQUIRED");
    if (!candidate.candidate_validation.payload_complete) issues.push("MUTATION_PAYLOAD_COMPLETE_REQUIRED");
    if (!candidate.verification.required || !candidate.verification.criteria.length) {
      issues.push("MUTATION_VERIFICATION_CRITERIA_REQUIRED");
    }
  }
  return issues;
}

function compareEvidenceFirst(left, right) {
  return (
    ORDINAL[right.candidate.information_gain] - ORDINAL[left.candidate.information_gain] ||
    RISK[left.candidate.risk] - RISK[right.candidate.risk] ||
    COST[left.candidate.cost] - COST[right.candidate.cost] ||
    LATENCY[left.candidate.latency] - LATENCY[right.candidate.latency] ||
    right.evidence.trusted_current_count - left.evidence.trusted_current_count ||
    ORDINAL[right.candidate.goal_progress] - ORDINAL[left.candidate.goal_progress] ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
}

function compareAction(left, right) {
  const leftSafety = left.candidate.irreversible
    ? 3
    : left.candidate.mutates
      ? left.candidate.reversible ? 1 : 2
      : 0;
  const rightSafety = right.candidate.irreversible
    ? 3
    : right.candidate.mutates
      ? right.candidate.reversible ? 1 : 2
      : 0;
  return (
    RISK[left.candidate.risk] - RISK[right.candidate.risk] ||
    leftSafety - rightSafety ||
    right.evidence.trusted_current_count - left.evidence.trusted_current_count ||
    ORDINAL[right.candidate.goal_progress] - ORDINAL[left.candidate.goal_progress] ||
    COST[left.candidate.cost] - COST[right.candidate.cost] ||
    LATENCY[left.candidate.latency] - LATENCY[right.candidate.latency] ||
    ORDINAL[right.candidate.information_gain] - ORDINAL[left.candidate.information_gain] ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
}

function safeCandidateSummary(entry) {
  const candidate = entry.candidate;
  return {
    id: candidate.id,
    title: candidate.title,
    kind: candidate.kind,
    mutates: candidate.mutates,
    reversible: candidate.reversible,
    irreversible: candidate.irreversible,
    risk: candidate.risk,
    cost: candidate.cost,
    latency: candidate.latency,
    goal_progress: candidate.goal_progress,
    information_gain: candidate.information_gain,
    trusted_current_evidence_count: entry.evidence.trusted_current_count,
    referenced_evidence_count: entry.evidence.referenced_count,
    requires_human: candidate.requires_human,
    eligible: entry.issues.length === 0,
    issues: entry.issues,
  };
}

export function deliberateOperatorIntelligenceDecision({
  goal,
  candidates = [],
  evidence = [],
  uncertainties = [],
  decision_critical = true,
} = {}) {
  const cleanGoal = text(goal, 1200);
  if (!cleanGoal) throw new Error("OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_GOAL_REQUIRED");

  const normalizedEvidence = list(evidence).slice(0, MAX_EVIDENCE).map(normalizeEvidence);
  const evidenceById = new Map(normalizedEvidence.map((item) => [item.id, item]));
  const normalizedUncertainties = list(uncertainties)
    .slice(0, MAX_UNCERTAINTIES)
    .map(normalizeUncertainty);
  const unresolvedCritical = normalizedUncertainties.filter((item) => item.critical && !item.resolved);

  const normalizedCandidates = list(candidates).slice(0, MAX_CANDIDATES).map(normalizeCandidate);
  const ids = normalizedCandidates.map((candidate) => candidate.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

  const evaluated = normalizedCandidates.map((candidate) => ({
    candidate,
    evidence: trustedEvidenceStats(candidate, evidenceById),
    issues: [
      ...candidateIssues(candidate),
      ...(duplicates.includes(candidate.id) ? ["DUPLICATE_CANDIDATE_ID"] : []),
    ],
  }));
  const eligible = evaluated.filter((entry) => entry.issues.length === 0);

  const evidenceFirst = eligible
    .filter((entry) =>
      EVIDENCE_KINDS.has(entry.candidate.kind) &&
      entry.candidate.mutates === false &&
      ORDINAL[entry.candidate.information_gain] >= ORDINAL.medium &&
      RISK[entry.candidate.risk] <= RISK.medium &&
      COST[entry.candidate.cost] <= COST.medium,
    )
    .sort(compareEvidenceFirst);

  const actionChoices = eligible
    .filter((entry) => ACTION_KINDS.has(entry.candidate.kind) && entry.candidate.kind !== "defer")
    .filter((entry) => ORDINAL[entry.candidate.goal_progress] > ORDINAL.none)
    .sort(compareAction);

  let selected = null;
  let status = "NO_FEASIBLE_CANDIDATE";
  let rationaleCode = "NO_ELIGIBLE_CANDIDATE";

  if (unresolvedCritical.length && evidenceFirst.length) {
    selected = evidenceFirst[0];
    status = "EVIDENCE_FIRST";
    rationaleCode = "DECISION_CRITICAL_UNCERTAINTY_HAS_SAFE_INFORMATION_ACTION";
  } else if (actionChoices.length) {
    selected = actionChoices[0];
    status = selected.candidate.requires_human
      ? "RECOMMENDATION_REQUIRES_HUMAN"
      : "SELECTED_FOR_PLANNING";
    rationaleCode = selected.candidate.requires_human
      ? "BEST_FEASIBLE_OPTION_REQUIRES_HUMAN_GOVERNANCE"
      : "BEST_FEASIBLE_OPTION_BY_SAFETY_EVIDENCE_PROGRESS_COST";
  } else if (evidenceFirst.length) {
    selected = evidenceFirst[0];
    status = "EVIDENCE_FIRST";
    rationaleCode = "NO_ACTION_READY_SAFE_INFORMATION_ACTION_AVAILABLE";
  }

  const alternativesRequired = decision_critical === true;
  const alternativesInsufficient = alternativesRequired && eligible.length < 2;
  if (selected && alternativesInsufficient) {
    status = "ALTERNATIVES_INSUFFICIENT";
    rationaleCode = "DECISION_CRITICAL_CHOICE_REQUIRES_MULTIPLE_FEASIBLE_ALTERNATIVES";
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_CONTRACT,
    goal: cleanGoal,
    status,
    rationale_code: rationaleCode,
    selected_candidate: selected ? safeCandidateSummary(selected) : null,
    unresolved_critical_uncertainty_ids: unresolvedCritical.map((item) => item.id),
    decision_critical: decision_critical === true,
    alternatives_required: alternativesRequired,
    alternatives_insufficient: alternativesInsufficient,
    candidate_count: evaluated.length,
    eligible_candidate_count: eligible.length,
    candidates: evaluated.map(safeCandidateSummary),
    ranking_policy: {
      uncertainty_first_when_decision_critical: true,
      evidence_action_requires_medium_information_gain: true,
      evidence_action_must_be_non_mutating: true,
      evidence_action_risk_ceiling: "medium",
      evidence_action_cost_ceiling: "medium",
      final_choice_prefers_lower_risk_then_reversibility_then_trusted_current_evidence_then_goal_progress_then_lower_cost_latency: true,
      model_numeric_utility_scores_trusted: false,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      recommendations_are_not_execution_authority: true,
      mutation_requires_normal_operator_governance: true,
      high_risk_or_irreversible_requires_human: true,
      untrusted_evidence_never_counts_as_trusted_support: true,
      constraint_violating_candidates_never_selected: true,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDeliberativeDecisionRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DELIBERATIVE_DECISION_CONTRACT,
  deliberate: deliberateOperatorIntelligenceDecision,
});
