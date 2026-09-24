import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");

test("Fast and Deep remain local-primary and fail closed without owned compute", () => {
  assert.match(provider, /executeHierarchicalLocalIntelligence/);
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(provider, /executeIntelligenceLocal\(input\)/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.match(wrapper, /local_only:\s*true/);
  assert.match(wrapper, /modal_fallback_allowed:\s*false/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod/);
});
