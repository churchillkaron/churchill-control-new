import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/turn/live/route.js", "utf8");
const progress = fs.readFileSync("lib/operator/runtime/BusinessPartnerLiveProgressRuntime.js", "utf8");
const bridge = fs.readFileSync("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js", "utf8");
const runtime = fs.readFileSync("lib/platform/runtime/AvantiqoLiveExecutionRuntime.js", "utf8");

test("live wrapper passes the exact execution id as server-only turn context", () => {
  assert.match(route, /runOperatorTurnPost\(request, \{[\s\S]*liveExecutionId,[\s\S]*\}\)/);
  assert.doesNotMatch(route, /headers\.set\("x-avantiqo-live-execution-id"/);
});

test("deep Business Partner progress binds to the internal execution id", () => {
  assert.match(progress, /x-avantiqo-live-execution-id/);
  assert.match(progress, /executionId,/);
  assert.match(bridge, /function liveExecutionId\(context\)/);
  assert.match(bridge, /executionId: liveExecutionId\(context\)/);
  assert.match(bridge, /publishAvantiqoLiveExecution\(\{[\s\S]*executionId/);
});

test("cooperative stop checks ignore stop flags belonging to a different execution", () => {
  assert.match(runtime, /avantiqoLiveExecutionStopRequested\(\{[\s\S]*executionId = null/);
  assert.match(runtime, /text\(loaded\.live_execution\?\.execution_id, 200\) !== expectedExecutionId/);
  assert.match(runtime, /avantiqoLiveExecutionStopRequested\(\{ context, executionId \}\)/);
});
