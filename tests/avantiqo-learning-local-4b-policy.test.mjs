import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const learning=fs.readFileSync("lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js","utf8");
const child=fs.readFileSync("scripts/run-avantiqo-learning-mechanism-synthesis-local-first.mjs","utf8");
test("mechanism learning defaults to local 4B while invention stays deep",()=>{
  assert.match(learning,/synthesisLane = mode === "invention" \? "deep" : "fast"/);
  assert.match(learning,/synthesis_model: mode === "mechanism" \? "qwen3:4b-instruct" : null/);
  assert.match(learning,/synthesis_local_first: mode === "mechanism"/);
  assert.match(learning,/synthesis_modal_only: mode === "invention"/);
});
test("local-first synthesis keeps experiment and promotion authority off",()=>{
  assert.match(child,/experiment_execution_performed:false/);
  assert.match(child,/model_training_performed:false/);
  assert.match(child,/production_promotion_performed:false/);
  assert.match(child,/automatic_experiment_execution:false/);
  assert.match(child,/automatic_training_started:false/);
  assert.match(child,/automatic_model_promotion:false/);
});
test("mechanism synthesis requires the local node infrastructure",()=>{
  assert.match(child,/qwen3:4b-instruct/);
  assert.match(child,/execution_lane:p\.lane/);
  assert.match(child,/AVANTIQO_LOCAL_NODE_V1/);
  assert.match(child,/LOCAL_4B_REQUIRED/);
});
test("scientific learning consumes the same synthesis scope",()=>{
  const science=fs.readFileSync("lib/intelligence/runtime/AvantiqoScientificLearningExperimentRuntime.js","utf8");
  assert.match(child,/platform_learning_discovery_syntheses/);
  assert.match(science,/platform_learning_discovery_syntheses/);
});
