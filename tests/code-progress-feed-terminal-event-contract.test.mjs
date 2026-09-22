import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/operator/CodeProgressFeedProvider.jsx", import.meta.url), "utf8");
const liveExecution = await readFile(new URL("../lib/platform/runtime/AvantiqoLiveExecutionRuntime.js", import.meta.url), "utf8");
const liveRoute = await readFile(new URL("../app/api/operator/live-execution/route.js", import.meta.url), "utf8");

test("fresh terminal mission event overrides stale running state", () => {
  assert.match(source, /const TERMINAL_EVENT_STATES = new Set/);
  assert.match(source, /"failed"/);
  assert.match(source, /"completed"/);
  assert.match(source, /"blocked"/);
  assert.match(source, /"stopped"/);
  assert.match(source, /if \(TERMINAL_EVENT_STATES\.has\(event\)\) return false/);
});

test("shared live execution also treats stopped as terminal", () => {
  assert.match(liveExecution, /\["completed", "failed", "cancelled", "blocked", "stopped"\]/);
  assert.match(liveRoute, /\["completed", "failed", "blocked", "cancelled", "stopped"\]/);
});
