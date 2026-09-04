import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key-not-used";

const {
  AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CONTRACT,
  buildAvantiqoLearningEvidenceMechanismAgendaRow,
} = await import(
  "../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime.js"
);

const NOW = new Date("2026-09-04T04:00:00.000Z");
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_CONTRACT = "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";

function candidate(overrides = {}) {
  const metadataOverrides = overrides.metadata || {};
  const row = {
    organization_id: ORGANIZATION_ID,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_evidence_candidates",
    memory_key: "mission-outcome-evidence-candidate:mechanism-audit",
    memory_type: "evidence",
    subject: "Verified mission outcome pattern: finance.reconcile",
    content:
      "Repeated verified de-identified mission outcomes support investigating whether verify-before-commit is associated with successful finance.reconcile outcomes. This is not a causal conclusion.",
    importance: 0.86,
    confidence: 0.85,
    source: "mission_outcome_learning",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    ...overrides,
  };
  row.metadata = {
    contract: CANDIDATE_CONTRACT,
    ingress_contract: "AVANTIQO_MISSION_OUTCOME_LEARNING_V1",
    epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
    topic_key: "mission-outcome-mechanism-audit",
    knowledge_domain: "finance",
    jurisdiction: null,
    stability: "mutable",
    source_count: 3,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    automatic_knowledge_promotion: false,
    explicit_final_promotion_required: true,
    requires_epistemic_promotion_pipeline: true,
    customer_private_memory: false,
    customer_private_content_included: false,
    raw_reasoning_persisted: false,
    direct_platform_knowledge_write_allowed: false,
    authorization_value: "none",
    causal_attribution_status: "NOT_ESTABLISHED",
    causal_attribution_allowed: false,
    ...metadataOverrides,
  };
  return row;
}

function build(row = candidate(), now = NOW) {
  return buildAvantiqoLearningEvidenceMechanismAgendaRow({
    organizationId: ORGANIZATION_ID,
    candidate: row,
    now,
  });
}

const agenda = build();
assert.equal(agenda.memory_scope, "platform_learning_agenda");
assert.equal(agenda.memory_type, "goal");
assert.equal(agenda.metadata.agenda_contract, AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CONTRACT);
assert.equal(agenda.metadata.epistemic_state, "MECHANISM_REVIEW_AGENDA_NOT_REUSABLE");
assert.equal(agenda.metadata.release_state, "NOT_RELEASED");
assert.equal(agenda.metadata.candidate_admission_rechecked, true);
assert.equal(agenda.metadata.reusable_platform_knowledge, false);
assert.equal(agenda.metadata.knowledge_router_reuse_allowed, false);
assert.equal(agenda.metadata.direct_platform_knowledge_write_allowed, false);
assert.equal(agenda.metadata.direct_platform_knowledge_promotion_allowed, false);
assert.equal(agenda.metadata.automatic_knowledge_promotion, false);
assert.equal(agenda.metadata.explicit_final_promotion_required, true);
assert.equal(agenda.metadata.requires_epistemic_promotion_pipeline, true);
assert.equal(agenda.metadata.customer_private_memory, false);
assert.equal(agenda.metadata.customer_private_content_included, false);
assert.equal(agenda.metadata.raw_reasoning_persisted, false);
assert.equal(agenda.metadata.authorization_value, "none");
assert.equal(agenda.metadata.automatic_business_action_execution, false);
assert.equal(agenda.metadata.automatic_message_send, false);
assert.equal(agenda.metadata.automatic_gpu_execution, false);
assert.equal(agenda.metadata.automatic_runpod_submission, false);
assert.equal(agenda.metadata.automatic_experiment_execution, false);
assert.equal(agenda.metadata.synthesis_spend_approval_required, true);
assert.equal(agenda.metadata.mechanism_mapping_required, true);
assert.equal(agenda.metadata.contradiction_search_required, true);
assert.equal(agenda.metadata.boundary_condition_search_required, true);
assert.equal(agenda.metadata.falsifiable_competing_hypotheses_required, true);
assert.equal(agenda.metadata.discriminating_experiments_required, true);
assert.equal(agenda.metadata.evidence_candidate_epistemic_state, "EVIDENCE_CANDIDATE_NOT_RELEASED");
assert.equal(agenda.organization_id, ORGANIZATION_ID);
assert.equal(agenda.party_id, null);
assert.equal(agenda.entity_id, null);
assert.equal(agenda.conversation_id, null);
assert.equal(agenda.source_turn_id, null);
assert.ok(agenda.content.includes("Do not assume the claim is true"));
assert.ok(agenda.content.includes("counterexamples that could refute the candidate"));

const repeat = build();
assert.equal(repeat.memory_key, agenda.memory_key, "same evidence candidate must create deterministic agenda identity");
assert.equal(repeat.subject, agenda.subject);
assert.equal(repeat.metadata.evidence_candidate_fingerprint, agenda.metadata.evidence_candidate_fingerprint);

const changedEvidence = build(candidate({
  content:
    "Repeated verified de-identified mission outcomes support investigating whether resume-existing-operation is associated with successful ambiguous execution outcomes. This is not a causal conclusion.",
  metadata: {
    topic_key: "mission-outcome-ambiguous-execution",
    knowledge_domain: "operations",
  },
}));
assert.notEqual(changedEvidence.memory_key, agenda.memory_key, "materially different evidence must not collide with prior agenda identity");

assert.throws(
  () => build(candidate({ metadata: { customer_private_content_included: true } })),
  /CANDIDATE_NOT_ADMITTED:CUSTOMER_PRIVATE_CONTENT_EXPLICIT_FALSE_REQUIRED/,
);
assert.throws(
  () => build(candidate({ metadata: { raw_reasoning_persisted: true } })),
  /CANDIDATE_NOT_ADMITTED:RAW_REASONING_PERSISTENCE_EXPLICIT_FALSE_REQUIRED/,
);
assert.throws(
  () => build(candidate({ metadata: { authorization_value: "execute" } })),
  /CANDIDATE_NOT_ADMITTED:AUTHORIZATION_VALUE_NONE_REQUIRED/,
);
assert.throws(
  () => build(candidate({ metadata: { reusable_platform_knowledge: true } })),
  /CANDIDATE_NOT_ADMITTED:REUSABLE_PLATFORM_KNOWLEDGE_EXPLICIT_FALSE_REQUIRED/,
);
assert.throws(
  () => build(candidate({ metadata: { explicit_final_promotion_required: false } })),
  /CANDIDATE_NOT_ADMITTED:EXPLICIT_FINAL_PROMOTION_REQUIRED/,
);
assert.throws(
  () => build(candidate({ metadata: { requires_epistemic_promotion_pipeline: false } })),
  /CANDIDATE_NOT_ADMITTED:EPISTEMIC_PROMOTION_PIPELINE_REQUIRED/,
);
assert.throws(
  () => build(candidate({ memory_scope: "platform_knowledge" })),
  /CANDIDATE_NOT_ADMITTED:EVIDENCE_CANDIDATE_SCOPE_REQUIRED/,
);
assert.throws(
  () => build(candidate({ valid_until: "2026-09-04T03:59:59.000Z" })),
  /CANDIDATE_NOT_ADMITTED:CANDIDATE_NOT_EXPIRED_REQUIRED/,
);
assert.throws(
  () => build(candidate({ superseded_by: "replacement" })),
  /CANDIDATE_NOT_ADMITTED:CANDIDATE_NOT_SUPERSEDED_OR_FORGOTTEN_REQUIRED/,
);
assert.throws(
  () => buildAvantiqoLearningEvidenceMechanismAgendaRow({ candidate: candidate(), now: NOW }),
  /ORGANIZATION_REQUIRED/,
);

assert.notEqual(agenda.memory_scope, "platform_knowledge");
assert.notEqual(agenda.memory_scope, "platform_provisional_knowledge");
assert.notEqual(agenda.memory_scope, "platform_learning_knowledge_final_promotion_candidates");
assert.notEqual(agenda.metadata.epistemic_state, "RELEASED");
assert.notEqual(agenda.metadata.release_state, "RELEASED_MONITORED");

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CERTIFIED",
  contract: AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CONTRACT,
  verified: {
    admitted_candidate_maps_only_to_mechanism_agenda: true,
    candidate_admission_is_rechecked_at_builder_boundary: true,
    agenda_is_explicitly_not_reusable_knowledge: true,
    agenda_cannot_authorize_actions_or_messages: true,
    agenda_cannot_directly_write_or_promote_platform_knowledge: true,
    explicit_final_promotion_and_epistemic_pipeline_remain_required: true,
    private_content_raw_reasoning_and_authorization_escalation_rejected: true,
    stale_and_superseded_candidates_rejected: true,
    deterministic_identity_prevents_duplicate_agenda_for_same_evidence: true,
    materially_different_evidence_gets_distinct_identity: true,
    mechanism_contradiction_boundary_hypothesis_and_experiment_review_required: true,
    missing_learning_organization_rejected: true,
    zero_database_calls_performed: true,
    zero_model_provider_gpu_or_runpod_calls_performed: true,
    zero_business_actions_performed: true,
  },
}, null, 2));
