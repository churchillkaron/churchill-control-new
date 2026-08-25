const CONTRACT = "AVANTIQO_CODE_RUNPOD_WORKER_REFRESH_V2";
const LEGACY_CONTRACT = "AVANTIQO_CODE_RUNPOD_WORKER_REFRESH_V1";
const IMMUTABLE_BIND_SCRIPT = "scripts/bind-avantiqo-code-runpod-immutable-image-local.mjs";
const IMMUTABLE_VERIFY_SCRIPT = "scripts/verify-avantiqo-code-immutable-image-concurrent-main-local.mjs";
const IMMUTABLE_BUILD_WORKFLOW = ".github/workflows/avantiqo-code-worker-image.yml";

const apply = process.argv.includes("--apply");

const result = {
  success: !apply,
  contract: CONTRACT,
  replaces_contract: LEGACY_CONTRACT,
  mode: apply ? "BLOCKED" : "PLAN",
  legacy_runpod_github_release_refresh_enabled: false,
  github_release_creation_allowed: false,
  runpod_managed_registry_rebind_allowed: false,
  immutable_worker_policy: {
    build_workflow: IMMUTABLE_BUILD_WORKFLOW,
    bind_script: IMMUTABLE_BIND_SCRIPT,
    verify_script: IMMUTABLE_VERIFY_SCRIPT,
    registry: "ghcr.io",
    digest_required: true,
  },
  reason: "Code worker releases must not trigger RunPod GitHub builds because they can overwrite the certified immutable GHCR template binding.",
  production_deploy_performed: false,
  provider_job_submitted: false,
  generation_submitted: false,
  secrets_printed: false,
  next_action: "BUILD_IMMUTABLE_GHCR_IMAGE_IF_CODE_SOURCE_CHANGED_THEN_BIND_EXACT_DIGEST",
};

console.log("AVANTIQO_CODE_RUNPOD_REFRESH_LEGACY_RELEASE_PATH_DISABLED=true");
console.log("AVANTIQO_CODE_RUNPOD_REFRESH_GITHUB_RELEASE_CREATION_ALLOWED=false");
console.log("AVANTIQO_CODE_RUNPOD_REFRESH_RUNPOD_REGISTRY_REBIND_ALLOWED=false");
console.log(JSON.stringify(result, null, 2));

if (apply) {
  throw new Error(
    "AVANTIQO_CODE_RUNPOD_GITHUB_RELEASE_REFRESH_DISABLED_USE_IMMUTABLE_IMAGE_PIPELINE",
  );
}
