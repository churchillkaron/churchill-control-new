import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const qc = read("lib/creative/continuity/runtime/CreativeContinuityQualityGateBootstrap.js");
const conflict = read("lib/creative/continuity/runtime/CreativeCinematicContinuityConflictGate.js");
const repair = read("lib/creative/continuity/runtime/CreativeCinematicContinuityAutoRepairBootstrap.js");
const memory = read("lib/creative/continuity/runtime/CreativeCinematicStateMemoryBootstrap.js");
const authority = read("lib/creative/continuity/runtime/CreativeContinuityQcAuthorityGuardBootstrap.js");
const perceptual = read("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js");
const worldClass = read("lib/creative/quality/runtime/CreativeWorldClassQualityBootstrap.js");
const endpoint = read("lib/creative/quality/runtime/CreativeCinemaEndpointFidelityExecutionGate.js");
const bridge = read("lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap.js");
const instrumentation = read("instrumentation.js");

assert.match(qc, /AVANTIQO_CONTINUITY_QC_GATE_V1/);
assert.match(qc, /AVANTIQO_CONTINUITY_QC_SEAL_V1/);
assert.match(qc, /GENERATED_MEDIA_CONTINUITY_OBSERVATION_V1/);
assert.match(qc, /WAITING_FOR_PREVIOUS_APPROVED_STATE/);
assert.match(qc, /continuity_qc_provider_call_blocked_while_waiting:\s*true/);
assert.match(qc, /continuity_reset_authorized/);
assert.match(qc, /expected_contract_hash/);
assert.match(qc, /previous_state_hash/);
assert.match(qc, /aggregate_score_cannot_override_continuity_failure:\s*true/);
assert.match(qc, /explicit_evidence_required_for_hard_temporal_checks:\s*true/);
assert.match(qc, /human_anatomy_identity_performance_checks_fail_closed:\s*true/);
assert.match(qc, /source_generation_not_released_without_qc_seal:\s*true/);
assert.match(qc, /fail_closed:\s*true/);

for (const dimension of [
  "opening_state",
  "progression",
  "closing_state",
  "environment",
  "lighting",
  "camera_path",
  "screen_direction",
  "action_match",
  "geometry_stability",
  "artifact_stability",
  "performance",
  "body_motion",
  "hands_limbs",
  "eyeline",
  "identity",
  "wardrobe",
  "hair_makeup",
  "product_prop",
  "aerial_motion",
  "horizon_spatial_stability",
  "endpoint_handoff",
]) {
  assert.match(qc, new RegExp(dimension));
}

for (const evidence of [
  "hand_integrity_valid",
  "limb_topology_valid",
  "body_proportions_preserved",
  "face_geometry_preserved",
  "identity_consistent_across_frames",
  "natural_pose",
  "performance_valid",
  "camera_path_valid",
  "screen_direction_valid",
  "eyeline_valid",
  "action_match_valid",
  "aerial_motion_valid",
  "extra_limbs_detected",
  "missing_limbs_detected",
  "malformed_hands_detected",
  "duplicate_subject_detected",
  "face_identity_drift_detected",
  "body_identity_drift_detected",
  "foot_sliding_detected",
  "object_contact_discontinuity_detected",
  "object_geometry_drift_detected",
  "camera_teleportation_detected",
  "temporal_warping_detected",
  "environment_instability_detected",
]) {
  assert.match(qc, new RegExp(evidence));
}

assert.match(qc, /LOCOMOTION\.test\(action\)[\s\S]*foot_sliding_detected/);
assert.match(qc, /CONTACT\.test\(action\)[\s\S]*object_contact_discontinuity_detected/);
assert.match(qc, /CONTACT\.test\(action\)[\s\S]*object_geometry_drift_detected/);
assert.match(qc, /continuity_qc_sealed:\s*true/);
assert.match(qc, /continuity_qc_sealed:\s*false/);
assert.match(qc, /rejected_before_editing:\s*true/);
assert.match(qc, /perceptual_validation_failed:\s*true/);

assert.match(conflict, /explicit_conflicting_state_requires_story_authority:\s*true/);
assert.match(conflict, /accidental_conflicts_block_before_provider_submission:\s*true/);
assert.match(conflict, /pre_gpu:\s*true/);
assert.match(repair, /canonical_shot_mutated:\s*false/);
assert.match(repair, /canonical_story_mutated:\s*false/);
assert.match(repair, /restore_only_reviewed_authoritative_state:\s*true/);
assert.match(repair, /fail_closed_when_deterministic_repair_cannot_pass:\s*true/);

assert.match(perceptual, /minimum_continuity_score/);
assert.match(perceptual, /minimum_physics_score/);
assert.match(perceptual, /analyzedImageCount[^;]*>=\s*7|analyzedImageCount\s*!==\s*null\s*&&\s*analyzedImageCount\s*>=\s*7/);
assert.match(perceptual, /generated_media_released_for_downstream:\s*true/);
assert.match(perceptual, /rejected_before_editing:\s*true/);

assert.match(worldClass, /minimum_continuity_score:\s*96/);
assert.match(worldClass, /minimum_physics_score:\s*96/);
assert.match(worldClass, /minimum_identity_score:\s*98/);
assert.match(worldClass, /minimum_anatomy_score:\s*97/);
assert.match(worldClass, /minimum_artifact_score:\s*98/);
assert.match(worldClass, /weakest_link_quality_gate:\s*true/);

assert.match(endpoint, /CREATIVE_CINEMA_ENDPOINT_FIDELITY_V1/);
assert.match(endpoint, /compareImages/);
assert.match(endpoint, /first_frame/);
assert.match(endpoint, /last_frame/);
assert.match(endpoint, /provider_calls_added:\s*0/);

assert.match(memory, /reviewed_only:\s*true/);
assert.match(memory, /chain_hash/);
assert.match(memory, /failed_or_superseded_outputs_excluded:\s*true/);

assert.match(authority, /AVANTIQO_CONTINUITY_QC_AUTHORITY_GUARD_V1/);
assert.match(authority, /MATCHED_CONTINUITY_QC_SEAL_REQUIRED/);
assert.match(authority, /continuity_qc_authority_rollback_applied:\s*true/);
assert.match(authority, /approved_for_downstream_after_perceptual_review:\s*false/);
assert.match(authority, /generated_media_released_for_downstream:\s*false/);
assert.match(authority, /cinematic_state_authority_requires_continuity_qc_seal:\s*true/);
assert.match(authority, /fail_closed:\s*true/);

assert.match(bridge, /AVANTIQO_CONTINUITY_QC_GATE_V1/);
assert.match(bridge, /AVANTIQO_CONTINUITY_QC_SEAL_V1/);
assert.match(bridge, /continuityQcPassed/);
assert.match(bridge, /shot_candidate_continuity_qc_passed/);
assert.match(bridge, /continuityPassed\s*&&\s*humanQualityPassed/);
assert.match(bridge, /include_in_master:\s*passed/);

const qcIndex = instrumentation.indexOf("CreativeContinuityQualityGateBootstrap");
const worldClassIndex = instrumentation.indexOf("CreativeWorldClassQualityBootstrap");
const endpointIndex = instrumentation.indexOf("CreativeCinemaEndpointFidelityExecutionGate");
const memoryIndex = instrumentation.indexOf("CreativeCinematicStateMemoryBootstrap");
const authorityIndex = instrumentation.indexOf("CreativeContinuityQcAuthorityGuardBootstrap");
const candidateIndex = instrumentation.indexOf("CreativePerceptualCandidateSelectionBridgeBootstrap");
assert.ok(qcIndex >= 0);
assert.ok(worldClassIndex > qcIndex);
assert.ok(endpointIndex > worldClassIndex);
assert.ok(memoryIndex > endpointIndex);
assert.ok(authorityIndex > memoryIndex);
assert.ok(candidateIndex > authorityIndex);

console.log("AVANTIQO_STUDIO_CONTINUITY_QC_CONTRACT=PASS");
