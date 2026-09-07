import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const craft = fs.readFileSync(
  "lib/creative/video/runtime/CreativeProfessionalFilmCraftRuntime.js",
  "utf8",
);
const native = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoNativeControlRuntime.js",
  "utf8",
);
const router = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoEngineRouter.js",
  "utf8",
);
const dispatch = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js",
  "utf8",
);

test("professional filmcraft governs all eight advanced filmmaking layers", () => {
  assert.match(craft, /AVANTIQO_PROFESSIONAL_FILMCRAFT_V1/);
  for (const field of [
    "lens_character",
    "movement_choreography",
    "performance_control",
    "editorial_micro_rhythm",
    "sound_perspective",
    "look_development",
    "optical_practical_fx",
  ]) assert.match(craft, new RegExp(field));
  assert.match(craft, /motion_reference_asset_id/);
  assert.match(craft, /performance_reference_asset_id/);
});

test("the rest of professional craft includes focus spatial transition and QC governance", () => {
  assert.match(craft, /focus_choreography/);
  assert.match(craft, /spatial_continuity/);
  assert.match(craft, /transition_choreography/);
  assert.match(craft, /craft_qc/);
  assert.match(craft, /axis_180/);
  assert.match(craft, /novelty_transition_forbidden_without_motivation/);
  assert.match(craft, /no_spectacle_only_fx/);
});

test("lens character models optical behavior instead of focal length alone", () => {
  for (const field of [
    "projection", "squeeze_ratio", "distortion", "breathing",
    "flare_response", "bokeh_character", "edge_falloff",
    "highlight_behavior", "diffusion", "close_focus_behavior",
  ]) assert.match(craft, new RegExp(field));
});

test("movement choreography supports compound spatial camera language", () => {
  for (const primitive of [
    "PAN", "TILT", "ROLL", "DOLLY", "TRUCK", "PEDESTAL",
    "ORBIT", "CRANE", "AERIAL", "ZOOM", "HANDHELD",
  ]) assert.match(craft, new RegExp(primitive));
  assert.match(craft, /compound_move/);
  assert.match(craft, /parallax_strategy/);
  assert.match(craft, /foreground_reveal/);
  assert.match(craft, /subject_relative_motion/);
});

test("performance control governs acting instead of relying on prompt adjectives", () => {
  for (const field of [
    "body_action", "gesture_timing", "facial_expression", "gaze",
    "dialogue_timing", "emotion_arc", "blocking", "interaction_beats",
  ]) assert.match(craft, new RegExp(field));
  assert.match(craft, /PERFORMANCE_REFERENCE/);
});

test("editorial and sound craft preserve professional temporal perspective", () => {
  for (const field of [
    "entry_handle_frames", "exit_handle_frames", "cut_on_motion",
    "reaction_allowance", "j_cut_intent", "l_cut_intent", "match_action",
    "listener_pov", "proximity", "occlusion", "reverb_distance",
    "movement_perspective", "intentional_silence",
  ]) assert.match(craft, new RegExp(field));
});

test("look development and optical practical effects are story governed", () => {
  for (const field of [
    "exposure_philosophy", "highlight_rolloff", "skin_rendering",
    "saturation_hierarchy", "black_level", "grain_texture", "scene_evolution",
  ]) assert.match(craft, new RegExp(field));
  for (const effect of [
    "HALATION", "BLOOM", "LENS_FLARE", "RAIN", "SMOKE", "HAZE",
    "DUST", "SPARKS", "REFLECTIONS", "LIGHT_RAYS", "RACK_FOCUS", "SPEED_RAMP",
  ]) assert.match(craft, new RegExp(effect));
  assert.match(craft, /must_not_be_added_for_spectacle_only:\s*true/);
  assert.match(craft, /PROFESSIONAL_FILMCRAFT_EFFECT_MOTIVATION_REQUIRED/);
});

test("native controls bind motion and performance references and preserve source assets", () => {
  assert.match(native, /CAMERA_MOTION_REFERENCE/);
  assert.match(native, /PERFORMANCE_REFERENCE/);
  assert.match(native, /camera_motion_reference_bound/);
  assert.match(native, /performance_reference_bound/);
  assert.match(native, /source_assets_preserved:\s*true/);
  assert.match(native, /list\(input\.source_assets\)/);
});

test("Service Runtime routing receives mandatory filmcraft capability requirements", () => {
  for (const requirement of [
    "professional_filmcraft_required",
    "camera_motion_reference_required",
    "performance_reference_required",
    "compound_camera_choreography_required",
    "lens_character_required",
    "focus_choreography_required",
    "spatial_continuity_required",
    "sound_perspective_required",
    "look_development_required",
    "story_motivated_optical_fx_required",
  ]) assert.match(router, new RegExp(requirement));
  assert.match(router, /unsupported_required_control_must_block:\s*true/);
});

test("filmcraft is asserted before engine routing and persisted as execution evidence", () => {
  const craftIndex = dispatch.indexOf("CreativeProfessionalFilmCraftRuntime.assert");
  const routeIndex = dispatch.indexOf("CreativeVideoEngineRouter.assert");
  assert.ok(craftIndex >= 0);
  assert.ok(routeIndex > craftIndex);
  assert.match(dispatch, /professional_filmcraft:\s*professionalFilmCraft/);
  assert.match(dispatch, /creative_professional_filmcraft_contract/);
  assert.match(dispatch, /creative_professional_filmcraft_qc/);
  assert.match(dispatch, /camera_motion_reference_bound/);
  assert.match(dispatch, /performance_reference_bound/);
});
