import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const grammar = read("lib/creative/director/runtime/CreativeCameraGrammarRuntime.js");
const gate = read("lib/creative/director/runtime/CreativeCameraGrammarExecutionGate.js");
const coverage = read("lib/creative/director/runtime/CreativeCinematicCoverageRuntime.js");
const authoring = read("lib/creative/director/runtime/CreativeCinematicCoverageAuthoringRuntime.js");
const instrumentation = read("instrumentation.js");

assert.match(grammar, /AVANTIQO_CAMERA_GRAMMAR_V1/);
for (const field of [
  "framing",
  "angle",
  "camera_distance",
  "lens_intent",
  "movement_path",
  "movement_speed",
  "stabilization",
  "movement_motivation",
  "focus_target",
  "focus_transition",
]) {
  assert.match(grammar, new RegExp(`\\"${field}\\"`));
}
assert.match(grammar, /CAMERA_MOVEMENT_GRAMMAR_VAGUE/);
assert.match(grammar, /CAMERA_MOVEMENT_MOTIVATION_REQUIRED/);
assert.match(grammar, /CAMERA_AXIS_BREAK_MOTIVATION_REQUIRED/);
assert.match(grammar, /CAMERA_EYELINE_MATCH_REQUIRED/);
assert.match(grammar, /CAMERA_EDIT_RELATIONSHIP_INCOMPATIBLE/);
assert.match(grammar, /CAMERA_STILLNESS_MOVEMENT_CONTRADICTION/);
assert.match(grammar, /CAMERA_MOVEMENT_OVERLOADED/);
assert.match(grammar, /provider_execution_order/);
assert.match(grammar, /aerial_candidate/);
assert.match(grammar, /NO_PHYSICAL_CAMERA_CONTRACT_REQUIRED/);
assert.match(grammar, /CREATIVE_CAMERA_GRAMMAR_BLOCKED/);

assert.match(gate, /ProductionTaskRuntime\.dispatch = async function dispatchWithCameraGrammar/);
assert.match(gate, /CreativeCameraGrammarRuntime\.assertReady/);
assert.match(gate, /camera_grammar_verified_before_dispatch:\s*true/);
assert.match(gate, /camera_grammar_aerial_candidate/);
assert.match(gate, /fail_closed:\s*true/);

assert.match(coverage, /AVANTIQO_CINEMATIC_COVERAGE_V1/);
assert.match(coverage, /axis breaks require explicit motivation/);
assert.match(coverage, /edit-incompatible shots cannot dispatch/);
assert.match(authoring, /AVANTIQO_CINEMATIC_COVERAGE_AUTHORING_V1/);
assert.match(authoring, /Camera movement is craft, not the creative device/);
assert.match(authoring, /Do not turn this into a Hollywood coverage template/);

const temporalCoverageIndex = instrumentation.indexOf("CreativeUniversalTemporalCoverageBootstrap");
const cameraGrammarIndex = instrumentation.indexOf("CreativeCameraGrammarExecutionGate");
const humanQualityIndex = instrumentation.indexOf("CreativeHumanContinuityQualityBootstrap");
assert.ok(temporalCoverageIndex >= 0);
assert.ok(cameraGrammarIndex > temporalCoverageIndex);
assert.ok(humanQualityIndex > cameraGrammarIndex);

console.log("AVANTIQO_STUDIO_CAMERA_GRAMMAR_CONTRACT=PASS");
