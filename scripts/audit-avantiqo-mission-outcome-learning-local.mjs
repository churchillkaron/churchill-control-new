import assert from "node:assert/strict";
import {
  AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  buildAvantiqoMissionOutcomeEvidenceCandidateRow,
  buildAvantiqoMissionOutcomeLearningObservation,
  evaluateAvantiqoMissionOutcomePattern,
} from "../lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js";

const LEARNING_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const OUTCOME_CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1";
const OUTCOME_ASSESSMENT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_V1";
const EVIDENCE_CANDIDATE_CONTRACT = "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";
const EVIDENCE_BRIDGE_CONTRACT = "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1";

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
      candidate_id: "candidate-verified-guard",
      mutates: true,
      irreversible: false,
      requires_human: true,
    },
    criteria: [
      {
        id: "success-verified-state",
        kind: "success",
        signal: "Current state matches intended result",
        comparator: "eq",
        expected_value: true,
        observation_source: "registered-verification-read",
        verification_criteria: ["Exact registered read confirms intended result"],
        failure_mode_ids: [],
        required: true,
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        signal: "Stale state was committed",
        comparator: "eq",
        expected_value: true,
        observation_source: "registered-verification-read",
        verification_criteria: ["Exact registered read detects stale-state commit"],
        failure_mode_ids: ["stale-state-commit"],
        required: true,
      },
    ],
  };
}

function successAssessment({ proven = true, decisiveEvidence = true } = {}) {
  return {
    contract: OUTCOME_ASSESSMENT,
    status: "OUTCOME_SUCCEEDED",
    outcome: "success",
    decision_success_proven: proven,
    review_required: false,
    criterion_results: [
      {
        id: "success-verified-state",
        kind: "success",
        required: true,
        status: "SATISFIED",
        exact_source_observation_count: decisiveEvidence ? 1 : 0,
        evidence_ids: decisiveEvidence ? ["evidence-verified-state"] : [],
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        required: true,
        status: "NOT_SATISFIED",
        exact_source_observation_count: decisiveEvidence ? 1 : 0,
        evidence_ids: decisiveEvidence ? ["evidence-no-stale-write"] : [],
      },
    ],
  };
}

function failureAssessment() {
  return {
    contract: OUTCOME_ASSESSMENT,
    status: "OUTCOME_FAILED",
    outcome: "failure",
    decision_success_proven: false,
    review_required: true,
    criterion_results: [
      {
        id: "success-verified-state",
        kind: "success",
        required: true,
        status: "NOT_SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["evidence-state-not-correct"],
      },
      {
        id: "failure-stale-write",
        kind: "failure",
        required: true,
        status: "SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["evidence-stale-write"],
      },
    ],
  };
}

function inconclusiveAssessment() {
  return {
    contract: OUTCOME_ASSESSMENT,
    status: "OUTCOME_INCONCLUSIVE",
    outcome: "inconclusive",
    decision_success_proven: false,
    review_required: false,
    criterion_results: [],
  };
}

function observation({ token, date, assessment = successAssessment() }) {
  return buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract: outcomeContract(),
    outcome_assessment: assessment,
    observation_token: token,
    organization_id: LEARNING_ORGANIZATION_ID,
    now: new Date(date),
  });
}

function requireThrows(fn, patternExpression) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "Expected function to throw");
  assert.match(String(thrown.message || thrown), patternExpression);
}

const one = observation({
  token: "a".repeat(64),
  date: "2026-09-01T08:00:00.000Z",
});
assert.equal(one.contract, AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT);
assert.equal(one.eligible, true);
assert.equal(one.status, "VERIFIED_DEIDENTIFIED_MISSION_OUTCOME_READY");
assert.equal(one.row.memory_scope, "platform_learning_outcomes");
assert.equal(one.row.metadata.verified_outcome, "SUCCESS");
assert.equal(one.row.metadata.causal_attribution_status, "NOT_ESTABLISHED");
assert.equal(one.row.metadata.causal_attribution_allowed, false);
assert.equal(one.row.metadata.reusable_platform_knowledge, false);
assert.equal(one.row.metadata.knowledge_router_reuse_allowed, false);
assert.equal(one.row.metadata.automatic_knowledge_promotion, false);
assert.equal(one.row.metadata.direct_platform_knowledge_write_allowed, false);
assert.equal(one.row.metadata.customer_private_content_included, false);
assert.equal(one.row.metadata.customer_identifiers_included, false);
assert.equal(one.row.metadata.source_observation_token_persisted, false);
assert.equal(one.row.metadata.source_evidence_ids_persisted, false);
assert.equal(one.row.metadata.raw_mission_text_included, false);
assert.equal(one.row.metadata.raw_payload_included, false);
assert.equal(one.row.metadata.raw_output_included, false);
assert.equal(one.row.metadata.raw_reasoning_persisted, false);
assert.equal(one.row.metadata.authorization_value, "none");
assert.equal(one.row.metadata.automatic_training_effect, "NONE");
assert.equal(one.row.metadata.automatic_gpu_execution, false);
assert.equal(one.row.metadata.automatic_modal_submission, false);
assert.ok(!one.row.content.includes("evidence-verified-state"));
assert.ok(!one.row.content.includes(LEARNING_ORGANIZATION_ID));
assert.ok(!one.row.content.includes("a".repeat(64)));

const oneShot = evaluateAvantiqoMissionOutcomePattern({
  observations: [one.row],
  pattern_fingerprint: one.pattern_fingerprint,
});
assert.equal(oneShot.eligible_for_evidence_candidate, false);
assert.equal(oneShot.observation_count, 1);
assert.equal(oneShot.anti_overfitting.single_observation_can_create_evidence_candidate, false);

const sameDayTwo = observation({
  token: "b".repeat(64),
  date: "2026-09-01T12:00:00.000Z",
});
const sameDayThree = observation({
  token: "c".repeat(64),
  date: "2026-09-01T18:00:00.000Z",
});
const sameDay = evaluateAvantiqoMissionOutcomePattern({
  observations: [one.row, sameDayTwo.row, sameDayThree.row],
  pattern_fingerprint: one.pattern_fingerprint,
});
assert.equal(sameDay.observation_count, 3);
assert.equal(sameDay.distinct_observation_days, 1);
assert.equal(sameDay.eligible_for_evidence_candidate, false);

const secondDay = observation({
  token: "d".repeat(64),
  date: "2026-09-02T08:00:00.000Z",
});
const repeated = evaluateAvantiqoMissionOutcomePattern({
  observations: [one.row, sameDayTwo.row, secondDay.row],
  pattern_fingerprint: one.pattern_fingerprint,
});
assert.equal(repeated.eligible_for_evidence_candidate, true);
assert.equal(repeated.observation_count, 3);
assert.equal(repeated.distinct_observation_days, 2);
assert.equal(repeated.dominant_outcome, "SUCCESS");
assert.equal(repeated.dominant_outcome_ratio, 1);

const candidate = buildAvantiqoMissionOutcomeEvidenceCandidateRow({
  pattern,
  pattern_evaluation: repeated,
  organization_id: LEARNING_ORGANIZATION_ID,
  now: new Date("2026-09-02T09:00:00.000Z"),
});
assert.ok(candidate);
assert.equal(candidate.memory_scope, "platform_learning_evidence_candidates");
assert.equal(candidate.metadata.contract, EVIDENCE_CANDIDATE_CONTRACT);
assert.equal(candidate.metadata.epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
assert.equal(candidate.metadata.next_stage_contract, EVIDENCE_BRIDGE_CONTRACT);
assert.equal(candidate.metadata.repeated_verified_outcome_gate_passed, true);
assert.equal(candidate.metadata.anti_overfitting_gate_passed, true);
assert.equal(candidate.metadata.causal_attribution_status, "NOT_ESTABLISHED");
assert.equal(candidate.metadata.causal_attribution_allowed, false);
assert.equal(candidate.metadata.mechanism_review_required, true);
assert.equal(candidate.metadata.contradiction_search_required, true);
assert.equal(candidate.metadata.boundary_condition_search_required, true);
assert.equal(candidate.metadata.falsifiable_competing_hypotheses_required, true);
assert.equal(candidate.metadata.discriminating_counterfactual_evaluation_required, true);
assert.equal(candidate.metadata.public_or_platform_safe_evidence_required_for_promotion, true);
assert.equal(candidate.metadata.requires_epistemic_promotion_pipeline, true);
assert.equal(candidate.metadata.reusable_platform_knowledge, false);
assert.equal(candidate.metadata.knowledge_router_reuse_allowed, false);
assert.equal(candidate.metadata.automatic_knowledge_promotion, false);
assert.equal(candidate.metadata.explicit_final_promotion_required, true);
assert.equal(candidate.metadata.direct_platform_knowledge_write_allowed, false);
assert.equal(candidate.metadata.customer_private_content_included, false);
assert.equal(candidate.metadata.customer_identifiers_included, false);
assert.equal(candidate.metadata.source_observation_tokens_persisted, false);
assert.equal(candidate.metadata.source_evidence_ids_persisted, false);
assert.equal(candidate.metadata.raw_mission_text_included, false);
assert.equal(candidate.metadata.raw_payload_included, false);
assert.equal(candidate.metadata.raw_output_included, false);
assert.equal(candidate.metadata.raw_reasoning_persisted, false);
assert.equal(candidate.metadata.automatic_modal_submission, false);
assert.equal(candidate.metadata.authorization_value, "none");
assert.match(candidate.content, /support investigating whether/i);
assert.match(candidate.content, /not a causal conclusion/i);
assert.doesNotMatch(candidate.content, /\bcaused\b/i);
assert.doesNotMatch(candidate.content, /reusable platform knowledge is approved/i);

const mixedFailure = observation({
  token: "e".repeat(64),
  date: "2026-09-02T10:00:00.000Z",
  assessment: failureAssessment(),
});
const mixed = evaluateAvantiqoMissionOutcomePattern({
  observations: [one.row, secondDay.row, mixedFailure.row],
  pattern_fingerprint: one.pattern_fingerprint,
});
assert.equal(mixed.verified_success_count, 2);
assert.equal(mixed.verified_failure_count, 1);
assert.equal(mixed.dominant_outcome_ratio, 0.6667);
assert.equal(mixed.eligible_for_evidence_candidate, false);
assert.equal(
  buildAvantiqoMissionOutcomeEvidenceCandidateRow({
    pattern,
    pattern_evaluation: mixed,
    organization_id: LEARNING_ORGANIZATION_ID,
  }),
  null,
);

const inconclusive = buildAvantiqoMissionOutcomeLearningObservation({
  pattern,
  outcome_contract: outcomeContract(),
  outcome_assessment: inconclusiveAssessment(),
  observation_token: "f".repeat(64),
  organization_id: LEARNING_ORGANIZATION_ID,
});
assert.equal(inconclusive.eligible, false);
assert.ok(inconclusive.blockers.includes("CONCLUSIVE_SUCCESS_OR_FAILURE_OUTCOME_REQUIRED"));

const unprovenSuccess = buildAvantiqoMissionOutcomeLearningObservation({
  pattern,
  outcome_contract: outcomeContract(),
  outcome_assessment: successAssessment({ proven: false }),
  observation_token: "1".repeat(64),
  organization_id: LEARNING_ORGANIZATION_ID,
});
assert.equal(unprovenSuccess.eligible, false);
assert.ok(unprovenSuccess.blockers.includes("VERIFIED_SUCCESS_PROOF_REQUIRED"));

const noEvidence = buildAvantiqoMissionOutcomeLearningObservation({
  pattern,
  outcome_contract: outcomeContract(),
  outcome_assessment: successAssessment({ decisiveEvidence: false }),
  observation_token: "2".repeat(64),
  organization_id: LEARNING_ORGANIZATION_ID,
});
assert.equal(noEvidence.eligible, false);
assert.ok(noEvidence.blockers.includes("DECISIVE_VERIFIED_OUTCOME_EVIDENCE_REQUIRED"));

requireThrows(
  () => buildAvantiqoMissionOutcomeLearningObservation({
    pattern: { ...pattern, customer_name: "Acme" },
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: "3".repeat(64),
    organization_id: LEARNING_ORGANIZATION_ID,
  }),
  /PATTERN_FIELD_FORBIDDEN/,
);

requireThrows(
  () => buildAvantiqoMissionOutcomeLearningObservation({
    pattern: { ...pattern, mission_family: "Customer Acme invoice" },
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: "4".repeat(64),
    organization_id: LEARNING_ORGANIZATION_ID,
  }),
  /MUST_BE_DEIDENTIFIED_CODE/,
);

requireThrows(
  () => buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: "customer-mission-123",
    organization_id: LEARNING_ORGANIZATION_ID,
  }),
  /DEIDENTIFIED_OBSERVATION_TOKEN_REQUIRED/,
);

requireThrows(
  () => buildAvantiqoMissionOutcomeEvidenceCandidateRow({
    pattern: { ...pattern, intervention_code: "different-safe-intervention" },
    pattern_evaluation: repeated,
    organization_id: LEARNING_ORGANIZATION_ID,
  }),
  /PATTERN_FINGERPRINT_MISMATCH/,
);

const result = {
  success: true,
  status: "AVANTIQO_MISSION_OUTCOME_LEARNING_CERTIFIED",
  contract: AVANTIQO_MISSION_OUTCOME_LEARNING_CONTRACT,
  verified: {
    valid_verified_outcome_is_deidentified_structural_observation_only: true,
    one_observation_cannot_create_evidence_candidate: true,
    three_same_day_observations_cannot_create_evidence_candidate: true,
    repeated_observations_across_distinct_days_can_create_review_candidate: true,
    mixed_outcomes_below_dominance_gate_block_candidate: true,
    inconclusive_outcome_blocks_learning_observation: true,
    success_without_verified_success_proof_blocks_learning_observation: true,
    outcome_without_decisive_verified_evidence_blocks_learning_observation: true,
    unknown_private_or_freeform_pattern_fields_are_rejected: true,
    freeform_pattern_values_are_rejected: true,
    raw_observation_token_is_rejected_and_never_persisted: true,
    evidence_candidate_is_non_reusable_and_non_causal: true,
    mechanism_contradiction_boundary_and_counterfactual_review_required: true,
    existing_learning_evidence_bridge_is_preserved: true,
    explicit_final_promotion_remains_required: true,
    no_business_action_authority_is_added: true,
    no_model_provider_gpu_or_modal_execution_performed: true,
  },
  positive_pattern: {
    observations: repeated.observation_count,
    distinct_days: repeated.distinct_observation_days,
    dominant_outcome: repeated.dominant_outcome,
    dominant_ratio: repeated.dominant_outcome_ratio,
    candidate_memory_scope: candidate.memory_scope,
    candidate_contract: candidate.metadata.contract,
    next_stage_contract: candidate.metadata.next_stage_contract,
  },
  negative_controls: {
    one_shot_eligible: oneShot.eligible_for_evidence_candidate,
    same_day_eligible: sameDay.eligible_for_evidence_candidate,
    mixed_outcome_eligible: mixed.eligible_for_evidence_candidate,
    inconclusive_eligible: inconclusive.eligible,
    unproven_success_eligible: unprovenSuccess.eligible,
    no_decisive_evidence_eligible: noEvidence.eligible,
  },
};

console.log(JSON.stringify(result, null, 2));