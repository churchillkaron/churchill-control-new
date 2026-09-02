import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker = fs.readFileSync(
  new URL("../services/avantiqo-intelligence-modal/modal_app.py", import.meta.url),
  "utf8",
);
const reasoning = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);

test("Modal worker tool ids are provider-local to each completion", () => {
  assert.match(worker, /for index, match in enumerate\(TOOL_CALL_RE\.finditer\(raw\), start=1\)/);
  assert.match(worker, /"id": f"call_\{index\}"/);
});

test("reasoning runtime does not impose session-global uniqueness on provider-local tool ids", () => {
  assert.match(reasoning, /assertNoDuplicateToolCallIdsWithinTurn\(calls, turn\)/);
  assert.doesNotMatch(reasoning, /seenCallIds/);
  assert.match(reasoning, /MAX_TURNS = 20/);
  assert.match(reasoning, /MAX_TOOL_CALLS = 64/);
});
