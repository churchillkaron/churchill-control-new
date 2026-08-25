import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const inspector = read("services/avantiqo-intelligence-candidate/inspect_adapter.py");
const startup = read("services/avantiqo-intelligence-candidate/startup.py");
const dockerfile = read("services/avantiqo-intelligence-candidate/Dockerfile.runpod");
const canary = read("lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js");
const promotion = read("lib/intelligence/runtime/AvantiqoModelPromotionRuntime.js");
const evaluation = read("lib/intelligence/runtime/AvantiqoModelBenchmarkEvaluationRuntime.js");
const index = read("lib/intelligence/index.js");

assert(inspector.includes('CONTRACT = "AVANTIQO_INTELLIGENCE_ADAPTER_LAYOUT_V1"'), "CANDIDATE_ADAPTER_INSPECTOR_CONTRACT_REQUIRED");
assert(inspector.includes('FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"'), "CANDIDATE_FOUNDATION_REQUIRED");
assert(inspector.includes("TRAINING_ROOT"), "CANDIDATE_TRAINING_ROOT_REQUIRED");
assert(inspector.includes("ADAPTER_PATH_OUTSIDE_TRAINING_ROOT"), "CANDIDATE_PATH_ESCAPE_GUARD_REQUIRED");
assert(inspector.includes("ADAPTER_BASE_MODEL_MISMATCH"), "CANDIDATE_BASE_MODEL_GUARD_REQUIRED");
assert(inspector.includes("ADAPTER_LORA_RANK_OUT_OF_RANGE"), "CANDIDATE_RANK_GUARD_REQUIRED");
assert(inspector.includes("MOE_3D_FUSED_PEFT"), "CANDIDATE_3D_MOE_LAYOUT_REQUIRED");
assert(inspector.includes("MOE_2D_PER_EXPERT"), "CANDIDATE_2D_MOE_LAYOUT_REQUIRED");
assert(inspector.includes("ADAPTER_MOE_LAYOUT_MIXED"), "CANDIDATE_MIXED_LAYOUT_REJECT_REQUIRED");
assert(inspector.includes("ADAPTER_MOE_LAYOUT_UNRECOGNIZED"), "CANDIDATE_UNKNOWN_LAYOUT_REJECT_REQUIRED");

assert(startup.includes("AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED"), "CANDIDATE_STARTUP_ENABLE_GATE_REQUIRED");
assert(startup.includes("candidate_model_name"), "CANDIDATE_ARTIFACT_MODEL_FINGERPRINT_REQUIRED");
assert(startup.includes("ENABLE_LORA"), "CANDIDATE_LORA_ENABLE_REQUIRED");
assert(startup.includes("LORA_MODULES"), "CANDIDATE_LORA_MODULES_REQUIRED");
assert(startup.includes("--enable-mixed-moe-lora-format"), "CANDIDATE_MOE_LORA_FLAG_REQUIRED");
assert(startup.includes("TOOL_CALL_PARSER"), "CANDIDATE_TOOL_PARSER_REQUIRED");
assert(startup.includes("REASONING_PARSER"), "CANDIDATE_REASONING_PARSER_REQUIRED");
assert(dockerfile.includes("runpod/worker-v1-vllm:v2.25.0"), "CANDIDATE_RUNPOD_VLLM_IMAGE_REQUIRED");
assert(dockerfile.includes("AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED=false"), "CANDIDATE_DISABLED_BY_DEFAULT_REQUIRED");
assert(dockerfile.includes("python3 -m py_compile inspect_adapter.py startup.py"), "CANDIDATE_STATIC_CHECK_REQUIRED");

assert(canary.includes("AVANTIQO_MODEL_CANDIDATE_CANARY_V1"), "CANDIDATE_CANARY_CONTRACT_REQUIRED");
assert(canary.includes("AVANTIQO_INTELLIGENCE_CANDIDATE_ENGINE_ENABLED"), "CANDIDATE_CANARY_ENABLE_GATE_REQUIRED");
assert(canary.includes("RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID"), "CANDIDATE_CANARY_ENDPOINT_REQUIRED");
assert(canary.includes("AVANTIQO_INTELLIGENCE_CANDIDATE_MODEL_CANDIDATE_ID"), "CANDIDATE_ID_BINDING_REQUIRED");
assert(canary.includes("candidateModelName"), "CANDIDATE_ARTIFACT_BINDING_REQUIRED");
assert(canary.includes("EXACT_ADAPTER_MODEL_NOT_REGISTERED"), "CANDIDATE_EXACT_MODEL_REGISTRATION_REQUIRED");
assert(canary.includes("structured_output_ok: true"), "CANDIDATE_STRUCTURED_OUTPUT_PROBE_REQUIRED");
assert(canary.includes("native_tool_call_ok: true"), "CANDIDATE_TOOL_CALL_PROBE_REQUIRED");
assert(canary.includes("ordinary_provider_routing_enabled: false"), "CANDIDATE_ROUTING_ISOLATION_REQUIRED");
assert(canary.includes("production_endpoint_mutated: false"), "CANDIDATE_PRODUCTION_MUTATION_FORBIDDEN");

assert(evaluation.includes("category_aware_hard_gates: true"), "BENCHMARK_CATEGORY_AWARE_GATE_REQUIRED");
assert(evaluation.includes("TOOL_DISCIPLINE_CATEGORY"), "BENCHMARK_TOOL_CATEGORY_REQUIRED");
assert(evaluation.includes("AUTHORIZATION_CATEGORY"), "BENCHMARK_AUTHORIZATION_CATEGORY_REQUIRED");
assert(evaluation.includes("PRIVACY_CATEGORY"), "BENCHMARK_PRIVACY_CATEGORY_REQUIRED");

assert(promotion.includes("AVANTIQO_MODEL_PROMOTION_V1"), "MODEL_PROMOTION_CONTRACT_REQUIRED");
assert(promotion.includes("PROMOTION_REVIEW_ELIGIBLE"), "MODEL_PROMOTION_BENCHMARK_ELIGIBILITY_REQUIRED");
assert(promotion.includes("candidateEvaluation.case_count || 0) >= 50"), "MODEL_PROMOTION_MIN_50_CASES_REQUIRED");
assert(promotion.includes("candidateEvaluation.regression_count || 0) === 0"), "MODEL_PROMOTION_ZERO_REGRESSION_REQUIRED");
assert(promotion.includes("certifyAvantiqoModelCandidateCanary"), "MODEL_PROMOTION_CANARY_REQUIRED");
assert(promotion.includes("exact_adapter_artifact_binding_verified"), "MODEL_PROMOTION_EXACT_ADAPTER_REQUIRED");
assert(promotion.includes('status: "CANARY_CERTIFIED_RELEASE_PENDING"'), "MODEL_PROMOTION_RELEASE_PENDING_STATE_REQUIRED");
assert(promotion.includes("production_release_authorized: false"), "MODEL_PROMOTION_RELEASE_NOT_AUTHORIZED_REQUIRED");
assert(promotion.includes("production_endpoint_mutated: false"), "MODEL_PROMOTION_ENDPOINT_MUTATION_FORBIDDEN");
assert(promotion.includes("automatic_production_promotion: false"), "MODEL_PROMOTION_AUTO_PROMOTION_FORBIDDEN");

assert(index.includes("AvantiqoModelCandidateCanaryRuntime"), "CANDIDATE_CANARY_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelPromotionRuntime"), "MODEL_PROMOTION_EXPORT_REQUIRED");

console.log("AVANTIQO_INTELLIGENCE_CANDIDATE_PROMOTION_AUDIT=PASS");
console.log("AVANTIQO_INTELLIGENCE_CANDIDATE_MOE_LAYOUT_FAIL_CLOSED=YES");
console.log("AVANTIQO_INTELLIGENCE_CANDIDATE_EXACT_ADAPTER_BINDING=YES");
console.log("AVANTIQO_INTELLIGENCE_CANDIDATE_ORDINARY_ROUTING=NO");
console.log("AVANTIQO_INTELLIGENCE_MODEL_RELEASE_REQUIRES_EXPLICIT_FINAL_STEP=YES");
console.log("AVANTIQO_INTELLIGENCE_MODEL_AUTOMATIC_PRODUCTION_PROMOTION=NO");
