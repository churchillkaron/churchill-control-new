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
      candidate_id: "candidate-builder-integrity",
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
  return built.row;
}

const evaluation = evaluateAvantiqoMissionOutcomePattern({
  observations: [
    observation("a".repeat(64), "2026-09-01T08:00:00.000Z"),
    observation("b".repeat(64), "2026-09-01T12:00:00.000Z"),
    observation("c".repeat(64), "2026-09-02T08:00:00.000Z"),
  ],
  pattern_fingerprint: buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: "d".repeat(64),
    organization_id: ORGANIZATION_ID,
    now: new Date("2026-09-02T09:00:00.000Z"),
  }).pattern_fingerprint,
});
assert.equal(evaluation.eligible_for_evidence_candidate, true);

const validCandidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
  pattern,
  pattern_evaluation: evaluation,
  organization_id: ORGANIZATION_ID,
  now: new Date("2026-09-02T10:00:00.000Z"),
});
assert.ok(validCandidate);
assert.equal(validCandidate.metadata.reusable_platform_knowledge, false);
assert.equal(validCandidate.metadata.observation_integrity_envelope_required, true);
assert.equal(validCandidate.metadata.observation_integrity_envelope_revalidated, true);
assert.equal(validCandidate.metadata.history_snapshot_verified, true);
assert.equal(validCandidate.metadata.history_snapshot_manifest_stable, true);

const mutations = [
  ["observation total", (value) => { value.observation_count = 999; }],
  ["success total", (value) => { value.verified_success_count = 2; }],
  ["failure total", (value) => { value.verified_failure_count = 1; }],
  ["distinct day threshold", (value) => { value.distinct_observation_days = 1; }],
  ["dominant outcome", (value) => { value.dominant_outcome = "FAILURE"; }],
  ["dominant ratio", (value) => { value.dominant_outcome_ratio = 0.5; }],
  ["minimum observations", (value) => { value.limits.min_observations = 4; }],
  ["minimum days", (value) => { value.limits.min_distinct_observation_days = 3; }],
  ["minimum dominance", (value) => { value.limits.min_dominant_outcome_ratio = 1.1; }],
  ["stored integrity flag", (value) => { value.anti_overfitting.stored_observation_integrity_revalidated = false; }],
  ["observation envelope required", (value) => { value.anti_overfitting.observation_integrity_envelope_required = false; }],
  ["observation envelope revalidated", (value) => { value.anti_overfitting.observation_integrity_envelope_revalidated = false; }],
  ["poison exclusion flag", (value) => { value.anti_overfitting.malformed_or_poisoned_observations_excluded = false; }],
  ["unique fingerprint flag", (value) => { value.anti_overfitting.unique_observation_fingerprints_required = false; }],
  ["duplicate exclusion flag", (value) => { value.anti_overfitting.duplicate_observations_excluded = false; }],
  ["conflict quarantine flag", (value) => { value.anti_overfitting.conflicting_observation_fingerprints_quarantined = false; }],
  ["row order flag", (value) => { value.anti_overfitting.row_order_cannot_resolve_observation_conflict = false; }],
  ["history requirement flag", (value) => { value.anti_overfitting.complete_history_scan_required = false; }],
  ["history incomplete blocker flag", (value) => { value.anti_overfitting.incomplete_history_blocks_evidence_candidate = false; }],
  ["crowding blocker flag", (value) => { value.anti_overfitting.raw_rows_cannot_crowd_out_unique_observation_limit = false; }],
  ["fixed watermark flag", (value) => { value.anti_overfitting.fixed_history_watermark_required = false; }],
  ["snapshot manifest revalidation flag", (value) => { value.anti_overfitting.history_snapshot_manifest_reverification_required = false; }],
  ["same-count replacement flag", (value) => { value.anti_overfitting.same_count_history_replacement_blocks_candidate = false; }],
  ["in-place mutation flag", (value) => { value.anti_overfitting.in_place_history_mutation_blocks_candidate = false; }],
  ["concurrent churn flag", (value) => { value.anti_overfitting.concurrent_history_churn_blocks_candidate = false; }],
  ["history scan incomplete", (value) => { value.history_scan_complete = false; }],
  ["history count unstable", (value) => { value.history_count_stable = false; }],
  ["snapshot not verified", (value) => { value.history_snapshot_verified = false; }],
  ["snapshot manifest unstable", (value) => { value.history_snapshot_manifest_stable = false; }],
  ["snapshot fingerprint malformed", (value) => { value.history_snapshot_fingerprint = "not-a-sha256"; }],
  ["snapshot mode missing", (value) => { value.history_snapshot_mode = ""; }],
  ["snapshot passes invalid", (value) => { value.history_snapshot_passes = -1; }],
];

for (const [name, mutate] of mutations) {
  const forged = structuredClone(evaluation);
  mutate(forged);
  const candidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
    pattern,
    pattern_evaluation: forged,
    organization_id: ORGANIZATION_ID,
    now: new Date("2026-09-02T10:00:00.000Z"),
  });
  assert.equal(candidate, null, `${name} must fail closed before candidate creation`);
}

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_MISSION_OUTCOME_EVIDENCE_CANDIDATE_BUILDER_INTEGRITY_CERTIFIED",
  verified: {
    valid_evaluator_summary_still_builds_candidate: true,
    candidate_builder_revalidates_observation_count_arithmetic: true,
    candidate_builder_revalidates_dominant_outcome_and_ratio: true,
    candidate_builder_revalidates_thresholds: true,
    candidate_builder_requires_integrity_flags: true,
    candidate_builder_requires_observation_integrity_envelope_flags: true,
    candidate_builder_requires_complete_stable_history: true,
    candidate_builder_requires_verified_snapshot_manifest: true,
    candidate_builder_requires_snapshot_churn_guards: true,
    forged_or_stale_evaluation_summary_fails_closed: true,
    evidence_candidate_remains_non_reusable: true,
    provider_gpu_modal_execution_performed: false,
  },
  adversarial_cases: mutations.length,
}, null, 2));