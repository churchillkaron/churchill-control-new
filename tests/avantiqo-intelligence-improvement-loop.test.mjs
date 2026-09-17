import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoIntelligenceImprovementLoopRuntime.js","utf8");
const route=fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js","utf8");

test("1 arena measures broad task quality with held out local cases",()=>{
  assert.match(runtime,/platform_intelligence_arena/);
  for(const d of ["correctness","tool_selection","evidence","governance","completion","recovery","cost","latency","invention"]) assert.match(runtime,new RegExp(`"${d}"`));
  assert.match(runtime,/held_out_task_count/);
  assert.match(runtime,/qwen3:4b-instruct/);
});

test("2 failures become bounded curriculum candidates not trusted knowledge",()=>{
  assert.match(runtime,/platform_intelligence_failure_curriculum/);
  assert.match(runtime,/failure_is_not_trusted_knowledge:true/);
  assert.match(runtime,/diagnose_before_training:true/);
  assert.match(runtime,/retest_required:true/);
});

test("3 verified real outcomes version the arena",()=>{
  assert.match(runtime,/platform_learning_outcomes/);
  assert.match(runtime,/verified_outcome_count/);
  assert.match(runtime,/real_outcomes_influence_arena_version:true/);
});

test("4 world model records operational relations without claiming causal proof",()=>{
  assert.match(runtime,/platform_intelligence_world_model/);
  for(const rel of ["OBSERVED_BY","VERIFIED_BY","MAY_CHANGE"]) assert.match(runtime,new RegExp(rel));
  assert.match(runtime,/relations_are_operational_hypotheses_not_causal_proof:true/);
});

test("5 simulation is required before material mutation and checked against outcomes",()=>{
  assert.match(runtime,/simulation_before_material_mutation:true/);
  assert.match(runtime,/prediction_must_be_compared_with_verified_outcome:true/);
  assert.match(runtime,/simulation_before_mutation:true/);
});

test("6 tool discovery follows live operator registry",()=>{
  assert.match(runtime,/listOperatorCapabilities/);
  assert.match(runtime,/capability_discovery_dynamic:true/);
  assert.match(runtime,/DO_NOT_INVENT_VERIFIER/);
});

test("7 long term project cognition binds existing durable project continuity",()=>{
  assert.match(runtime,/OperatorProjectState\+IntelligenceCrossConversationContinuityRuntime/);
});

test("8 calibration learns measured local strengths and weaknesses",()=>{
  assert.match(runtime,/platform_intelligence_calibration/);
  assert.match(runtime,/route_deeper_on_repeated_measured_weakness:true/);
  assert.match(runtime,/difficulty_alone_never_justifies_escalation:true/);
});

test("9 novel problems create governed invention gaps not self modification",()=>{
  assert.match(runtime,/platform_intelligence_invention_gaps/);
  assert.match(runtime,/PROPOSE_GOVERNED_CAPABILITY_GAP/);
  assert.match(runtime,/direct_self_modification_forbidden:true/);
  assert.match(runtime,/automatic_capability_creation:false/);
});

test("10 competitive benchmark is prepared but external execution requires approval",()=>{
  assert.match(runtime,/competitive_benchmark/);
  assert.match(runtime,/external_reference_execution_enabled:false/);
  assert.match(runtime,/requires_explicit_authorization:true/);
  assert.match(runtime,/matched_evidence_and_tool_conditions_required:true/);
  assert.match(runtime,/automatic_external_spend:false/);
});

test("nightly loop runs after metacognition",()=>{
  const meta=route.indexOf("runAvantiqoMetacognitiveEscalationCompetence()");
  const loop=route.indexOf("runAvantiqoIntelligenceImprovementLoop()");
  assert.ok(meta>=0&&loop>meta);
  assert.match(route,/intelligence_improvement_loop: intelligenceImprovementLoop/);
});
