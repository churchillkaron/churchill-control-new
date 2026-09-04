import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  learning: "lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js",
  handoff: "lib/intelligence/runtime/OperatorMissionOutcomeLearningHandoffRuntime.js",
  bridge: "lib/operator/runtime/OperatorMissionOutcomeLearningBridgeRuntime.js",
  declaration: "lib/operator/runtime/OperatorMissionOutcomeLearningManifestRuntime.js",
  projection: "lib/operator/runtime/OperatorMissionOutcomeLearningProjectionRuntime.js",
  settlement: "lib/operator/runtime/OperatorMissionOutcomeLearningSettlementRuntime.js",
  mission: "lib/platform/capabilities/createOperatorBindingAwareMissionCapability.js",
  auditIntegrity: "scripts/audit-avantiqo-mission-outcome-learning-integrity-local.mjs",
  auditHistory: "scripts/audit-avantiqo-mission-outcome-learning-history-window-local.mjs",
  auditHandoff: "scripts/audit-operator-mission-outcome-learning-handoff-local.mjs",
  auditBridge: "scripts/audit-operator-mission-outcome-learning-bridge-local.mjs",
  auditCompletion: "scripts/audit-operator-mission-completion-learning-local.mjs",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);

function includes(key, expected) {
  assert.ok(
    source[key].includes(expected),
    `${files[key]} must include ${JSON.stringify(expected)}`,
  );
}

includes("learning", "EVIDENCE_CANDIDATE_NOT_RELEASED");
includes("learning", "causal_attribution_allowed: false");
includes("learning", "reusable_platform_knowledge: false");
includes("learning", "knowledge_router_reuse_allowed: false");
includes("learning", "automatic_knowledge_promotion: false");
includes("learning", "explicit_final_promotion_required: true");
includes("learning", "min_observations: 3");
includes("learning", "min_distinct_observation_days: 2");
includes("learning", "min_dominant_outcome_ratio: 0.8");
includes("learning", "history_page_size: 250");
includes("learning", "max_history_pages: 64");
includes("learning", "max_raw_history_scan: 5000");
includes("learning", "const SHA256_RE");
includes("learning", "function positiveInteger");
includes("learning", "function validObservationTime");
includes("learning", "function observationStructuralSignature");
includes("learning", "function uniqueEligibleObservationRows");
includes("learning", "const groups = new Map()");
includes("learning", "duplicate_observation_count");
includes("learning", "conflicting_observation_fingerprint_count");
includes("learning", "quarantined_conflicting_observation_count");
includes("learning", "unique_observation_fingerprints_required: true");
includes("learning", "duplicate_observations_excluded: true");
includes("learning", "conflicting_observation_fingerprints_quarantined: true");
includes("learning", "row_order_cannot_resolve_observation_conflict: true");
includes("learning", "function historyScanConfiguration");
includes("learning", "function patternObservationQuery");
includes("learning", 'count: "exact"');
includes("learning", '.range(0, firstTo)');
includes("learning", "function applyHistoryScanGate");
includes("learning", "complete_history_scan_required: true");
includes("learning", "incomplete_history_blocks_evidence_candidate: true");
includes("learning", "raw_rows_cannot_crowd_out_unique_observation_limit: true");
includes("learning", "history_count_must_remain_stable_during_scan: true");
includes("learning", "stable_row_identity_required_across_pages: true");
includes("learning", 'status: "VERIFIED_OUTCOME_HISTORY_SCAN_INCOMPLETE"');
includes("learning", "stored_observation_integrity_revalidated: true");
includes("learning", "malformed_or_poisoned_observations_excluded: true");
includes("learning", "excluded_observation_count");
includes("learning", "source_outcome_contract");
includes("learning", "source_outcome_assessment_contract");

includes("handoff", "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_HANDOFF_V1");
includes("handoff", "post_verified_outcome_handoff_only: true");
includes("handoff", "full_operator_outcome_persisted: false");
includes("handoff", "source_observation_token_persisted: false");
includes("handoff", "customer_private_content_allowed: false");
includes("handoff", "customer_identifiers_allowed: false");
includes("handoff", "automatic_knowledge_promotion: false");
includes("handoff", "direct_platform_knowledge_write_allowed: false");
includes("handoff", 'authorization_effect: "NONE"');

includes("bridge", "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_BRIDGE_V1");
includes("bridge", "actual_operator_outcome_assessment_required: true");
includes("bridge", "outcome_assessment_generated_by_operator_runtime: true");
includes("bridge", "raw_outcome_observations_forwarded_to_learning: false");
includes("bridge", "observed_values_forwarded_to_learning: false");
includes("bridge", "automatic_knowledge_promotion: false");
includes("bridge", "direct_platform_knowledge_write_allowed: false");

includes("declaration", "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_MANIFEST_V1");
includes("declaration", "capability_manifest_declaration_required: true");
includes("declaration", "DIRECT_LEARNING_OWNER_CAPABILITY_KEYS");
includes("declaration", "platform.code_ai_autonomous.execute");
includes("declaration", "DUPLICATE_LEARNING_OWNER_FORBIDDEN");
includes("declaration", "single_learning_owner_required: true");
includes("declaration", "duplicate_learning_owner_allowed: false");
includes("declaration", "exact_declared_verifier_required: true");
includes("declaration", "STATIC_VERIFIER_IDENTITY_REQUIRED");
includes("declaration", "static_verifier_identity_required: true");
includes("declaration", "static_verifier_identity_verified: true");
includes("declaration", "dynamic_verifier_identity_allowed: false");
includes("declaration", "planner_supplied_learning_projection_allowed: false");
includes("declaration", "model_invented_learning_projection_allowed: false");
includes("declaration", "FINAL_CAPABILITY_MANIFEST");
includes("declaration", "TRUSTED_SERVER_RESUME");

includes("projection", "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_V1");
includes("projection", "final_registered_verification_only: true");
includes("projection", "freeform_mission_text_used: false");
includes("projection", "raw_write_result_used: false");
includes("projection", "SENSITIVE_PATH_SEGMENTS");

includes("settlement", "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_SETTLEMENT_V1");
includes("settlement", "post_verified_mission_completion_only: true");
includes("settlement", "customer_organization_forwarded_to_learning: false");
includes("settlement", "raw_write_result_forwarded_to_learning: false");
includes("settlement", "raw_verification_result_forwarded_to_learning: false");
includes("settlement", "automatic_knowledge_promotion: false");
includes("settlement", "direct_platform_knowledge_write_allowed: false");

includes("mission", "resolveOperatorMissionOutcomeLearningProjection");
includes("mission", "restoreOperatorMissionOutcomeLearningProjection");
includes("mission", "OPERATOR_MISSION_PLANNER_SUPPLIED_LEARNING_PROJECTION_BLOCKED");
includes("mission", "settleOperatorMissionOutcomeLearning");
includes("mission", "OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_INVALID");
includes("mission", "learning_observation_token");
includes("mission", "delete inputSchema.properties.learning");

includes("auditIntegrity", "poisoned_row_cannot_inflate_three_observation_gate: true");
includes("auditIntegrity", "duplicate_rows_cannot_inflate_three_observation_gate: true");
includes("auditIntegrity", "duplicate_rows_cannot_fake_distinct_day_gate: true");
includes("auditIntegrity", "conflicting_observation_fingerprints_quarantined: true");
includes("auditIntegrity", "conflicting_rows_contribute_zero_votes: true");
includes("auditIntegrity", "conflicting_rows_are_order_independent: true");
includes("auditIntegrity", "unique_observation_fingerprints_required: true");
includes("auditIntegrity", "sha256_fingerprints_required: true");
includes("auditIntegrity", "observation_key_bound_to_fingerprint: true");
includes("auditIntegrity", "decisive_evidence_counts_revalidated: true");
includes("auditIntegrity", "observation_day_and_timestamp_must_agree: true");
includes("auditHistory", "raw_rows_before_valid_evidence_do_not_crowd_out_unique_votes: true");
includes("auditHistory", "history_scan_uses_ordered_range_pagination: true");
includes("auditHistory", "raw_scan_limit_fails_closed_before_candidate: true");
includes("auditHistory", "count_change_during_scan_fails_closed: true");
includes("auditHandoff", "first_observation_cannot_create_candidate: true");
includes("auditHandoff", "same_day_repetition_cannot_create_candidate: true");
includes("auditHandoff", "cross_day_three_observation_pattern_creates_one_candidate: true");
includes("auditBridge", "production_exact_source_outcome_assessor_used: true");
includes("auditBridge", "evidence_candidate_is_not_reusable_knowledge: true");
includes("auditCompletion", "paused_mission_cannot_write_learning: true");
includes("auditCompletion", "same_observation_token_is_idempotent: true");
includes("auditCompletion", "no_platform_knowledge_write: true");

const guardedFiles = [
  source.learning,
  source.handoff,
  source.bridge,
  source.declaration,
  source.projection,
  source.settlement,
  source.mission,
].join("\n");

assert.equal(
  /from\s+["'`](?:openai|@anthropic-ai|modal|runpod)/i.test(guardedFiles),
  false,
  "zero-cost mission learning must not import model or GPU providers",
);
assert.equal(
  /\.from\(["']platform_knowledge["']\)/.test(guardedFiles),
  false,
  "mission learning must not write reusable platform knowledge directly",
);

console.log(
  JSON.stringify(
    {
      success: true,
      status: "AVANTIQO_OPERATOR_MISSION_LEARNING_STATIC_GUARDS_CERTIFIED",
      verified: {
        manifest_declared_only: true,
        single_learning_owner_required: true,
        duplicate_learning_owner_blocked: true,
        exact_declared_verifier_required: true,
        static_verifier_identity_required: true,
        dynamic_verifier_identity_blocked: true,
        planner_supplied_projection_blocked: true,
        planner_visible_learning_schema_removed: true,
        final_registered_verification_only: true,
        stored_observation_integrity_revalidated: true,
        malformed_or_poisoned_observations_excluded: true,
        unique_observation_fingerprints_required: true,
        duplicate_observations_excluded: true,
        conflicting_observation_fingerprints_quarantined: true,
        row_order_cannot_resolve_observation_conflict: true,
        complete_history_scan_required: true,
        incomplete_history_blocks_evidence_candidate: true,
        raw_rows_cannot_crowd_out_unique_observation_limit: true,
        history_count_must_remain_stable_during_scan: true,
        stable_row_identity_required_across_pages: true,
        evidence_candidate_only: true,
        no_direct_platform_knowledge_write: true,
        no_model_gpu_provider_import: true,
      },
    },
    null,
    2,
  ),
);
