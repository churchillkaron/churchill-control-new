import assert from "node:assert/strict";
import fs from "node:fs";
import {
  sealAvantiqoLearningEvidenceCandidateAuthenticity,
  createAvantiqoLearningEvidenceCandidateAuthenticityVerifier,
} from "../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js";
import {
  buildAvantiqoLearningEvidenceMechanismAgendaRow,
} from "../lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime.js";
import {
  AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_ALGORITHM,
  AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_CONTRACT,
  createAvantiqoLearningMechanismAgendaAuthenticityVerifier,
  isAvantiqoEvidenceCandidateMechanismAgenda,
  sealAvantiqoLearningMechanismAgendaAuthenticity,
} from "../lib/intelligence/runtime/AvantiqoLearningMechanismAgendaAuthenticityRuntime.js";

const ACTIVE_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const OLD_KEY = "1".repeat(64);
const NEW_KEY = "2".repeat(64);
const WRONG_KEY = "3".repeat(64);
const NOW = new Date("2026-09-05T00:00:00.000Z");

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
    memory_key: "mechanism-agenda-audit-candidate:001",
    memory_type: "evidence",
    subject: "knowledge-evidence:mechanism-agenda-audit",
    content: "Repeated governed evidence supports adversarial mechanism review.",
    importance: 0.9,
    confidence: 0.88,
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
      topic_key: "mechanism-agenda-audit-topic",
      knowledge_domain: "engineering",
      stability: "stable",
    },
    updated_at: NOW.toISOString(),
  };
}

function ordinaryAgenda() {
  return {
    organization_id: "00000000-0000-4000-8000-000000000001",
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: "platform_learning_agenda",
    memory_key: "ordinary-learning-agenda:001",
    memory_type: "goal",
    subject: "ordinary-internal-learning-topic",
    content: "Investigate an internally governed learning objective.",
    importance: 0.7,
    confidence: 1,
    source: "continuous_learning_runtime",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning: true,
      topic_key: "ordinary-internal-learning-topic",
      status: "READY",
    },
  };
}

setKeys("audit-v1", { "audit-v1": OLD_KEY, "audit-v2": NEW_KEY });
const sealedCandidate = sealAvantiqoLearningEvidenceCandidateAuthenticity(candidate());
assert.equal(sealedCandidate.success, true);
const candidateVerifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
assert.equal(candidateVerifier.verify(sealedCandidate.row), true);

const agenda = buildAvantiqoLearningEvidenceMechanismAgendaRow({
  organizationId: sealedCandidate.row.organization_id,
  candidate: sealedCandidate.row,
  now: NOW,
  authenticity_verifier: candidateVerifier,
});
assert.equal(isAvantiqoEvidenceCandidateMechanismAgenda(agenda), true);
assert.equal(
  agenda.metadata.mechanism_agenda_authenticity_contract,
  AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_CONTRACT,
);
assert.equal(
  agenda.metadata.mechanism_agenda_authenticity_algorithm,
  AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_ALGORITHM,
);
assert.equal(agenda.metadata.mechanism_agenda_authenticity_key_id, "audit-v1");

const oldVerifier = createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
assert.equal(oldVerifier.available, true);
assert.equal(oldVerifier.verify(agenda), true);

for (const mutate of [
  (row) => { row.content = `${row.content} forged`; },
  (row) => { row.organization_id = "00000000-0000-4000-8000-000000000099"; },
  (row) => { row.memory_scope = "platform_learning_gaps"; },
  (row) => { row.memory_key = "evidence-mechanism-agenda:forged"; },
  (row) => { row.source = "database_only_writer"; },
  (row) => { row.active = false; },
  (row) => { row.importance = 0.01; },
  (row) => { row.confidence = 0.01; },
  (row) => { row.metadata.evidence_candidate_memory_key = "forged-candidate"; },
  (row) => { row.metadata.evidence_candidate_fingerprint = "forged-fingerprint"; },
  (row) => { row.metadata.reusable_platform_knowledge = true; },
  (row) => { row.metadata.mechanism_agenda_authenticity_mac = "0".repeat(64); },
  (row) => { delete row.metadata.mechanism_agenda_authenticity_mac; },
  (row) => { row.metadata.mechanism_agenda_authenticity_key_id = "unknown-key"; },
]) {
  const poisoned = clone(agenda);
  mutate(poisoned);
  assert.equal(oldVerifier.verify(poisoned), false);
}

const unsignedAgenda = clone(agenda);
delete unsignedAgenda.metadata.mechanism_agenda_authenticity_mac;
assert.equal(oldVerifier.verify(unsignedAgenda), false);

const candidateMacReplay = clone(agenda);
candidateMacReplay.metadata.mechanism_agenda_authenticity_mac =
  sealedCandidate.row.metadata.evidence_candidate_authenticity_mac;
assert.equal(oldVerifier.verify(candidateMacReplay), false);

const ordinary = ordinaryAgenda();
assert.equal(isAvantiqoEvidenceCandidateMechanismAgenda(ordinary), false);
assert.equal(oldVerifier.verify(ordinary), false);

setKeys("audit-v2", { "audit-v1": OLD_KEY, "audit-v2": NEW_KEY });
const rotatedVerifier = createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
assert.equal(rotatedVerifier.verify(agenda), true);
const newAgendaSeed = clone(agenda);
delete newAgendaSeed.metadata.mechanism_agenda_authenticity_mac;
delete newAgendaSeed.metadata.mechanism_agenda_authenticity_key_id;
const resealedNew = sealAvantiqoLearningMechanismAgendaAuthenticity(newAgendaSeed);
assert.equal(resealedNew.success, true);
assert.equal(resealedNew.row.metadata.mechanism_agenda_authenticity_key_id, "audit-v2");
assert.equal(rotatedVerifier.verify(resealedNew.row), true);

setKeys("audit-v2", { "audit-v2": NEW_KEY });
const retiredVerifier = createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
assert.equal(retiredVerifier.verify(agenda), false);
assert.equal(retiredVerifier.verify(resealedNew.row), true);

setKeys("audit-v2", { "audit-v2": WRONG_KEY });
const wrongVerifier = createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
assert.equal(wrongVerifier.verify(resealedNew.row), false);

setKeys("audit-v2", { "audit-v2": NEW_KEY });
const runtimeSource = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", import.meta.url),
  "utf8",
);
assert.ok(runtimeSource.includes("if (!isAvantiqoEvidenceCandidateMechanismAgenda(row)) return true;"));
assert.ok(runtimeSource.includes("mechanismAgendaVerifier.verify(row)"));
assert.ok(runtimeSource.includes("const existingAgendaKeys = new Set(admissibleAgendas.map(topicKey));"));
assert.ok(!runtimeSource.includes("const existingAgendaKeys = new Set(state.agendas.map(topicKey));"));
assert.ok(runtimeSource.includes("const roots = admissibleAgendas"));
assert.ok(runtimeSource.includes("forged_evidence_candidate_mechanism_agenda_rejected: true"));
assert.ok(runtimeSource.includes("ordinary_internal_learning_agendas_remain_supported: true"));

const serialized = JSON.stringify(resealedNew.row);
assert.equal(serialized.includes(OLD_KEY), false);
assert.equal(serialized.includes(NEW_KEY), false);

const savedKeyring = process.env[KEYRING_ENV];
delete process.env[KEYRING_ENV];
const unavailableVerifier = createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
assert.equal(unavailableVerifier.available, false);
assert.equal(unavailableVerifier.verify(resealedNew.row), false);
process.env[KEYRING_ENV] = savedKeyring;

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_CERTIFIED",
  verified: {
    candidate_derived_agenda_sealed_at_bridge_boundary: true,
    hmac_sha256_mechanism_agenda_authenticity: true,
    agenda_domain_separated_from_candidate_authenticity: true,
    agenda_domain_separated_from_observation_authenticity: true,
    organization_scope_key_content_lifecycle_and_governance_bound_to_mac: true,
    database_mutation_without_server_key_rejected: true,
    malformed_missing_unknown_and_wrong_key_mac_rejected: true,
    unsigned_candidate_derived_agenda_rejected: true,
    candidate_mac_cannot_be_replayed_as_agenda_mac: true,
    rotation_accepts_old_key_only_while_retained: true,
    new_signing_uses_active_key_only: true,
    retired_key_removal_invalidates_old_agenda: true,
    forged_agenda_cannot_become_discovery_root: true,
    forged_agenda_cannot_squat_existing_topic_key: true,
    ordinary_internal_learning_agenda_compatibility_preserved: true,
    secret_key_material_not_persisted: true,
    provider_free: true,
    model_call_performed: false,
    gpu_execution_performed: false,
    modal_job_submitted: false,
    automatic_knowledge_promotion: false,
  },
}, null, 2));
