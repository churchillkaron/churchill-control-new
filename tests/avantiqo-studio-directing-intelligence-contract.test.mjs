import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDirectingIntelligenceRuntime.js",
  "utf8",
);
const planning = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDirectingIntelligencePlanningBootstrap.js",
  "utf8",
);
const execution = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDirectingIntelligenceExecutionGate.js",
  "utf8",
);
const instrumentation = fs.readFileSync("instrumentation.js", "utf8");
const temporal = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

for (const contract of [
  "AVANTIQO_DIRECTING_INTELLIGENCE_V1",
  "AVANTIQO_DIRECTOR_PROJECT_DECISION_V1",
  "AVANTIQO_DIRECTOR_SCENE_DECISION_V1",
  "AVANTIQO_DIRECTOR_SHOT_DECISION_V1",
]) {
  assert.ok(runtime.includes(contract), `missing ${contract}`);
}

assert.ok(runtime.includes('hierarchy: "PROJECT_SCENE_SHOT"'));
assert.ok(runtime.includes("director_is_semantic_authority: true"));
assert.ok(runtime.includes("renderer_is_execution_engine_not_director: true"));
assert.ok(runtime.includes("renderer_must_not_invent_direction: true"));
assert.ok(runtime.includes("renderer_must_not_change_story_information: true"));
assert.ok(runtime.includes("specialist_contracts_may_refine_but_not_override_director_intent: true"));
assert.ok(runtime.includes("provider_neutral: true"));
assert.ok(runtime.includes("promptless_execution: true"));
assert.ok(runtime.includes("provider_calls_executed: 0"));

for (const boundary of [
  "DIRECTING_INTELLIGENCE_FRAME_AUTHORITY_REQUIRED",
  "DIRECTING_INTELLIGENCE_CAMERA_FRAMING_REQUIRED",
  "DIRECTING_INTELLIGENCE_CAMERA_MOTIVATION_REQUIRED",
  "DIRECTING_INTELLIGENCE_AUDIO_HIERARCHY_REQUIRED",
  "DIRECTING_INTELLIGENCE_PERFORMANCE_DIRECTION_REQUIRED",
  "DIRECTING_INTELLIGENCE_TRANSITION_IN_REQUIRED",
  "DIRECTING_INTELLIGENCE_TRANSITION_OUT_REQUIRED",
  "DIRECTING_INTELLIGENCE_CONTINUITY_REQUIRED",
  "DIRECTING_INTELLIGENCE_REPAIR_AUTHORITY_REQUIRED",
  "DIRECTING_INTELLIGENCE_DUPLICATE_SHOT_PURPOSE",
  "DIRECTING_INTELLIGENCE_SCENE_SHOT_DURATION_MISMATCH",
  "DIRECTING_INTELLIGENCE_PRIMARY_SOURCE_AUTHORITY_INVALID",
  "DIRECTING_INTELLIGENCE_PRIMARY_SOURCE_MISMATCH",
  "DIRECTING_INTELLIGENCE_SHOT_HASH_MISMATCH",
]) {
  assert.ok(runtime.includes(boundary), `missing ${boundary}`);
}

assert.ok(runtime.includes("narrative_escalation_scoring_deferred_to_phase_15: true"));
assert.ok(runtime.includes("automatic_candidate_selection_deferred_to_phase_16: true"));
assert.ok(runtime.includes("budget_quality_optimization_deferred_to_phase_17: true"));
assert.ok(runtime.includes("multi_version_audience_output_deferred_to_phase_18: true"));

assert.ok(planning.includes("ProductionGraphRuntime.preview"));
assert.ok(planning.includes("requirements:"));
assert.ok(planning.includes("directing_intelligence: decision"));
assert.ok(planning.includes("directing_intelligence_verified_before_materialization: true"));
assert.ok(planning.includes('hierarchical_planning: "PROJECT_SCENE_SHOT"'));

assert.ok(execution.includes("DIRECTING_INTELLIGENCE_PREAUTHORED_DECISION_REQUIRED"));
assert.ok(execution.includes("verifyShotDecision"));
assert.ok(execution.includes("directing_intelligence_verified_before_dispatch: true"));
assert.ok(execution.includes("fail_closed: true"));

const planningIndex = instrumentation.indexOf("CreativeDirectingIntelligencePlanningBootstrap");
const performanceIndex = instrumentation.indexOf("CreativeHumanPerformancePlanningBootstrap");
const executionIndex = instrumentation.indexOf("CreativeDirectingIntelligenceExecutionGate");
assert.ok(planningIndex >= 0, "directing planning bootstrap not registered");
assert.ok(executionIndex >= 0, "directing execution gate not registered");
assert.ok(planningIndex < performanceIndex, "directing authority must precede specialist human-performance planning");

assert.ok(temporal.includes("complete scene architecture"));
assert.ok(temporal.includes("Every shot must add new information"));
assert.ok(temporal.includes("signature device"));
assert.ok(temporal.includes("movement_motivation"));
assert.ok(temporal.includes("mix_intent"));
assert.ok(temporal.includes("known_failure_modes"));
assert.ok(temporal.includes("repair_instructions"));

console.log("AVANTIQO_STUDIO_DIRECTING_INTELLIGENCE_CONTRACT=PASS");
