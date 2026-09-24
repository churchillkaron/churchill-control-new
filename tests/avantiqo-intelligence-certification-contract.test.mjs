import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("owned Intelligence certification is local-only and fail-closed", () => {
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(input\)/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(registration, /local_only:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.match(registration, /infrastructure_candidates:\s*\[localInfrastructure\]/);
  assert.match(queue, /supabase-pull-queue-v1/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod/);
});
