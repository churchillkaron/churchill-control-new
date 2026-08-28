#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_AUDIT_V2";
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const has = (source, marker, code) => assert.ok(source.includes(marker), `${CONTRACT}_${code}_MISSING:${marker}`);
const forbid = (source, marker, code) => assert.ok(!source.includes(marker), `${CONTRACT}_${code}_FORBIDDEN:${marker}`);
function nodeSyntax(relative) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relative)], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${CONTRACT}_SYNTAX_FAILED:${relative}\n${result.stderr || result.stdout || ""}`);
}
function pythonSyntax(relative) {
  const source = read(relative);
  const result = spawnSync("python3", ["-c", "import sys; compile(sys.stdin.read(), sys.argv[1], 'exec')", relative], {
    cwd: root, encoding: "utf8", input: source,
  });
  assert.equal(result.status, 0, `${CONTRACT}_PYTHON_SYNTAX_FAILED:${relative}\n${result.stderr || result.stdout || ""}`);
}

const files = {
  startup: "services/avantiqo-intelligence-production-adapter/startup.py",
  dockerfile: "services/avantiqo-intelligence-production-adapter/Dockerfile.runpod",
  inspector: "services/avantiqo-intelligence-candidate/inspect_adapter.py",
  workflow: ".github/workflows/avantiqo-intelligence-production-adapter-image.yml",
  build: "scripts/build-avantiqo-intelligence-production-adapter-image-local.mjs",
  recover: "scripts/recover-avantiqo-intelligence-production-adapter-image-evidence-local.mjs",
  binder: "scripts/rebind-avantiqo-intelligence-production-adapter-local.mjs",
  promotion: "lib/intelligence/runtime/AvantiqoModelPromotionRuntime.js",
  learningOrganization: "lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime.js",
  canary: "lib/intelligence/runtime/AvantiqoModelCandidateCanaryRuntime.js",
  deep: "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceDeepProvider.js",
  fast: "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceFastProvider.js",
};
for (const relative of Object.values(files)) assert.ok(exists(relative), `${CONTRACT}_MISSING_FILE:${relative}`);
for (const relative of [files.build, files.recover, files.binder, files.promotion, files.learningOrganization, files.canary, files.deep, files.fast]) nodeSyntax(relative);
pythonSyntax(files.startup);
pythonSyntax(files.inspector);

const startup = read(files.startup);
const dockerfile = read(files.dockerfile);
const inspector = read(files.inspector);
const workflow = read(files.workflow);
const build = read(files.build);
const recover = read(files.recover);
const binder = read(files.binder);
const promotion = read(files.promotion);
const learningOrganization = read(files.learningOrganization);
const canary = read(files.canary);
const deep = read(files.deep);
const fast = read(files.fast);

has(startup, 'CONTRACT = "AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_STARTUP_V2"', "STARTUP_V2");
has(startup, 'BASE_MODEL_ALIAS = "avantiqo-intelligence-deep-base"', "BASE_ALIAS");
has(startup, '"name": FOUNDATION_MODEL', "CANONICAL_ADAPTER_MODEL_NAME");
has(startup, '"base_model_name": BASE_MODEL_ALIAS', "BASE_MODEL_ALIAS_BINDING");
has(startup, '"canonical_deep_request_uses_adapter": True', "CANONICAL_DEEP_ADAPTER_ROUTE");
has(startup, '"fast_lane_effect": "NONE"', "FAST_UNAFFECTED_STARTUP");
has(startup, '"provider_routing_mutation_required": False', "NO_PROVIDER_ROUTING_MUTATION");
has(startup, '"automatic_promotion": False', "NO_AUTOMATIC_PROMOTION");
has(startup, 'EXTERNAL_EXPLICIT_RELEASE_BINDER_ONLY', "EXPLICIT_BINDER_AUTHORITY");
has(startup, 'actual_fingerprint != expected_fingerprint', "ADAPTER_FINGERPRINT_VERIFY");
has(startup, 'inspect(adapter_path)', "EXACT_ADAPTER_REINSPECTION");

has(dockerfile, 'runpod/worker-v1-vllm:v2.25.0', "PINNED_VLLM_WORKER");
has(dockerfile, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ENABLED=false', "PRODUCTION_DISABLED_DEFAULT");
has(dockerfile, 'COPY services/avantiqo-intelligence-candidate/inspect_adapter.py ./inspect_adapter.py', "SHARED_INSPECTOR_COPY");
has(dockerfile, 'ENTRYPOINT ["python3", "/production-adapter/startup.py"]', "STARTUP_ENTRYPOINT");
has(inspector, 'FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"', "THINKING_FOUNDATION");
has(inspector, 'MOE_3D_FUSED_PEFT', "MOE_LAYOUT");
has(inspector, 'PEFT_FUSED_EXPERT_FACTORS_2D', "PEFT_SERIALIZATION");
has(inspector, 'ADAPTER_MOE_PER_EXPERT_LAYOUT_FORBIDDEN', "PER_EXPERT_LAYOUT_FORBIDDEN");

has(workflow, 'workflow_dispatch:', "IMAGE_MANUAL_DISPATCH");
has(workflow, 'ref: ${{ github.sha }}', "IMAGE_SOURCE_SHA_LOCK");
has(workflow, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_STARTUP_V2', "IMAGE_STARTUP_V2");
has(workflow, 'provenance: true', "IMAGE_PROVENANCE");
has(workflow, 'sbom: true', "IMAGE_SBOM");
has(workflow, 'immutable_image_reference: `${repository}@${digest}`', "IMAGE_DIGEST_EVIDENCE");
has(workflow, 'exact_candidate_adapter_inspector_reused: true', "IMAGE_INSPECTOR_EVIDENCE");
has(workflow, 'adapter_artifact_embedded: false', "IMAGE_NO_ADAPTER_EMBED");
has(workflow, 'explicit_release_binder_required: true', "IMAGE_EXPLICIT_BINDER");
has(workflow, 'fast_lane_effect: "NONE"', "IMAGE_FAST_NONE");
has(workflow, 'runpod_endpoint_mutated: false', "IMAGE_NO_RUNPOD_MUTATION");
has(workflow, 'production_model_promoted: false', "IMAGE_NO_PROMOTION");
has(workflow, 'automatic_production_promotion: false', "IMAGE_NO_AUTOPROMOTION");

for (const source of [build, recover]) {
  has(source, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_RESULT_V1', "LOCAL_IMAGE_EVIDENCE_CONTRACT");
  has(source, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_STARTUP_V2', "LOCAL_IMAGE_STARTUP_V2");
  has(source, 'immutable_image_reference', "LOCAL_IMAGE_IMMUTABLE_REFERENCE");
  has(source, 'runpod_endpoint_mutated: false', "LOCAL_IMAGE_NO_ENDPOINT_MUTATION");
  has(source, 'production_model_promoted: false', "LOCAL_IMAGE_NO_PROMOTION");
  has(source, 'fast_lane_effect: "NONE"', "LOCAL_IMAGE_FAST_NONE");
}

has(learningOrganization, 'CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform"', "CANONICAL_LEARNING_ORGANIZATION_NAME");
has(learningOrganization, 'CANONICAL_ORGANIZATION_TYPE = "enterprise_group"', "CANONICAL_LEARNING_ORGANIZATION_TYPE");
has(learningOrganization, 'source: "CANONICAL_DATABASE_RECORD"', "CANONICAL_LEARNING_ORGANIZATION_DB_FALLBACK");

has(binder, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_BINDER_V2', "BINDER_CONTRACT_V2");
has(binder, 'const apply = process.argv.includes("--apply")', "PLAN_DEFAULT");
has(binder, 'const rollback = process.argv.includes("--rollback")', "ROLLBACK_MODE");
has(binder, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_APPROVED', "RELEASE_GATE");
has(binder, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ROLLBACK_APPROVED', "ROLLBACK_GATE");
has(binder, 'LEARNING_ORGANIZATION_NAME = "Avantiqo Platform"', "BINDER_CANONICAL_ORG_NAME");
has(binder, 'LEARNING_ORGANIZATION_TYPE = "enterprise_group"', "BINDER_CANONICAL_ORG_TYPE");
has(binder, 'source: "CANONICAL_DATABASE_RECORD"', "BINDER_CANONICAL_ORG_FALLBACK");
has(binder, 'resolveGovernedSelection', "BINDER_GOVERNED_SELECTION");
has(binder, 'UNIQUE_GOVERNED_REVIEW', "BINDER_UNIQUE_PENDING_REVIEW");
has(binder, 'candidate_env_required: false', "BINDER_CANDIDATE_ENV_OPTIONAL");
has(binder, 'adapter_path_env_required: false', "BINDER_ADAPTER_PATH_ENV_OPTIONAL");
has(binder, 'CANARY_CERTIFIED_RELEASE_PENDING', "CANARY_RELEASE_STATE_REQUIRED");
has(binder, 'structured_output_ok !== true', "CANARY_STRUCTURED_OUTPUT_REQUIRED");
has(binder, 'native_tool_call_ok !== true', "CANARY_TOOL_CALL_REQUIRED");
has(binder, 'exact_adapter_artifact_binding_verified !== true', "CANARY_EXACT_ADAPTER_REQUIRED");
has(binder, 'requireIdle(deep, deepHealth, "PRODUCTION_ADAPTER_DEEP")', "DEEP_IDLE_GUARD_CALL");
has(binder, '_RESTING_0_0_REQUIRED', "DEEP_ZERO_ZERO_GATE");
has(binder, '_QUEUE_NOT_DRAINED', "DEEP_DRAIN_GATE");
has(binder, '_WORKERS_NOT_RESTING', "DEEP_WORKER_GATE");
has(binder, 'dockerEntrypoint: []', "IMAGE_OWNED_ENTRYPOINT");
has(binder, 'dockerStartCmd: []', "IMAGE_OWNED_START_CMD");
has(binder, 'docker_entrypoint_override', "EXISTING_TARGET_ENTRYPOINT_OVERRIDE_REJECTED");
has(binder, 'docker_start_cmd_override', "EXISTING_TARGET_START_CMD_OVERRIDE_REJECTED");
has(binder, 'image_owned_entrypoint_required: true', "PLAN_REPORTS_IMAGE_OWNED_ENTRYPOINT");
has(binder, 'rollback_provenance_required_before_endpoint_patch: true', "ROLLBACK_PROVENANCE_BEFORE_PATCH");
has(binder, 'previous_template_id: previousTemplateId', "PREVIOUS_TEMPLATE_CAPTURE");
has(binder, 'body: { templateId: targetTemplateId }', "RELEASE_TEMPLATE_ONLY_PATCH");
has(binder, 'body: { templateId: previousTemplateId }', "ROLLBACK_TEMPLATE_ONLY_PATCH");
has(binder, 'sameInfrastructure(deepBefore, deepAfter)', "DEEP_INFRA_PRESERVATION");
has(binder, 'JSON.stringify(fastBefore) !== JSON.stringify(fastAfter)', "FAST_PRESERVATION");
has(binder, 'status: "PRODUCTION_RELEASED"', "RELEASE_FINAL_STATE");
has(binder, 'status: "PRODUCTION_ROLLED_BACK"', "ROLLBACK_FINAL_STATE");
has(binder, 'requires_new_promotion_review: true', "ROLLBACK_REVIEW_RESET");
has(binder, 'automatic_production_promotion: false', "BINDER_NO_AUTOPROMOTION");
has(binder, 'automatic_rollback: false', "BINDER_NO_AUTOROLLBACK");
has(binder, 'wallet_operation_performed: false', "BINDER_NO_WALLET");
has(binder, 'web_deploy_performed: false', "BINDER_NO_WEB_DEPLOY");
forbid(binder, 'const learningOrganizationId = required("AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID")', "NO_REQUIRED_ORG_ENV");
forbid(binder, 'const candidateId = required("AVANTIQO_INTELLIGENCE_PRODUCTION_MODEL_CANDIDATE_ID")', "NO_REQUIRED_CANDIDATE_ENV");
forbid(binder, 'const adapterPath = required("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PATH")', "NO_REQUIRED_ADAPTER_PATH_ENV");
forbid(binder, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_APPROVED=YES', "NO_HARDCODED_RELEASE_APPROVAL");
forbid(binder, 'AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ROLLBACK_APPROVED=YES', "NO_HARDCODED_ROLLBACK_APPROVAL");

has(promotion, 'status: "CANARY_CERTIFIED_RELEASE_PENDING"', "PROMOTION_RUNTIME_STOPS_BEFORE_RELEASE");
has(promotion, 'adapter_artifact_reference: text(candidateMetadata.adapter_artifact_reference', "PROMOTION_REVIEW_OWNS_ADAPTER_PATH");
has(promotion, 'model_candidate_id: candidate.id', "PROMOTION_REVIEW_OWNS_CANDIDATE_ID");
has(promotion, 'automatic_production_promotion: false', "PROMOTION_RUNTIME_NO_AUTO");
has(canary, 'production_endpoint_mutated: false', "CANARY_NO_PROD_MUTATION");
has(canary, 'ordinary_provider_routing_enabled: false', "CANARY_ISOLATION");
has(deep, 'const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"', "DEEP_CANONICAL_MODEL");
has(deep, 'const CANONICAL_ENDPOINT_NAME = "avantiqo-intelligence-v1"', "DEEP_CANONICAL_ENDPOINT");
has(fast, 'avantiqo-intelligence-fast-v1', "FAST_SEPARATE_ENDPOINT");

console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_AUDIT=PASS");
console.log(`AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RELEASE_AUDIT_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_CANONICAL_DEEP_MODEL_BOUND=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_CANONICAL_ORGANIZATION_RESOLUTION=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_GOVERNED_CANDIDATE_SELECTION=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMAGE_OWNED_ENTRYPOINT=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_IMMUTABLE_IMAGE_WORKFLOW=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PLAN_DEFAULT=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_EXPLICIT_RELEASE_GATE=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_EXPLICIT_ROLLBACK_GATE=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_ROLLBACK_PROVENANCE=true");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_FAST_LANE_EFFECT=NONE");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PROVIDER_JOB_SUBMITTED=NO");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_INFERENCE_PERFORMED=NO");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_RUNPOD_MUTATION_PERFORMED=NO");
console.log("AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PRODUCTION_PROMOTION_PERFORMED=NO");
