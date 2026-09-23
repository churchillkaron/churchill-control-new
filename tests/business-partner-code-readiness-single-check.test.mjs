import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const route = fs.readFileSync("app/api/operator/code/prewarm/route.js", "utf8");

test("Business Partner performs one advisory code readiness check instead of a background prewarm loop", () => {
  assert.match(home, /fetch\("\/api\/operator\/code\/prewarm"/);
  assert.match(home, /AVANTIQO_CODE_READINESS_ADVISORY_FAILURE/);
  assert.doesNotMatch(home, /CODE_PREWARM_MAX_POLLS/);
  assert.doesNotMatch(home, /CODE_PREWARM_POLL_MS/);
  assert.doesNotMatch(home, /advanceCodePrewarm/);
  assert.doesNotMatch(home, /AVANTIQO_CODE_PREWARM_BACKGROUND_RETRY/);
});

test("code readiness fails closed locally and never starts an external worker", () => {
  assert.match(route, /status: localReady \? "local_ready" : "local_unavailable"/);
  assert.match(route, /warming: false/);
  assert.match(route, /external_compute_available: false/);
  assert.match(route, /external_worker_started: false/);
  assert.doesNotMatch(route, /DURABLE_WARM_SESSION|Modal|modal|RunPod|runpod/);
});
