import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const local = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js",
  "utf8",
);
const reasoning = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js",
  "utf8",
);

test("local provider tool ids are completion-local and generated when absent", () => {
  assert.match(local, /function normalizeToolCalls\(value\)/);
  assert.match(local, /id: text\(call\?\.id\) \|\| `local_\$\{randomUUID\(\)\}`/);
});

test("reasoning runtime scopes replay protection to each turn", () => {
  assert.match(reasoning, /assertNoDuplicateToolCallIdsWithinTurn\(calls, turn\)/);
  assert.doesNotMatch(reasoning, /seenCallIds/);
  assert.match(reasoning, /MAX_TURNS = 20/);
  assert.match(reasoning, /MAX_TOOL_CALLS = 64/);
});
