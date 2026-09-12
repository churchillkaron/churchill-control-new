import test from "node:test";
import assert from "node:assert/strict";
import { buildShotDpIntent, evaluateShotDpIntent } from "../lib/creative/video/runtime/CreativeShotDpIntentRuntime.js";

const shot = {
  id: "shot-dp-1",
  subject: "aircraft fuselage",
  purpose: "signature industrial reveal",
  action: "technician crosses frame as the aircraft catches a narrow highlight",
  camera: {
    framing: "wide environmental hero",
    lens_intent: "35mm full-frame, restrained perspective",
    movement_path: "slow lateral dolly",
    movement_motivation: "Reveal scale through foreground parallax without overtaking the technician",
    focus_target: "aircraft fuselage",
  },
  lighting: {
    source: "large north-facing factory windows",
    direction: "rear three-quarter",
    contrast: "5:1",
    exposure_intent: "fuselage highlight protected; faces 0.3 stops under",
  },
};

test("DP intent governs lens, motivated movement and actual lighting design", () => {
  const value = buildShotDpIntent({
    shot,
    physical_world: { production_design: { practical_lights: "existing factory work lights" } },
    cinematography_acquisition: { camera: { focal_length_mm: 35, aperture_t_stop: 2.8, depth_of_field: "CONTROLLED_NARRATIVE" } },
    professional_filmcraft: {
      lens_character: { projection: "SPHERICAL", character: "MODERN_CINEMATIC", distortion: "MINIMAL_NARRATIVE" },
      movement_choreography: { start_anchor: "foreground machine edge", end_anchor: "fuselage hero geometry", path: "slow lateral dolly", speed_profile: "SMOOTH_LINEAR", acceleration_profile: "SMOOTH_LOW_JERK", parallax_strategy: "THREE_PLANE", subject_relative_motion: "maintain aircraft scale" },
      focus_choreography: { start_target: "aircraft", end_target: "aircraft" },
      spatial_continuity: { lens_continuity: "35-50mm environmental family" },
      look_development: { exposure_philosophy: "protect metallic highlight" },
    },
  });
  const gate = evaluateShotDpIntent(value);
  assert.equal(gate.passed, true);
  assert.equal(value.lens_grammar.role, "HERO_GEOMETRY");
  assert.equal(value.lens_grammar.focal_length_mm, 35);
  assert.match(value.camera_choreography.reason_to_move, /Reveal scale/i);
  assert.match(value.lighting_design.key_source, /north-facing factory windows/i);
  assert.equal(value.provider_may_replace_lens_or_light_plan, false);
});
