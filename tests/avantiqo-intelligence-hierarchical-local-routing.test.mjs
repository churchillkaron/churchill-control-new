import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("oversized deep owned reasoning routes through hierarchical Node01 before the single-context queue path", () => {
  const provider = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js");
  const hierarchical = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js");
  const hierarchicalIndex = provider.indexOf("shouldUseHierarchicalLocalIntelligence(input)");
  const queueIndex = provider.indexOf("shouldUseLocalIntelligenceQueue(input)");
  assert.ok(hierarchicalIndex >= 0);
  assert.ok(queueIndex > hierarchicalIndex);
  assert.match(hierarchical, /AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1/);
  assert.match(hierarchical, /lane\(input\) !== 'deep'/);
  assert.match(hierarchical, /!localIntelligenceContextFits\(input, 'deep'\)/);
  assert.match(hierarchical, /executeIntelligenceLocalQueueAndWait/);
  assert.match(hierarchical, /external_compute_started: false/);
  assert.match(hierarchical, /modal_inference_performed: false/);
  assert.match(hierarchical, /runpod_inference_performed: false/);
  assert.match(hierarchical, /hierarchical_chunk_count/);
});


test("service runtime propagates its resolved reasoning lane into the provider payload", () => {
  const execution = read("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js");
  assert.match(execution, /const providerExecutionInput = intelligenceExecutionLane/);
  assert.match(execution, /\{ \.\.\.payload, execution_lane: intelligenceExecutionLane \}/);
  assert.match(execution, /input: providerExecutionInput/);
});


test("hierarchical deep local eligibility participates in pricing readiness", () => {
  const execution = read("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js");
  assert.match(execution, /shouldUseHierarchicalLocalIntelligence/);
  assert.match(execution, /const localExecutionEligible =/);
});

test("creative governed benchmark calls are marked as Studio preproduction review", () => {
  const approval = read("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js");
  assert.match(approval, /execution_scope: BENCHMARK_SCOPE[\s\S]*studio_preproduction_review: true/);
});


test("creative governed benchmark calls explicitly allowlist the approved model", () => {
  const approval = read("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js");
  assert.match(approval, /allowed_models: \[approval\.model\]/);
  assert.match(approval, /preferred_models: \[approval\.model\]/);
});


test("hierarchical local deep reasoning reserves enough output headroom for valid JSON while staying inside 20k context", () => {
  const hierarchical = read("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js");
  assert.match(hierarchical, /DEFAULT_CHUNK_CHARS = 50000/);
  assert.match(hierarchical, /DEFAULT_CHUNK_OUTPUT_TOKENS = 1100/);
  assert.match(hierarchical, /DEFAULT_MERGE_OUTPUT_TOKENS = 1400/);
  assert.match(hierarchical, /DEFAULT_FINAL_OUTPUT_CAP = 6000/);
});
