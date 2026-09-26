import test from "node:test";
import assert from "node:assert/strict";
import { certifyCodeAIFrontierLatency } from "../lib/code/runtime/CodeAIFrontierLatencyCertificationRuntime.js";

function warm(ms) {
  return { wall_ms: ms, code_runtime_model_already_gpu_resident: true, code_cpu_fallback: false };
}

test("frontier latency certification passes a fast warm lane with one bounded cold start", () => {
  const result = certifyCodeAIFrontierLatency([
    { wall_ms: 7500, code_runtime_model_already_gpu_resident: false, code_cpu_fallback: false },
    ...Array.from({ length: 20 }, (_, index) => warm(1500 + index * 50)),
  ]);
  assert.equal(result.passed, true);
  assert.equal(result.measurements.warm_samples, 20);
  assert.equal(result.measurements.cold_samples, 1);
  assert.equal(result.checks.cpu_fallback_forbidden, true);
});

test("frontier latency certification fails slow warm p95 even when outputs are otherwise valid", () => {
  const rows = Array.from({ length: 20 }, (_, index) => warm(index < 18 ? 1800 : 5000));
  const result = certifyCodeAIFrontierLatency(rows);
  assert.equal(result.passed, false);
  assert.equal(result.checks.warm_p95_within_limit, false);
});

test("frontier latency certification fails CPU fallback and insufficient warm evidence", () => {
  const result = certifyCodeAIFrontierLatency([
    { wall_ms: 1200, code_runtime_model_already_gpu_resident: true, code_cpu_fallback: true },
  ]);
  assert.equal(result.passed, false);
  assert.equal(result.checks.minimum_warm_samples, false);
  assert.equal(result.checks.cpu_fallback_forbidden, false);
});
