import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("Fast Intelligence is an owned local provider contract", () => {
  assert.match(provider, /shouldUseLocalIntelligenceQueue/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(queue, /AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_JOB_PREFIX/);
  assert.match(queue, /exact_job_only: true/);
  assert.doesNotMatch(provider, /RunPod|runpod|ModalClient/);
});
