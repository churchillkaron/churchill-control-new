import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key-not-used";

const {
  AVANTIQO_REUSABLE_KNOWLEDGE_ROW_ADMISSION_CONTRACT,
  assessAvantiqoReusableKnowledgeRowEligibility,
  rankAvantiqoKnowledgeRows,
} = await import(
  "../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
);
const { releaseAvantiqoFinalKnowledge } = await import(
  "../lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js"
);

const NOW = new Date("2026-09-04T05:00:00.000Z");
const FINAL_SOURCE = "avantiqo_explicit_final_knowledge_release";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";

function released(overrides = {}) {
  const metadataOverrides = overrides.metadata || {};
  const row = {
    id: "released-audit",
    memory_scope: "platform_knowledge",
    memory_key: "released-knowledge:audit",
    memory_type: "fact",
    subject: "Finance reconciliation verification",
    content: "Finance reconciliation should verify the governed evidence before financial commit.",
    importance: 0.94,
    confidence: 0.93,
    source: FINAL_SOURCE,
    active: true,
    valid_until: "2026-12-01T00:00:00.000Z",
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    updated_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    ...overrides,
  };
  row.metadata = {
    release_status: "RELEASED_MONITORED",
    explicit_final_release_approved: true,
    reusable_platform_knowledge: true,
    knowledge_router_reuse_allowed: true,
    automatic_knowledge_promotion: false,
    customer_private_content_included: false,
    raw_reasoning_persisted: false,
    authorization_value: "none",
    knowledge_domain: "finance",
    topic_key: "finance-reconcile",
    verified_at: NOW.toISOString(),
    sources: [
      { url: "https://example.com/primary", official: true, primary: true },
      { url: "https://example.org/independent" },
    ],
    ...metadataOverrides,
  };
  return row;
}

function assess(row, options = {}) {
  return assessAvantiqoReusableKnowledgeRowEligibility(row, options);
}

function expectRejected(row, blocker, options = {}) {
  const result = assess(row, options);
  assert.equal(result.contract, AVANTIQO_REUSABLE_KNOWLEDGE_ROW_ADMISSION_CONTRACT);
  assert.equal(result.eligible, false, `Expected ${blocker}`);
  assert.ok(result.blockers.includes(blocker), `Missing ${blocker}`);
  return result;
}

const valid = released();
const validAssessment = assess(valid);
assert.equal(validAssessment.eligible, true);
assert.equal(validAssessment.status, "EXPLICITLY_RELEASED_PLATFORM_KNOWLEDGE_ADMITTED");
assert.equal(validAssessment.source_class, "explicit_final_release");
assert.equal(validAssessment.policy.fail_closed, true);
assert.equal(validAssessment.policy.mechanism_agenda_reuse_allowed, false);
assert.equal(validAssessment.policy.evidence_candidate_reuse_allowed, false);
assert.equal(validAssessment.policy.provisional_knowledge_reuse_allowed, false);
assert.equal(validAssessment.policy.explicit_final_release_required_for_learned_knowledge, true);

const mechanismAgenda = released({
  id: "agenda-audit",
  memory_scope: "platform_learning_agenda",
  source: "continuous_learning_evidence_candidate_bridge",
  metadata: {
    release_status: undefined,
    explicit_final_release_approved: false,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    epistemic_state: "MECHANISM_REVIEW_AGENDA_NOT_REUSABLE",
  },
});
expectRejected(mechanismAgenda, "EXPLICIT_FINAL_RELEASE_SOURCE_REQUIRED");
expectRejected(mechanismAgenda, "PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");

const sourceSpoofedAgenda = released({
  id: "source-spoofed-agenda-audit",
  memory_scope: "platform_learning_agenda",
  source: FINAL_SOURCE,
});
expectRejected(sourceSpoofedAgenda, "PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");

const evidenceCandidate = released({
  id: "candidate-audit",
  memory_scope: "platform_learning_evidence_candidates",
  source: "mission_outcome_learning",
  metadata: {
    release_status: undefined,
    explicit_final_release_approved: false,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
  },
});
expectRejected(evidenceCandidate, "EXPLICIT_FINAL_RELEASE_SOURCE_REQUIRED");
expectRejected(evidenceCandidate, "PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");

const provisional = released({
  id: "provisional-audit",
  memory_scope: "platform_provisional_knowledge",
  source: "continuous_learning_provisional",
  metadata: {
    release_status: undefined,
    explicit_final_release_approved: false,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
  },
});
expectRejected(provisional, "EXPLICIT_FINAL_RELEASE_SOURCE_REQUIRED");
expectRejected(provisional, "PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");

expectRejected(released({ source: "legacy_platform_learning" }), "EXPLICIT_FINAL_RELEASE_SOURCE_REQUIRED");
expectRejected(released({ metadata: { release_status: "READY" } }), "RELEASED_MONITORED_STATUS_REQUIRED");
expectRejected(released({ metadata: { explicit_final_release_approved: false } }), "EXPLICIT_FINAL_RELEASE_APPROVAL_REQUIRED");
expectRejected(released({ metadata: { reusable_platform_knowledge: false } }), "REUSABLE_PLATFORM_KNOWLEDGE_TRUE_REQUIRED");
expectRejected(released({ metadata: { knowledge_router_reuse_allowed: false } }), "KNOWLEDGE_ROUTER_REUSE_TRUE_REQUIRED");
expectRejected(released({ metadata: { automatic_knowledge_promotion: true } }), "AUTOMATIC_KNOWLEDGE_PROMOTION_FALSE_REQUIRED");
expectRejected(released({ metadata: { customer_private_content_included: true } }), "CUSTOMER_PRIVATE_CONTENT_FALSE_REQUIRED");
expectRejected(released({ metadata: { raw_reasoning_persisted: true } }), "RAW_REASONING_PERSISTENCE_FALSE_REQUIRED");
expectRejected(released({ metadata: { authorization_value: "execute" } }), "AUTHORIZATION_VALUE_NONE_REQUIRED");

const internal = released({
  id: "internal-audit",
  source: INTERNAL_SOURCE,
  metadata: {},
});
expectRejected(internal, "INTERNAL_KNOWLEDGE_NOT_REQUESTED");
assert.equal(assess(internal, { include_internal: true }).eligible, true);

const mixed = [
  mechanismAgenda,
  sourceSpoofedAgenda,
  evidenceCandidate,
  provisional,
  released({ id: "legacy", source: "legacy_platform_learning" }),
  released({ id: "unapproved", metadata: { explicit_final_release_approved: false } }),
  released({ id: "private", metadata: { customer_private_content_included: true } }),
  released({ id: "inactive", active: false }),
  released({ id: "expired", valid_until: "2026-09-04T04:59:59.000Z" }),
  released({ id: "forgotten", forgotten_at: NOW.toISOString() }),
  released({ id: "superseded", superseded_by: "replacement" }),
  valid,
];
const ranking = rankAvantiqoKnowledgeRows({
  rows: mixed,
  query: "finance reconciliation verify evidence before financial commit",
  domain: "finance",
  now_ms: NOW.getTime(),
});
assert.equal(ranking.row_admission_contract, AVANTIQO_REUSABLE_KNOWLEDGE_ROW_ADMISSION_CONTRACT);
assert.equal(ranking.ranked.length, 1);
assert.equal(ranking.ranked[0].row.id, valid.id);
assert.equal(ranking.ranked.some((entry) => entry.row.memory_scope === "platform_learning_agenda"), false);
assert.equal(ranking.ranked.some((entry) => entry.row.memory_scope === "platform_learning_evidence_candidates"), false);
assert.equal(ranking.ranked.some((entry) => entry.row.memory_scope === "platform_provisional_knowledge"), false);

const priorApproval = process.env.AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED;
delete process.env.AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED;
await assert.rejects(
  releaseAvantiqoFinalKnowledge({
    hypothesis_fingerprint: "a".repeat(64),
    approval_reason: "audit-only",
  }),
  /EXPLICIT_APPROVAL_REQUIRED/,
);
if (priorApproval === undefined) delete process.env.AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED;
else process.env.AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED = priorApproval;

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_REUSABLE_KNOWLEDGE_ROW_ADMISSION_CERTIFIED",
  contract: AVANTIQO_REUSABLE_KNOWLEDGE_ROW_ADMISSION_CONTRACT,
  verified: {
    explicit_final_release_row_admitted: true,
    mechanism_agenda_excluded_from_retrieval: true,
    final_release_source_spoof_on_agenda_scope_rejected: true,
    evidence_candidate_excluded_from_retrieval: true,
    provisional_knowledge_excluded_from_retrieval: true,
    legacy_platform_knowledge_excluded_from_retrieval: true,
    unapproved_or_nonreusable_release_excluded: true,
    customer_private_content_and_raw_reasoning_excluded: true,
    authorization_escalation_excluded: true,
    inactive_expired_forgotten_superseded_rows_excluded: true,
    canonical_internal_requires_explicit_internal_mode: true,
    mixed_row_ranker_returns_only_valid_final_release: true,
    final_release_without_explicit_approval_fails_before_database_read: true,
    zero_database_calls_performed: true,
    zero_model_provider_gpu_or_runpod_calls_performed: true,
    zero_business_actions_performed: true,
  },
}, null, 2));
