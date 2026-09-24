import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const wrapper = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");

test("Fast and Deep remain owned-local and fail closed without Node1", () => {
  const hierarchy = provider.indexOf("shouldUseHierarchicalLocalIntelligence(input)");
  const queue = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  const direct = provider.indexOf("shouldUseLocalIntelligence(input)");
  assert.ok(hierarchy >= 0 && queue > hierarchy && direct > queue);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(wrapper, /runtime_ready: enabled && localConfigured/);
  assert.doesNotMatch(provider, /Modal|modal|RunPod|runpod/);
});
