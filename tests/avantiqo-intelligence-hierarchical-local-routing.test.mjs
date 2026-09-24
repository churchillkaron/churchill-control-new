import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const hierarchical = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js", "utf8");
const policy = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js", "utf8");

test("Node01 local intelligence baseline keeps bounded context and Deep output", () => {
  assert.match(policy, /AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS = 20480/);
  assert.match(policy, /AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP = 8192/);
});

test("large Deep local reasoning routes hierarchically before ordinary local queue", () => {
  const hierarchicalIndex = provider.indexOf("shouldUseHierarchicalLocalIntelligence(input)");
  const queueIndex = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  assert.ok(hierarchicalIndex >= 0);
  assert.ok(queueIndex > hierarchicalIndex);
  assert.match(hierarchical, /AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1/);
  assert.match(hierarchical, /executeIntelligenceLocalQueueAndWait/);
  assert.match(hierarchical, /MAX_CHUNKS = 12/);
  assert.match(hierarchical, /modal_inference_performed: false/);
  assert.match(hierarchical, /external_compute_started: false/);
});

test("final synthesis has deterministic local hierarchy stage identity", () => {
  assert.match(hierarchical, /hierarchical_stage: 'final'/);
  assert.match(hierarchical, /hierarchical_local_disabled: true/);
});
