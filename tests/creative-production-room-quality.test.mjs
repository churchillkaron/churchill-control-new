import test from "node:test";
import assert from "node:assert/strict";

import { evaluateVirtualRehearsal } from "../lib/creative/production-room/runtime/CreativeVirtualRehearsalRuntime.js";
import { evaluateDailiesTake } from "../lib/creative/production-room/runtime/CreativeDailiesRoomRuntime.js";
import {
  evaluateEditorialRoom,
  evaluateVfxRoom,
  evaluateColorRoom,
  evaluateSoundMusicRoom,
  evaluateMasterDirectorReview,
  evaluateReleaseRoom,
} from "../lib/creative/production-room/runtime/CreativePostRoomQualityRuntime.js";

function rehearsableShot() {
  return {
    subject_class: "Heavy twin-engine offshore transport helicopter with wheeled landing gear",
    subject_signature: { defining_features: ["twin-engine fuselage", "wheeled landing gear"], forbidden_substitutions: ["light skid helicopter"] },
    subject_identity_key: "helicopter-a",
    world_identity_key: "platform-a",
    mechanical_truth: "Rotor mast, hub, transmission, engines and landing gear remain physically connected throughout the approach.",
    mechanical_signature: { functional_assemblies: ["main rotor", "transmission"], required_connections: ["rotor mast to transmission"], motion_constraints: ["rotor remains attached to mast"] },
    world_geometry_anchor: "The same offshore platform remains fixed with one helideck and crane relationship.",
    world_topology: ["helideck remains attached to platform edge", "main crane remains aft of the helideck across the full shot"],
    continuity_invariants: ["same helicopter", "same platform"],
    camera_feasibility: "A lateral tracking camera follows the same aircraft continuously without hidden reset or impossible scale change.",
    camera: { movement_path: "slow lateral tracking move", movement_motivation: "show approach relationship" },
    frame_plan: { opening_frame: "medium aircraft over sea", progression: "aircraft advances while platform enters frame", closing_frame: "wide aircraft beside platform" },
    virtual_camera_state: {
      start: { focal_length_mm: 50, subject_distance_m: 18, camera_height_m: 2.2, roll_degrees: 0 },
      end: { focal_length_mm: 50, subject_distance_m: 14, camera_height_m: 2.2, roll_degrees: 0 },
      zoom_or_lens_change_declared: false,
      focus_behavior: "focus remains on the helicopter fuselage during approach",
      perspective_intent: "medium telephoto perspective preserves aircraft/platform scale",
    },
    subject_motion_choreography: {
      required: true,
      start_state: "airborne over open sea on stable approach heading",
      path: "continuous left-to-right approach remaining clear of platform steelwork",
      speed_profile: "gradual controlled deceleration while remaining airborne",
      screen_direction: "left-to-right",
      clearance_and_contact_constraints: ["remain clear of crane and platform steelwork"],
      end_state: "airborne beside the same platform on the same approach heading",
    },
  };
}

function rehearsalInputs() {
  return {
    coverage: { units: [{ id: "hero", purpose: "hero approach", shared_action_state: "same left-to-right approach", cut_opportunity: "platform enters frame" }] },
    lighting_simulation: {
      motivated_sources: ["overcast North Sea sky"], shadow_behavior: "soft downward shadow remains coherent",
      reflection_behavior: "wet metal carries restrained sky reflection", surface_response: "paint and steel respond consistently",
      continuity_rule: "cloud direction and exposure remain stable across coverage",
    },
    editability: { entry_state: "aircraft isolated over sea", exit_state: "aircraft beside platform", cut_points: ["platform first enters frame"], failure_if_missing: "editor cannot establish approach geography" },
  };
}
test("virtual rehearsal passes only with executable coverage lighting and editability", () => {
  const report = evaluateVirtualRehearsal({ shot: rehearsableShot(), ...rehearsalInputs() });
  assert.equal(report.passed, true);
  assert.equal(report.zero_media_generation, true);
  assert.equal(report.zero_provider_calls, true);
});

test("dailies rejects one weak department even when the others pass", () => {
  const families = ["DIRECTING", "CINEMATOGRAPHY", "CONTINUITY", "TECHNICAL_TRUTH", "PERCEPTUAL_QUALITY"];
  const reviews = families.map((family) => ({ reviewer_id: family.toLowerCase(), family, score: family === "CONTINUITY" ? 91 : 97, passed: family !== "CONTINUITY", evidence: ["frame review"] }));
  const report = evaluateDailiesTake({ take: { id: "take-a" }, reviews });
  assert.equal(report.passed, false);
  assert.match(report.failures.join(" "), /CONTINUITY|continuity/i);
});

test("editorial forbids unapproved takes", () => {
  const report = evaluateEditorialRoom({
    approved_take_ids: ["take-a"],
    assembly: { clips: [{ take_id: "take-b", story_reason: "needed reveal", cut_reason: "action cut" }], coverage_gaps: [], pacing_strategy: "contrast short punctuation with earned holds" },
  });
  assert.equal(report.passed, false);
  assert.match(report.failures.join(" "), /UNAPPROVED_TAKE/);
});
test("vfx color sound master and release rooms enforce specialist approvals", () => {
  assert.equal(evaluateVfxRoom({ shots: [{ shot_id: "s1", source_digest: "abc", version_id: "v1", integration_evidence: ["matchmove verified"], approved: true }] }).passed, true);
  assert.equal(evaluateColorRoom({
    look: { show_look: "cool overcast documentary base", highlight_rule: "protect specular detail", black_detail_rule: "retain readable shadow texture", skin_product_truth_rule: "preserve natural skin and product color", scene_continuity_rule: "match exposure and weather across sequence" },
    shots: [{ shot_id: "s1", match_score: 97, approved: true }],
  }).passed, true);
  assert.equal(evaluateSoundMusicRoom({
    sound_world: { signature_sounds: ["rotor transients"], acoustic_perspective: "distance follows picture scale", silence_strategy: "drop density before reveal", transition_motifs: ["rotor lead-in"] },
    mix: { picture_lock_digest: "edit123", sync_events: [{ at: 1.2, event: "rotor blade pass" }], dynamics_score: 96, approved: true },
  }).passed, true);
  const verdicts = ["DIRECTOR", "EDITOR", "CINEMATOGRAPHY", "POST", "SOUND"].map((family) => ({ family, score: 96, passed: true, evidence: ["approved review"] }));
  assert.equal(evaluateMasterDirectorReview({ department_verdicts: verdicts, final_repairs: [] }).passed, true);
  assert.equal(evaluateReleaseRoom({
    master_qc: { checksum_verified: true, duration_verified: true, audio_verified: true, video_verified: true, no_rejected_assets_in_master: true },
    rights: { cleared: true, evidence: ["rights manifest"] },
    delivery: { approved: true, profile_id: "master-prores", master_digest: "master123" },
  }).passed, true);
});