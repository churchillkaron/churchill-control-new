import assert from "node:assert/strict";
import {
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
  createAvantiqoLearningEvidenceCandidateAuthenticityVerifier,
  sealAvantiqoLearningEvidenceCandidateAuthenticity,
} from "../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js";
import {
  sealAvantiqoMissionOutcomeObservationAuthenticity,
} from "../lib/intelligence/runtime/AvantiqoMissionOutcomeObservationAuthenticityRuntime.js";
import {
  assessAvantiqoLearningEvidenceCandidateBridgeEligibility,
  buildAvantiqoLearningEvidenceMechanismAgendaRow,
} from "../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime.js";

const ACTIVE_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const OLD_KEY = "1".repeat(64);
const NEW_KEY = "2".repeat(64);
const WRONG_KEY = "3".repeat(64);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setKeys(active, keys) {
  process.env[ACTIVE_ENV] = active;
  process.env[KEYRING_ENV] = JSON.stringify(keys);
}

function candidate() {
  return {
    organization_id: "00000000-0000-4000-8000-000000000001",
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_evidence_candidates",
    memory_key: "audit-candidate:001",
    memory_type: "evidence",
    subject: "knowledge-evidence:audit",
    content: "Repeated governed evidence supports investigating a bounded mechanism.",
    importance: 0.86,
    confidence: 0.84,
    source: "continuous_learning_evidence_candidate",
    active: true,
    valid_until: "2030-01-01T00:00:00.000Z",
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1",
      epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true,
      requires_epistemic_promotion_pipeline: true,
      customer_private_memory: false,
      customer_private_content_included: false,
      direct_platform_knowledge_write_allowed: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      source_count: 2,
      sources: [
        { url: "https://example.com/a", official: true, primary: true },
        { url: "https://example.org/b", official: false, primary: false },
      ],
      evidence_status: "SUPPORTED",
      topic_key: "audit-topic",
      knowledge_domain: "engineering",
      stability: "stable",
    },
    updated_at: "2026-09-04T00:00:00.000Z",
  };
}

setKeys("audit-v1", { "audit-v1": OLD_KEY, "audit-v2": NEW_KEY });
const sealedOld = sealAvantiqoLearningEvidenceCandidateAuthenticity(candidate());
assert.equal(sealedOld.success, true);
assert.equal(
  sealedOld.row.metadata.evidence_candidate_authenticity_contract,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
);
assert.equal(
  sealedOld.row.metadata.evidence_candidate_authenticity_algorithm,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
);
assert.equal(sealedOld.row.metadata.evidence_candidate_authenticity_key_id, "audit-v1");
const oldVerifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
assert.equal(oldVerifier.verify(sealedOld.row), true);

const admitted = assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
  sealedOld.row,
  { now: new Date("2026-09-04T00:00:00.000Z"), authenticity_verifier: oldVerifier },
);
assert.equal(admitted.eligible, true);
assert.equal(admitted.evidence_candidate_authenticity_verified, true);
const agenda = buildAvantiqoLearningEvidenceMechanismAgendaRow({
  organizationId: sealedOld.row.organization_id,
  candidate: sealedOld.row,
  now: new Date("2026-09-04T00:00:00.000Z"),
  authenticity_verifier: oldVerifier,
});
assert.equal(agenda.metadata.evidence_candidate_authenticity_verified, true);
assert.equal(agenda.metadata.unsigned_candidate_compatibility_allowed, false);

for (const mutate of [
  (row) => { row.content = `${row.content} forged`; },
  (row) => { row.organization_id = "00000000-0000-4000-8000-000000000099"; },
  (row) => { row.memory_scope = "platform_learning_agenda"; },
  (row) => { row.memory_key = "audit-candidate:forged"; },
  (row) => { row.metadata.source_count = 99; },
  (row) => { row.metadata.reusable_platform_knowledge = true; },
  (row) => { row.metadata.evidence_candidate_authenticity_mac = "0".repeat(64); },
  (row) => { delete row.metadata.evidence_candidate_authenticity_mac; },
  (row) => { row.metadata.evidence_candidate_authenticity_key_id = "unknown-key"; },
]) {
  const poisoned = clone(sealedOld.row);
  mutate(poisoned);
  assert.equal(oldVerifier.verify(poisoned), false);
  const assessment = assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
    poisoned,
    { now: new Date("2026-09-04T00:00:00.000Z"), authenticity_verifier: oldVerifier },
  );
  assert.equal(assessment.eligible, false);
}

const unsigned = candidate();
const unsignedAssessment = assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
  unsigned,
  { now: new Date("2026-09-04T00:00:00.000Z"), authenticity_verifier: oldVerifier },
);
assert.equal(unsignedAssessment.eligible, false);
assert.ok(unsignedAssessment.blockers.includes("EVIDENCE_CANDIDATE_AUTHENTICITY_REQUIRED"));

setKeys("audit-v2", { "audit-v1": OLD_KEY, "audit-v2": NEW_KEY });
const rotatedVerifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
assert.equal(rotatedVerifier.verify(sealedOld.row), true);
const sealedNew = sealAvantiqoLearningEvidenceCandidateAuthenticity(candidate());
assert.equal(sealedNew.success, true);
assert.equal(sealedNew.row.metadata.evidence_candidate_authenticity_key_id, "audit-v2");
assert.equal(rotatedVerifier.verify(sealedNew.row), true);

setKeys("audit-v2", { "audit-v2": NEW_KEY });
const retiredVerifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
assert.equal(retiredVerifier.verify(sealedOld.row), false);
assert.equal(retiredVerifier.verify(sealedNew.row), true);

setKeys("audit-v2", { "audit-v2": WRONG_KEY });
const wrongVerifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
assert.equal(wrongVerifier.verify(sealedNew.row), false);

setKeys("audit-v2", { "audit-v2": NEW_KEY });
const observationSigned = sealAvantiqoMissionOutcomeObservationAuthenticity(candidate());
assert.equal(observationSigned.success, true);
const crossProtocolForgery = candidate();
crossProtocolForgery.metadata.evidence_candidate_authenticity_contract =
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT;
crossProtocolForgery.metadata.evidence_candidate_authenticity_algorithm =
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM;
crossProtocolForgery.metadata.evidence_candidate_authenticity_key_id = "audit-v2";
crossProtocolForgery.metadata.evidence_candidate_authenticity_mac =
  observationSigned.row.metadata.observation_authenticity_mac;
assert.equal(
  createAvantiqoLearningEvidenceCandidateAuthenticityVerifier().verify(crossProtocolForgery),
  false,
);

const serialized = JSON.stringify(sealedNew.row);
assert.equal(serialized.includes(OLD_KEY), false);
assert.equal(serialized.includes(NEW_KEY), false);

const savedKeyring = process.env[KEYRING_ENV];
delete process.env[KEYRING_ENV];
const unavailableVerifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
assert.equal(unavailableVerifier.available, false);
const unavailableAssessment = assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
  sealedNew.row,
  { now: new Date("2026-09-04T00:00:00.000Z"), authenticity_verifier: unavailableVerifier },
);
assert.equal(unavailableAssessment.eligible, false);
assert.ok(
  unavailableAssessment.blockers.includes("EVIDENCE_CANDIDATE_AUTHENTICITY_KEYRING_REQUIRED"),
);
process.env[KEYRING_ENV] = savedKeyring;

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CERTIFIED",
  verified: {
    hmac_sha256_candidate_authenticity: true,
    candidate_domain_separated_from_observation_authenticity: true,
    organization_scope_key_content_and_governance_bound_to_mac: true,
    database_mutation_without_server_key_rejected: true,
    malformed_missing_unknown_and_wrong_key_mac_rejected: true,
    unsigned_candidate_cannot_enter_mechanism_review: true,
    authenticated_candidate_enters_mechanism_review: true,
    rotation_accepts_old_key_only_while_retained: true,
    new_signing_uses_active_key_only: true,
    retired_key_removal_invalidates_old_candidate: true,
    observation_mac_cannot_be_replayed_as_candidate_mac: true,
    secret_key_material_not_persisted: true,
    provider_free: true,
    model_call_performed: false,
    gpu_execution_performed: false,
    modal_job_submitted: false,
  },
}, null, 2));
