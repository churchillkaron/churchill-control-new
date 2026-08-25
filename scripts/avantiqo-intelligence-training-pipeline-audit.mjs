import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const candidate = read("lib/intelligence/runtime/AvantiqoTrainingCandidateRuntime.js");
const dataset = read("lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js");
const compiler = read("lib/intelligence/runtime/AvantiqoTrainingExampleCompilerRuntime.js");
const improvement = read("lib/intelligence/runtime/AvantiqoModelImprovementRuntime.js");
const execution = read("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js");
const handler = read("services/avantiqo-intelligence-trainer/handler.py");
const dockerfile = read("services/avantiqo-intelligence-trainer/Dockerfile.runpod");
const requirements = read("services/avantiqo-intelligence-trainer/requirements.txt");
const index = read("lib/intelligence/index.js");

assert(candidate.includes("AVANTIQO_TRAINING_CANDIDATE_V1"), "TRAINING_CANDIDATE_CONTRACT_REQUIRED");
assert(candidate.includes("MIN_BENCHMARK_CASES = 20"), "TRAINING_CANDIDATE_MIN_BENCHMARK_REQUIRED");
assert(candidate.includes("MIN_PASS_RATE = 0.95"), "TRAINING_CANDIDATE_PASS_RATE_REQUIRED");
assert(candidate.includes("training_ready: false"), "TRAINING_CANDIDATE_DEFAULT_NOT_READY_REQUIRED");
assert(candidate.includes("automatic_model_weight_mutation: false"), "TRAINING_CANDIDATE_AUTO_WEIGHT_MUTATION_FORBIDDEN");

assert(dataset.includes("AVANTIQO_TRAINING_DATASET_V1"), "TRAINING_DATASET_CONTRACT_REQUIRED");
assert(dataset.includes("MIN_READY_CANDIDATES = 8"), "TRAINING_DATASET_MIN_READY_REQUIRED");
assert(dataset.includes("deterministic_holdout_split: true"), "TRAINING_DATASET_HOLDOUT_REQUIRED");
assert(dataset.includes('preferred_method: "QLORA_OR_LORA"'), "TRAINING_DATASET_LORA_REQUIRED");
assert(dataset.includes("base_weights_immutable: true"), "TRAINING_DATASET_IMMUTABLE_BASE_REQUIRED");
assert(dataset.includes("raw_reasoning_training_allowed: false"), "TRAINING_DATASET_RAW_REASONING_FORBIDDEN");

assert(compiler.includes("AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1"), "TRAINING_COMPILER_CONTRACT_REQUIRED");
assert(compiler.includes("customer_private_content_available: false"), "TRAINING_COMPILER_PRIVATE_CONTENT_FORBIDDEN");
assert(compiler.includes("raw_customer_turns_used: false"), "TRAINING_COMPILER_RAW_TURNS_FORBIDDEN");
assert(compiler.includes("raw_reasoning_used_as_training_target: false"), "TRAINING_COMPILER_RAW_REASONING_FORBIDDEN");
assert(compiler.includes("leakageDetected"), "TRAINING_COMPILER_LEAKAGE_GUARD_REQUIRED");
assert(compiler.includes("memory or prior success grants authorization"), "TRAINING_COMPILER_AUTHORIZATION_GUARD_REQUIRED");

assert(improvement.includes("AVANTIQO_MODEL_IMPROVEMENT_V1"), "MODEL_IMPROVEMENT_CONTRACT_REQUIRED");
assert(improvement.includes('FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"'), "MODEL_IMPROVEMENT_FOUNDATION_REQUIRED");
assert(improvement.includes("AVANTIQO_MODEL_IMPROVEMENT_COMPILED_EXAMPLES_REQUIRED"), "MODEL_IMPROVEMENT_COMPILED_EXAMPLES_REQUIRED");
assert(improvement.includes("MIN_EVALUATION_CASES = 50"), "MODEL_IMPROVEMENT_50_CASE_GATE_REQUIRED");
assert(improvement.includes("MIN_CANDIDATE_PASS_RATE = 0.97"), "MODEL_IMPROVEMENT_PASS_RATE_REQUIRED");
assert(improvement.includes("MAX_REGRESSIONS = 0"), "MODEL_IMPROVEMENT_ZERO_REGRESSION_REQUIRED");
assert(improvement.includes("HALLUCINATION_REGRESSION"), "MODEL_IMPROVEMENT_HALLUCINATION_GATE_REQUIRED");
assert(improvement.includes("TOOL_USE_FAILED"), "MODEL_IMPROVEMENT_TOOL_GATE_REQUIRED");
assert(improvement.includes("AUTHORIZATION_FAILED"), "MODEL_IMPROVEMENT_AUTHORIZATION_GATE_REQUIRED");
assert(improvement.includes("automatic_production_promotion: false"), "MODEL_IMPROVEMENT_AUTO_PROMOTION_FORBIDDEN");

assert(execution.includes("AVANTIQO_MODEL_TRAINING_EXECUTION_V1"), "TRAINING_EXECUTION_CONTRACT_REQUIRED");
assert(execution.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED"), "TRAINING_EXECUTION_ENABLE_GATE_REQUIRED");
assert(execution.includes("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID"), "TRAINING_EXECUTION_DEDICATED_ENDPOINT_REQUIRED");
assert(execution.includes("approved !== true"), "TRAINING_EXECUTION_EXPLICIT_APPROVAL_REQUIRED");
assert(execution.includes("execute_training: true"), "TRAINING_EXECUTION_WORKER_APPROVAL_REQUIRED");
assert(execution.includes("foundation_weights_mutated !== false"), "TRAINING_EXECUTION_BASE_WEIGHT_INVARIANT_REQUIRED");
assert(execution.includes("production_model_promoted !== false"), "TRAINING_EXECUTION_PRODUCTION_INVARIANT_REQUIRED");
assert(execution.includes("candidate_benchmark_required: true"), "TRAINING_EXECUTION_BENCHMARK_REQUIRED");

assert(handler.includes('CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_V1"'), "TRAINER_WORKER_CONTRACT_REQUIRED");
assert(handler.includes('FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"'), "TRAINER_FOUNDATION_ALLOWLIST_REQUIRED");
assert(handler.includes("BitsAndBytesConfig"), "TRAINER_BITSANDBYTES_REQUIRED");
assert(handler.includes('bnb_4bit_quant_type="nf4"'), "TRAINER_NF4_REQUIRED");
assert(handler.includes("prepare_model_for_kbit_training"), "TRAINER_KBIT_PREPARATION_REQUIRED");
assert(handler.includes("LoraConfig"), "TRAINER_LORA_REQUIRED");
assert(handler.includes("gradient_checkpointing=True"), "TRAINER_GRADIENT_CHECKPOINTING_REQUIRED");
assert(handler.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED"), "TRAINER_ENABLE_GATE_REQUIRED");
assert(handler.includes('payload.get("execute_training") is not True'), "TRAINER_EXPLICIT_EXECUTION_REQUIRED");
assert(handler.includes('"foundation_weights_mutated": False'), "TRAINER_BASE_WEIGHT_MUTATION_FORBIDDEN");
assert(handler.includes('"production_model_promoted": False'), "TRAINER_AUTO_PROMOTION_FORBIDDEN");
assert(handler.includes("TRAINING_EXAMPLE_POTENTIAL_PRIVATE_DATA_REJECTED"), "TRAINER_PRIVATE_DATA_GUARD_REQUIRED");

assert(dockerfile.includes("pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime"), "TRAINER_CUDA_IMAGE_REQUIRED");
assert(dockerfile.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED=false"), "TRAINER_DISABLED_BY_DEFAULT_REQUIRED");
assert(dockerfile.includes("/runpod-volume/avantiqo-intelligence-training"), "TRAINER_ISOLATED_OUTPUT_REQUIRED");
assert(dockerfile.includes("python -m py_compile handler.py"), "TRAINER_BUILD_STATIC_CHECK_REQUIRED");

assert(requirements.includes("runpod==1.12.0"), "TRAINER_RUNPOD_PIN_REQUIRED");
assert(requirements.includes("transformers==5.15.0"), "TRAINER_TRANSFORMERS_PIN_REQUIRED");
assert(requirements.includes("peft==0.20.0"), "TRAINER_PEFT_PIN_REQUIRED");
assert(requirements.includes("accelerate==1.14.0"), "TRAINER_ACCELERATE_PIN_REQUIRED");
assert(requirements.includes("bitsandbytes==0.50.0"), "TRAINER_BITSANDBYTES_PIN_REQUIRED");

assert(index.includes("AvantiqoTrainingExampleCompilerRuntime"), "TRAINING_COMPILER_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelImprovementRuntime"), "MODEL_IMPROVEMENT_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelTrainingExecutionRuntime"), "TRAINING_EXECUTION_EXPORT_REQUIRED");

console.log("AVANTIQO_INTELLIGENCE_TRAINING_PIPELINE_AUDIT=PASS");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_RAW_CUSTOMER_DATA=FORBIDDEN");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_RAW_REASONING=FORBIDDEN");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_METHOD=QLORA_PEFT");
console.log("AVANTIQO_INTELLIGENCE_TRAINER_DEFAULT_ENABLED=NO");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_EXPLICIT_APPROVAL=REQUIRED");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_BASE_WEIGHTS_MUTATED=NO");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_PRODUCTION_PROMOTION=AUTO_FORBIDDEN");
