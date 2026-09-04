import assert from "node:assert/strict";
import {
  buildAvantiqoMissionOutcomeEvidenceCandidateRow,
  buildAvantiqoMissionOutcomeLearningObservation,
  evaluateAvantiqoMissionOutcomePattern,
} from "../lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const OUTCOME_CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1";
const OUTCOME_ASSESSMENT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_V1";

const pattern = Object.freeze({
  mission_family: "finance.reconcile",
  intervention_code: "verify-before-commit",
  intervention_class: "verification-guard",
  knowledge_domain: "finance",
  condition_codes: ["external-state-mutable", "write-action"],
  boundary_condition_codes: ["current-evidence-required"],
  failure_mode_codes: ["stale-state-commit"],
  stability: "mutable",
});

function outcomeContract() {
  return {
    contract: OUTCOME_CONTRACT,
    status: "OUTCOME_CONTRACT_READY",
    outcome_contract_ready: true,
    decision_critical: true,
    decision: {
      candidate_id: "candidate-integrity",
      mutates: true,
      irreversible: false,
      requires_human: true,
    },
    criteria: [
      {
        id: "success-verified-state",
        kind: "success",
        comparator: "eq",
        required: true,
        verification_criteria: ["exact-registered-read"],
        failure_mode_ids: [],
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        comparator: "eq",
        required: true,
        verification_criteria: ["detect-stale-write"],
        failure_mode_ids: ["stale-state-commit"],
      },
    ],
  };
}

function successAssessment() {
  return {
    contract: OUTCOME_ASSESSMENT,
    status: "OUTCOME_SUCCEEDED",
    outcome: "success",
    decision_success_proven: true,
    review_required: false,
    criterion_results: [
      {
        id: "success-verified-state",
        kind: "success",
        required: true,
        status: "SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["evidence-success"],
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        required: true,
        status: "NOT_SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["evidence-failure-clear"],
      },
    ],
  };
}

function observation(token, date) {
  const built = buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: token,
    organization_id: ORGANIZATION_ID,
    now: new Date(date),
  });
  assert.equal(built.eligible, true);
  return built;
}

const first = observation("a".repeat(64), "2026-09-01T08:00:00.000Z");
const second = observation("b".repeat(64), "2026-09-01T12:00:00.000Z");
const third = observation("c".repeat(64), "2026-09-02T08:00:00.000Z");

const valid = evaluateAvantiqoMissionOutcomePattern({
  observations: [first.row, second.row, third.row],
  pattern_fingerprint: first.pattern_fingerprint,
});
assert.equal(valid.eligible_for_evidence_candidate, true);
assert.equal(valid.observation_count, 3);
assert.equal(valid.duplicate_observation_count, 0);
assert.equal(valid.conflicting_observation_fingerprint_count, 0);
assert.equal(valid.quarantined_conflicting_observation_count, 0);
assert.equal(valid.excluded_observation_count, 0);
assert.equal(valid.anti_overfitting.stored_observation_integrity_revalidated, true);
assert.equal(valid.anti_overfitting.malformed_or_poisoned_observations_excluded, true);
assert.equal(valid.anti_overfitting.unique_observation_fingerprints_required, true);
assert.equal(valid.anti_overfitting.duplicate_observations_excluded, true);
assert.equal(valid.anti_overfitting.conflicting_observation_fingerprints_quarantined, true);
assert.equal(valid.anti_overfitting.row_order_cannot_resolve_observation_conflict, true);

const duplicateInflationAttempt = evaluateAvantiqoMissionOutcomePattern({
  observations: [
    first.row,
    second.row,
    structuredClone(first.row),
    structuredClone(first.row),
    structuredClone(second.row),
  ],
  pattern_fingerprint: first.pattern_fingerprint,
});
assert.equal(duplicateInflationAttempt.observation_count, 2);
assert.equal(duplicateInflationAttempt.duplicate_observation_count, 3);
assert.equal(duplicateInflationAttempt.conflicting_observation_fingerprint_count, 0);
assert.equal(duplicateInflationAttempt.excluded_observation_count, 3);
assert.equal(duplicateInflationAttempt.distinct_observation_days, 1);
assert.equal(duplicateInflationAttempt.eligible_for_evidence_candidate, false);

const duplicateCrossDayAttempt = structuredClone(first.row);
duplicateCrossDayAttempt.metadata.observed_day = "2026-09-02";
duplicateCrossDayAttempt.metadata.observed_at = "2026-09-02T08:00:00.000Z";
const duplicateCrossDayEvaluation = evaluateAvantiqoMissionOutcomePattern({
  observations: [first.row, second.row, duplicateCrossDayAttempt],
  pattern_fingerprint: first.pattern_fingerprint,
});
assert.equal(duplicateCrossDayEvaluation.observation_count, 1);
assert.equal(duplicateCrossDayEvaluation.duplicate_observation_count, 1);
assert.equal(duplicateCrossDayEvaluation.conflicting_observation_fingerprint_count, 1);
assert.equal(duplicateCrossDayEvaluation.quarantined_conflicting_observation_count, 2);
assert.equal(duplicateCrossDayEvaluation.distinct_observation_days, 1);
assert.equal(duplicateCrossDayEvaluation.eligible_for_evidence_candidate, false);

const conflictCases = [
  ["outcome", (row) => { row.metadata.verified_outcome = "FAILURE"; }],
  ["contract structure", (row) => { row.metadata.outcome_contract_structural_fingerprint = "d".repeat(64); }],
  ["assessment structure", (row) => { row.metadata.outcome_assessment_structural_fingerprint = "e".repeat(64); }],
  ["criterion count", (row) => { row.metadata.criterion_count += 1; }],
  ["evidence count", (row) => { row.metadata.evidence_reference_count += 1; }],
  ["timestamp", (row) => {
    row.metadata.observed_day = "2026-09-02";
    row.metadata.observed_at = "2026-09-02T08:00:00.000Z";
  }],
];

for (const [name, mutate] of conflictCases) {
  const conflicting = structuredClone(first.row);
  mutate(conflicting);
  for (const observations of [
    [first.row, second.row, conflicting],
    [conflicting, second.row, first.row],
  ]) {
    const evaluation = evaluateAvantiqoMissionOutcomePattern({
      observations,
      pattern_fingerprint: first.pattern_fingerprint,
    });
    assert.equal(evaluation.observation_count, 1, `${name} must quarantine both conflicting rows`);
    assert.equal(evaluation.duplicate_observation_count, 1, `${name} duplicate must be detected`);
    assert.equal(evaluation.conflicting_observation_fingerprint_count, 1, `${name} fingerprint must be conflicted`);
    assert.equal(evaluation.quarantined_conflicting_observation_count, 2, `${name} rows must be quarantined`);
    assert.equal(evaluation.excluded_observation_count, 2, `${name} rows must be excluded`);
    assert.equal(evaluation.eligible_for_evidence_candidate, false, `${name} conflict must block candidate`);
  }
}

const candidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
  pattern,
  pattern_evaluation: valid,
  organization_id: ORGANIZATION_ID,
  now: new Date("2026-09-02T09:00:00.000Z"),
});
assert.equal(candidate.metadata.stored_observation_integrity_revalidated, true);
assert.equal(candidate.metadata.malformed_or_poisoned_observations_excluded, true);
assert.equal(candidate.metadata.unique_observation_fingerprints_required, true);
assert.equal(candidate.metadata.duplicate_observations_excluded, true);
assert.equal(candidate.metadata.conflicting_observation_fingerprints_quarantined, true);
assert.equal(candidate.metadata.row_order_cannot_resolve_observation_conflict, true);
assert.equal(candidate.metadata.duplicate_observation_count, 0);
assert.equal(candidate.metadata.conflicting_observation_fingerprint_count, 0);
assert.equal(candidate.metadata.quarantined_conflicting_observation_count, 0);
assert.equal(candidate.metadata.reusable_platform_knowledge, false);

const mutations = [
  ["pattern fingerprint", (row) => { row.metadata.pattern_fingerprint = "0".repeat(63); }],
  ["observation fingerprint", (row) => { row.metadata.observation_fingerprint = "not-a-sha256"; }],
  ["observation key", (row) => { row.memory_key = "mission-outcome-observation:forged"; }],
  ["contract structural fingerprint", (row) => { row.metadata.outcome_contract_structural_fingerprint = "x".repeat(64); }],
  ["assessment structural fingerprint", (row) => { row.metadata.outcome_assessment_structural_fingerprint = "x".repeat(64); }],
  ["source outcome contract", (row) => { row.metadata.source_outcome_contract = "FORGED"; }],
  ["source outcome assessment", (row) => { row.metadata.source_outcome_assessment_contract = "FORGED"; }],
  ["criterion count", (row) => { row.metadata.criterion_count = 0; }],
  ["decisive criterion count", (row) => { row.metadata.decisive_verified_criterion_count = 0; }],
  ["decisive count overflow", (row) => { row.metadata.decisive_verified_criterion_count = 3; row.metadata.criterion_count = 2; }],
  ["evidence reference count", (row) => { row.metadata.evidence_reference_count = 0; }],
  ["observation day mismatch", (row) => { row.metadata.observed_day = "2026-09-03"; }],
  ["observation timestamp", (row) => { row.metadata.observed_at = "not-a-timestamp"; }],
];

for (const [name, mutate] of mutations) {
  const poisoned = structuredClone(third.row);
  mutate(poisoned);
  const evaluation = evaluateAvantiqoMissionOutcomePattern({
    observations: [first.row, second.row, poisoned],
    pattern_fingerprint: first.pattern_fingerprint,
  });
  assert.equal(
    evaluation.observation_count,
    2,
    `${name} must not count toward the learning threshold`,
  );
  assert.equal(evaluation.excluded_observation_count, 1, `${name} must be excluded`);
  assert.equal(
    evaluation.eligible_for_evidence_candidate,
    false,
    `${name} must not create an evidence candidate`,
  );
}

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_MISSION_OUTCOME_STORED_EVIDENCE_INTEGRITY_CERTIFIED",
  verified: {
    valid_cross_day_pattern_still_qualifies: true,
    stored_observation_integrity_revalidated: true,
    malformed_or_poisoned_observations_excluded: true,
    unique_observation_fingerprints_required: true,
    duplicate_observations_excluded_before_accumulation: true,
    duplicate_rows_cannot_inflate_three_observation_gate: true,
    duplicate_rows_cannot_fake_distinct_day_gate: true,
    conflicting_observation_fingerprints_quarantined: true,
    conflicting_rows_contribute_zero_votes: true,
    conflicting_rows_are_order_independent: true,
    sha256_fingerprints_required: true,
    observation_key_bound_to_fingerprint: true,
    exact_source_contracts_required: true,
    decisive_evidence_counts_revalidated: true,
    observation_day_and_timestamp_must_agree: true,
    poisoned_row_cannot_inflate_three_observation_gate: true,
    evidence_candidate_remains_non_reusable: true,
    provider_gpu_modal_execution_performed: false,
  },
  poison_cases: mutations.length,
  duplicate_cases: 2,
  conflict_cases: conflictCases.length,
  conflict_orderings_per_case: 2,
}, null, 2));
