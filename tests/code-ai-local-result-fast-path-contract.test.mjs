import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/code/runtime/CodeAIPlannerExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("planner polls local Node1 job status before governed settlement", () => {
  assert.match(source, /getIntelligenceLocalQueueStatus/);
  assert.match(source, /isIntelligenceLocalQueueJob/);
  assert.match(source, /async function fastLocalPlannerJobStatus/);

  const fastIndex = source.indexOf("const fastLocalStatus = await fastLocalPlannerJobStatus(pending)");
  const settleIndex = source.indexOf("result = await settleOnce(serviceRuntime, pending)", fastIndex);
  assert.ok(fastIndex >= 0, "local fast status check must exist");
  assert.ok(settleIndex > fastIndex, "governed settlement must happen after local completion detection");

  const between = source.slice(fastIndex, settleIndex);
  assert.match(between, /status\)\.toLowerCase\(\) !== "completed"\) continue/);
});

test("local fast path preserves normal settlement instead of bypassing billing", () => {
  assert.match(source, /result = await settleOnce\(serviceRuntime, pending\)/);
  assert.match(source, /CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED/);
});
