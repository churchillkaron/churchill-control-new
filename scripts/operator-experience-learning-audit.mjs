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
const datasetPath = "lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js";
const improvementPath = "lib/intelligence/runtime/AvantiqoModelImprovementRuntime.js";
const indexPath = "lib/intelligence/index.js";

const policy = read(policyPath);
const runtime = read(runtimePath);
const conversation = read(conversationPath);
const training = read(trainingPath);
const dataset = read(datasetPath);
const improvement = read(improvementPath);
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

assert(dataset.includes("AVANTIQO_TRAINING_DATASET_V1"), "TRAINING_DATASET_CONTRACT_REQUIRED");
assert(dataset.includes("MIN_READY_CANDIDATES = 8"), "TRAINING_DATASET_MIN_CANDIDATES_REQUIRED");
assert(dataset.includes("deterministic_holdout_split: true"), "TRAINING_DATASET_HOLDOUT_REQUIRED");
assert(dataset.includes('strategy: "PEFT_ADAPTER_CANDIDATE"'), "TRAINING_DATASET_PEFT_STRATEGY_REQUIRED");
assert(dataset.includes('TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"'), "TRAINING_DATASET_BF16_MOE_METHOD_REQUIRED");
assert(dataset.includes('TRAINING_BACKEND = "RUNPOD_SERVERLESS_DEDICATED_TRAINER"'), "TRAINING_DATASET_DEDICATED_BACKEND_REQUIRED");
assert(dataset.includes("preferred_method: TRAINING_METHOD"), "TRAINING_DATASET_METHOD_BINDING_REQUIRED");
assert(dataset.includes('base_precision: "BF16"'), "TRAINING_DATASET_BF16_REQUIRED");
assert(dataset.includes("base_quantized: false"), "TRAINING_DATASET_UNQUANTIZED_BASE_REQUIRED");
assert(dataset.includes("execution_backend: TRAINING_BACKEND"), "TRAINING_DATASET_BACKEND_BINDING_REQUIRED");
assert(dataset.includes("explicit_training_execution_required: true"), "TRAINING_DATASET_EXPLICIT_EXECUTION_REQUIRED");
assert(!dataset.includes("QLORA_OR_LORA"), "TRAINING_DATASET_LEGACY_QLORA_RECIPE_FORBIDDEN");
assert(dataset.includes("base_weights_immutable: true"), "TRAINING_DATASET_BASE_WEIGHTS_IMMUTABLE_REQUIRED");
assert(dataset.includes("synthetic_example_compilation_required: true"), "TRAINING_DATASET_SYNTHETIC_COMPILATION_REQUIRED");
assert(dataset.includes("raw_reasoning_training_allowed: false"), "TRAINING_DATASET_RAW_REASONING_FORBIDDEN");

assert(improvement.includes("AVANTIQO_MODEL_IMPROVEMENT_V1"), "MODEL_IMPROVEMENT_CONTRACT_REQUIRED");
assert(improvement.includes('FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"'), "MODEL_IMPROVEMENT_FOUNDATION_REQUIRED");
assert(improvement.includes('TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"'), "MODEL_IMPROVEMENT_BF16_MOE_METHOD_REQUIRED");
assert(improvement.includes('TRAINING_BACKEND = "RUNPOD_SERVERLESS_DEDICATED_TRAINER"'), "MODEL_IMPROVEMENT_DEDICATED_BACKEND_REQUIRED");
assert(improvement.includes("MIN_EVALUATION_CASES = 50"), "MODEL_IMPROVEMENT_MIN_EVALUATION_REQUIRED");
assert(improvement.includes("MIN_CANDIDATE_PASS_RATE = 0.97"), "MODEL_IMPROVEMENT_PASS_RATE_REQUIRED");
assert(improvement.includes("MAX_REGRESSIONS = 0"), "MODEL_IMPROVEMENT_ZERO_REGRESSION_REQUIRED");
assert(improvement.includes("MIN_QUALITY_DELTA = 0.01"), "MODEL_IMPROVEMENT_QUALITY_DELTA_REQUIRED");
assert(improvement.includes("foundation_weights_immutable: true"), "MODEL_IMPROVEMENT_BASE_WEIGHTS_IMMUTABLE_REQUIRED");
assert(improvement.includes("execution_backend: TRAINING_BACKEND"), "MODEL_IMPROVEMENT_BACKEND_BOUND_REQUIRED");
assert(!improvement.includes("UNBOUND_UNTIL_TRAINING_WORKER_CONFIGURED"), "MODEL_IMPROVEMENT_UNBOUND_BACKEND_FORBIDDEN");
assert(!improvement.includes("QLORA_OR_LORA"), "MODEL_IMPROVEMENT_LEGACY_QLORA_RECIPE_FORBIDDEN");
assert(improvement.includes("HALLUCINATION_REGRESSION"), "MODEL_IMPROVEMENT_HALLUCINATION_GATE_REQUIRED");
assert(improvement.includes("TOOL_USE_FAILED"), "MODEL_IMPROVEMENT_TOOL_GATE_REQUIRED");
assert(improvement.includes("AUTHORIZATION_FAILED"), "MODEL_IMPROVEMENT_AUTHORIZATION_GATE_REQUIRED");
assert(improvement.includes("automatic_production_promotion: false"), "MODEL_IMPROVEMENT_NO_AUTO_PROMOTION_REQUIRED");
assert(improvement.includes('production_model_promotion_effect: "NONE"'), "MODEL_IMPROVEMENT_NO_PRODUCTION_EFFECT_REQUIRED");

assert(index.includes("AvantiqoTrainingCandidateRuntime"), "TRAINING_CANDIDATE_EXPORT_REQUIRED");
assert(index.includes("AvantiqoTrainingDatasetRuntime"), "TRAINING_DATASET_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelImprovementRuntime"), "MODEL_IMPROVEMENT_EXPORT_REQUIRED");

console.log("AVANTIQO_EXPERIENCE_LEARNING_AUDIT=PASS");
console.log("AVANTIQO_EXPERIENCE_VERIFIED_SUCCESS_LEARNING=YES");
console.log("AVANTIQO_EXPERIENCE_PRIVATE_SCOPE_PRESERVED=YES");
console.log("AVANTIQO_EXPERIENCE_DEIDENTIFIED_TRAINING_CANDIDATES=YES");
console.log("AVANTIQO_EXPERIENCE_BENCHMARK_GATE=YES");
console.log("AVANTIQO_TRAINING_DATASET_ASSEMBLY=YES");
console.log("AVANTIQO_TRAINING_ADAPTER_STRATEGY=LORA_BF16_PEFT_QWEN3_MOE");
console.log("AVANTIQO_TRAINING_BACKEND=RUNPOD_SERVERLESS_DEDICATED_TRAINER");
console.log("AVANTIQO_TRAINING_BASE_QUANTIZED=NO");
console.log("AVANTIQO_MODEL_CANDIDATE_BASELINE_GATE=YES");
console.log("AVANTIQO_EXPERIENCE_AUTOMATIC_WEIGHT_MUTATION=NO");
console.log("AVANTIQO_MODEL_AUTOMATIC_PRODUCTION_PROMOTION=NO");