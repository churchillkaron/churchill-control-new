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
assert.equal(valid.excluded_observation_count, 0);
assert.equal(valid.anti_overfitting.stored_observation_integrity_revalidated, true);
assert.equal(valid.anti_overfitting.malformed_or_poisoned_observations_excluded, true);

const candidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
  pattern,
  pattern_evaluation: valid,
  organization_id: ORGANIZATION_ID,
  now: new Date("2026-09-02T09:00:00.000Z"),
});
assert.equal(candidate.metadata.stored_observation_integrity_revalidated, true);
assert.equal(candidate.metadata.malformed_or_poisoned_observations_excluded, true);
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
}, null, 2));
