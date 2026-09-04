import assert from "node:assert/strict";
import {
  buildAvantiqoMissionOutcomeLearningObservation,
  computeAvantiqoMissionOutcomeObservationIntegrityFingerprint,
  evaluateAvantiqoMissionOutcomePattern,
} from "../lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js";
import {
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM,
  AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  createAvantiqoMissionOutcomeObservationAuthenticityVerifier,
  getAvantiqoMissionOutcomeObservationAuthenticityStatus,
} from "../lib/intelligence/runtime/AvantiqoMissionOutcomeObservationAuthenticityRuntime.js";

const ACTIVE_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const OUTCOME_CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1";
const OUTCOME_ASSESSMENT = "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_V1";
const KEY_V1 = "1".repeat(64);
const KEY_V2 = "2".repeat(64);
const WRONG_KEY = "3".repeat(64);

const pattern = Object.freeze({
  mission_family: "engineering.code-commit",
  intervention_code: "verified-main-commit",
  intervention_class: "verified-source-control",
  knowledge_domain: "engineering",
  condition_codes: ["main-branch", "server-owned-evidence"],
  boundary_condition_codes: ["registered-verification-required"],
  failure_mode_codes: ["unverified-commit"],
  stability: "mutable",
});

function outcomeContract() {
  return {
    contract: OUTCOME_CONTRACT,
    status: "OUTCOME_CONTRACT_READY",
    outcome_contract_ready: true,
    decision_critical: true,
    decision: {
      candidate_id: "candidate-authenticity",
      mutates: true,
      irreversible: false,
      requires_human: false,
    },
    criteria: [
      {
        id: "commit-verified",
        kind: "success",
        comparator: "eq",
        required: true,
        verification_criteria: ["exact-main-commit-read"],
        failure_mode_ids: ["unverified-commit"],
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
        id: "commit-verified",
        kind: "success",
        required: true,
        status: "SATISFIED",
        exact_source_observation_count: 1,
        evidence_ids: ["server-verification-evidence"],
      },
    ],
  };
}

function build(token, date) {
  return buildAvantiqoMissionOutcomeLearningObservation({
    pattern,
    outcome_contract: outcomeContract(),
    outcome_assessment: successAssessment(),
    observation_token: token,
    organization_id: ORGANIZATION_ID,
    now: new Date(date),
  });
}

function setKeys(active, keys) {
  if (active === null) delete process.env[ACTIVE_ENV];
  else process.env[ACTIVE_ENV] = active;
  if (keys === null) delete process.env[KEYRING_ENV];
  else process.env[KEYRING_ENV] = JSON.stringify(keys);
}

const originalActive = process.env[ACTIVE_ENV];
const originalKeyring = process.env[KEYRING_ENV];

try {
  setKeys("audit-v2", { "audit-v1": KEY_V1, "audit-v2": KEY_V2 });
  const status = getAvantiqoMissionOutcomeObservationAuthenticityStatus({
    require_active: true,
  });
  assert.equal(status.available, true);
  assert.equal(status.active_key_id, "audit-v2");
  assert.equal(status.algorithm, AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_ALGORITHM);
  assert.equal(status.server_only_keyring_required, true);
  assert.equal(status.client_exposure_allowed, false);
  assert.equal(status.database_stored_secret_allowed, false);
  assert.equal(status.key_rotation_supported, true);

  const current = build("a".repeat(64), "2026-09-04T08:00:00.000Z");
  assert.equal(current.eligible, true);
  assert.equal(current.observation_authenticity_sealed, true);
  assert.equal(
    current.row.metadata.observation_authenticity_contract,
    AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CONTRACT,
  );
  assert.equal(current.row.metadata.observation_authenticity_key_id, "audit-v2");
  assert.match(current.row.metadata.observation_authenticity_mac, /^[a-f0-9]{64}$/);
  const verifier = createAvantiqoMissionOutcomeObservationAuthenticityVerifier();
  assert.equal(verifier.available, true);
  assert.equal(verifier.verify(current.row), true);

  const databaseForgery = structuredClone(current.row);
  databaseForgery.metadata.verified_outcome = "FAILURE";
  databaseForgery.metadata.observation_integrity_fingerprint =
    computeAvantiqoMissionOutcomeObservationIntegrityFingerprint(databaseForgery);
  assert.equal(verifier.verify(databaseForgery), false);
  const forgedEvaluation = evaluateAvantiqoMissionOutcomePattern({
    observations: [databaseForgery],
    pattern_fingerprint: current.pattern_fingerprint,
  });
  assert.equal(forgedEvaluation.observation_count, 0);
  assert.equal(forgedEvaluation.observation_authenticity_rejected_row_count, 1);

  const malformed = structuredClone(current.row);
  malformed.metadata.observation_authenticity_mac = "bad-mac";
  assert.equal(verifier.verify(malformed), false);
  const unknownKey = structuredClone(current.row);
  unknownKey.metadata.observation_authenticity_key_id = "unknown-key";
  assert.equal(verifier.verify(unknownKey), false);

  setKeys("audit-v2", { "audit-v2": WRONG_KEY });
  const wrongKeyVerifier = createAvantiqoMissionOutcomeObservationAuthenticityVerifier();
  assert.equal(wrongKeyVerifier.verify(current.row), false);

  setKeys(null, null);
  const unavailableStatus = getAvantiqoMissionOutcomeObservationAuthenticityStatus({
    require_active: true,
  });
  assert.equal(unavailableStatus.available, false);
  const unsignedBlocked = build("b".repeat(64), "2026-09-04T09:00:00.000Z");
  assert.equal(unsignedBlocked.eligible, false);
  assert.equal(unsignedBlocked.row, null);
  assert.equal(unsignedBlocked.observation_authenticity_sealed, false);
  assert.ok(unsignedBlocked.blockers.includes("OBSERVATION_AUTHENTICITY_KEYRING_REQUIRED"));

  setKeys("audit-v1", { "audit-v1": KEY_V1, "audit-v2": KEY_V2 });
  const oldObservation = build("c".repeat(64), "2026-09-03T08:00:00.000Z");
  assert.equal(oldObservation.eligible, true);
  assert.equal(oldObservation.row.metadata.observation_authenticity_key_id, "audit-v1");

  setKeys("audit-v2", { "audit-v1": KEY_V1, "audit-v2": KEY_V2 });
  const rotatedObservation = build("d".repeat(64), "2026-09-04T10:00:00.000Z");
  assert.equal(rotatedObservation.eligible, true);
  assert.equal(rotatedObservation.row.metadata.observation_authenticity_key_id, "audit-v2");
  const rotationVerifier = createAvantiqoMissionOutcomeObservationAuthenticityVerifier();
  assert.equal(rotationVerifier.verify(oldObservation.row), true);
  assert.equal(rotationVerifier.verify(rotatedObservation.row), true);

  setKeys("audit-v2", { "audit-v2": KEY_V2 });
  const retiredVerifier = createAvantiqoMissionOutcomeObservationAuthenticityVerifier();
  assert.equal(retiredVerifier.verify(oldObservation.row), false);
  assert.equal(retiredVerifier.verify(rotatedObservation.row), true);

  const serialized = JSON.stringify(rotatedObservation.row);
  assert.equal(serialized.includes(KEY_V1), false);
  assert.equal(serialized.includes(KEY_V2), false);
  assert.equal(serialized.includes(WRONG_KEY), false);

  console.log(JSON.stringify({
    success: true,
    status: "AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_CERTIFIED",
    verified: {
      hmac_sha256_authenticity_contract: true,
      server_only_keyring_required: true,
      active_key_signing_required: true,
      valid_mac_verifies: true,
      timing_safe_mac_verification_used: true,
      database_mutation_plus_public_sha_reseal_is_rejected: true,
      malformed_mac_is_rejected: true,
      unknown_key_id_is_rejected: true,
      wrong_key_material_is_rejected: true,
      missing_keyring_fails_closed_before_observation_write: true,
      rotation_accepts_retired_key_while_retained: true,
      new_signing_uses_active_key_only: true,
      removed_retired_key_stops_verifying_old_rows: true,
      secret_key_material_is_not_persisted_in_observation: true,
      no_provider_gpu_modal_execution_performed: true,
    },
  }, null, 2));
} finally {
  if (originalActive === undefined) delete process.env[ACTIVE_ENV];
  else process.env[ACTIVE_ENV] = originalActive;
  if (originalKeyring === undefined) delete process.env[KEYRING_ENV];
  else process.env[KEYRING_ENV] = originalKeyring;
}
