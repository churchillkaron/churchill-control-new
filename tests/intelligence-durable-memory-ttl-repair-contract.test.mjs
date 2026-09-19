import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const memoryRuntime = fs.readFileSync(
  new URL("../lib/operator/runtime/IntelligenceMemoryRuntime.js", import.meta.url),
  "utf8",
);
const turnRoute = fs.readFileSync(
  new URL("../app/api/operator/turn/route.js", import.meta.url),
  "utf8",
);

test("durable project memories repair stale TTLs without faking freshness", () => {
  assert.match(memoryRuntime, /const DURABLE_MEMORY_TYPES = new Set/);
  assert.match(memoryRuntime, /\.update\(\{ valid_until: null \}\)/);
  assert.doesNotMatch(memoryRuntime, /\.update\(\{ valid_until: null, updated_at:/);
  assert.match(memoryRuntime, /repaired: repairIds\.length/);
});

test("legacy durable TTL repair is bounded and scope safe", () => {
  assert.match(memoryRuntime, /async function repairExpiredDurableOperatorMemory/);
  assert.match(memoryRuntime, /\.eq\("source", "operator_project_state"\)/);
  assert.match(memoryRuntime, /\.in\("memory_type", \[\.\.\.DURABLE_MEMORY_TYPES\]\)/);
  assert.match(memoryRuntime, /Math\.min\(100, Number\(limit\) \|\| 100\)/);
});

test("operator turn exposes durable repair separately from learning", () => {
  assert.match(turnRoute, /projectStateMemoryRepaired = Number\(learned\?\.repaired \|\| 0\)/);
  assert.match(turnRoute, /longTermLearned > 0 \|\| projectStateMemoryRepaired > 0/);
  assert.match(turnRoute, /project_state_memory_repaired: projectStateMemoryRepaired/);
});

test("transient project memories retain TTL lifecycle", () => {
  assert.match(memoryRuntime, /ttlDays: 90/);
  assert.match(memoryRuntime, /ttlDays: 14/);
  assert.match(memoryRuntime, /ttlDays: status === "failed" \? 7 : 14/);
});
