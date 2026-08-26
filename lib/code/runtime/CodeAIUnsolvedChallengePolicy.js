const CONTRACT = "AVANTIQO_CODE_AI_UNSOLVED_CHALLENGE_POLICY_V1";

const FUNDAMENTAL_CONSTRAINTS = new Set([
  "mathematical_constraint",
  "physical_constraint",
]);

const EXTERNAL_CONSTRAINTS = new Set([
  "policy_or_law_constraint",
  "external_dependency_constraint",
  "environment_constraint",
  "resource_constraint",
]);

const NON_TERMINAL_CONSTRAINTS = new Set([
  "knowledge_gap",
  "architecture_limit",
  "implementation_failure",
  "unknown",
]);

const KNOWN_CONSTRAINTS = new Set([
  ...FUNDAMENTAL_CONSTRAINTS,
  ...EXTERNAL_CONSTRAINTS,
  ...NON_TERMINAL_CONSTRAINTS,
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 1200)).filter(Boolean))];
}

function observedOperationIds(state = {}) {
  return new Set(unique([
    ...list(state?.completed_operation_ids),
    ...list(state?.verification).map((item) => item?.operation_id),
    ...list(state?.tests).map((item) => item?.operation_id),
    ...list(state?.failures).map((item) => item?.operation_id),
    ...list(state?.repairs).map((item) => item?.operation_id),
    ...list(state?.evidence).map((item) => item?.operation_id),
  ]));
}

function normalizedBlockInput(value = {}) {
  const source = object(value);
  return {
    constraint_type: text(source.constraint_type, 120).toLowerCase(),
    constraint_to_change: text(source.constraint_to_change, 2000),
    proof_summary: text(source.proof_summary, 4000),
    evidence_operation_ids: unique(list(source.evidence_operation_ids)).slice(0, 20),
    alternative_approaches_considered: unique(
      list(source.alternative_approaches_considered),
    ).slice(0, 12),
  };
}

function containsImpossibleClaim(decision = {}) {
  const combined = `${text(decision?.description, 2000)} ${text(decision?.reason, 2000)}`;
  return /\bimpossible\b/i.test(combined);
}

function requiredExplorationAction(constraintType) {
  if (constraintType === "knowledge_gap" || constraintType === "unknown") {
    return "research_or_experiment";
  }
  if (constraintType === "architecture_limit") {
    return "alternative_architecture_or_experiment";
  }
  if (constraintType === "implementation_failure") {
    return "diagnose_repair_or_alternative_implementation";
  }
  return null;
}

export function assessCodeAIBlockDecision({ state = {}, decision = {} } = {}) {
  const input = normalizedBlockInput(decision?.input);
  const blockers = [];
  const observed = observedOperationIds(state);
  const unknownEvidence = input.evidence_operation_ids.filter((id) => !observed.has(id));
  const fundamental = FUNDAMENTAL_CONSTRAINTS.has(input.constraint_type);
  const external = EXTERNAL_CONSTRAINTS.has(input.constraint_type);
  const nonTerminal = NON_TERMINAL_CONSTRAINTS.has(input.constraint_type);
  const impossibleClaim = containsImpossibleClaim(decision);

  if (!KNOWN_CONSTRAINTS.has(input.constraint_type)) {
    blockers.push("CODE_AI_BLOCK_CONSTRAINT_TYPE_REQUIRED");
  }
  if (!input.evidence_operation_ids.length) {
    blockers.push("CODE_AI_BLOCK_OBSERVED_EVIDENCE_REQUIRED");
  }
  if (unknownEvidence.length) {
    blockers.push("CODE_AI_BLOCK_EVIDENCE_OPERATION_UNKNOWN");
  }
  if (!input.constraint_to_change) {
    blockers.push("CODE_AI_BLOCK_CONSTRAINT_TO_CHANGE_REQUIRED");
  }

  if (nonTerminal) {
    blockers.push("CODE_AI_BLOCK_NONTERMINAL_UNSOLVED_CONSTRAINT");
  }

  if (fundamental) {
    if (!input.proof_summary) {
      blockers.push("CODE_AI_BLOCK_FUNDAMENTAL_PROOF_REQUIRED");
    }
    if (input.evidence_operation_ids.length < 2) {
      blockers.push("CODE_AI_BLOCK_FUNDAMENTAL_INDEPENDENT_EVIDENCE_REQUIRED");
    }
  }

  if (impossibleClaim && !fundamental) {
    blockers.push("CODE_AI_BLOCK_UNSUPPORTED_IMPOSSIBLE_CLAIM");
  }

  const accepted = blockers.length === 0 && (fundamental || external);
  const disposition = accepted
    ? fundamental
      ? "fundamental_constraint_proven"
      : "blocked_by_external_constraint"
    : nonTerminal
      ? "unsolved_continue_exploration"
      : "block_rejected_continue_exploration";

  return {
    contract: CONTRACT,
    accepted,
    disposition,
    constraint_type: input.constraint_type || null,
    constraint_to_change: input.constraint_to_change || null,
    proof_summary: input.proof_summary || null,
    evidence_operation_ids: input.evidence_operation_ids,
    alternative_approaches_considered: input.alternative_approaches_considered,
    unknown_evidence_operation_ids: unknownEvidence,
    fundamental_constraint: fundamental,
    external_constraint: external,
    non_terminal_unsolved_constraint: nonTerminal,
    impossible_claim_present: impossibleClaim,
    impossible_claim_authorized: accepted && fundamental,
    required_exploration_action: accepted
      ? null
      : requiredExplorationAction(input.constraint_type) || "gather_evidence_or_try_alternative",
    blockers,
    principle:
      "Failure of an approach is evidence against that approach, not evidence that the objective is impossible.",
    authorization_effect: "NONE",
  };
}

export const CodeAIUnsolvedChallengePolicy = Object.freeze({
  contract: CONTRACT,
  assessBlockDecision: assessCodeAIBlockDecision,
  fundamental_constraints: [...FUNDAMENTAL_CONSTRAINTS],
  external_constraints: [...EXTERNAL_CONSTRAINTS],
  non_terminal_constraints: [...NON_TERMINAL_CONSTRAINTS],
});
