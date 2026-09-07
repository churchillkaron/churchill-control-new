import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/world/runtime/CreativeWorldConsistencyRuntime.js");
const authoring = read("lib/creative/world/runtime/CreativeWorldConsistencyAuthoringRuntime.js");
const planning = read("lib/creative/world/runtime/CreativeWorldConsistencyPlanningBootstrap.js");
const execution = read("lib/creative/world/runtime/CreativeWorldConsistencyExecutionGate.js");
const qc = read("lib/creative/world/runtime/CreativeWorldConsistencyQualityGateBootstrap.js");
const scene = read("lib/creative/scenes/documents/Scene.js");
const shot = read("lib/creative/shots/documents/Shot.js");
const instrumentation = read("instrumentation.js");

assert.match(runtime, /AVANTIQO_WORLD_CONSISTENCY_V1/);
assert.match(runtime, /SCENE_BASE_PLUS_SPARSE_SHOT_OVERRIDE/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /provider_prompt_persisted:\s*false/);
assert.match(runtime, /execution_authorship_forbidden:\s*true/);

for (const dimension of [
  "location_identity",
  "spatial_geography",
  "architecture_geometry",
  "production_design",
  "props_set_dressing",
  "materials_surfaces",
  "signage_readable_text",
  "lighting_sources_direction",
  "time_of_day",
  "weather",
  "atmosphere",
  "background_population",
  "scale_perspective",
]) {
  assert.match(runtime, new RegExp(dimension));
}

for (const policy of [
  "reviewed_rendered_state_becomes_authoritative_for_later_shots",
  "no_silent_architecture_or_geography_mutation",
  "no_prop_or_set_dressing_teleportation",
  "no_unmotivated_time_weather_or_lighting_reset",
  "readable_signage_and_brand_text_must_not_drift",
  "reflections_shadows_and_occlusion_must_match_world_geometry",
  "camera_angle_may_change_world_geometry_may_not",
  "generated_attractiveness_cannot_override_world_failure",
]) {
  assert.match(runtime, new RegExp(policy));
}

for (const blocker of [
  "WORLD_ID_REQUIRED",
  "WORLD_CHANGE_REASON_REQUIRED",
  "WORLD_UNAUTHORIZED_BASE_CONTRADICTION",
  "WORLD_CONTRACT_HASH_MISMATCH",
  "CREATIVE_WORLD_PREAUTHORED_CONTRACT_REQUIRED",
]) {
  assert.match(runtime + execution, new RegExp(blocker));
}

assert.match(authoring, /AVANTIQO_WORLD_CONSISTENCY_AUTHORING_V1/);
assert.match(authoring, /world_consistency_authored_before_materialization:\s*true/);
assert.match(planning, /AVANTIQO_WORLD_CONSISTENCY_PLANNING_BOOTSTRAP_V1/);
assert.match(planning, /world_consistency_contracts_in_graph:\s*true/);
assert.match(execution, /AVANTIQO_WORLD_CONSISTENCY_EXECUTION_GATE_V1/);
assert.match(execution, /CreativeWorldConsistencyRuntime\.assertReady/);
assert.match(execution, /world_consistency_verified_before_dispatch:\s*true/);
assert.match(execution, /fail_closed:\s*true/);

assert.match(qc, /AVANTIQO_WORLD_CONSISTENCY_QC_V1/);
assert.match(qc, /AVANTIQO_WORLD_CONSISTENCY_QC_SEAL_V1/);
assert.match(qc, /actual_rendered_frames_are_authority:\s*true/);
assert.match(qc, /aggregate_score_cannot_override_world_failure:\s*true/);
assert.match(qc, /camera_change_does_not_authorize_world_mutation:\s*true/);
assert.match(qc, /previous_reviewed_world_state_is_authority_when_available:\s*true/);
assert.match(qc, /world_consistency_qc_sealed:\s*true/);
assert.match(qc, /world_consistency_qc_sealed:\s*false/);
assert.match(qc, /rejected_before_editing:\s*true/);
assert.match(qc, /repair_instructions/);
assert.match(qc, /provider_calls_added:\s*0/);

for (const evidence of [
  "world_identity_preserved",
  "spatial_geography_valid",
  "architecture_geometry_valid",
  "production_design_valid",
  "props_set_dressing_valid",
  "materials_surfaces_valid",
  "lighting_world_valid",
  "scale_perspective_valid",
  "reflection_shadow_occlusion_valid",
  "environment_geometry_drift_detected",
  "architecture_mutation_detected",
  "prop_teleportation_detected",
  "set_dressing_drift_detected",
  "material_surface_drift_detected",
  "signage_text_drift_detected",
  "unmotivated_lighting_reset_detected",
  "unmotivated_time_weather_reset_detected",
  "background_population_teleportation_detected",
  "scale_perspective_drift_detected",
  "reflection_shadow_geometry_conflict_detected",
]) {
  assert.match(qc, new RegExp(evidence));
}

assert.match(scene, /world_state_preserved:\s*true/);
assert.match(scene, /architecture_geometry/);
assert.match(scene, /materials_surfaces/);
assert.match(scene, /signage_readable_text/);
assert.match(scene, /background_population/);
assert.match(shot, /world_consistency_intent_preserved:\s*true/);
assert.match(shot, /world_override/);
assert.match(shot, /world_reference_assets/);

const planningIndex = instrumentation.indexOf("CreativeWorldConsistencyPlanningBootstrap");
const materializationIndex = instrumentation.indexOf("CreativeProductionTaskMaterializationGraphRuntime");
const executionIndex = instrumentation.indexOf("CreativeWorldConsistencyExecutionGate");
const worldQcIndex = instrumentation.indexOf("CreativeWorldConsistencyQualityGateBootstrap");
const continuityQcIndex = instrumentation.indexOf("CreativeContinuityQualityGateBootstrap");
const candidateIndex = instrumentation.indexOf("CreativePerceptualCandidateSelectionBridgeBootstrap");
assert.ok(planningIndex >= 0);
assert.ok(materializationIndex > planningIndex);
assert.ok(executionIndex > planningIndex);
assert.ok(worldQcIndex > materializationIndex);
assert.ok(continuityQcIndex > worldQcIndex);
assert.ok(candidateIndex > continuityQcIndex);

console.log("AVANTIQO_STUDIO_WORLD_CONSISTENCY_CONTRACT=PASS");
