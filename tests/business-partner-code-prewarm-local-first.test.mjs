import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/code/prewarm/route.js", "utf8");

test("Business Partner code readiness is owned-local only with no external fallback", () => {
  assert.match(route, /AVANTIQO_CODE_OPERATOR_LOCAL_READINESS_V4/);
  assert.match(route, /AvantiqoCodeLocalQueueProvider\.available\(\)/);
  assert.match(route, /status: localReady \? "local_ready" : "local_unavailable"/);
  assert.match(route, /execution_transport_mode: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(route, /local_only: true/);
  assert.match(route, /external_compute_available: false/);
  assert.match(route, /external_compute_checked: false/);
  assert.match(route, /external_worker_started: false/);
  assert.match(route, /reasoning_calls_used: 0/);
  assert.match(route, /wallet_mutation_performed: false/);
  assert.doesNotMatch(route, /Modal|modal|RunPod|runpod|ensureCodeAIWorkerSession|codeAIZeroIdleServerlessEnabled/);
});
