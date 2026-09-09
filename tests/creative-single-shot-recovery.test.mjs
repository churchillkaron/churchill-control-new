import assert from "node:assert/strict";
import test from "node:test";

import { recoverSingleContinuousShot } from "../lib/creative/director/runtime/CreativeSingleShotRecoveryRuntime.js";

function shot(id, action, movement, opening, closing) {
  return {
    id,
    duration_seconds: 5 / 3,
    subject: "Offshore helicopter and platform",
    purpose: "Advance the same offshore approach",
    action,
    frame_plan: { opening_frame: opening, progression: action, closing_frame: closing },
    camera: {
      platform: "FLUID_HEAD_TRIPOD",
      lens_intent: "18mm wide lens",
      movement_path: movement,
      movement_speed: movement.includes("pan") ? "0.4°/sec" : "0°/sec",
      movement_motivation: "Follow the helicopter approach",
      focus_target: "Helicopter and helideck",
      stabilization: "Fluid head tripod",
    },
    audio: { source_sound: "Rotor and North Sea wind", mix_intent: "Physical sound only" },
    continuity: { location: "Same Norwegian offshore platform", screen_direction: "left-to-right" },
    negative_constraints: ["No cuts", "No malformed rotor"],
    known_failure_modes: ["Weak opening scale"],
    repair_instructions: [],
  };
}

function scene(id, index, movement) {
  return {
    id,
    title: `Scene ${index}`,
    objective: "Reveal one continuous offshore approach",
    emotion: "Calm confidence",
    story_state_before: index === 1 ? "Distant approach" : "Approach continues",
    state_change: `Approach state ${index}`,
    story_state_after: index === 3 ? "Landing position" : "Approach continues",
    duration_seconds: 5 / 3,
    location: {
      name: index === 1 ? "Norwegian Sea Horizon" : "Offshore Platform Helideck",
      reference_asset_id: "platform-ref",
    },
    reference_asset_ids: ["platform-ref"],
    shots: [shot(`shot-${index}`, index === 1 ? "Helicopter stationary on horizon" : `Helicopter advances toward platform ${index}`, movement,
      index === 1 ? "Tiny helicopter on horizon" : "Helicopter already moving",
      index === 3 ? "Helicopter in landing position" : "Platform grows clearer")],
  };
}

test("explicit single-shot recovery collapses multi-scene plan and applies paid scalar critique", () => {
  const plan = {
    workflow_kind: "TEMPORAL",
    temporal_contract: {
      duration_seconds: 5,
      single_continuous_shot: true,
      scene_count: 1,
      shot_count: 1,
      music_allowed: false,
    },
    deliverables: [{ output_spec: { duration_seconds: 5, aspect_ratio: "16:9" } }],
    scenes: [
      scene("scene_001", 1, "No camera movement"),
      scene("scene_002", 2, "Slow pan right at 0.4°/sec"),
      scene("scene_003", 3, "Slow pan right at 0.4°/sec"),
    ],
  };
  const critique = {
    required_repairs: [
      { id: "scene_001", problem: "Opening lacks kinetic weight", required_change: "Increase helicopter frame size by 20% in first shot" },
      { id: "scene_002", problem: "Pan is too slow", required_change: "Increase pan speed to 0.8°/sec" },
    ],
  };
  const result = recoverSingleContinuousShot({ plan, critique });
  assert.equal(result.recovered, true);
  assert.equal(result.plan.scenes.length, 1);
  assert.equal(result.plan.scenes[0].shots.length, 1);
  assert.equal(result.plan.scenes[0].duration_seconds, 5);
  assert.equal(result.plan.scenes[0].shots[0].duration_seconds, 5);
  assert.match(result.plan.scenes[0].shots[0].camera.movement_path, /0\.8°\/sec/);
  assert.equal(result.plan.scenes[0].shots[0].visual_repairs.opening_subject_scale_adjustment_percent, 20);
  assert.equal(result.plan.scenes[0].shots[0].visual_repairs.opening_subject_scale_multiplier, 1.2);
  assert.doesNotMatch(result.plan.scenes[0].shots[0].frame_plan.opening_frame, /approved critique adjustment/i);
  assert.doesNotMatch(result.plan.scenes[0].shots[0].action, /stationary/i);
  assert.equal(result.plan.deliverables[0].output_spec.audio, "Authentic physical source sound only; music disabled.");
});
