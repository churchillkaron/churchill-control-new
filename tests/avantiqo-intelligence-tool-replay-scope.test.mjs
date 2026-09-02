import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoDuplicateToolCallIdsWithinTurn,
} from "../lib/intelligence/runtime/AvantiqoToolCallReplayGuardRuntime.mjs";

test("duplicate provider-local tool ids inside one completion are rejected", () => {
  assert.throws(
    () => assertNoDuplicateToolCallIdsWithinTurn([
      { id: "call_1", function: { name: "first" } },
      { id: "call_1", function: { name: "second" } },
    ], 1),
    /AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED:call_1/,
  );
});

test("provider-local call_1 may legitimately recur on a later model completion", () => {
  const firstTurn = assertNoDuplicateToolCallIdsWithinTurn([
    { id: "call_1", function: { name: "operator_live_read" } },
  ], 1);
  const secondTurn = assertNoDuplicateToolCallIdsWithinTurn([
    { id: "call_1", function: { name: "operator_action_candidate" } },
  ], 2);
  assert.equal(firstTurn.unique_call_ids, 1);
  assert.equal(secondTurn.unique_call_ids, 1);
});
