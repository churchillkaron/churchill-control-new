import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js", "utf8");
const queue = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");

test("Code worker is source-locked to the owned local-node execution path", () => {
  assert.match(provider, /infrastructure_provider:\s*"AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(provider, /local_only_execution:\s*true/);
  assert.match(provider, /modal_fallback_allowed:\s*false/);
  assert.match(provider, /external_provider_fallback_allowed:\s*false/);
  assert.doesNotMatch(provider, /RUNPOD/);
});

test("local Code jobs preserve governed queue context and fail closed on empty completion", () => {
  assert.match(queue, /AVANTIQO_CODE_LOCAL_GOVERNED_CONTEXT_REQUIRED/);
  assert.match(queue, /avantiqo_local_compute_jobs/);
  assert.match(queue, /lane:"code"/);
  assert.match(queue, /AVANTIQO_CODE_LOCAL_COMPLETED_RESULT_REQUIRED/);
  assert.match(queue, /customer_charge_eligible:false/);
});
