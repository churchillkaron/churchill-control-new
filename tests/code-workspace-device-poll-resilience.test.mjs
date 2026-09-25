import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");

test("device job polling survives transient control-plane read exhaustion within the overall deadline", () => {
  assert.match(source, /catch \(error\) \{[\s\S]*!controlPlaneRetryable\(error\) \|\| Date\.now\(\) >= deadline[\s\S]*continue;/);
  assert.match(source, /cancelQueuedDeviceJob/);
  assert.match(source, /CODE_AI_DEVICE_JOB_TIMEOUT_QUEUED_CANCELLED/);
  assert.match(source, /CODE_AI_DEVICE_JOB_TIMEOUT_IN_FLIGHT_UNCERTAIN/);
  assert.match(source, /queued_job_cancelled/);
});


test("device workspace job completion polling stays sub-200ms", () => {
  assert.match(source, /const POLL_MS = 150;/);
  assert.doesNotMatch(source, /const POLL_MS = 700;/);
});
