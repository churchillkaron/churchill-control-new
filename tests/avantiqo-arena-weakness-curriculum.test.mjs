import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoArenaWeaknessCurriculumRuntime.js","utf8");
const route=fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js","utf8");
test("arena weakness curriculum uses measured dimensions without answer leakage",()=>{
  assert.match(runtime,/platform_intelligence_weakness_curriculum/);
  assert.match(runtime,/hidden_benchmark_answer_available:false/);
  assert.match(runtime,/benchmark_case_text_reused:false/);
  assert.match(runtime,/failed_fields/);
  assert.doesNotMatch(runtime,/expected_action/);
});
test("arena weakness curriculum stays local and zero external spend",()=>{
  assert.match(runtime,/practice_mode:"LOCAL_SYNTHETIC_ONLY"/);
  assert.match(runtime,/external_research_allowed:false/);
  assert.match(runtime,/external_provider_spend_allowed:false/);
  assert.match(runtime,/automatic_training_started:false/);
});
test("nightly route derives weakness curriculum immediately after arena",()=>{
  const arena=route.indexOf("runAvantiqoIntelligenceImprovementLoop()");
  const curriculum=route.indexOf("reconcileAvantiqoArenaWeaknessCurriculum()");
  assert.ok(arena>=0&&curriculum>arena);
  assert.match(route,/arena_weakness_curriculum: arenaWeaknessCurriculum/);
});
