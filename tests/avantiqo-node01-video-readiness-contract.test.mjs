import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(
  new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url),
  "utf8",
);
const readiness = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoReadinessRuntime.js", import.meta.url),
  "utf8",
);

test("Node01 advertises and dispatches governed local video generation", () => {
  assert.match(worker, /\$AllCapabilities = @\([^\n]*'ai\.video\.generate'/);
  assert.match(worker, /\$GpuCapabilities = @\([^\n]*'ai\.video\.generate'/);
  assert.match(worker, /function RunVideoLtx25Job\(\$Job\)/);
  assert.match(worker, /elseif \(\[string\]\$job\.capability -eq 'ai\.video\.generate'\) \{ RunVideoLtx25Job \$job \}/);
  assert.match(worker, /AVANTIQO_NODE01_LTX25_GGUF_LOCAL_V1/);
});

test("video readiness proves live worker availability instead of hardcoding implementation false", () => {
  assert.match(readiness, /AvantiqoVideoLocalQueueProvider\.available\(\)/);
  assert.match(readiness, /localVideoWorkerImplemented=true/);
  assert.match(readiness, /local_video_worker_available:localVideoWorkerAvailable/);
  assert.doesNotMatch(readiness, /localVideoWorkerImplemented=false/);
});