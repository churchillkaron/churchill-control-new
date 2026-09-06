import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const aerial = read("lib/creative/director/runtime/CreativeAerialCinematographyRuntime.js");
const gate = read("lib/creative/director/runtime/CreativeAerialCinematographyExecutionGate.js");
const camera = read("lib/creative/director/runtime/CreativeCameraGrammarRuntime.js");
const instrumentation = read("instrumentation.js");

assert.match(aerial, /AVANTIQO_AERIAL_CINEMATOGRAPHY_V1/);
assert.match(aerial, /STABILIZED_AERIAL/);
assert.match(aerial, /FPV/);

for (const field of [
  "flight_path",
  "start_position",
  "end_position",
  "altitude_profile",
  "speed_profile",
  "yaw_behavior",
  "gimbal_behavior",
  "horizon_behavior",
  "subject_tracking",
  "point_of_interest",
  "parallax_intent",
  "foreground_reveal",
  "clearance_strategy",
  "terrain_relationship",
  "entry_motion",
  "exit_motion",
  "settling_behavior",
  "self_visibility_policy",
  "movement_motivation",
  "edit_relationship",
]) {
  assert.match(aerial, new RegExp(field));
}

assert.match(aerial, /CreativeCameraGrammarRuntime\.compile/);
assert.match(aerial, /NO_AERIAL_CAMERA_INTENT/);
assert.match(aerial, /AERIAL_CAMERA_GRAMMAR_REQUIRED/);
assert.match(aerial, /AERIAL_POINT_OF_INTEREST_REQUIRED/);
assert.match(aerial, /AERIAL_TRACKING_TARGET_REQUIRED/);
assert.match(aerial, /AERIAL_REVEAL_GEOMETRY_REQUIRED/);
assert.match(aerial, /AERIAL_HORIZON_ROLL_CONTRADICTION/);
assert.match(aerial, /AERIAL_CAMERA_SELF_VISIBILITY_FORBIDDEN/);
assert.match(aerial, /AERIAL_COMPOUND_FLIGHT_OVERLOADED/);
assert.match(aerial, /provider_neutral:\s*true/);
assert.match(aerial, /provider_prompt_persisted:\s*false/);
assert.match(aerial, /FLIGHT_GEOMETRY/);
assert.match(aerial, /HEADING_YAW/);
assert.match(aerial, /GIMBAL_LOOK/);
assert.match(aerial, /SPEED_EASING/);
assert.match(aerial, /PARALLAX_REVEAL/);
assert.match(aerial, /EDIT_CONTINUITY/);

assert.match(camera, /aerial_candidate/);
assert.match(gate, /ProductionTaskRuntime\.dispatch = async function dispatchWithAerialCinematography/);
assert.match(gate, /CreativeAerialCinematographyRuntime\.assertReady/);
assert.match(gate, /aerial_cinematography_verified_before_dispatch:\s*true/);
assert.match(gate, /aerial_cinematography_provider_neutral:\s*true/);
assert.match(gate, /fail_closed:\s*true/);

const cameraIndex = instrumentation.indexOf("CreativeCameraGrammarExecutionGate");
const aerialIndex = instrumentation.indexOf("CreativeAerialCinematographyExecutionGate");
const humanIndex = instrumentation.indexOf("CreativeHumanContinuityQualityBootstrap");
assert.ok(cameraIndex >= 0);
assert.ok(aerialIndex > cameraIndex);
assert.ok(humanIndex > aerialIndex);

console.log("AVANTIQO_STUDIO_AERIAL_CINEMATOGRAPHY_CONTRACT=PASS");
