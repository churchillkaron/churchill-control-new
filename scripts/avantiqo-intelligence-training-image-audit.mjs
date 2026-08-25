import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const workflow = read(".github/workflows/avantiqo-intelligence-training-images.yml");
const trainerDockerfile = read("services/avantiqo-intelligence-trainer/Dockerfile.runpod");
const trainerRequirements = read("services/avantiqo-intelligence-trainer/requirements.txt");
const trainer = read("services/avantiqo-intelligence-trainer/handler.py");
const candidateDockerfile = read("services/avantiqo-intelligence-candidate/Dockerfile.runpod");
const candidateInspector = read("services/avantiqo-intelligence-candidate/inspect_adapter.py");

assert(workflow.includes("workflow_dispatch:"), "INTELLIGENCE_IMAGE_WORKFLOW_MANUAL_TRIGGER_REQUIRED");
assert(!workflow.includes("\n  push:"), "INTELLIGENCE_IMAGE_WORKFLOW_PUSH_TRIGGER_FORBIDDEN");
assert(workflow.includes("component:"), "INTELLIGENCE_IMAGE_WORKFLOW_COMPONENT_INPUT_REQUIRED");
assert(workflow.includes("build-trainer:"), "INTELLIGENCE_IMAGE_WORKFLOW_TRAINER_JOB_REQUIRED");
assert(workflow.includes("build-candidate:"), "INTELLIGENCE_IMAGE_WORKFLOW_CANDIDATE_JOB_REQUIRED");
assert(workflow.includes("actions/checkout@v4"), "INTELLIGENCE_IMAGE_WORKFLOW_CHECKOUT_REQUIRED");
assert(workflow.includes('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"'), "INTELLIGENCE_IMAGE_WORKFLOW_SHA_LOCK_REQUIRED");
assert(workflow.includes("docker/setup-buildx-action@v3"), "INTELLIGENCE_IMAGE_WORKFLOW_BUILDX_REQUIRED");
assert(workflow.includes("docker/login-action@v3"), "INTELLIGENCE_IMAGE_WORKFLOW_GHCR_LOGIN_REQUIRED");
assert(workflow.includes("docker/build-push-action@v6"), "INTELLIGENCE_IMAGE_WORKFLOW_BUILD_PUSH_REQUIRED");
assert(workflow.includes("provenance: true"), "INTELLIGENCE_IMAGE_WORKFLOW_PROVENANCE_REQUIRED");
assert(workflow.includes("sbom: true"), "INTELLIGENCE_IMAGE_WORKFLOW_SBOM_REQUIRED");
assert(workflow.includes("avantiqo-intelligence-trainer"), "INTELLIGENCE_IMAGE_WORKFLOW_TRAINER_IMAGE_REQUIRED");
assert(workflow.includes("avantiqo-intelligence-candidate"), "INTELLIGENCE_IMAGE_WORKFLOW_CANDIDATE_IMAGE_REQUIRED");
assert(workflow.includes("immutable_image_reference"), "INTELLIGENCE_IMAGE_WORKFLOW_DIGEST_EVIDENCE_REQUIRED");
assert(workflow.includes("provider_job_submitted: false"), "INTELLIGENCE_IMAGE_WORKFLOW_PROVIDER_EXECUTION_FORBIDDEN");
assert(workflow.includes("training_started: false"), "INTELLIGENCE_IMAGE_WORKFLOW_TRAINING_FORBIDDEN");
assert(workflow.includes("runpod_endpoint_mutated: false"), "INTELLIGENCE_IMAGE_WORKFLOW_RUNPOD_MUTATION_FORBIDDEN");
assert(workflow.includes("production_model_promoted: false"), "INTELLIGENCE_IMAGE_WORKFLOW_MODEL_PROMOTION_FORBIDDEN");
assert(workflow.includes("production_web_deploy: false"), "INTELLIGENCE_IMAGE_WORKFLOW_PRODUCTION_DEPLOY_FORBIDDEN");
assert(workflow.includes("default_sequence_length: 1024"), "INTELLIGENCE_IMAGE_WORKFLOW_SEQUENCE_DEFAULT_REQUIRED");
assert(workflow.includes("maximum_sequence_length: 2048"), "INTELLIGENCE_IMAGE_WORKFLOW_SEQUENCE_MAX_REQUIRED");
assert(workflow.includes('dense_lora_target_modules: ["q_proj", "v_proj"]'), "INTELLIGENCE_IMAGE_WORKFLOW_DENSE_TARGETS_REQUIRED");
assert(workflow.includes('adapter_serialization: "PEFT_FUSED_EXPERT_FACTORS_2D"'), "INTELLIGENCE_IMAGE_WORKFLOW_PEFT_SERIALIZATION_EVIDENCE_REQUIRED");
assert(!workflow.includes("api.runpod.ai"), "INTELLIGENCE_IMAGE_WORKFLOW_RUNPOD_API_FORBIDDEN");
assert(!workflow.includes("RUNPOD_API_KEY"), "INTELLIGENCE_IMAGE_WORKFLOW_RUNPOD_SECRET_FORBIDDEN");

assert(trainerDockerfile.includes("pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime"), "INTELLIGENCE_TRAINER_IMAGE_BASE_REQUIRED");
assert(trainerDockerfile.includes("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED=false"), "INTELLIGENCE_TRAINER_DISABLED_BY_DEFAULT_REQUIRED");
assert(trainerDockerfile.includes("python -m py_compile handler.py"), "INTELLIGENCE_TRAINER_PYTHON_COMPILE_REQUIRED");
assert(trainerDockerfile.includes("bitsandbytes must not be installed"), "INTELLIGENCE_TRAINER_BITSANDBYTES_ABSENCE_CHECK_REQUIRED");
assert(!trainerRequirements.includes("bitsandbytes"), "INTELLIGENCE_TRAINER_BITSANDBYTES_DEPENDENCY_FORBIDDEN");
assert(trainer.includes('"method": "LORA_BF16_PEFT_QWEN3_MOE"'), "INTELLIGENCE_TRAINER_BF16_MOE_METHOD_REQUIRED");
assert(trainer.includes("MIN_BF16_GPU_MEMORY_BYTES = 78 * 1024 * 1024 * 1024"), "INTELLIGENCE_TRAINER_80GB_CLASS_REQUIRED");
assert(trainer.includes("MAX_SEQUENCE_LENGTH = 2048"), "INTELLIGENCE_TRAINER_MAX_SEQUENCE_REQUIRED");
assert(trainer.includes("DEFAULT_SEQUENCE_LENGTH = 1024"), "INTELLIGENCE_TRAINER_DEFAULT_SEQUENCE_REQUIRED");
assert(trainer.includes('DENSE_LORA_TARGET_MODULES = [\n    "q_proj",\n    "v_proj",\n]'), "INTELLIGENCE_TRAINER_DENSE_TARGETS_REQUIRED");
assert(trainer.includes("target_parameters=MOE_LORA_TARGET_PARAMETERS"), "INTELLIGENCE_TRAINER_MOE_TARGET_PARAMETER_REQUIRED");

assert(candidateDockerfile.includes("runpod/worker-v1-vllm:v2.25.0"), "INTELLIGENCE_CANDIDATE_VLLM_BASE_REQUIRED");
assert(candidateDockerfile.includes("AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED=false"), "INTELLIGENCE_CANDIDATE_DISABLED_BY_DEFAULT_REQUIRED");
assert(candidateDockerfile.includes("python3 -m py_compile inspect_adapter.py startup.py"), "INTELLIGENCE_CANDIDATE_PYTHON_COMPILE_REQUIRED");
assert(candidateInspector.includes('EXPECTED_TARGET_MODULES = {"q_proj", "v_proj"}'), "INTELLIGENCE_CANDIDATE_TARGET_MODULE_CHECK_REQUIRED");
assert(candidateInspector.includes("EXPECTED_TARGET_PARAMETERS"), "INTELLIGENCE_CANDIDATE_TARGET_PARAMETER_CHECK_REQUIRED");
assert(candidateInspector.includes("FUSED_GATE_UP_KEY"), "INTELLIGENCE_CANDIDATE_FUSED_GATE_UP_KEY_REQUIRED");
assert(candidateInspector.includes("FUSED_DOWN_KEY"), "INTELLIGENCE_CANDIDATE_FUSED_DOWN_KEY_REQUIRED");
assert(candidateInspector.includes("ADAPTER_MOE_PER_EXPERT_LAYOUT_FORBIDDEN"), "INTELLIGENCE_CANDIDATE_PER_EXPERT_LAYOUT_FORBIDDEN");
assert(candidateInspector.includes("ADAPTER_MOE_FUSED_FACTOR_NOT_2D"), "INTELLIGENCE_CANDIDATE_PEFT_FACTOR_2D_REQUIRED");
assert(candidateInspector.includes('"layout": "MOE_3D_FUSED_PEFT"'), "INTELLIGENCE_CANDIDATE_VLLM_3D_FORMAT_REQUIRED");
assert(candidateInspector.includes('"serialization": "PEFT_FUSED_EXPERT_FACTORS_2D"'), "INTELLIGENCE_CANDIDATE_PEFT_SERIALIZATION_REQUIRED");
assert(candidateInspector.includes('"is_3d_lora_weight": True'), "INTELLIGENCE_CANDIDATE_VLLM_3D_DECLARATION_REQUIRED");
assert(!candidateInspector.includes("ADAPTER_MOE_LORA_TENSOR_NOT_3D"), "INTELLIGENCE_CANDIDATE_STALE_3D_TENSOR_ASSERTION_FORBIDDEN");

console.log("AVANTIQO_INTELLIGENCE_TRAINING_IMAGE_AUDIT=PASS");
console.log("AVANTIQO_INTELLIGENCE_IMAGE_TRIGGER=MANUAL_ONLY");
console.log("AVANTIQO_INTELLIGENCE_TRAINER_METHOD=LORA_BF16_PEFT_QWEN3_MOE");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_SEQUENCE_DEFAULT=1024");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_SEQUENCE_MAX=2048");
console.log("AVANTIQO_INTELLIGENCE_CANDIDATE_VLLM_LAYOUT=MOE_3D_FUSED_PEFT");
console.log("AVANTIQO_INTELLIGENCE_CANDIDATE_SERIALIZATION=PEFT_FUSED_EXPERT_FACTORS_2D");
console.log("AVANTIQO_INTELLIGENCE_TRAINING_STARTED=NO");
console.log("AVANTIQO_INTELLIGENCE_RUNPOD_ENDPOINT_MUTATED=NO");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_MODEL_PROMOTED=NO");
