import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const api = fs.readFileSync("app/api/operator/live-execution/route.js", "utf8");
const runtime = fs.readFileSync("lib/platform/runtime/AvantiqoLiveExecutionRuntime.js", "utf8");
const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const dock = fs.readFileSync("components/operator/HomeAvantiqoIntelligenceDock.jsx", "utf8");

test("live execution exposes the exact shared stop identity separately from displayed code progress", () => {
  assert.match(api, /stop_execution_id:/);
  assert.match(api, /sharedProgress\?\.execution_id \|\| latest\?\.execution_id/);
});

test("stop requests fail closed without the exact live execution id", () => {
  assert.match(runtime, /AVANTIQO_LIVE_EXECUTION_ID_REQUIRED/);
  assert.match(runtime, /AVANTIQO_LIVE_EXECUTION_ID_MISMATCH/);
  assert.match(runtime, /text\(previous\.execution_id, 200\) !== expectedExecutionId/);
  assert.match(api, /error: "execution_id required"/);
  assert.match(api, /executionId,/);
});

test("Business Partner correction and Stop button submit the exact stop execution id", () => {
  assert.match(home, /const stopExecutionId = text\(liveExecution\?\.stop_execution_id\)/);
  assert.match(home, /JSON\.stringify\(\{ organizationId, executionId: stopExecutionId \}\)/);
  assert.match(dock, /const stopExecutionId = text\(liveExecution\?\.stop_execution_id\)/);
  assert.match(dock, /JSON\.stringify\(\{ organizationId, executionId: stopExecutionId \}\)/);
});
