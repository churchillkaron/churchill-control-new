import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildTemporalCoverageIntelligence,
  classifyTemporalScene,
  evaluateTemporalSequenceIntelligence,
} from "../lib/creative/director/runtime/CreativeTemporalCinematicIntelligenceRuntime.js";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const audio = fs.readFileSync("lib/creative/audio/runtime/CreativeTemporalSoundtrackCueSheetRuntime.js", "utf8");
const visual = fs.readFileSync("lib/creative/execution/runtime/CreativeProviderInstructionSerializer.js", "utf8");

test("A scene classifier detects pursuit and transformation grammar", () => {
  assert.equal(classifyTemporalScene({ scene: { objective: "A hunted man flees drone search beams" } }).primary_type, "PURSUIT_HUNT");
  assert.ok(classifyTemporalScene({ scene: { objective: "Lightning causes a neural form to resolve into the logo" } }).transformation_scene);
});

test("B pursuit coverage intelligence requires real multi-angle coverage", () => {
  const result = buildTemporalCoverageIntelligence({ scene: { objective: "Hunted through forest by drones" } });
  assert.equal(result.coverage_contract.rear_follow_default_forbidden, true);
  assert.ok(result.coverage_contract.required_roles.includes("BODY_DETAIL_OR_FEET"));
  assert.ok(result.coverage_contract.required_roles.includes("THREAT_PROXIMITY"));
  assert.ok(result.coverage_contract.minimum_distinct_roles >= 6);
});

test("C-D flat rear-follow sequences fail before generation", () => {
  const shots = Array.from({ length: 4 }, (_, index) => ({
    id: "s" + index,
    title: "rear running",
    purpose: "man runs",
    action: "man runs away",
    duration_seconds: 2,
    tempo_role: "BUILD",
    camera: { platform: "gimbal", framing: "rear medium", angle: "behind", movement_path: "follow behind" },
    signature_frame_design: { anti_game_camera_rule: "weak" },
  }));
  const result = evaluateTemporalSequenceIntelligence({ scene: { objective: "A hunted man flees through forest" }, shots });
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "TEMPORAL_GAME_CAMERA_FORBIDDEN"));
  assert.ok(result.failures.some((failure) => failure.code === "TEMPORAL_EDIT_RHYTHM_FLAT"));
  assert.ok(result.failures.some((failure) => failure.code === "TEMPORAL_REPEATED_SHOT_SCALE"));
  assert.ok(result.failures.some((failure) => failure.code === "TEMPORAL_REPEATED_CAMERA_ANGLE"));
});

test("E picture and audio studio authority are separated", () => {
  assert.match(visual, /PICTURE ONLY/);
  assert.match(visual, /Audio Studio owns the picture-locked soundtrack and final mix/);
  assert.match(audio, /music_may_not_operate_as_constant_background_bed/);
  assert.match(audio, /foreground_physical_sound_may_override_music/);
});

test("F transformation scenes are causally directed", () => {
  assert.match(temporal, /CAUSE -> PHYSICAL_CONSEQUENCE -> TRANSFORMATION_PROGRESS -> FORM_SIMPLIFICATION -> BRAND_RESOLUTION/);
  assert.match(temporal, /Reject generic electric-brain imagery/);
});
