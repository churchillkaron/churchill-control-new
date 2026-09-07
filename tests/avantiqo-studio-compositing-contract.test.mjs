import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/compositing/runtime/CreativeCompositingRuntime.js");
const authoring = read("lib/creative/compositing/runtime/CreativeCompositingAuthoringRuntime.js");
const planning = read("lib/creative/compositing/runtime/CreativeCompositingPlanningBootstrap.js");
const renderer = read("lib/creative/compositing/runtime/CreativeLayeredCompositingRenderRuntime.js");
const project = read("lib/creative/compositing/runtime/CreativeProjectCompositingBootstrap.js");
const shot = read("lib/creative/shots/documents/Shot.js");
const instrumentation = read("instrumentation.js");

assert.match(runtime, /AVANTIQO_COMPOSITING_V1/);
assert.match(runtime, /provider_neutral:\s*true/);
assert.match(runtime, /provider_prompt_persisted:\s*false/);
assert.match(runtime, /execution_authorship_forbidden:\s*true/);
assert.match(runtime, /BASE_PLATE/);
assert.match(runtime, /SET_EXTENSION/);
assert.match(runtime, /SIMULATION_PASS/);
assert.match(runtime, /VFX_ELEMENT/);
assert.match(runtime, /SCREEN_INSERT/);
assert.match(runtime, /FOREGROUND_HOLDOUT/);
assert.match(runtime, /ATMOSPHERE/);
assert.match(runtime, /LIGHTING_PASS/);
assert.match(runtime, /BEAUTY_CLEANUP/);
assert.match(runtime, /GRAPHIC_ELEMENT/);

for (const mode of [
  "NORMAL",
  "ADD",
  "SCREEN",
  "MULTIPLY",
  "OVERLAY",
  "LIGHTEN",
  "DARKEN",
]) {
  assert.match(runtime, new RegExp(`\\b${mode}\\b`));
}

for (const alpha of ["OPAQUE", "STRAIGHT", "LUMA_MATTE"]) {
  assert.match(runtime, new RegExp(alpha));
}

for (const field of [
  "asset_node_id",
  "production_task_id",
  "matte_asset_node_id",
  "z_index",
  "blend_mode",
  "alpha_mode",
  "opacity",
  "tracking_authority",
  "perspective_authority",
  "occlusion_authority",
  "edge_treatment",
  "color_light_match",
  "motion_blur_dof_match",
  "grain_texture_match",
]) {
  assert.match(runtime, new RegExp(field));
}

for (const blocker of [
  "COMPOSITING_LAYER_ROLE_INVALID",
  "COMPOSITING_LAYER_SOURCE_REQUIRED",
  "COMPOSITING_BLEND_MODE_INVALID",
  "COMPOSITING_ALPHA_MODE_INVALID",
  "COMPOSITING_MATTE_REQUIRED",
  "COMPOSITING_EDGE_TREATMENT_REQUIRED",
  "COMPOSITING_COLOR_LIGHT_MATCH_REQUIRED",
  "COMPOSITING_BLUR_DOF_MATCH_REQUIRED",
  "COMPOSITING_GRAIN_MATCH_REQUIRED",
  "COMPOSITING_OCCLUSION_AUTHORITY_REQUIRED",
  "COMPOSITING_SINGLE_BASE_PLATE_REQUIRED",
  "COMPOSITING_PREAUTHORED_CONTRACT_REQUIRED",
]) {
  assert.match(runtime, new RegExp(blocker));
}

assert.match(runtime, /STRAIGHT_ALPHA_INTERNAL_PREMULTIPLY_ONLY_AT_MERGE_BOUNDARY/);
assert.match(runtime, /COLOR_MANAGEMENT_MUST_BE_EXPLICIT_AT_RENDER_BACKEND/);
assert.match(runtime, /aggregate_beauty_cannot_override_edge_tracking_identity_or_geometry_failure:\s*true/);
assert.match(authoring, /AVANTIQO_COMPOSITING_AUTHORING_V1/);
assert.match(authoring, /compositing_authored_before_materialization:\s*true/);
assert.match(planning, /AVANTIQO_COMPOSITING_PLANNING_BOOTSTRAP_V1/);
assert.match(planning, /compositing_contracts_in_graph:\s*true/);
assert.match(planning, /execution_authorship_forbidden:\s*true/);
assert.match(renderer, /AVANTIQO_LAYERED_COMPOSITING_RENDER_V1/);
assert.match(renderer, /alphamerge/);
assert.match(renderer, /overlay=x=/);
assert.match(renderer, /blend=all_mode=/);
assert.match(renderer, /COMPOSITING_VFX_QC_SEAL_REQUIRED/);
assert.match(renderer, /COMPOSITING_SIMULATION_QC_SEAL_REQUIRED/);
assert.match(renderer, /COMPOSITING_BASE_WORLD_CLASS_REVIEW_REQUIRED/);
assert.match(renderer, /compositing_source_gate_passed:\s*true/);
assert.match(renderer, /compositing_rendered_deterministically:\s*true/);
assert.match(renderer, /compositing_actual_pixels_created:\s*true/);
assert.match(renderer, /compositing_requires_final_perceptual_review:\s*true/);
assert.match(project, /AVANTIQO_PROJECT_COMPOSITING_V1/);
assert.match(project, /BLOCKED_BY_COMPOSITING/);
assert.match(project, /CreativeLayeredCompositingRenderRuntime\.render/);
assert.match(project, /fail_closed:\s*true/);
assert.match(shot, /compositing:\s*structured\(data\.compositing\)/);
assert.match(shot, /compositing_intent_preserved:\s*true/);

const compositingPlanningIndex = instrumentation.indexOf("CreativeCompositingPlanningBootstrap");
const materializationIndex = instrumentation.indexOf("CreativeProductionTaskMaterializationGraphRuntime");
const candidateIndex = instrumentation.indexOf("CreativeShotCandidateQualityGateBootstrap");
const projectCompositingIndex = instrumentation.indexOf("CreativeProjectCompositingBootstrap");
const editorialIndex = instrumentation.indexOf("CreativeEditorialAssemblyRenderBootstrap");
assert.ok(compositingPlanningIndex >= 0);
assert.ok(materializationIndex > compositingPlanningIndex);
assert.ok(candidateIndex > materializationIndex);
assert.ok(projectCompositingIndex > candidateIndex);
assert.ok(editorialIndex > projectCompositingIndex);

console.log("AVANTIQO_STUDIO_COMPOSITING_CONTRACT=PASS");
