import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const queue = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js",
  "utf8",
);

test("Intelligence jobs are serialized through durable local queue ownership", () => {
  assert.match(queue, /avantiqo_local_compute_jobs/);
  assert.match(queue, /node_id/);
  assert.match(queue, /leased_until/);
  assert.match(queue, /status === "RUNNING" \? "processing" : "queued"/);
});

test("each queued Intelligence job remains exact and bounded", () => {
  assert.match(queue, /max_attempts: 2/);
  assert.match(queue, /\.eq\("id", id\)/);
  assert.match(queue, /exact_job_only: true/);
  assert.doesNotMatch(queue, /Modal|modal|RunPod|runpod|gpu_count/);
});
