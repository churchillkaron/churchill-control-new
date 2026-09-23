import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const hierarchical = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js", "utf8");
const policy = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js", "utf8");

test("Node01 Deep policy separates physical context from measured one-shot trust", () => {
  assert.match(policy, /LOCAL_CONTEXT_TOKENS = 20480/);
  assert.match(policy, /LOCAL_DEEP_OUTPUT_CAP = 8192/);
  assert.match(policy, /LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS = 6000/);
});

test("provider owns the single canonical local Deep hierarchy", () => {
  assert.match(provider, /shouldUseHierarchicalLocalIntelligence\(effectiveInput\)/);
  assert.match(provider, /executeHierarchicalLocalIntelligence\(effectiveInput\)/);
  assert.match(hierarchical, /AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1/);
  assert.match(hierarchical, /MAX_CHUNKS = 12/);
  assert.match(hierarchical, /AVANTIQO_INTELLIGENCE_LOCAL_DEEP_SINGLE_PASS_TRUSTED_PROMPT_TOKENS/);
  assert.match(hierarchical, /estimatedPromptTokens\(input\) >/);
  assert.doesNotMatch(reasoning, /operatorDeepEvidenceChunks|prepareOperatorDeepRequest|reduceOperatorDeepEvidenceChunk/);
});

test("hierarchical child stages stay local and cannot recursively hierarchy", () => {
  assert.match(hierarchical, /local_compute_required: true/);
  assert.match(hierarchical, /infrastructure_policy: 'local_only'/);
  assert.match(hierarchical, /hierarchical_local_disabled: true/);
  assert.match(hierarchical, /if \(hierarchicalDisabled\(input\)\) return false/);
  assert.match(hierarchical, /external_compute_started: false/);
  assert.match(hierarchical, /modal_inference_performed: false/);
  assert.match(hierarchical, /runpod_inference_performed: false/);
});

test("Business Partner supplies immutable current-turn and authority anchors to provider hierarchy", () => {
  assert.match(reasoning, /function operatorHierarchicalAnchor/);
  assert.match(reasoning, /AVANTIQO_OPERATOR_HIERARCHICAL_ANCHOR_V1/);
  assert.match(reasoning, /user_input: object\(source\.user_input\)/);
  assert.match(reasoning, /business_context: object\(source\.business_context\)/);
  assert.match(reasoning, /current_project_state: object\(source\.current_project_state\)/);
  assert.match(reasoning, /agreement_state: object\(source\.agreement_state\)/);
  assert.match(reasoning, /executable_capability_keys: capabilityKeys/);
  assert.match(reasoning, /authority_effect: "NONE"/);
  assert.match(reasoning, /hierarchical_anchor: hierarchicalAnchor/);
  assert.match(reasoning, /hierarchical_final_instructions: hierarchicalFinalInstructions/);
});

test("provider hierarchy final synthesis preserves Operator decision contract", () => {
  assert.match(reasoning, /function operatorHierarchicalFinalInstructions/);
  assert.match(reasoning, /Return exactly one valid JSON object with keys response_text/);
  assert.match(reasoning, /Stronger reasoning never increases authority/);
  assert.match(hierarchical, /FINAL OUTPUT CONTRACT/);
  assert.match(hierarchical, /Return one valid JSON object only/);
});

test("action-resolution repair reuses the same anchored reasoning request", () => {
  assert.match(reasoning, /\.\.\.reasoningRequest,[\s\S]*server_action_resolution/);
});

test("local provider/hierarchy failures become governed Business Partner clarification", () => {
  assert.match(reasoning, /AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED/);
  assert.match(reasoning, /function localDeepCapacityDecision/);
  assert.match(reasoning, /I kept the work local and did not start external compute/);
  assert.match(reasoning, /external_compute_authority: "NONE"/);
  assert.match(reasoning, /modal_inference_performed: false/);
  assert.match(reasoning, /const capacityDecision = localDeepCapacityDecision/);
});


test("Business Partner applies an interactive local hierarchy budget", () => {
  assert.match(reasoning, /hierarchical_max_chunks: voice \? 4 : 6/);
  assert.match(reasoning, /hierarchical_child_timeout_ms: voice \? 45000 : 60000/);
  assert.match(hierarchical, /function requestedMaxChunks/);
  assert.match(hierarchical, /function requestedChildTimeoutMs/);
  assert.match(hierarchical, /Math\.min\(Math\.floor\(requested\), MAX_CHUNKS\)/);
  assert.match(hierarchical, /Math\.min\(Math\.floor\(value\), 120_000\)/);
});
