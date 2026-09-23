import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const route = fs.readFileSync("app/api/operator/code/prewarm/route.js", "utf8");

test("Business Partner does not prewarm or poll Code runtime", () => {
  assert.doesNotMatch(home, /\/api\/operator\/code\/prewarm/);
  assert.doesNotMatch(home, /CODE_PREWARM_MAX_POLLS|CODE_PREWARM_POLL_MS|advanceCodePrewarm/);
});

test("code readiness fails closed locally and never starts an external worker", () => {
  assert.match(route, /status: localReady \? "local_ready" : "local_unavailable"/);
  assert.match(route, /warming: false/);
  assert.match(route, /external_compute_available: false/);
  assert.match(route, /external_worker_started: false/);
  assert.doesNotMatch(route, /DURABLE_WARM_SESSION|Modal|modal|RunPod|runpod/);
});
