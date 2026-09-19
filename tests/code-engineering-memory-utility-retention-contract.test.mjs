import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/code/runtime/CodeAIEngineeringMemoryUtilityRuntime.js", import.meta.url),
  "utf8",
);

test("engineering utility observations have a physical per-actor cap", () => {
  assert.match(runtime, /const MAX_ROWS = 320/);
  assert.match(runtime, /trimEngineeringMemoryUtilityObservations/);
  assert.match(runtime, /\.contains\("metadata", \{ actor_id: actor \}\)/);
  assert.match(runtime, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(runtime, /\.range\(MAX_ROWS, MAX_ROWS \+ 99\)/);
  assert.match(runtime, /\.delete\(\)/);
  assert.match(runtime, /\.eq\("organization_id", orgId\)/);
  assert.match(runtime, /\.eq\("memory_scope", MEMORY_SCOPE\)/);
});
