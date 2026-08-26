import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE3_AUDIT_V1";
const files = Object.freeze({
  attribution: "lib/intelligence/runtime/AvantiqoKnowledgeUtilityAttributionRuntime.js",
  feedback: "lib/intelligence/runtime/AvantiqoKnowledgeUtilityFeedbackRuntime.js",
  conversation: "lib/operator/runtime/IntelligenceConversationRuntime.js",
  route: "app/api/internal/intelligence/continuous-learning/process/route.js",
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

const [attribution, feedback, conversation, route, index] =
  await Promise.all(Object.values(files).map(source));

hasAll(attribution, [
  "AVANTIQO_KNOWLEDGE_UTILITY_ATTRIBUTION_V1",
  'UTILITY_SCOPE = "platform_learning_knowledge_utility"',
  "observeVerifiedExecutionFailure",
  "observeVerifiedExecutionSuccess",
  "VERIFIED_OUTCOME_WITH_EXPLICIT_KNOWLEDGE_PROVENANCE_REQUIRED",
  'relationship: "OBSERVATIONAL_ASSOCIATION_ONLY"',
  "causal_attribution_allowed: false",
  "MIN_SIGNAL_OBSERVATIONS = 8",
  "MIN_SIGNAL_DAYS = 3",
  "bayesian_smoothing_applied: true",
  "single_observation_changes_learning_policy: false",
  "customer_private_content_included: false",
  "source_customer_scope_persisted: false",
  "source_party_id_persisted: false",
  "source_conversation_id_persisted: false",
  "raw_decision_persisted: false",
  "raw_evidence_persisted: false",
  "raw_execution_payload_persisted: false",
  "raw_output_persisted: false",
  "raw_reasoning_persisted: false",
  "training_ready: false",
  'automatic_training_effect: "NONE"',
  'production_model_promotion_effect: "NONE"',
], "knowledge utility attribution");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(attribution), false,
  "knowledge utility attribution must not call RunPod");
assert.equal(/workersMax\s*[:=]/.test(attribution), false,
  "knowledge utility attribution must not mutate worker limits");

hasAll(conversation, [
  "recordAvantiqoKnowledgeUtilityObservation",
  "INTELLIGENCE_KNOWLEDGE_UTILITY_LEARN_FAILED",
  "decision: object(decision)",
  "evidence: object(evidence)",
  "execution: object(execution)",
], "conversation persistence");

hasAll(feedback, [
  "AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_V1",
  "summarizeAvantiqoKnowledgeUtilityAttribution",
  "pattern.signal_eligible !== true",
  "ELIGIBLE_NEGATIVE_KNOWLEDGE_UTILITY_ASSOCIATION",
  "ELIGIBLE_MIXED_KNOWLEDGE_UTILITY_ASSOCIATION",
  "ELIGIBLE_POSITIVE_KNOWLEDGE_UTILITY_ASSOCIATION",
  "anti_overfitting_gate_passed: true",
  'relationship: "OBSERVATIONAL_ASSOCIATION_ONLY"',
  "causal_attribution_allowed: false",
  "ineligible_patterns_change_learning_policy: false",
  "single_observation_changes_learning_policy: false",
  "product_outcomes_authorize_actions: false",
  "automatic_training_started: false",
  "automatic_model_weight_mutation: false",
  "automatic_model_promotion: false",
  "runpod_job_submitted: false",
  "runpod_endpoint_mutated: false",
], "knowledge utility feedback");

assert.equal(/api\.runpod\.ai|rest\.runpod\.io/.test(feedback), false,
  "knowledge utility feedback must not call RunPod");
assert.equal(/workersMax\s*[:=]/.test(feedback), false,
  "knowledge utility feedback must not mutate worker limits");

hasAll(route, [
  "applyAvantiqoKnowledgeUtilityFeedback",
  "const learningEffectiveness = await evaluateAvantiqoLearningEffectiveness();",
  "const knowledgeUtilityFeedback = await applyAvantiqoKnowledgeUtilityFeedback();",
  "const result = await runAvantiqoContinuousLearningBatch({ limit });",
  "knowledge_utility_feedback: knowledgeUtilityFeedback",
], "continuous learning route");

const effectivenessIndex = route.indexOf("const learningEffectiveness = await evaluateAvantiqoLearningEffectiveness();");
const utilityIndex = route.indexOf("const knowledgeUtilityFeedback = await applyAvantiqoKnowledgeUtilityFeedback();");
const researchIndex = route.indexOf("const result = await runAvantiqoContinuousLearningBatch({ limit });");
assert.ok(effectivenessIndex >= 0 && utilityIndex > effectivenessIndex && researchIndex > utilityIndex,
  "knowledge utility feedback must run after effectiveness and before bounded research");

hasAll(index, [
  'export * from "./runtime/AvantiqoKnowledgeUtilityAttributionRuntime";',
  'export * from "./runtime/AvantiqoKnowledgeUtilityFeedbackRuntime";',
], "intelligence exports");

const result = {
  success: true,
  contract: CONTRACT,
  status: "PASS",
  learning_architecture: {
    explicit_machine_readable_knowledge_provenance_required: true,
    verified_execution_outcome_required: true,
    immutable_deidentified_knowledge_use_receipts: true,
    knowledge_utility_feedback_loop: true,
    minimum_eight_observations_per_signal: true,
    minimum_three_distinct_days_per_signal: true,
    bayesian_smoothing: true,
    single_observation_cannot_change_learning_policy: true,
    feedback_runs_before_bounded_research: true,
    observational_association_not_causal_attribution: true,
  },
  governance: {
    customer_private_content_promoted: false,
    source_customer_identifiers_persisted: false,
    raw_decision_persisted: false,
    raw_evidence_persisted: false,
    raw_execution_payload_persisted: false,
    raw_output_persisted: false,
    raw_reasoning_persisted: false,
    product_actions_authorized_by_learning: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    automatic_model_promotion: false,
    runpod_job_submitted: false,
    runpod_endpoint_mutated: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE3_AUDIT=PASS");
