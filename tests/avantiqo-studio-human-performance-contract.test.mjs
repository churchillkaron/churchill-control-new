import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = read("lib/creative/performance/runtime/CreativeHumanPerformanceRuntime.js");
const authoring = read("lib/creative/performance/runtime/CreativeHumanPerformanceAuthoringRuntime.js");
const planning = read("lib/creative/performance/runtime/CreativeHumanPerformancePlanningBootstrap.js");
const gate = read("lib/creative/performance/runtime/CreativeHumanPerformanceExecutionGate.js");
const identity = read("lib/creative/identity/runtime/CreativeHumanContinuityQualityBootstrap.js");
const instrumentation = read("instrumentation.js");

assert.match(runtime, /AVANTIQO_HUMAN_PERFORMANCE_V1/);
for (const field of [
  "performance_intent",
  "physical_action",
  "action_class",
  "body_visibility",
  "entry_state",
  "action_progression",
  "exit_state",
  "body_orientation",
  "weight_and_support",
  "hand_behavior",
  "contact_and_interaction",
  "head_and_gaze",
  "facial_expression_progression",
  "pose_transition",
  "occlusion_and_limb_continuity",
  "continuity_anchors",
  "movement_motivation",
  "performance_timing",
]) {
  assert.match(runtime, new RegExp(field));
}

assert.match(runtime, /WEIGHTED_OBJECT/);
assert.match(runtime, /OBJECT_CONTACT/);
assert.match(runtime, /LOCOMOTION/);
assert.match(runtime, /POSTURAL_TRANSITION/);
assert.match(runtime, /VOCAL_PERFORMANCE/);
assert.match(runtime, /REACTIVE_MICRO_BEHAVIOR/);
assert.match(runtime, /STATIC_PERFORMANCE/);
assert.match(runtime, /HUMAN_PERFORMANCE_DIRECTION_GENERIC/);
assert.match(runtime, /HUMAN_PERFORMANCE_STILLNESS_LOCOMOTION_CONTRADICTION/);
assert.match(runtime, /HUMAN_PERFORMANCE_CONTACT_CONTRADICTION/);
assert.match(runtime, /HUMAN_PERFORMANCE_HAND_VISIBILITY_CONTRADICTION/);
assert.match(runtime, /HUMAN_PERFORMANCE_GESTURE_OVERLOAD/);
assert.match(runtime, /CREATIVE_HUMAN_PERFORMANCE_BLOCKED/);
assert.match(runtime, /authorCreativeHumanPerformance/);
assert.match(runtime, /verifyCreativeHumanPerformance/);
assert.match(runtime, /Execution may not author human performance/);

for (const stage of [
  "IDENTITY_BASELINE",
  "STAGING_BODY_ORIENTATION",
  "WEIGHT_SUPPORT_ACTION",
  "HAND_OBJECT_CONTACT",
  "HEAD_GAZE",
  "FACIAL_EXPRESSION_MICRO_BEHAVIOR",
  "OCCLUSION_LIMB_CONTINUITY",
  "ENTRY_EXIT_CONTINUITY",
]) {
  assert.match(runtime, new RegExp(stage));
}

assert.match(authoring, /AVANTIQO_HUMAN_PERFORMANCE_AUTHORING_V1/);
assert.match(authoring, /CreativeHumanPerformanceRuntime\.author/);
assert.match(authoring, /human_performance_authored_before_materialization:\s*true/);
assert.match(authoring, /execution_authorship_forbidden:\s*true/);

assert.match(planning, /ProductionGraphRuntime\.preview = async function previewWithHumanPerformance/);
assert.match(planning, /ProductionGraphRuntime\.plan = async function planWithHumanPerformance/);
assert.match(planning, /requirements:[\s\S]*human_performance: shot\.human_performance/);
assert.match(planning, /human_performance_execution_authorship_forbidden:\s*true/);

assert.match(gate, /ProductionTaskRuntime\.dispatch = async function dispatchWithHumanPerformance/);
assert.match(gate, /CreativeHumanPerformanceRuntime\.assertReady/);
assert.match(gate, /human_performance_verified_before_dispatch:\s*true/);
assert.match(gate, /human_performance_execution_authored:\s*false/);
assert.match(gate, /fail_closed:\s*true/);

assert.match(identity, /HUMAN_CONTINUITY_QUALITY_V1/);
assert.match(identity, /anatomy_validation_required:\s*true/);
assert.match(identity, /hand_integrity_validation_required:\s*true/);
assert.match(identity, /limb_topology_validation_required:\s*true/);
assert.match(identity, /temporal_identity_consistency_required:\s*true/);

const temporalIndex = instrumentation.indexOf("CreativeUniversalTemporalCoverageBootstrap");
const planningIndex = instrumentation.indexOf("CreativeHumanPerformancePlanningBootstrap");
const humanGateIndex = instrumentation.indexOf("CreativeHumanPerformanceExecutionGate");
const aerialIndex = instrumentation.indexOf("CreativeAerialCinematographyExecutionGate");
const cameraIndex = instrumentation.indexOf("CreativeCameraGrammarExecutionGate");
const qualityIndex = instrumentation.indexOf("CreativeHumanContinuityQualityBootstrap");
assert.ok(temporalIndex >= 0);
assert.ok(planningIndex > temporalIndex);
assert.ok(humanGateIndex > planningIndex);
assert.ok(aerialIndex > humanGateIndex);
assert.ok(cameraIndex > aerialIndex);
assert.ok(qualityIndex > cameraIndex);

console.log("AVANTIQO_STUDIO_HUMAN_PERFORMANCE_CONTRACT=PASS");
