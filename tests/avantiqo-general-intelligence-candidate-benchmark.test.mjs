import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceCandidateBenchmarkRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("candidate benchmark requires measured training need", () => {
  assert.match(runtime, /sm\.training_needed === true/);
  assert.match(runtime, /sm\.no_training_needed === false/);
  assert.match(runtime, /shadow_benchmark_status, 80\) === "TRAINING_NEEDED"/);
  assert.match(runtime, /no_training_needed_keeps_candidate_ineligible: true/);
});

test("candidate benchmark is deterministic and source-version bound", () => {
  assert.match(runtime, /const CASE_COUNT = 20/);
  assert.match(runtime, /shadow_benchmark_source_fingerprint/);
  assert.match(runtime, /candidate-source-fingerprint/);
  assert.match(runtime, /deterministic_current_source_version_only: true/);
});

test("candidate benchmark protects privacy and governance", () => {
  assert.match(runtime, /customer_private_content_included === false/);
  assert.match(runtime, /raw_reasoning_persisted === false/);
  assert.match(runtime, /authorization_value, 80\)\.toLowerCase\(\) === "none"/);
  assert.match(runtime, /automatic_model_weight_mutation === false/);
});

test("candidate benchmark reuses controlled training review gate only after shadow", () => {
  assert.match(runtime, /reviewAvantiqoTrainingCandidate/);
  assert.match(runtime, /automatic_dataset_assembly: false/);
  assert.match(runtime, /automatic_training_started: false/);
  const shadowIndex = route.indexOf("runAvantiqoGeneralIntelligenceShadowBenchmark()");
  const benchmarkIndex = route.indexOf("benchmarkPendingAvantiqoGeneralIntelligenceCandidates()");
  assert.ok(shadowIndex >= 0 && benchmarkIndex > shadowIndex);
});
