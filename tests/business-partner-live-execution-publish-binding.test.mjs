import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("lib/platform/runtime/AvantiqoLiveExecutionRuntime.js", "utf8");
const route = fs.readFileSync("app/api/operator/turn/live/route.js", "utf8");

test("live execution publish can bind to one exact execution id and ignores stale publishers", () => {
  assert.match(runtime, /executionId = null/);
  assert.match(runtime, /const expectedExecutionId = text\(executionId, 200\)/);
  assert.match(runtime, /text\(previousState\.execution_id, 200\) !== expectedExecutionId/);
  assert.match(runtime, /ignored: true/);
  assert.match(runtime, /AVANTIQO_LIVE_EXECUTION_ID_MISMATCH/);
});

test("turn live wrapper binds routing, completion and failure events to the execution it began", () => {
  assert.match(route, /let liveExecutionId = null/);
  assert.match(route, /liveExecutionId = text\(liveExecution\?\.live_execution\?\.execution_id\) \|\| null/);
  assert.ok((route.match(/executionId: liveExecutionId/g) || []).length >= 3);
});
