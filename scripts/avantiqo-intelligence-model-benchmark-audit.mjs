import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function assert(condition, code) { if (!condition) throw new Error(code); }

const suite = read("lib/intelligence/runtime/AvantiqoModelBenchmarkSuiteRuntime.js");
const evaluation = read("lib/intelligence/runtime/AvantiqoModelBenchmarkEvaluationRuntime.js");
const execution = read("lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js");
const improvement = read("lib/intelligence/runtime/AvantiqoModelImprovementRuntime.js");
const handler = read("services/avantiqo-intelligence-benchmark/handler.py");
const dockerfile = read("services/avantiqo-intelligence-benchmark/Dockerfile.runpod");
const requirements = read("services/avantiqo-intelligence-benchmark/requirements.txt");
const policy = read("config/avantiqo-runpod-safe-lease-policy.json");
const index = read("lib/intelligence/index.js");

assert(suite.includes("AVANTIQO_MODEL_BENCHMARK_SUITE_V1"), "BENCHMARK_SUITE_CONTRACT_REQUIRED");
assert(suite.includes("const CASE_COUNT = 60"), "BENCHMARK_SUITE_60_CASES_REQUIRED");
assert(suite.includes("task_quality: 20"), "BENCHMARK_TASK_QUALITY_CASES_REQUIRED");
assert(suite.includes("recovery_behavior: 10"), "BENCHMARK_RECOVERY_CASES_REQUIRED");
assert(suite.includes("evidence_tool_discipline: 10"), "BENCHMARK_TOOL_CASES_REQUIRED");
assert(suite.includes("authorization_governance: 10"), "BENCHMARK_AUTHORIZATION_CASES_REQUIRED");
assert(suite.includes("privacy_leakage: 5"), "BENCHMARK_PRIVACY_CASES_REQUIRED");
assert(suite.includes("uncertainty_hallucination: 5"), "BENCHMARK_HALLUCINATION_CASES_REQUIRED");
assert(suite.includes("matched_baseline_candidate_prompts: true"), "BENCHMARK_MATCHED_PROMPTS_REQUIRED");
assert(suite.includes("customer_private_content_included: false"), "BENCHMARK_PRIVATE_CONTENT_FORBIDDEN");

assert(handler.includes('CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1"'), "BENCHMARK_WORKER_CONTRACT_REQUIRED");
assert(handler.includes('FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"'), "BENCHMARK_FOUNDATION_REQUIRED");
assert(handler.includes("BENCHMARK_MINIMUM_50_CASES_REQUIRED"), "BENCHMARK_WORKER_MIN_CASES_REQUIRED");
assert(handler.includes("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED"), "BENCHMARK_WORKER_ENABLE_GATE_REQUIRED");
assert(handler.includes('payload.get("execute_benchmark") is not True'), "BENCHMARK_WORKER_EXPLICIT_APPROVAL_REQUIRED");
assert(handler.includes('mode not in {"baseline", "candidate", "paired"}'), "BENCHMARK_WORKER_PAIRED_MODE_REQUIRED");
assert(handler.includes('if mode == "paired"'), "BENCHMARK_WORKER_PAIRED_EXECUTION_REQUIRED");
assert(handler.includes('"baseline_outputs": baseline_outputs'), "BENCHMARK_WORKER_BASELINE_OUTPUT_REQUIRED");
assert(handler.includes('"candidate_outputs": candidate_outputs'), "BENCHMARK_WORKER_CANDIDATE_OUTPUT_REQUIRED");
assert(handler.includes('"single_runpod_job": True'), "BENCHMARK_WORKER_SINGLE_JOB_REQUIRED");
assert(handler.includes("release_model(model)"), "BENCHMARK_WORKER_GPU_RELEASE_REQUIRED");
assert(handler.includes("PeftModel.from_pretrained"), "BENCHMARK_WORKER_ADAPTER_REQUIRED");
assert(handler.includes("do_sample=False"), "BENCHMARK_WORKER_DETERMINISTIC_GENERATION_REQUIRED");
assert(handler.includes('"production_model_mutated": False'), "BENCHMARK_WORKER_PRODUCTION_MUTATION_FORBIDDEN");
assert(handler.includes('"production_model_promoted": False'), "BENCHMARK_WORKER_AUTO_PROMOTION_FORBIDDEN");

assert(evaluation.includes("AVANTIQO_MODEL_BENCHMARK_EVALUATION_V1"), "BENCHMARK_EVALUATION_CONTRACT_REQUIRED");
assert(evaluation.includes("blindPair"), "BENCHMARK_BLIND_PAIRING_REQUIRED");
assert(evaluation.includes("candidate_did_not_grade_itself: true"), "BENCHMARK_SELF_GRADING_FORBIDDEN");
assert(evaluation.includes("critical_governance_privacy_fail_closed: true"), "BENCHMARK_CRITICAL_FAIL_CLOSED_REQUIRED");
assert(evaluation.includes("regressions"), "BENCHMARK_REGRESSION_COUNT_REQUIRED");

assert(execution.includes("AVANTIQO_MODEL_BENCHMARK_EXECUTION_V1"), "BENCHMARK_EXECUTION_CONTRACT_REQUIRED");
assert(execution.includes("requireAvantiqoModelImprovementSafeLease"), "BENCHMARK_SAFE_LEASE_GUARD_REQUIRED");
assert(execution.includes('requireAvantiqoModelImprovementSafeLease("benchmark"'), "BENCHMARK_SAFE_LEASE_STAGE_REQUIRED");
assert(execution.includes('mode: "paired"'), "BENCHMARK_EXECUTION_PAIRED_REQUIRED");
assert(execution.includes("provider_job_count: 1"), "BENCHMARK_EXECUTION_ONE_JOB_REQUIRED");
assert(execution.includes("one_job_per_lease_preserved: true"), "BENCHMARK_EXECUTION_ONE_JOB_LEASE_INVARIANT_REQUIRED");
assert(execution.includes("paired_provider_job_id"), "BENCHMARK_EXECUTION_PAIRED_JOB_BINDING_REQUIRED");
assert(!execution.includes("baseline_provider_job_id"), "BENCHMARK_EXECUTION_LEGACY_BASELINE_JOB_FORBIDDEN");
assert(!execution.includes("candidate_provider_job_id"), "BENCHMARK_EXECUTION_LEGACY_CANDIDATE_JOB_FORBIDDEN");
assert(execution.includes("recordAvantiqoModelCandidateEvaluation"), "BENCHMARK_PROMOTION_GATE_HANDOFF_REQUIRED");
assert(execution.includes('production_model_promotion_effect: "NONE"'), "BENCHMARK_EXECUTION_NO_PRODUCTION_EFFECT_REQUIRED");

assert(policy.includes('"max_jobs_per_lease": 1'), "BENCHMARK_GLOBAL_ONE_JOB_LIMIT_REQUIRED");
assert(policy.includes('"intelligence-benchmark": "avantiqo-intelligence-trainer-v1"'), "BENCHMARK_SAFE_LEASE_POLICY_REQUIRED");
assert(improvement.includes("MIN_EVALUATION_CASES = 50"), "BENCHMARK_PROMOTION_MIN_CASE_GATE_REQUIRED");
assert(improvement.includes("MIN_CANDIDATE_PASS_RATE = 0.97"), "BENCHMARK_PROMOTION_PASS_RATE_GATE_REQUIRED");
assert(improvement.includes("MAX_REGRESSIONS = 0"), "BENCHMARK_PROMOTION_ZERO_REGRESSION_REQUIRED");
assert(improvement.includes("HALLUCINATION_REGRESSION"), "BENCHMARK_PROMOTION_HALLUCINATION_GATE_REQUIRED");
assert(improvement.includes("AUTHORIZATION_FAILED"), "BENCHMARK_PROMOTION_AUTHORIZATION_GATE_REQUIRED");

assert(dockerfile.includes("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED=false"), "BENCHMARK_DISABLED_BY_DEFAULT_REQUIRED");
assert(dockerfile.includes("python -m py_compile handler.py"), "BENCHMARK_WORKER_STATIC_CHECK_REQUIRED");
assert(requirements.includes("transformers==5.15.0"), "BENCHMARK_TRANSFORMERS_PIN_REQUIRED");
assert(requirements.includes("peft==0.20.0"), "BENCHMARK_PEFT_PIN_REQUIRED");
assert(index.includes("AvantiqoModelBenchmarkSuiteRuntime"), "BENCHMARK_SUITE_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelBenchmarkEvaluationRuntime"), "BENCHMARK_EVALUATION_EXPORT_REQUIRED");
assert(index.includes("AvantiqoModelBenchmarkExecutionRuntime"), "BENCHMARK_EXECUTION_EXPORT_REQUIRED");

console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_AUDIT=PASS");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_CASES=60");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_MATCHED_AB=YES");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_PROVIDER_JOB_COUNT=1");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_SAFE_LEASE_V2=REQUIRED");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_BLIND_EVALUATION=YES");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_ZERO_REGRESSION_GATE=YES");
console.log("AVANTIQO_INTELLIGENCE_MODEL_BENCHMARK_AUTO_PROMOTION=NO");
