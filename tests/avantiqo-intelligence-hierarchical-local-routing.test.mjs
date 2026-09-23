import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Node01 local intelligence baseline is 20480 context with measured Deep policy", () => {
  const policy = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js");
  const worker = read("scripts/local-node/avantiqo-node01-worker.ps1");
  assert.match(policy, /AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS = 20480/);
  assert.match(policy, /AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP = 8192/);
  assert.match(policy, /AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS = 6000/);
  assert.match(worker, /\$ContextTokens = 20480/);
});

test("large Deep local reasoning routes hierarchically before ordinary queue and Modal", () => {
  const provider = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  const hierarchical = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js");
  const hierarchicalIndex = provider.indexOf("shouldUseHierarchicalLocalIntelligence(effectiveInput)");
  const queueIndex = provider.indexOf("shouldUseLocalIntelligenceQueue(effectiveInput)");
  const modalIndex = provider.indexOf("return executeIntelligenceModalDirect");
  assert.ok(hierarchicalIndex >= 0);
  assert.ok(queueIndex > hierarchicalIndex);
  assert.ok(modalIndex > queueIndex);
  assert.match(hierarchical, /AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1/);
  assert.match(hierarchical, /executeIntelligenceLocalQueueAndWait/);
  assert.match(hierarchical, /hierarchical_single_pass_trusted_prompt_tokens/);
  assert.match(hierarchical, /MAX_CHUNKS = 12/);
  assert.match(hierarchical, /modal_inference_performed: false/);
  assert.match(hierarchical, /external_compute_started: false/);
});

test("approved external proposal bypasses a second local hierarchy attempt", () => {
  const provider = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  assert.match(provider, /if \(!approvedProposalBinding && shouldUseHierarchicalLocalIntelligence\(effectiveInput\)\)/);
});


test("Service Runtime keeps oversized Deep on the owned local model for provider hierarchy", () => {
  const service = read("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js");
  assert.match(service, /shouldUseHierarchicalLocalIntelligence/);
  assert.match(service, /const localExecutionEligible/);
  assert.match(service, /shouldUseLocalIntelligenceQueue\([\s\S]*\) \|\|[\s\S]*shouldUseHierarchicalLocalIntelligence/);
  assert.match(service, /allowed_models: \[AVANTIQO_INTELLIGENCE_LOCAL_MODEL\]/);
  assert.match(service, /local_owned_pricing_required: true/);
});


test("final synthesis has its own deterministic hierarchy stage identity", () => {
  const hierarchical = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js");
  assert.match(hierarchical, /hierarchical_stage: 'final'/);
  assert.match(hierarchical, /hierarchical_local_disabled: true/);
});
