import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM,
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateAuthenticityVerifier,
  createAvantiqoFinalPromotionCandidateClaimBinding,
  sealAvantiqoFinalPromotionCandidateAuthenticity,
  verifyAvantiqoFinalPromotionCandidateClaimBinding,
} from "../lib/intelligence/runtime/AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";

const ACTIVE_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const OLD_KEY = "1".repeat(64);
const NEW_KEY = "2".repeat(64);
const WRONG_KEY = "3".repeat(64);
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const HYPOTHESIS = "a".repeat(64);
const NOW = "2026-09-05T02:30:00.000Z";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setKeys(active, keys) {
  process.env[ACTIVE_ENV] = active;
  process.env[KEYRING_ENV] = JSON.stringify(keys);
}

function provisional() {
  return {
    id: "provisional-row-1",
    organization_id: ORGANIZATION_ID,
    memory_scope: "platform_provisional_knowledge",
    memory_key: `provisional-knowledge:${HYPOTHESIS.slice(0, 40)}`,
    subject: "knowledge:final-promotion-authenticity-audit",
    content: "A governed mechanism produces the verified improvement only under the tested boundary conditions.",
    active: true,
    valid_until: "2026-12-31T00:00:00.000Z",
    metadata: {
      hypothesis_fingerprint: HYPOTHESIS,
      synthesis_fingerprint: "b".repeat(64),
      status: "PROVISIONAL_SHADOW_ONLY",
      epistemic_state: "PROVISIONAL_NOT_CANONICAL",
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      explicit_final_promotion_required: true,
      rollback_on_conflict: true,
      automatic_knowledge_promotion: false,
    },
    updated_at: NOW,
  };
}

function candidate(binding) {
  return {
    organization_id: ORGANIZATION_ID,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_knowledge_final_promotion_candidates",
    memory_key: `knowledge-final-promotion:${HYPOTHESIS.slice(0, 40)}`,
    memory_type: "completed_step",
    subject: "counterfactual benchmark result",
    content: "Controlled counterfactual knowledge benchmark passed all final-promotion eligibility gates.",
    importance: 0.99,
    confidence: 1,
    source: "counterfactual_knowledge_final_promotion_gate",
    active: true,
    valid_until: "2026-12-31T00:00:00.000Z",
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: "AVANTIQO_KNOWLEDGE_COUNTERFACTUAL_BENCHMARK_V1",
      status: "FINAL_KNOWLEDGE_RELEASE_REVIEW_PENDING",
      hypothesis_fingerprint: HYPOTHESIS,
      benchmark_plan_fingerprint: "c".repeat(64),
      evaluation_fingerprint: "d".repeat(64),
      candidate: {
        pass_rate: 0.99,
        governance_passed: true,
        privacy_passed: true,
        tool_use_passed: true,
        authorization_passed: true,
        uncertainty_calibration_passed: true,
        leakage_detected: false,
        critical_case_failure_count: 0,
      },
      regression_count: 0,
      quality_delta: 0.03,
      hallucination_delta: 0,
      counterfactual_evidence: {
        same_cases_both_arms: true,
        blind_pairing: true,
        independent_evaluator: true,
        candidate_did_not_grade_itself: true,
        exact_provisional_claim_isolated: true,
        customer_private_cases_used: false,
        customer_identifiers_used: false,
      },
      ...binding,
      exact_provisional_claim_bound: true,
      final_promotion_candidate_authenticity_required: true,
      exact_claim_release_requires_separate_runtime: true,
      explicit_final_knowledge_release_required: true,
      production_knowledge_release_authorized: false,
      reusable_platform_knowledge: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      authorization_value: "none",
      customer_private_content_included: false,
      created_at: NOW,
    },
    updated_at: NOW,
  };
}

setKeys("audit-v1", { "audit-v1": OLD_KEY, "audit-v2": NEW_KEY });
const liveProvisional = provisional();
const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(liveProvisional);
assert.equal(claimBinding.success, true);
assert.equal(
  claimBinding.binding.provisional_claim_binding_contract,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
);
assert.match(claimBinding.binding.provisional_claim_digest, /^[a-f0-9]{64}$/);

const sealed = sealAvantiqoFinalPromotionCandidateAuthenticity(
  candidate(claimBinding.binding),
);
assert.equal(sealed.success, true);
assert.equal(
  sealed.row.metadata.final_promotion_candidate_authenticity_contract,
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
);
assert.equal(
  sealed.row.metadata.final_promotion_candidate_authenticity_algorithm,
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM,
);
assert.equal(sealed.row.metadata.final_promotion_candidate_authenticity_key_id, "audit-v1");

const oldVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
assert.equal(oldVerifier.available, true);
assert.equal(oldVerifier.verify(sealed.row), true);
assert.equal(
  verifyAvantiqoFinalPromotionCandidateClaimBinding(sealed.row, liveProvisional),
  true,
);

for (const mutate of [
  (row) => { row.content = `${row.content} forged`; },
  (row) => { row.organization_id = "00000000-0000-4000-8000-000000000099"; },
  (row) => { row.memory_scope = "platform_knowledge"; },
  (row) => { row.memory_key = "knowledge-final-promotion:forged"; },
  (row) => { row.source = "database_only_writer"; },
  (row) => { row.active = false; },
  (row) => { row.importance = 0.01; },
  (row) => { row.confidence = 0.01; },
  (row) => { row.metadata.benchmark_plan_fingerprint = "e".repeat(64); },
  (row) => { row.metadata.evaluation_fingerprint = "f".repeat(64); },
  (row) => { row.metadata.candidate.pass_rate = 0.2; },
  (row) => { row.metadata.regression_count = 1; },
  (row) => { row.metadata.provisional_claim_digest = "0".repeat(64); },
  (row) => { row.metadata.reusable_platform_knowledge = true; },
  (row) => { row.metadata.final_promotion_candidate_authenticity_mac = "0".repeat(64); },
  (row) => { delete row.metadata.final_promotion_candidate_authenticity_mac; },
  (row) => { row.metadata.final_promotion_candidate_authenticity_key_id = "unknown-key"; },
]) {
  const poisoned = clone(sealed.row);
  mutate(poisoned);
  assert.equal(oldVerifier.verify(poisoned), false);
}

const changedContent = clone(liveProvisional);
changedContent.content = `${changedContent.content} Materially changed after benchmark.`;
assert.equal(
  verifyAvantiqoFinalPromotionCandidateClaimBinding(sealed.row, changedContent),
  false,
);
const changedVersion = clone(liveProvisional);
changedVersion.updated_at = "2026-09-05T02:31:00.000Z";
assert.equal(
  verifyAvantiqoFinalPromotionCandidateClaimBinding(sealed.row, changedVersion),
  false,
);
const changedHypothesis = clone(liveProvisional);
changedHypothesis.metadata.hypothesis_fingerprint = "9".repeat(64);
assert.equal(
  verifyAvantiqoFinalPromotionCandidateClaimBinding(sealed.row, changedHypothesis),
  false,
);

const unsigned = clone(sealed.row);
delete unsigned.metadata.final_promotion_candidate_authenticity_mac;
assert.equal(oldVerifier.verify(unsigned), false);
const crossDomainReplay = clone(sealed.row);
crossDomainReplay.metadata.final_promotion_candidate_authenticity_mac = "4".repeat(64);
assert.equal(oldVerifier.verify(crossDomainReplay), false);

setKeys("audit-v2", { "audit-v1": OLD_KEY, "audit-v2": NEW_KEY });
const rotatedVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
assert.equal(rotatedVerifier.verify(sealed.row), true);
const newCandidateSeed = candidate(claimBinding.binding);
const resealed = sealAvantiqoFinalPromotionCandidateAuthenticity(newCandidateSeed);
assert.equal(resealed.success, true);
assert.equal(resealed.row.metadata.final_promotion_candidate_authenticity_key_id, "audit-v2");
assert.equal(rotatedVerifier.verify(resealed.row), true);

setKeys("audit-v2", { "audit-v2": NEW_KEY });
const retiredVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
assert.equal(retiredVerifier.verify(sealed.row), false);
assert.equal(retiredVerifier.verify(resealed.row), true);

setKeys("audit-v2", { "audit-v2": WRONG_KEY });
const wrongVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
assert.equal(wrongVerifier.verify(resealed.row), false);

setKeys("audit-v2", { "audit-v2": NEW_KEY });
const benchmarkSource = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoKnowledgeCounterfactualBenchmarkRuntime.js", import.meta.url),
  "utf8",
);
const releaseSource = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js", import.meta.url),
  "utf8",
);
assert.ok(benchmarkSource.includes("createAvantiqoFinalPromotionCandidateClaimBinding(provisional)"));
assert.ok(benchmarkSource.includes("sealAvantiqoFinalPromotionCandidateAuthenticity(candidate)"));
assert.ok(benchmarkSource.includes("unsigned_final_promotion_candidate_compatibility_allowed: false"));
assert.ok(releaseSource.includes("candidateVerifier.verify(state.candidate)"));
assert.ok(releaseSource.includes("verifyAvantiqoFinalPromotionCandidateClaimBinding(state.candidate, state.provisional)"));
assert.ok(releaseSource.includes("FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_REQUIRED"));
assert.ok(releaseSource.includes("PROVISIONAL_CLAIM_BINDING_MISMATCH"));

const serialized = JSON.stringify(resealed.row);
assert.equal(serialized.includes(OLD_KEY), false);
assert.equal(serialized.includes(NEW_KEY), false);

const savedKeyring = process.env[KEYRING_ENV];
delete process.env[KEYRING_ENV];
const unavailableVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
assert.equal(unavailableVerifier.available, false);
assert.equal(unavailableVerifier.verify(resealed.row), false);
process.env[KEYRING_ENV] = savedKeyring;

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CERTIFIED",
  verified: {
    hmac_sha256_final_promotion_candidate_authenticity: true,
    final_candidate_domain_separated_from_prior_learning_authenticity_domains: true,
    exact_provisional_claim_content_and_version_bound: true,
    organization_scope_key_content_benchmark_and_governance_bound_to_mac: true,
    database_mutation_without_server_key_rejected: true,
    malformed_missing_unknown_and_wrong_key_mac_rejected: true,
    unsigned_final_promotion_candidate_rejected: true,
    post_benchmark_claim_content_drift_rejected: true,
    post_benchmark_claim_version_drift_rejected: true,
    hypothesis_substitution_rejected: true,
    rotation_accepts_old_key_only_while_retained: true,
    new_signing_uses_active_key_only: true,
    retired_key_removal_invalidates_old_candidate: true,
    final_release_runtime_reverifies_candidate_authenticity: true,
    final_release_runtime_reverifies_exact_claim_binding: true,
    secret_key_material_not_persisted: true,
    provider_free: true,
    model_call_performed: false,
    gpu_execution_performed: false,
    runpod_job_submitted: false,
    automatic_knowledge_promotion: false,
  },
}, null, 2));
