import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("Fast scheduling uses the durable owned local compute queue", () => {
  assert.match(queue, /avantiqo_local_compute_jobs/);
  assert.match(queue, /enqueueLocalComputeJob/);
  assert.match(queue, /status: "queued"/);
  assert.match(queue, /leased_until/);
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.doesNotMatch(queue, /RunPod|runpod|Modal|modal/);
});
