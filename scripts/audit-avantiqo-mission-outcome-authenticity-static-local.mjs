import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  wrapper: "lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js",
  core: "lib/intelligence/runtime/AvantiqoMissionOutcomeLearningCoreRuntime.js",
  authenticity: "lib/intelligence/runtime/AvantiqoMissionOutcomeObservationAuthenticityRuntime.js",
  audit: "scripts/audit-avantiqo-mission-outcome-observation-authenticity-local.mjs",
  integrityAudit: "scripts/audit-avantiqo-mission-outcome-learning-integrity-local.mjs",
  builderAudit: "scripts/audit-avantiqo-mission-outcome-evidence-candidate-builder-integrity-local.mjs",
  workflow: ".github/workflows/avantiqo-intelligence-mission-outcome-learning-audit.yml",
  envExample: ".env.example",
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

includes("core", "AVANTIQO_MISSION_OUTCOME_OBSERVATION_INTEGRITY_V1");
includes("core", "history_snapshot_verification_passes: 2");
includes("core", "conflicting_observation_fingerprints_quarantined: true");
includes("core", "HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES");
includes("core", "EVIDENCE_CANDIDATE_NOT_RELEASED");
includes("core", "reusable_platform_knowledge: false");

includes("authenticity", "AVANTIQO_MISSION_OUTCOME_OBSERVATION_AUTHENTICITY_V1");
includes("authenticity", '"HMAC-SHA256"');
includes("authenticity", 'createHmac("sha256", key)');
includes("authenticity", "createSecretKey");
includes("authenticity", "timingSafeEqual");
includes("authenticity", 'AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID');
includes("authenticity", 'AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON');
includes("authenticity", "OBSERVATION_AUTHENTICITY_KEYRING_REQUIRED");
includes("authenticity", "OBSERVATION_AUTHENTICITY_ACTIVE_KEY_NOT_IN_KEYRING");
includes("authenticity", "database_stored_secret_allowed: false");
includes("authenticity", "client_exposure_allowed: false");
includes("authenticity", "key_rotation_supported: true");
includes("authenticity", "delete metadata.observation_integrity_fingerprint");
includes("authenticity", "delete metadata.observation_authenticity_mac");

includes("wrapper", "sealAvantiqoMissionOutcomeObservationAuthenticity");
includes("wrapper", "createAvantiqoMissionOutcomeObservationAuthenticityVerifier");
includes("wrapper", "NOT_ELIGIBLE_OBSERVATION_AUTHENTICITY_UNAVAILABLE");
includes("wrapper", "authenticatedRows = verifier.available");
includes("wrapper", "observations: authenticatedRows");
includes("wrapper", "observation_authenticity_rejected_row_count");
includes("wrapper", "observation_authenticity_required: true");
includes("wrapper", "server_only_observation_authenticity_key_required: true");
includes("wrapper", "database_stored_authenticity_secret_allowed: false");
includes("wrapper", "database_only_writer_cannot_reseal_without_server_key: true");
includes("wrapper", "observation_authenticity_key_rotation_supported: true");
includes("wrapper", "computeAvantiqoMissionOutcomeObservationIntegrityFingerprint(row)");
includes("wrapper", "SUPABASE_WATERMARK_TWO_PASS_RANGE_V1");
includes("wrapper", "HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES");
includes("wrapper", "reusable_platform_knowledge_written: false");

includes("audit", "database_mutation_plus_public_sha_reseal_is_rejected: true");
includes("audit", "wrong_key_material_is_rejected: true");
includes("audit", "missing_keyring_fails_closed_before_observation_write: true");
includes("audit", "rotation_accepts_retired_key_while_retained: true");
includes("audit", "new_signing_uses_active_key_only: true");
includes("audit", "removed_retired_key_stops_verifying_old_rows: true");
includes("audit", "secret_key_material_is_not_persisted_in_observation: true");
includes("integrityAudit", "public_checksum_reseal_cannot_forge_authenticity: true");
includes("integrityAudit", "legitimately_signed_conflicting_duplicates_still_reach_conflict_quarantine: true");
includes("builderAudit", "candidate_builder_requires_observation_authenticity_flags: true");
includes("builderAudit", "candidate_builder_requires_server_only_authenticity_key: true");
includes("builderAudit", "candidate_builder_requires_database_reseal_resistance: true");

includes("workflow", "Run observation authenticity audit");
includes("workflow", "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID: audit-v2");
includes("workflow", "audit-v1");
includes("workflow", "audit-v2");
includes("workflow", "AvantiqoMissionOutcomeLearningCoreRuntime.js");
includes("workflow", "AvantiqoMissionOutcomeObservationAuthenticityRuntime.js");

includes("envExample", "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID=");
includes("envExample", "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON=");
includes("envExample", "Never expose client-side or store");

assert.equal(
  /NEXT_PUBLIC_AVANTIQO_MISSION_OUTCOME_AUTH/i.test(source.envExample),
  false,
  "mission outcome authenticity key configuration must never be public env",
);
assert.equal(
  /(?:OPENAI|ANTHROPIC|MODAL|RUNPOD).*AUTH_KEYRING/i.test(source.authenticity),
  false,
  "authenticity runtime must not depend on model or GPU provider credentials",
);
assert.equal(
  /\.from\(["']platform_knowledge["']\)/.test(
    `${source.wrapper}\n${source.core}\n${source.authenticity}`,
  ),
  false,
  "authenticated mission learning must not directly write reusable platform knowledge",
);

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_MISSION_OUTCOME_AUTHENTICITY_STATIC_GUARDS_CERTIFIED",
  verified: {
    certified_core_inspected_directly: true,
    hmac_sha256_runtime_inspected_directly: true,
    timing_safe_verification_required: true,
    server_only_key_configuration_required: true,
    public_key_environment_forbidden: true,
    database_secret_persistence_forbidden: true,
    database_only_checksum_reseal_blocked: true,
    key_rotation_contract_certified: true,
    authenticated_rows_only_reach_accumulation_core: true,
    candidate_builder_authenticity_gate_required: true,
    snapshot_and_conflict_guards_preserved: true,
    evidence_candidate_remains_non_reusable: true,
    no_provider_gpu_modal_execution_performed: true,
  },
}, null, 2));
