import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  ".github/workflows/avantiqo-business-partner-head-to-head.yml",
  "utf8",
);
const runner = fs.readFileSync(
  "scripts/run-business-partner-reference-head-to-head.mjs",
  "utf8",
);

test("reference benchmark is manual-only and requires explicit paid authorization", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.doesNotMatch(workflow, /\npull_request:/);
  assert.match(workflow, /I_AUTHORIZE_EXTERNAL_REFERENCE_SPEND/);
  assert.match(runner, /AVANTIQO_BENCHMARK_EXECUTE_EXTERNAL/);
  assert.match(runner, /EXPLICIT_EXTERNAL_REFERENCE_EXECUTION_REQUIRED/);
});

test("all three reference families use the same protocol and suite", () => {
  assert.match(runner, /benchmarks\/business-partner\/suite\.v1\.json/);
  assert.match(runner, /benchmarks\/business-partner\/protocol\.v1\.json/);
  assert.match(runner, /family: "chatgpt"/);
  assert.match(runner, /family: "claude"/);
  assert.match(runner, /family: "gemini"/);
  assert.match(runner, /const prompt = benchmarkPrompt\(protocol, testCase\)/);
});

test("raw evidence keeps measured provenance without logging secrets", () => {
  assert.match(runner, /raw_output_sha256/);
  assert.match(runner, /latency_ms/);
  assert.match(runner, /prompt_sha256/);
  assert.doesNotMatch(runner, /console\.log\([^\n]*API_KEY/);
  assert.match(workflow, /Upload raw measured reference evidence/);
});
