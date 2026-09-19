import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluatePursuitPerformanceChoreography,
} from "../lib/creative/performance/runtime/CreativePursuitPerformanceChoreographyRuntime.js";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const perceptual = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const planner = fs.readFileSync("lib/creative/production-graph/planner/ProductionGraphPlanner.js", "utf8");
const preproduction = fs.readFileSync("lib/creative/production-room/runtime/CreativeCanonicalPreproductionEvidenceRuntime.js", "utf8");

test("pursuit performance requires observable state and carryover", () => {
  const result = evaluatePursuitPerformanceChoreography({
    scene: { objective: "Drone hunts a man through forest" },
    shots: [{ id: "s1", action: "man runs from drone" }],
  });
  assert.equal(result.applicable, true);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "PURSUIT_PERFORMANCE_FIELD_REQUIRED"));
  assert.ok(result.failures.some((failure) => failure.code === "PURSUIT_PERFORMANCE_MICRO_CUES_REQUIRED"));
  assert.ok(result.failures.some((failure) => failure.code === "PURSUIT_PERFORMANCE_CARRYOVER_REQUIRED"));
});

test("complete pursuit performance choreography passes", () => {
  const performance = {
    fear_state_before: "Breath shallow, jaw tight, scanning rear-left while trying not to panic.",
    trigger_or_threat_read: "Drone beam clips the wet trunk beside his face and rotor pitch rises.",
    involuntary_reaction: "Eyes snap left, breath catches, shoulders compress and right hand shields cheek.",
    decision_and_intent: "He commits to cutting across the slope toward denser trees for cover.",
    body_mechanics: "Weight drops through left leg, torso rotates, stride shortens on mud and arms counterbalance.",
    breath_state: "Two rapid breaths, one held inhale during near miss, forced exhale on acceleration.",
    gaze_and_head_behavior: "Eyes check beam source once, then lock on the gap between two trunks.",
    contact_or_obstacle_response: "Left boot slips half-step in mud; right hand catches bark and body recoils forward.",
    fatigue_state: "Moderate exertion with rising calf load and less stable recovery than prior beat.",
    micro_behavior_cues: ["lower lip tremor", "wet eyelash blink", "right hand flex after bark contact"],
    fear_state_after: "Panic is more contained but urgency increases after realizing the drone is closer.",
    next_action_impulse: "Push off bark contact and burst laterally into the darker tree line.",
    physical_carryover: ["mud on left shin", "right palm pain", "shortened breath", "wet shirt clinging at shoulder"],
  };
  const result = evaluatePursuitPerformanceChoreography({
    scene: { objective: "Drone hunts a man through forest" },
    shots: [{ id: "s1", action: "man runs from drone", pursuit_performance_choreography: performance }],
  });
  assert.equal(result.passed, true);
});

test("performance choreography reaches direction review and graph", () => {
  assert.match(temporal, /pursuit_performance_choreography/);
  assert.match(temporal, /stimulus -> involuntary reaction -> conscious decision -> physical action -> changed body\/emotional state/);
  assert.match(temporal, /Generic reaction shots are forbidden/);
  assert.match(perceptual, /generic running loops/);
  assert.match(perceptual, /fatigue that resets/);
  assert.match(planner, /pursuit_performance_choreography/);
  assert.match(preproduction, /pursuit_performance_choreography/);
});
