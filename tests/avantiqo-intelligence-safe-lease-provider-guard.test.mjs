import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const canonical = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutor.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("active Intelligence provider is owned-local and has no external fallback", () => {
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(input\)/);
  assert.match(canonical, /runtime_ready: enabled && localConfigured/);
  assert.match(canonical, /local_only: true/);
  assert.match(canonical, /modal_fallback_allowed: false/);
  assert.match(registration, /local_only:\s*true/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.doesNotMatch(provider, /OwnedIntelligenceRequestLeaseRuntime|Modal|RunPod|runpod/);
});

test("local queue remains the durable primary asynchronous transport", () => {
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.match(queue, /avantiqo_local_compute_jobs/);
  assert.match(queue, /local-intelligence:/);
});

test("shared ProviderExecutor contains no legacy Intelligence lease fallback routing", () => {
  assert.doesNotMatch(executor, /OwnedIntelligenceRequestLeaseRuntime/);
  assert.doesNotMatch(executor, /OwnedIntelligenceFastPodLeaseRuntime/);
  assert.doesNotMatch(executor, /AvantiqoIntelligenceFastPodProvider/);
  assert.match(executor, /const result = await executeProviderCore\(options\)/);
});
