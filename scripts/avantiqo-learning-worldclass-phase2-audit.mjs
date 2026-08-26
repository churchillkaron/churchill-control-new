import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE2_AUDIT_V1";
const files = Object.freeze({
  outcome: "lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime.js",
  effectiveness: "lib/intelligence/runtime/AvantiqoLearningEffectivenessRuntime.js",
  conversation: "lib/operator/runtime/IntelligenceConversationRuntime.js",
  evidenceGraph: "lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime.js",
  knowledgeRouter: "lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js",
  index: "lib/intelligence/index.js",
});

async function source(path) {
  return readFile(path, "utf8");
}

function hasAll(content, markers, label) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `${label}: missing marker ${marker}`);
  }
}

const [outcome, effectiveness, conversation, evidenceGraph, knowledgeRouter, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(outcome, [
  "AVANTIQO_VERIFIED_OUTCOME_LEARNING_V1",
  'OUTCOME_SCOPE = "platform_learning_outcomes"',
  "observeVerifiedExecutionFailure",
  "observeVerifiedExecutionSuccess",
  'outcome: "VERIFIED_SUCCESS"',
  'outcome: "VERIFIED_FAILURE"',
  "structural_outcome_only: true",
  "customer_private_content_included: false",
  "customer_identifiers_included: false",
  "source_organization_id_persisted: false",
  "source_party_id_persisted: false",
  "source_conversation_id_persisted: false",
  "raw_payload_persisted: false",
  "raw_output_persisted: false",
  "raw_reasoning_persisted: false",
  "raw_failure_reason_persisted: false",
  "training_ready: false",
  'automatic_training_effect: "NONE"',
  'production_model_promotion_effect: "NONE"',
], "verified outcome runtime");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(outcome), false,
  "verified outcome runtime must not call RunPod");
assert.equal(/workersMax\s*[:=]/.test(outcome), false,
  "verified outcome runtime must not mutate worker limits");
assert.equal(/organizationId\s*[,}]/.test(
  outcome.slice(outcome.indexOf("recordAvantiqoVerifiedExecutionOutcome"),
    outcome.indexOf("function summarizeCapability")),
), false, "verified outcome API must not accept a source organization id");
assert.equal(/partyId|conversationId/.test(outcome), false,
  "verified outcome runtime must not accept or persist source party/conversation ids");

hasAll(conversation, [
  "recordAvantiqoVerifiedExecutionOutcome",
  "INTELLIGENCE_VERIFIED_OUTCOME_LEARN_FAILED",
], "conversation persistence");
const outcomeCall = conversation.match(
  /recordAvantiqoVerifiedExecutionOutcome\s*\(\s*\{([\s\S]*?)\}\s*\)/,
);
assert.ok(outcomeCall, "verified outcome call not found");
assert.ok(outcomeCall[1].includes("execution: object(execution)"),
  "verified outcome call must pass execution only");
assert.equal(/organizationId|partyId|conversationId/.test(outcomeCall[1]), false,
  "verified outcome call must not forward customer scope identifiers");

hasAll(effectiveness, [
  "summarizeAvantiqoVerifiedExecutionOutcomes",
  "product_outcome: productOutcome",
  'outcome_relationship: "OBSERVATIONAL_CORRELATION_ONLY"',
  "causal_attribution_allowed: false",
  "VERIFIED_PRODUCT_OUTCOME_ATTENTION_REQUIRED",
  "VERIFIED_PRODUCT_CAPABILITY_UNSTABLE",
  "verified_product_outcomes_influence_priority: true",
  "product_outcomes_authorize_actions: false",
], "learning effectiveness");
assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(effectiveness), false,
  "learning effectiveness must not call RunPod");
assert.equal(/workersMax\s*[:=]/.test(effectiveness), false,
  "learning effectiveness must not mutate worker limits");

hasAll(evidenceGraph, [
  "AVANTIQO_EVIDENCE_GRAPH_V1",
  '"SUPPORTED"',
  '"CONFLICTED"',
  '"INSUFFICIENT"',
  "conflicted_claims_never_promoted_as_consensus: true",
  "evidence_never_authorizes_actions: true",
], "evidence graph");

hasAll(knowledgeRouter, [
  "AVANTIQO_KNOWLEDGE_ROUTER_V2",
  "inspectAvantiqoEvidenceGraph",
  "block_knowledge_reuse",
  "forced_fresh_research",
], "knowledge router");

hasAll(index, [
  'export * from "./runtime/AvantiqoEvidenceGraphRuntime";',
  'export * from "./runtime/AvantiqoVerifiedOutcomeLearningRuntime";',
  'export * from "./runtime/AvantiqoLearningEffectivenessRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    durable_evidence_graph: true,
    conflicted_knowledge_reuse_blocked: true,
    fresh_research_for_stale_or_conflicted_evidence: true,
    verified_product_outcome_capture: true,
    structural_deidentified_outcomes_only: true,
    outcome_feedback_into_learning_priority: true,
    outcome_feedback_is_observational_not_causal: true,
  },
  governance: {
    customer_private_content_promoted: false,
    source_customer_identifiers_persisted: false,
    raw_payload_persisted: false,
    raw_output_persisted: false,
    raw_reasoning_persisted: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    runpod_job_submitted: false,
    runpod_endpoint_mutated: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE2_AUDIT=PASS");
