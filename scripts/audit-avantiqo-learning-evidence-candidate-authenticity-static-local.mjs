import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  authenticity: "lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js",
  mission: "lib/intelligence/runtime/AvantiqoMissionOutcomeLearningRuntime.js",
  missionBase: "lib/intelligence/runtime/AvantiqoMissionOutcomeLearningAuthenticatedObservationRuntime.js",
  bridge: "lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeRuntime.js",
  bridgeCore: "lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateBridgeCoreRuntime.js",
  audit: "scripts/audit-avantiqo-learning-evidence-candidate-authenticity-local.mjs",
  workflow: ".github/workflows/avantiqo-intelligence-mission-outcome-learning-audit.yml",
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

includes("authenticity", "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_V1");
includes("authenticity", '"HMAC-SHA256"');
includes("authenticity", "avantiqo-learning-evidence-candidate-authenticity-v1");
includes("authenticity", 'createHmac("sha256", key)');
includes("authenticity", "createSecretKey");
includes("authenticity", "timingSafeEqual");
includes("authenticity", "organization_id:");
includes("authenticity", "memory_scope:");
includes("authenticity", "memory_key:");
includes("authenticity", "content:");
includes("authenticity", "metadata,");
includes("authenticity", "delete metadata.evidence_candidate_authenticity_mac");
includes("authenticity", "database_stored_secret_allowed: false");
includes("authenticity", "key_rotation_supported: true");

includes("mission", "sealAvantiqoLearningEvidenceCandidateAuthenticity");
includes("mission", "sealCandidateWriteValue");
includes("mission", 'value.memory_scope !== EVIDENCE_CANDIDATE_SCOPE');
includes("mission", 'builderProperty === "upsert"');
includes("mission", "evidence_candidate_authenticity_sealed_before_persistence");
includes("mission", "database_only_writer_cannot_reseal_evidence_candidate_without_server_key: true");
includes("missionBase", "observation_authenticity_required: true");
includes("missionBase", "HISTORY_SNAPSHOT_MANIFEST_CHANGED_BETWEEN_PASSES");

includes("bridge", "createAvantiqoLearningEvidenceCandidateAuthenticityVerifier");
includes("bridge", "verifier.verify(row)");
includes("bridge", "EVIDENCE_CANDIDATE_AUTHENTICITY_REQUIRED");
includes("bridge", "EVIDENCE_CANDIDATE_AUTHENTICITY_KEYRING_REQUIRED");
includes("bridge", "unsigned_candidate_compatibility_allowed: false");
includes("bridge", "organization_id,party_id,entity_id,conversation_id,source_turn_id");
includes("bridge", "evidence_candidate_authenticity_verified: true");
includes("bridgeCore", "candidate_is_not_reusable_knowledge: true");
includes("bridgeCore", "explicit_final_promotion_required: true");

includes("audit", "database_mutation_without_server_key_rejected: true");
includes("audit", "unsigned_candidate_cannot_enter_mechanism_review: true");
includes("audit", "observation_mac_cannot_be_replayed_as_candidate_mac: true");
includes("audit", "rotation_accepts_old_key_only_while_retained: true");
includes("audit", "secret_key_material_not_persisted: true");

includes("workflow", "AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js");
includes("workflow", "Run evidence candidate authenticity audit");
includes("workflow", "Run evidence candidate authenticity source guard");

assert.equal(
  /NEXT_PUBLIC_AVANTIQO_MISSION_OUTCOME_AUTH/i.test(source.authenticity),
  false,
  "candidate authenticity must never use a public key environment variable",
);
assert.equal(
  /(?:OPENAI|ANTHROPIC|MODAL|RUNPOD).*AUTH_KEYRING/i.test(source.authenticity),
  false,
  "candidate authenticity must not depend on model or GPU provider credentials",
);
assert.equal(
  /\.from\(["']platform_knowledge["']\)/.test(
    `${source.authenticity}\n${source.mission}\n${source.bridge}`,
  ),
  false,
  "candidate authenticity boundary must not write reusable platform knowledge",
);

console.log(JSON.stringify({
  success: true,
  status: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_STATIC_GUARDS_CERTIFIED",
  verified: {
    candidate_hmac_source_inspected: true,
    domain_separation_source_inspected: true,
    candidate_write_boundary_sealing_inspected: true,
    bridge_verification_before_admission_inspected: true,
    unsigned_compatibility_forbidden: true,
    organization_scope_key_content_and_metadata_bound: true,
    certified_observation_runtime_preserved: true,
    structural_bridge_core_preserved: true,
    provider_gpu_modal_independent: true,
  },
}, null, 2));
