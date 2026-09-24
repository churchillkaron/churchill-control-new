import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutor.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("retired external Intelligence request lease runtime stays retired", () => {
  assert.equal(fs.existsSync("lib/platform/service-runtime/execution/OwnedIntelligenceRequestLeaseRuntime.js"), false);
  assert.doesNotMatch(provider, /RunPod|OwnedIntelligenceRequestLeaseRuntime/);
  assert.doesNotMatch(executor, /OwnedIntelligenceRequestLeaseRuntime|OwnedIntelligenceFastPodLeaseRuntime/);
});

test("durable local queue owns asynchronous Intelligence work", () => {
  assert.match(queue, /avantiqo_local_compute_jobs/);
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.match(queue, /cancelIntelligenceLocalQueue/);
  assert.match(queue, /exact_job_only: true/);
});

test("local-only provider fails closed instead of opening external capacity", () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_JOB_ID_REQUIRED/);
  assert.doesNotMatch(provider, /patchWorkers|endpointId|workersMax/);
});
