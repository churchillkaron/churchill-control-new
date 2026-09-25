export const AVANTIQO_BUSINESS_PARTNER_BENCHMARK_FLOOR_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_FLOOR_V1";

export const BUSINESS_PARTNER_REFERENCE_FAMILIES = Object.freeze([
  "chatgpt",
  "claude",
  "gemini",
]);

export const BUSINESS_PARTNER_QUALITY_DIMENSIONS = Object.freeze([
  "instruction_following",
  "contextual_continuity",
  "reasoning_quality",
  "factuality_and_evidence",
  "tool_and_capability_selection",
  "action_completion",
  "recovery_and_self_correction",
  "communication_quality",
  "latency_and_efficiency",
  "governance_and_authority_discipline",
]);

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeScores(value = {}) {
  const source = object(value);
  return Object.fromEntries(
    BUSINESS_PARTNER_QUALITY_DIMENSIONS.map((dimension) => [
      dimension,
      number(source[dimension]),
    ]),
  );
}

function completeScores(scores = {}) {
  return BUSINESS_PARTNER_QUALITY_DIMENSIONS.every(
    (dimension) => number(scores[dimension]) !== null,
  );
}

export function businessPartnerBenchmarkFloorPolicy() {
  return Object.freeze({
    contract: AVANTIQO_BUSINESS_PARTNER_BENCHMARK_FLOOR_CONTRACT,
    immutable_floor: true,
    applies_to: "customer_facing_business_partner_release",
    reference_families: [...BUSINESS_PARTNER_REFERENCE_FAMILIES],
    dimensions: [...BUSINESS_PARTNER_QUALITY_DIMENSIONS],
    floor_rule:
      "Avantiqo must meet or exceed the strongest measured reference score in every required dimension under matched task, evidence, tool, latency and authority conditions.",
    aggregate_rule:
      "No aggregate score may hide a dimension regression below the reference floor.",
    missing_reference_evidence:
      "NOT_CERTIFIED",
    stale_reference_evidence:
      "NOT_CERTIFIED",
    regression_policy:
      "BLOCK_RELEASE",
    benchmark_execution_policy: {
      external_reference_execution_automatic: false,
      explicit_authorization_required: true,
      matched_conditions_required: true,
      provider_spend_without_authorization: false,
    },
    benchmark_claim_policy: {
      names_are_reference_families_not_performance_claims: true,
      no_superiority_claim_without_fresh_measured_evidence: true,
      no_release_claim_from_internal_synthetic_tests_alone: true,
    },
  });
}

export function evaluateBusinessPartnerBenchmarkFloor({
  candidate = {},
  references = {},
  evidenceFresh = false,
  matchedConditions = false,
} = {}) {
  const policy = businessPartnerBenchmarkFloorPolicy();
  const candidateScores = normalizeScores(candidate);
  const normalizedReferences = Object.fromEntries(
    BUSINESS_PARTNER_REFERENCE_FAMILIES.map((family) => [
      family,
      normalizeScores(object(references)[family]),
    ]),
  );

  const missingFamilies = BUSINESS_PARTNER_REFERENCE_FAMILIES.filter(
    (family) => !completeScores(normalizedReferences[family]),
  );
  const candidateComplete = completeScores(candidateScores);

  if (
    missingFamilies.length ||
    !candidateComplete ||
    evidenceFresh !== true ||
    matchedConditions !== true
  ) {
    return {
      contract: policy.contract,
      status: "NOT_CERTIFIED",
      release_eligible: false,
      reasons: [
        ...(missingFamilies.length
          ? ["MISSING_REFERENCE_EVIDENCE:" + missingFamilies.join(",")]
          : []),
        ...(!candidateComplete ? ["INCOMPLETE_CANDIDATE_EVIDENCE"] : []),
        ...(evidenceFresh !== true ? ["REFERENCE_EVIDENCE_NOT_FRESH"] : []),
        ...(matchedConditions !== true ? ["BENCHMARK_CONDITIONS_NOT_MATCHED"] : []),
      ],
      policy,
      candidate_scores: candidateScores,
      reference_scores: normalizedReferences,
      floor_scores: null,
      regressions: [],
    };
  }

  const floorScores = {};
  const regressions = [];
  for (const dimension of BUSINESS_PARTNER_QUALITY_DIMENSIONS) {
    const floor = Math.max(
      ...BUSINESS_PARTNER_REFERENCE_FAMILIES.map(
        (family) => normalizedReferences[family][dimension],
      ),
    );
    floorScores[dimension] = floor;
    if (candidateScores[dimension] < floor) {
      regressions.push({
        dimension,
        candidate: candidateScores[dimension],
        required_floor: floor,
      });
    }
  }

  return {
    contract: policy.contract,
    status: regressions.length ? "BELOW_FLOOR" : "CERTIFIED",
    release_eligible: regressions.length === 0,
    reasons: regressions.length ? ["DIMENSION_BELOW_REFERENCE_FLOOR"] : [],
    policy,
    candidate_scores: candidateScores,
    reference_scores: normalizedReferences,
    floor_scores: floorScores,
    regressions,
  };
}

export default Object.freeze({
  contract: AVANTIQO_BUSINESS_PARTNER_BENCHMARK_FLOOR_CONTRACT,
  policy: businessPartnerBenchmarkFloorPolicy,
  evaluate: evaluateBusinessPartnerBenchmarkFloor,
});
