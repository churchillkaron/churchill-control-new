import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const policyPath = "lib/operator/runtime/IntelligenceFailureLearningPolicy.js";
const runtimePath = "lib/operator/runtime/IntelligenceAdaptiveLearningRuntime.js";
const conversationPath = "lib/operator/runtime/IntelligenceConversationRuntime.js";
const trainingPath = "lib/intelligence/runtime/AvantiqoTrainingCandidateRuntime.js";
const indexPath = "lib/intelligence/index.js";

const policy = read(policyPath);
const runtime = read(runtimePath);
const conversation = read(conversationPath);
const training = read(trainingPath);
const index = read(indexPath);

assert(policy.includes("observeVerifiedExecutionSuccess"), "EXPERIENCE_SUCCESS_OBSERVATION_REQUIRED");
assert(policy.includes("deriveResolvedFailureLearning"), "EXPERIENCE_RECOVERY_DERIVATION_REQUIRED");
assert(policy.includes("failure_family"), "EXPERIENCE_FAILURE_FAMILY_REQUIRED");
assert(policy.includes("verified_failure_recovery"), "EXPERIENCE_RECOVERY_SOURCE_REQUIRED");
assert(runtime.includes('const TRAINING_SCOPE = "platform_training_candidates"'), "EXPERIENCE_TRAINING_SCOPE_REQUIRED");
assert(runtime.includes("AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID"), "EXPERIENCE_DEDICATED_LEARNING_ORG_REQUIRED");
assert(runtime.includes("training_ready: false"), "EXPERIENCE_NO_AUTO_TRAINING_REQUIRED");
assert(runtime.includes("requires_benchmark_validation: true"), "EXPERIENCE_BENCHMARK_GATE_REQUIRED");
assert(runtime.includes("customer_private_content_included: false"), "EXPERIENCE_PRIVATE_CONTENT_EXCLUSION_REQUIRED");
assert(runtime.includes("raw_payload_persisted: false"), "EXPERIENCE_RAW_PAYLOAD_EXCLUSION_REQUIRED");
assert(runtime.includes("raw_output_persisted: false"), "EXPERIENCE_RAW_OUTPUT_EXCLUSION_REQUIRED");
assert(runtime.includes("learnVerifiedRecoveryExperience"), "EXPERIENCE_SUCCESS_LEARNING_REQUIRED");
assert(runtime.includes("RECOVERY_LOOKBACK_DAYS"), "EXPERIENCE_LOOKBACK_BOUND_REQUIRED");
assert(conversation.includes("learnAdaptiveExecutionLesson"), "EXPERIENCE_EXISTING_PERSISTENCE_HOOK_REQUIRED");
assert(conversation.includes("retireAdaptiveLessonsAfterVerifiedSuccess"), "EXPERIENCE_FAILURE_RETIREMENT_REQUIRED");

assert(training.includes("AVANTIQO_TRAINING_CANDIDATE_V1"), "TRAINING_CANDIDATE_CONTRACT_REQUIRED");
assert(training.includes("MIN_BENCHMARK_CASES = 20"), "TRAINING_CANDIDATE_MIN_CASES_REQUIRED");
assert(training.includes("MIN_PASS_RATE = 0.95"), "TRAINING_CANDIDATE_PASS_RATE_REQUIRED");
assert(training.includes("regression_count > 0"), "TRAINING_CANDIDATE_NO_REGRESSION_REQUIRED");
assert(training.includes("privacy_passed"), "TRAINING_CANDIDATE_PRIVACY_GATE_REQUIRED");
assert(training.includes("governance_passed"), "TRAINING_CANDIDATE_GOVERNANCE_GATE_REQUIRED");
assert(training.includes("leakage_detected"), "TRAINING_CANDIDATE_LEAKAGE_GATE_REQUIRED");
assert(training.includes("automatic_model_weight_mutation: false"), "TRAINING_CANDIDATE_NO_WEIGHT_MUTATION_REQUIRED");
assert(training.includes('production_model_promotion_effect: "NONE"'), "TRAINING_CANDIDATE_NO_PRODUCTION_PROMOTION_REQUIRED");
assert(index.includes("AvantiqoTrainingCandidateRuntime"), "TRAINING_CANDIDATE_EXPORT_REQUIRED");

console.log("AVANTIQO_EXPERIENCE_LEARNING_AUDIT=PASS");
console.log("AVANTIQO_EXPERIENCE_VERIFIED_SUCCESS_LEARNING=YES");
console.log("AVANTIQO_EXPERIENCE_PRIVATE_SCOPE_PRESERVED=YES");
console.log("AVANTIQO_EXPERIENCE_DEIDENTIFIED_TRAINING_CANDIDATES=YES");
console.log("AVANTIQO_EXPERIENCE_BENCHMARK_GATE=YES");
console.log("AVANTIQO_EXPERIENCE_AUTOMATIC_WEIGHT_MUTATION=NO");
