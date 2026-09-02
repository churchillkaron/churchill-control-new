import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);

test("Intelligence reasoning loop settles pending owned Modal jobs before parsing output", () => {
  assert.match(source, /async function settlePendingReasoningExecution/);
  assert.match(source, /if \(execution\?\.pending !== true\) return execution/);
  assert.match(source, /ServiceExecutionRuntime\.settle\(\{/);
  assert.match(source, /provider_job_id:\s*providerJobId/);
  assert.match(source, /usage_id:\s*usageId/);
  assert.match(source, /provider_job_reused:\s*true/);
  assert.match(source, /duplicate_provider_job_submitted:\s*false/);
  assert.match(source, /execution = await settlePendingReasoningExecution\(\{/);
});

test("pending settlement preserves lane and capability identity", () => {
  assert.match(source, /provider_status_input:\s*\{[\s\S]*capability:\s*executionService,[\s\S]*execution_lane:\s*executionLane/);
  assert.match(source, /intelligence_execution_lane:\s*executionLane/);
  assert.match(source, /intelligence_service_id:\s*executionService/);
  assert.match(source, /raw_reasoning_persisted:\s*false/);
});

test("reasoning loop has bounded polling and no RunPod dependency", () => {
  assert.match(source, /PENDING_SETTLEMENT_POLL_INTERVAL_MS\s*=\s*1000/);
  assert.match(source, /PENDING_SETTLEMENT_MAX_POLLS\s*=\s*300/);
  assert.doesNotMatch(source, /RUNPOD_/);
  assert.doesNotMatch(source, /runpod\.io/);
});
