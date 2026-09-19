import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");
const runtime = fs.readFileSync("lib/intelligence/runtime/AvantiqoNightlyLearningSynthesisRuntime.js", "utf8");

test("continuous learning runs nightly at 02:00 Phuket", () => {
  const cron = vercel.crons.find((item) => item.path === "/api/internal/intelligence/continuous-learning/process");
  assert.equal(cron?.schedule, "0 19 * * *");
});

test("nightly route runs deterministic learning then bounded local synthesis", () => {
  assert.match(route, /runAvantiqoContinuousLearningBatch/);
  assert.match(route, /runAvantiqoNightlyLearningSynthesis/);
  assert.match(route, /nightly_local_4b_synthesis/);
});

test("nightly synthesis defers unless local compute queue is idle", () => {
  assert.match(runtime, /avantiqo_local_compute_nodes/);
  assert.match(runtime, /avantiqo_local_compute_jobs/);
  assert.match(runtime, /LOCAL_GPU_BUSY/);
  assert.match(runtime, /LOCAL_NODE_OFFLINE/);
  assert.match(runtime, /blocking\.length===0/);
});

test("automatic nightly synthesis is mechanism-only local 4B", () => {
  assert.match(runtime, /research_mode,40\)===\"mechanism\"/);
  assert.match(runtime, /qwen3:4b-instruct/);
  assert.match(runtime, /AVANTIQO_LOCAL_NODE_V1/);
  assert.match(runtime, /execution_lane:\"fast\"/);
  assert.match(runtime, /external_fallback_allowed:false/);
  assert.match(runtime, /deep_invention_waiting/);
});

test("nightly learning cannot execute experiments train or promote", () => {
  assert.match(runtime, /experiment_execution_performed:false/);
  assert.match(runtime, /model_training_performed:false/);
  assert.match(runtime, /production_promotion_performed:false/);
  assert.match(runtime, /automatic_experiment_execution:false/);
  assert.match(runtime, /automatic_training_started:false/);
  assert.match(runtime, /automatic_model_promotion:false/);
});
