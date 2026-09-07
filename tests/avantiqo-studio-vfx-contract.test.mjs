import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/vfx/runtime/CreativeVfxRuntime.js");
const authoring = read("lib/creative/vfx/runtime/CreativeVfxAuthoringRuntime.js");
const planning = read("lib/creative/vfx/runtime/CreativeVfxPlanningBootstrap.js");
const execution = read("lib/creative/vfx/runtime/CreativeVfxExecutionGate.js");
const qc = read("lib/creative/vfx/runtime/CreativeVfxQualityGateBootstrap.js");
const bridge = read("lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap.js");
const instrumentation = read("instrumentation.js");

assert.match(runtime, /AVANTIQO_VFX_V1/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /provider_prompt_persisted:\s*false/);
assert.match(runtime, /execution_authorship_forbidden:\s*true/);
assert.match(runtime, /CLEANUP_REMOVAL/);
assert.match(runtime, /SET_EXTENSION/);
assert.match(runtime, /SCREEN_REPLACEMENT/);
assert.match(runtime, /ATMOSPHERIC/);
assert.match(runtime, /LIGHTING_EFFECT/);
assert.match(runtime, /PARTICLE_EFFECT/);
assert.match(runtime, /ENERGY_MAGIC/);
assert.match(runtime, /CREATURE_OBJECT_AUGMENT/);
assert.match(runtime, /BEAUTY_CLEANUP/);

for (const field of [
  "vfx_intent",
  "target_subject_or_region",
  "source_plate",
  "tracking_mode",
  "tracking_target",
  "mask_roto_strategy",
  "occlusion_depth_strategy",
  "temporal_entry",
  "temporal_progression",
  "temporal_exit",
  "perspective_scale",
  "motion_blur",
  "depth_of_field",
  "lighting_interaction",
  "color_exposure_match",
  "edge_integration",
  "grain_texture_match",
  "physical_plausibility",
  "anti_artifact_constraints",
  "provider_execution_order",
]) {
  assert.match(runtime, new RegExp(field));
}

for (const blocker of [
  "VFX_INTENT_REQUIRED",
  "VFX_TARGET_REQUIRED",
  "VFX_TEMPORAL_LIFECYCLE_REQUIRED",
  "VFX_TRACKING_TARGET_REQUIRED",
  "VFX_SCREEN_PLANAR_TRACK_REQUIRED",
  "VFX_SCREEN_MATTE_REQUIRED",
  "VFX_OCCLUSION_DEPTH_PLAN_REQUIRED",
  "VFX_PERSPECTIVE_SCALE_REQUIRED",
  "VFX_MOTION_BLUR_MATCH_REQUIRED",
  "VFX_DOF_MATCH_REQUIRED",
  "VFX_LIGHTING_INTERACTION_REQUIRED",
  "VFX_COLOR_EXPOSURE_MATCH_REQUIRED",
  "VFX_EDGE_INTEGRATION_REQUIRED",
  "VFX_GRAIN_TEXTURE_MATCH_REQUIRED",
  "VFX_PHYSICAL_PLAUSIBILITY_REQUIRED",
  "VFX_SIMULATION_CONTRACT_REQUIRED",
  "VFX_PREAUTHORED_CONTRACT_REQUIRED",
]) {
  assert.match(runtime, new RegExp(blocker));
}

assert.match(authoring, /AVANTIQO_VFX_AUTHORING_V1/);
assert.match(authoring, /vfx_authored_before_materialization:\s*true/);
assert.match(planning, /AVANTIQO_VFX_PLANNING_BOOTSTRAP_V1/);
assert.match(planning, /vfx_contracts_in_graph:\s*true/);
assert.match(planning, /execution_authorship_forbidden:\s*true/);
assert.match(execution, /AVANTIQO_VFX_EXECUTION_GATE_V1/);
assert.match(execution, /CreativeVfxRuntime\.assertReady/);
assert.match(execution, /vfx_verified_before_dispatch:\s*true/);
assert.match(execution, /vfx_execution_authored:\s*false/);
assert.match(execution, /fail_closed:\s*true/);

assert.match(qc, /AVANTIQO_VFX_QC_V1/);
assert.match(qc, /AVANTIQO_VFX_QC_SEAL_V1/);
assert.match(qc, /actual_rendered_frames_are_authority:\s*true/);
assert.match(qc, /aggregate_score_cannot_override_vfx_failure:\s*true/);
assert.match(qc, /identity_and_product_geometry_protected:\s*true/);
assert.match(qc, /temporal_edge_alpha_tracking_fail_closed:\s*true/);
assert.match(qc, /provider_calls_added:\s*0/);
assert.match(qc, /vfx_qc_sealed:\s*true/);
assert.match(qc, /vfx_qc_sealed:\s*false/);
assert.match(qc, /rejected_before_editing:\s*true/);

for (const dimension of [
  "tracking_lock",
  "mask_edge_integrity",
  "occlusion_depth",
  "perspective_scale",
  "temporal_stability",
  "motion_blur_depth_of_field",
  "lighting_shadow_reflection",
  "color_exposure",
  "grain_texture",
  "identity_product_geometry",
]) {
  assert.match(qc, new RegExp(dimension));
}

for (const evidence of [
  "vfx_temporal_stability_valid",
  "tracking_lock_valid",
  "mask_edge_integrity_valid",
  "occlusion_depth_valid",
  "perspective_scale_valid",
  "motion_blur_dof_match_valid",
  "lighting_color_match_valid",
  "grain_texture_match_valid",
  "identity_product_fidelity_preserved",
  "alpha_halo_detected",
  "color_spill_detected",
  "edge_chatter_detected",
  "tracking_slip_detected",
  "scale_pumping_detected",
  "perspective_drift_detected",
  "effect_teleportation_detected",
  "effect_temporal_popping_detected",
  "unintended_geometry_change_detected",
  "unintended_identity_change_detected",
]) {
  assert.match(qc, new RegExp(evidence));
}

assert.match(bridge, /AVANTIQO_VFX_QC_V1/);
assert.match(bridge, /AVANTIQO_VFX_QC_SEAL_V1/);
assert.match(bridge, /vfxQcPassed/);
assert.match(bridge, /shot_candidate_vfx_qc_passed/);
assert.match(bridge, /baseHardGatePassed\s*&&\s*vfxPassed/);
assert.match(bridge, /include_in_master:\s*passed/);

const vfxPlanningIndex = instrumentation.indexOf("CreativeVfxPlanningBootstrap");
const materializationIndex = instrumentation.indexOf("CreativeProductionTaskMaterializationGraphRuntime");
const vfxQcIndex = instrumentation.indexOf("CreativeVfxQualityGateBootstrap");
const continuityQcIndex = instrumentation.indexOf("CreativeContinuityQualityGateBootstrap");
const candidateIndex = instrumentation.indexOf("CreativePerceptualCandidateSelectionBridgeBootstrap");
assert.ok(vfxPlanningIndex >= 0);
assert.ok(materializationIndex > vfxPlanningIndex);
assert.ok(vfxQcIndex > materializationIndex);
assert.ok(continuityQcIndex > vfxQcIndex);
assert.ok(candidateIndex > continuityQcIndex);

console.log("AVANTIQO_STUDIO_VFX_CONTRACT=PASS");
