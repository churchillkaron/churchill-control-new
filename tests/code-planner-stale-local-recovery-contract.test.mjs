import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/code/runtime/CodeAIPlannerExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("stale local planner jobs have one bounded exact-job recovery", () => {
  assert.match(source, /MAX_STALE_LOCAL_QUEUE_RECOVERIES = 1/);
  assert.match(source, /STALE_LOCAL_INTERACTIVE_RECOVERY_MS = 105000/);
  assert.match(source, /STALE_LOCAL_STRONG_RECOVERY_MS = 170000/);
  assert.match(source, /const staleThresholdMs = strongModelRequired[\s\S]*STALE_LOCAL_STRONG_RECOVERY_MS[\s\S]*STALE_LOCAL_INTERACTIVE_RECOVERY_MS/);
  assert.match(source, /finalStatusValue !== "processing"\) return null/);
  assert.match(source, /serviceRuntime\.cancelPending\(\{/);
  assert.match(source, /reason: "CODE_AI_PLANNER_STALE_LOCAL_JOB_RECOVERY"/);
  assert.match(source, /executionInputForRuntimeRecovery\(executionInput, nextRecoveryCount\)/);
  assert.match(source, /stale_queue_recovery_count: nextRecoveryCount/);
  assert.match(source, /recovered_from_provider_job_id: providerJobId/);
});

test("stale recovery rechecks completion before cancellation and never targets non-local jobs", () => {
  assert.match(source, /if \(!providerJobId \|\| !isCodeLocalJob\(providerJobId\)\) return null/);
  assert.match(source, /const finalStatus = await transientPlannerPollRetry\(\(\) => fastLocalPlannerJobStatus\(pending\)\)/);
  assert.match(source, /finalStatusValue === "completed"/);
  assert.match(source, /finalStatusValue !== "processing"\) return null/);
  assert.match(source, /const settled = await transientPlannerPollRetry\(\(\) => settleOnce\(serviceRuntime, pending\)\)/);
});

test("stale recovery publishes concrete live progress without increasing authority", () => {
  assert.match(source, /phase: "LOCAL_CODE_STALE_JOB_RECOVERY"/);
  assert.match(source, /cancelling only that exact stale job and resubmitting the same planner step once/);
  assert.doesNotMatch(source, /production_deploy_authority:\s*true/);
});
