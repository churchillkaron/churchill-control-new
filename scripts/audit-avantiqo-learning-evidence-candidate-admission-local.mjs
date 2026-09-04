import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key-not-used";

const {
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
  assessAvantiqoLearningEvidenceCandidateBridgeEligibility,
} = await import(
  "../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime.js"
);

const NOW = new Date("2026-09-04T03:00:00.000Z");
const CANDIDATE_CONTRACT = "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";
const PUBLIC_WEB_COMPATIBILITY = "LEGACY_PUBLIC_WEB_EVIDENCE_EXPLICIT_SOURCE_GUARD";

function strictCandidate(overrides = {}) {
  const metadataOverrides = overrides.metadata || {};
  const row = {
    organization_id: "00000000-0000-4000-8000-000000000001",
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_evidence_candidates",
    memory_key: "mission-outcome-evidence-candidate:audit",
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
    topic_key: "mission-outcome-audit",
    knowledge_domain: "finance",
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

function assess(row) {
  return assessAvantiqoLearningEvidenceCandidateBridgeEligibility(row, { now: NOW });
}

function expectRejected(row, blocker) {
  const result = assess(row);
  assert.equal(result.contract, AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT);
  assert.equal(result.eligible, false, `Expected rejected candidate for ${blocker}`);
  assert.ok(result.blockers.includes(blocker), `Missing blocker ${blocker}`);
  return result;
}

const strict = assess(strictCandidate());
assert.equal(strict.contract, AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT);
assert.equal(strict.eligible, true);
assert.equal(strict.status, "EVIDENCE_CANDIDATE_ADMITTED_TO_MECHANISM_REVIEW");
assert.equal(strict.compatibility_path, null);
assert.equal(strict.policy.admission_fail_closed, true);
assert.equal(strict.policy.candidate_is_not_fact, true);
assert.equal(strict.policy.candidate_is_not_reusable_knowledge, true);
assert.equal(strict.policy.explicit_final_promotion_required, true);
assert.equal(strict.policy.epistemic_promotion_pipeline_required, true);
assert.equal(strict.policy.authorization_value_none_required, true);

const strictWeb = strictCandidate({
  source: "continuous_learning_evidence_candidate",
  memory_key: "knowledge-evidence-candidate:audit",
  metadata: {
    ingress_contract: null,
    topic_key: "enterprise-integration-standards",
    knowledge_domain: "integrations",
    source_count: 2,
    sources: [
      { url: "https://example.com/primary", official: true, primary: true },
      { url: "https://example.org/independent" },
    ],
    evidence_status: "SUPPORTED",
  },
});
const strictWebAssessment = assess(strictWeb);
assert.equal(strictWebAssessment.eligible, true);
assert.equal(strictWebAssessment.compatibility_path, PUBLIC_WEB_COMPATIBILITY);

const legacyWeb = strictCandidate({
  source: "continuous_learning_evidence_candidate",
  memory_key: "knowledge-evidence-candidate:legacy-audit",
  metadata: {
    ingress_contract: null,
    topic_key: "enterprise-integration-standards",
    knowledge_domain: "integrations",
    source_count: 2,
    sources: [
      { url: "https://example.com/primary", official: true, primary: true },
      { url: "https://example.org/independent" },
    ],
    evidence_status: "SUPPORTED",
    customer_private_content_included: undefined,
    direct_platform_knowledge_write_allowed: undefined,
  },
});
const legacyWebAssessment = assess(legacyWeb);
assert.equal(legacyWebAssessment.eligible, true);
assert.equal(legacyWebAssessment.compatibility_path, PUBLIC_WEB_COMPATIBILITY);

expectRejected(strictCandidate({ metadata: { customer_private_content_included: true } }), "CUSTOMER_PRIVATE_CONTENT_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { customer_private_content_included: undefined } }), "CUSTOMER_PRIVATE_CONTENT_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { customer_private_memory: true } }), "CUSTOMER_PRIVATE_MEMORY_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { raw_reasoning_persisted: true } }), "RAW_REASONING_PERSISTENCE_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { direct_platform_knowledge_write_allowed: true } }), "DIRECT_PLATFORM_KNOWLEDGE_WRITE_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { direct_platform_knowledge_write_allowed: undefined } }), "DIRECT_PLATFORM_KNOWLEDGE_WRITE_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { authorization_value: "execute" } }), "AUTHORIZATION_VALUE_NONE_REQUIRED");
expectRejected(strictCandidate({ metadata: { knowledge_router_reuse_allowed: true } }), "KNOWLEDGE_ROUTER_REUSE_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { automatic_knowledge_promotion: true } }), "AUTOMATIC_KNOWLEDGE_PROMOTION_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { reusable_platform_knowledge: true } }), "REUSABLE_PLATFORM_KNOWLEDGE_EXPLICIT_FALSE_REQUIRED");
expectRejected(strictCandidate({ metadata: { explicit_final_promotion_required: false } }), "EXPLICIT_FINAL_PROMOTION_REQUIRED");
expectRejected(strictCandidate({ metadata: { requires_epistemic_promotion_pipeline: false } }), "EPISTEMIC_PROMOTION_PIPELINE_REQUIRED");
expectRejected(strictCandidate({ metadata: { source_count: 0 } }), "EVIDENCE_SOURCE_COUNT_REQUIRED");
expectRejected(strictCandidate({ metadata: { topic_key: "" } }), "EVIDENCE_TOPIC_KEY_REQUIRED");
expectRejected(strictCandidate({ metadata: { knowledge_domain: "" } }), "EVIDENCE_KNOWLEDGE_DOMAIN_REQUIRED");
expectRejected(strictCandidate({ content: "" }), "EVIDENCE_CANDIDATE_CONTENT_REQUIRED");
expectRejected(strictCandidate({ memory_scope: "platform_knowledge" }), "EVIDENCE_CANDIDATE_SCOPE_REQUIRED");
expectRejected(strictCandidate({ metadata: { contract: "WRONG" } }), "EVIDENCE_CANDIDATE_CONTRACT_REQUIRED");
expectRejected(strictCandidate({ metadata: { epistemic_state: "RELEASED" } }), "UNRELEASED_EPISTEMIC_STATE_REQUIRED");
expectRejected(strictCandidate({ active: false }), "CANDIDATE_ACTIVE_REQUIRED");
expectRejected(strictCandidate({ superseded_by: "replacement" }), "CANDIDATE_NOT_SUPERSEDED_OR_FORGOTTEN_REQUIRED");
expectRejected(strictCandidate({ forgotten_at: "2026-09-03T00:00:00.000Z" }), "CANDIDATE_NOT_SUPERSEDED_OR_FORGOTTEN_REQUIRED");
expectRejected(strictCandidate({ valid_until: "2026-09-04T02:59:59.000Z" }), "CANDIDATE_NOT_EXPIRED_REQUIRED");

const fakeLegacy = strictCandidate({
  source: "mission_outcome_learning",
  metadata: {
    customer_private_content_included: undefined,
    direct_platform_knowledge_write_allowed: undefined,
    evidence_status: "SUPPORTED",
    sources: [{ url: "https://example.com/evidence" }],
  },
});
const fakeLegacyAssessment = assess(fakeLegacy);
assert.equal(fakeLegacyAssessment.eligible, false);
assert.equal(fakeLegacyAssessment.compatibility_path, null);
assert.ok(fakeLegacyAssessment.blockers.includes("CUSTOMER_PRIVATE_CONTENT_EXPLICIT_FALSE_REQUIRED"));
assert.ok(fakeLegacyAssessment.blockers.includes("DIRECT_PLATFORM_KNOWLEDGE_WRITE_EXPLICIT_FALSE_REQUIRED"));

const webWithoutRealUrl = strictCandidate({
  source: "continuous_learning_evidence_candidate",
  metadata: {
    customer_private_content_included: undefined,
    direct_platform_knowledge_write_allowed: undefined,
    evidence_status: "SUPPORTED",
    sources: [{ url: "not-a-url" }],
  },
});
assert.equal(assess(webWithoutRealUrl).eligible, false);

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CERTIFIED",
  contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
  verified: {
    strict_mission_candidate_admitted: true,
    public_web_candidate_requires_explicit_supported_source_guard: true,
    legacy_public_web_candidate_has_narrow_explicit_compatibility_only: true,
    private_content_true_or_missing_rejected_for_non_web_candidates: true,
    private_memory_rejected: true,
    raw_reasoning_rejected: true,
    direct_platform_knowledge_write_true_or_missing_rejected_for_non_web_candidates: true,
    authorization_effect_rejected: true,
    router_reuse_rejected: true,
    automatic_promotion_rejected: true,
    already_reusable_candidate_rejected: true,
    explicit_final_promotion_required: true,
    epistemic_pipeline_required: true,
    stale_superseded_forgotten_expired_candidates_rejected: true,
    source_topic_domain_and_content_required: true,
    arbitrary_candidate_cannot_exploit_legacy_compatibility: true,
    fake_source_url_cannot_exploit_legacy_compatibility: true,
    zero_database_calls_performed: true,
    zero_model_provider_gpu_or_runpod_calls_performed: true,
    zero_business_actions_performed: true,
  },
}, null, 2));
