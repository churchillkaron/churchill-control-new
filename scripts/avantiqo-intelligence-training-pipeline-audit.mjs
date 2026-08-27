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
assert(candidate.includes("training_ready: metadata.training_ready === true"), "TRAINING_CANDIDATE_EXPLICIT_READY_TRUE_REQUIRED");
assert(candidate.includes("training_ready: decision.approved"), "TRAINING_CANDIDATE_BENCHMARK_DECISION_BOUND_REQUIRED");
assert(candidate.includes("training_ready_means_dataset_eligible_only: true"), "TRAINING_CANDIDATE_READY_DATASET_ONLY_REQUIRED");
assert(candidate.includes("automatic_training_started: false"), "TRAINING_CANDIDATE_AUTO_TRAINING_FORBIDDEN");
assert(candidate.includes("automatic_model_weight_mutation: false"), "TRAINING_CANDIDATE_AUTO_WEIGHT_MUTATION_FORBIDDEN");

assert(dataset.includes("AVANTIQO_TRAINING_DATASET_V1"), "TRAINING_DATASET_CONTRACT_REQUIRED");
assert(dataset.includes("MIN_READY_CANDIDATES = 8"), "TRAINING_DATASET_MIN_READY_REQUIRED");
assert(dataset.includes("deterministic_holdout_split: true"), "TRAINING_DATASET_HOLDOUT_REQUIRED");
assert(dataset.includes('TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"'), "TRAINING_DATASET_BF16_MOE_METHOD_REQUIRED");
assert(dataset.includes('TRAINING_BACKEND = "RUNPOD_SERVERLESS_DEDICATED_TRAINER"'), "TRAINING_DATASET_DEDICATED_TRAINER_REQUIRED");
assert(dataset.includes("preferred_method: TRAINING_METHOD"), "TRAINING_DATASET_METHOD_BINDING_REQUIRED");
assert(dataset.includes('base_precision: "BF16"'), "TRAINING_DATASET_BF16_BASE_REQUIRED");
assert(dataset.includes("base_quantized: false"), "TRAINING_DATASET_UNQUANTIZED_BASE_REQUIRED");
assert(dataset.includes("execution_backend: TRAINING_BACKEND"), "TRAINING_DATASET_BACKEND_BINDING_REQUIRED");
assert(dataset.includes("dedicated_trainer_required: true"), "TRAINING_DATASET_DEDICATED_TRAINER_FLAG_REQUIRED");
assert(dataset.includes("explicit_training_execution_required: true"), "TRAINING_DATASET_EXPLICIT_EXECUTION_REQUIRED");
assert(!dataset.includes("QLORA_OR_LORA"), "TRAINING_DATASET_LEGACY_QLORA_RECIPE_FORBIDDEN");
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
assert(improvement.includes('TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"'), "MODEL_IMPROVEMENT_BF16_MOE_METHOD_REQUIRED");
assert(improvement.includes('TRAINING_BACKEND = "RUNPOD_SERVERLESS_DEDICATED_TRAINER"'), "MODEL_IMPROVEMENT_DEDICATED_TRAINER_REQUIRED");
assert(improvement.includes("MIN_BF16_GPU_MEMORY_BYTES = 78 * 1024 * 1024 * 1024"), "MODEL_IMPROVEMENT_80GB_CLASS_REQUIRED");
assert(improvement.includes("DEFAULT_SEQUENCE_LENGTH = 1024"), "MODEL_IMPROVEMENT_DEFAULT_SEQUENCE_REQUIRED");
assert(improvement.includes("MAX_SEQUENCE_LENGTH = 2048"), "MODEL_IMPROVEMENT_MAX_SEQUENCE_REQUIRED");
assert(improvement.includes('DENSE_LORA_TARGET_MODULES = ["q_proj", "v_proj"]'), "MODEL_IMPROVEMENT_DENSE_TARGETS_REQUIRED");
assert(improvement.includes('"mlp.experts.gate_up_proj"'), "MODEL_IMPROVEMENT_GATE_UP_TARGET_REQUIRED");
assert(improvement.includes('"mlp.experts.down_proj"'), "MODEL_IMPROVEMENT_DOWN_TARGET_REQUIRED");
assert(improvement.includes("base_quantized: false"), "MODEL_IMPROVEMENT_UNQUANTIZED_BASE_REQUIRED");
assert(improvement.includes("lora_dropout: 0"), "MODEL_IMPROVEMENT_ZERO_DROPOUT_REQUIRED");
assert(improvement.includes("execution_backend: TRAINING_BACKEND"), "MODEL_IMPROVEMENT_EXECUTION_BACKEND_BOUND_REQUIRED");
assert(improvement.includes("explicit_training_execution_required: true"), "MODEL_IMPROVEMENT_EXPLICIT_TRAINING_REQUIRED");
assert(improvement.includes("candidate_benchmark_required: true"), "MODEL_IMPROVEMENT_CANDIDATE_BENCHMARK_REQUIRED");
assert(!improvement.includes("QLORA_OR_LORA"), "MODEL_IMPROVEMENT_LEGACY_QLORA_RECIPE_FORBIDDEN");
assert(!improvement.includes("UNBOUND_UNTIL_TRAINING_WORKER_CONFIGURED"), "MODEL_IMPROVEMENT_UNBOUND_BACKEND_FORBIDDEN");
assert(improvement.includes("AVANTIQO_MODEL_IMPROVEMENT_COMPILED_EXAMPLES_REQUIRED"), "MODEL_IMPROVEMENT_COMPILED_EXAMPLES_REQUIRED");
assert(improvement.includes("MIN_EVALUATION_CASES = 50"), "MODEL_IMPROVEMENT_50_CASE_GATE_REQUIRED");
assert(improvement.includes("MIN_CANDIDATE_PASS_RATE = 0.97"), "MODEL_IMPROVEMENT_PASS_RATE_REQUIRED");
assert(improvement.includes("MAX_REGRESSIONS = 0"), "MODEL_IMPROVEMENT_ZERO_REGRESSION_REQUIRED");
assert(improvement.includes("HALLUCINATION_REGRESSION"), "MODEL_IMPROVEMENT_HALLUCINATION_GATE_REQUIRED");
assert(improvement.includes("TOOL_USE_FAILED"), "MODEL_IMPROVEMENT_TOOL_GATE_REQUIRED");
assert(improvement.includes("AUTHORIZATION_FAILED"), "MODEL_IMPROVEMENT_AUTHORIZATION_GATE_REQUIRED");
assert(improvement.includes("automatic_production_promotion: false"), "MODEL_IMPROVEMENT_AUTO_PROMOTION_FORBIDDEN");

assert(execution.includes("AVANTIQO_MODEL_TRAINING_EXECUTION_V1"), "TRAINING_EXECUTION_CONTRACT_REQUIRED");
assert(execution.includes('TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE"'), "TRAINING_EXECUTION_BF16_MOE_METHOD_REQUIRED");
assert(execution.includes("DEFAULT_SEQUENCE_LENGTH = 1024"), "TRAINING_EXECUTION_DEFAULT_SEQUENCE_BOUND_REQUIRED");
assert(execution.includes("MAX_SEQUENCE_LENGTH = 2048"), "TRAINING_EXECUTION_MAX_SEQUENCE_BOUND_REQUIRED");
assert(execution.includes('DENSE_LORA_TARGET_MODULES = ["q_proj", "v_proj"]'), "TRAINING_EXECUTION_OFFICIAL_DENSE_TARGETS_REQUIRED");
assert(execution.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED"), "TRAINING_EXECUTION_ENABLE_GATE_REQUIRED");
assert(execution.includes("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID"), "TRAINING_EXECUTION_DEDICATED_ENDPOINT_REQUIRED");
assert(execution.includes("approved !== true"), "TRAINING_EXECUTION_EXPLICIT_APPROVAL_REQUIRED");
assert(execution.includes("execute_training: true"), "TRAINING_EXECUTION_WORKER_APPROVAL_REQUIRED");
assert(execution.includes("foundation_weights_mutated !== false"), "TRAINING_EXECUTION_BASE_WEIGHT_INVARIANT_REQUIRED");
assert(execution.includes("production_model_promoted !== false"), "TRAINING_EXECUTION_PRODUCTION_INVARIANT_REQUIRED");
assert(execution.includes("candidate_benchmark_required: true"), "TRAINING_EXECUTION_BENCHMARK_REQUIRED");
assert(execution.includes("lora_dropout: 0"), "TRAINING_EXECUTION_MOE_DROPOUT_ZERO_REQUIRED");
assert(execution.includes("output.base_precision !== \"BF16\""), "TRAINING_EXECUTION_BF16_RESULT_REQUIRED");
assert(execution.includes("output.base_quantized !== false"), "TRAINING_EXECUTION_UNQUANTIZED_BASE_REQUIRED");
assert(execution.includes("78 * 1024 * 1024 * 1024"), "TRAINING_EXECUTION_80GB_CLASS_GPU_REQUIRED");
assert(execution.includes("Number(output.max_sequence_length || 0) > MAX_SEQUENCE_LENGTH"), "TRAINING_EXECUTION_RESULT_SEQUENCE_BOUND_REQUIRED");
assert(execution.includes("outputDenseTargets.some"), "TRAINING_EXECUTION_RESULT_DENSE_TARGET_GATE_REQUIRED");
assert(execution.includes("AVANTIQO_INTELLIGENCE_TRAINER_MOE_ADAPTER_INVARIANT_FAILED"), "TRAINING_EXECUTION_MOE_COMPLETION_GATE_REQUIRED");
assert(execution.includes("moe_adapter_attachment_verified !== true"), "TRAINING_EXECUTION_MOE_ATTACHMENT_REQUIRED");
assert(execution.includes("moe_fused_expert_layout_verified !== true"), "TRAINING_EXECUTION_MOE_FUSED_LAYOUT_REQUIRED");

assert(handler.includes('CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_V1"'), "TRAINER_WORKER_CONTRACT_REQUIRED");
assert(handler.includes('FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"'), "TRAINER_FOUNDATION_ALLOWLIST_REQUIRED");
assert(handler.includes("MAX_SEQUENCE_LENGTH = 2048"), "TRAINER_MAX_SEQUENCE_BOUND_REQUIRED");
assert(handler.includes("DEFAULT_SEQUENCE_LENGTH = 1024"), "TRAINER_DEFAULT_SEQUENCE_BOUND_REQUIRED");
assert(handler.includes('DENSE_LORA_TARGET_MODULES = [\n    "q_proj",\n    "v_proj",\n]'), "TRAINER_OFFICIAL_QWEN3_DENSE_TARGETS_REQUIRED");
assert(!handler.includes('"k_proj",'), "TRAINER_K_PROJ_TARGET_FORBIDDEN_FOR_FIRST_PROFILE");
assert(!handler.includes('"o_proj",'), "TRAINER_O_PROJ_TARGET_FORBIDDEN_FOR_FIRST_PROFILE");
assert(handler.includes("MIN_BF16_GPU_MEMORY_BYTES = 78 * 1024 * 1024 * 1024"), "TRAINER_BF16_80GB_CLASS_GPU_REQUIRED");
assert(handler.includes("AutoModelForCausalLM.from_pretrained"), "TRAINER_MODEL_LOAD_REQUIRED");
assert(handler.includes("torch_dtype=torch.bfloat16"), "TRAINER_BF16_MODEL_LOAD_REQUIRED");
assert(!handler.includes("BitsAndBytesConfig"), "TRAINER_BITSANDBYTES_FORBIDDEN_FOR_FUSED_MOE");
assert(!handler.includes("load_in_4bit"), "TRAINER_FAKE_QLORA_FORBIDDEN");
assert(handler.includes("gradient_checkpointing_enable"), "TRAINER_GRADIENT_CHECKPOINTING_REQUIRED");
assert(handler.includes("LoraConfig"), "TRAINER_LORA_REQUIRED");
assert(handler.includes("MOE_LORA_TARGET_PARAMETERS"), "TRAINER_MOE_TARGET_PARAMETERS_REQUIRED");
assert(handler.includes('"mlp.experts.gate_up_proj"'), "TRAINER_MOE_GATE_UP_TARGET_REQUIRED");
assert(handler.includes('"mlp.experts.down_proj"'), "TRAINER_MOE_DOWN_TARGET_REQUIRED");
assert(handler.includes("target_parameters=MOE_LORA_TARGET_PARAMETERS"), "TRAINER_MOE_PEFT_TARGET_PARAMETER_BINDING_REQUIRED");
assert(handler.includes('model_type != "qwen3_moe"'), "TRAINER_QWEN3_MOE_MODEL_TYPE_GATE_REQUIRED");
assert(handler.includes("effective_expert_rank = max(1, settings[\"lora_rank\"] // expert_count)"), "TRAINER_MOE_EXPERT_RANK_REQUIRED");
assert(handler.includes("TRAINING_QWEN3_MOE_LORA_DROPOUT_MUST_BE_ZERO"), "TRAINER_MOE_DROPOUT_GUARD_REQUIRED");
assert(handler.includes("lora_dropout=0.0"), "TRAINER_MOE_DROPOUT_ZERO_REQUIRED");
assert(handler.includes("assert_bf16_fused_expert_weights"), "TRAINER_MOE_BF16_FUSED_EXPERT_PREFLIGHT_REQUIRED");
assert(handler.includes("parameter.ndim != 3"), "TRAINER_MOE_3D_EXPERT_LAYOUT_REQUIRED");
assert(handler.includes("parameter.dtype != torch.bfloat16"), "TRAINER_MOE_BF16_EXPERT_REQUIRED");
assert(handler.includes('module.__class__.__name__ != "ParamWrapper"'), "TRAINER_MOE_PARAM_WRAPPER_VERIFICATION_REQUIRED");
assert(handler.includes("TRAINING_QWEN3_MOE_DENSE_TARGET_MODULES_NOT_BOUND"), "TRAINER_DENSE_TARGET_ATTACHMENT_REQUIRED");
assert(handler.includes("TRAINING_QWEN3_MOE_EXPERT_LORA_NOT_TRAINABLE"), "TRAINER_MOE_TRAINABLE_EXPERT_REQUIRED");
assert(handler.includes('"moe_adapter_attachment_verified": True'), "TRAINER_MOE_ATTACHMENT_EVIDENCE_REQUIRED");
assert(handler.includes('"method": "LORA_BF16_PEFT_QWEN3_MOE"'), "TRAINER_MOE_METHOD_REQUIRED");
assert(handler.includes('"base_quantized": False'), "TRAINER_BASE_QUANTIZATION_FALSE_REQUIRED");
assert(handler.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED"), "TRAINER_ENABLE_GATE_REQUIRED");
assert(handler.includes('payload.get("execute_training") is not True'), "TRAINER_EXPLICIT_EXECUTION_REQUIRED");
assert(handler.includes('"foundation_weights_mutated": False'), "TRAINER_BASE_WEIGHT_MUTATION_FORBIDDEN");
assert(handler.includes('"production_model_promoted": False'), "TRAINER_AUTO_PROMOTION_FORBIDDEN");
assert(handler.includes("TRAINING_EXAMPLE_POTENTIAL_PRIVATE_DATA_REJECTED"), "TRAINER_PRIVATE_DATA_GUARD_REQUIRED");

assert(dockerfile.includes("pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime"), "TRAINER_CUDA_IMAGE_REQUIRED");
assert(dockerfile.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED=false"), "TRAINER_DISABLED_BY_DEFAULT_REQUIRED");
assert(dockerfile.includes("/runpod-volume/avantiqo-intelligence-training"), "TRAINER_ISOLATED_OUTPUT_REQUIRED");
assert(dockerfile.includes("python -m py_compile handler.py"), "TRAINER_BUILD_STATIC_CHECK_REQUIRED");
assert(dockerfile.includes("bitsandbytes must not be installed"), "TRAINER_BITSANDBYTES_ABSENCE_CHECK_REQUIRED");

assert(requirements.includes("runpod==1.12.0"), "TRAINER_RUNPOD_PIN_REQUIRED");
assert(requirements.includes("transformers==5.15.0"), "TRAINER_TRANSFORMERS_PIN_REQUIRED");
assert(requirements.includes("peft==0.20.0"), "TRAINER_PEFT_PIN_REQUIRED");
assert(requirements.includes("accelerate==1.14.0"), "TRAINER_ACCELERATE_PIN_REQUIRED");
assert(!requirements.includes("bitsandbytes"), "TRAINER_BITSANDBYTES_DEPENDENCY_FORBIDDEN");

assert(index.includes("AvantiqoTrainingExampleCompilerRuntime"), "TRAINING_COMPILER_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelImprovementRuntime"), "MODEL_IMPROVEMENT_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelTrainingExecutionRuntime"), "TRAINING_EXECUTION_EXPORT_REQUIRED");

console.log("AVANTIQO_INTELLIGENCE_TRAINING_PIPELINE_AUDIT=PASS");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_RAW_CUSTOMER_DATA=FORBIDDEN");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_RAW_REASONING=FORBIDDEN");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_METHOD=LORA_BF16_PEFT_QWEN3_MOE");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_DATASET_METHOD=LORA_BF16_PEFT_QWEN3_MOE");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_DATASET_BACKEND=RUNPOD_SERVERLESS_DEDICATED_TRAINER");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_PREPARED_RECIPE=BOUND");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_BASE_QUANTIZED=NO");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_GPU_CLASS=80GB");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_SEQUENCE_DEFAULT=1024");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_SEQUENCE_MAX=2048");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_DENSE_TARGETS=q_proj,v_proj");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_MOE_EXPERT_TARGETING=REQUIRED");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_MOE_DROPOUT=ZERO");
console.log("AVANTIQO_INTELLIGENCE_TRAINER_DEFAULT_ENABLED=NO");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_EXPLICIT_APPROVAL=REQUIRED");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_BASE_WEIGHTS_MUTATED=NO");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_PRODUCTION_PROMOTION=AUTO_FORBIDDEN");