import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`missing:${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) failures.push(label);
}

function forbidPattern(source, pattern, label) {
  if (pattern.test(source)) failures.push(label);
}

const worker = read("services/avantiqo-audio-engine/handler.py");
const workerV2 = read("services/avantiqo-audio-engine/handler_v2.py");
const policy = read("config/avantiqo-runpod-safe-lease-policy.json");
const provisioner = read("scripts/provision-avantiqo-music-transform-candidate-runpod-local.mjs");
const preflight = read("scripts/preflight-avantiqo-music-transform-candidate-local.mjs");
const launcher = read("scripts/run-avantiqo-music-transform-certification-local.mjs");
const benchmark = read("scripts/benchmark-avantiqo-music-transform.mjs");
const imageRequest = read("audits/avantiqo-audio-worker-image-request.json");
const provisionWorkflow = read(".github/workflows/avantiqo-music-transform-candidate-provision.yml");

requirePattern(policy, /"music-transform-candidate":\s*"avantiqo-music-transform-candidate-v1"/, "music-transform-safe-lease-policy-must-own-candidate-lane");

requirePattern(worker, /SAFE_LEASE_LANE = os\.getenv\("AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE", "audio"\)\.strip\(\)/, "music-transform-worker-must-bind-certification-lane-from-endpoint-env");
requirePattern(worker, /safe_lease_lane": _text\(context\.get\("safe_lease_lane"\)\) == SAFE_LEASE_LANE/, "music-transform-worker-must-reject-wrong-safe-lease-lane");
requirePattern(worker, /production_activation_allowed/, "music-transform-worker-must-require-production-activation-false");
requirePattern(worker, /pricing_activation_allowed/, "music-transform-worker-must-require-pricing-activation-false");
requirePattern(worker, /provider_selection_change_allowed/, "music-transform-worker-must-require-provider-selection-unchanged");
requirePattern(workerV2, /TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/, "music-transform-worker-v2-must-use-canonical-temporal-extend-strategy");
requirePattern(workerV2, /"temporal_extension_proven": False/, "music-transform-worker-v2-must-not-self-certify-temporal-extend");

requirePattern(provisioner, /ENDPOINT_NAME = "avantiqo-music-transform-candidate-v1"/, "music-transform-provisioner-must-target-candidate-endpoint");
requirePattern(provisioner, /PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1"/, "music-transform-provisioner-must-identify-production-compose-endpoint");
requirePattern(provisioner, /REQUEST_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_REQUEST_V11"/, "music-transform-provisioner-must-require-candidate-aware-image-request");
requirePattern(provisioner, /AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE: SAFE_LEASE_LANE/, "music-transform-template-must-bind-candidate-certification-lane");
requirePattern(provisioner, /workersMax:\s*0/, "music-transform-candidate-must-be-created-parked");
requirePattern(provisioner, /workersMin:\s*0/, "music-transform-candidate-min-workers-must-be-zero");
requirePattern(provisioner, /networkVolumeId:\s*volume\.id/, "music-transform-candidate-must-bind-shared-cache");
requirePattern(provisioner, /networkVolumeIds:\s*\[volume\.id\]/, "music-transform-candidate-must-bind-single-shared-cache");
requirePattern(provisioner, /production_audio_endpoint_mutation_allowed:\s*false/, "music-transform-provisioner-must-forbid-production-compose-mutation");
requirePattern(provisioner, /provider_job_submitted:\s*false/, "music-transform-provisioner-must-not-submit-provider-job");
requirePattern(provisioner, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVISION_APPROVED/, "music-transform-provisioner-must-require-explicit-apply-approval");

requirePattern(provisionWorkflow, /RUNPOD_MANAGEMENT_API_KEY:\s*\$\{\{\s*secrets\.RUNPOD_MANAGEMENT_API_KEY\s*\|\|\s*secrets\.RUNPOD_API_KEY\s*\}\}/, "music-transform-provision-workflow-must-use-canonical-management-key-fallback");
forbidPattern(provisionWorkflow, /^\s*RUNPOD_API_KEY:\s*\$\{\{/m, "music-transform-provision-workflow-must-not-expose-inference-key-env");
forbidPattern(provisionWorkflow, /^\s*NEXT_PUBLIC_SUPABASE_URL:\s*\$\{\{/m, "music-transform-provision-workflow-must-not-expose-supabase-url-env");
forbidPattern(provisionWorkflow, /^\s*SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{/m, "music-transform-provision-workflow-must-not-expose-supabase-service-role-env");
requirePattern(provisionWorkflow, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVISION_MANAGEMENT_ONLY=true/, "music-transform-provision-workflow-must-assert-management-only-scope");
requirePattern(provisionWorkflow, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVIDER_JOB_CAPABLE=false/, "music-transform-provision-workflow-must-assert-provider-job-incapable");

requirePattern(preflight, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_V1/, "music-transform-candidate-preflight-contract-required");
requirePattern(preflight, /RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID/, "music-transform-preflight-must-require-exact-candidate-endpoint-id");
requirePattern(preflight, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_PRODUCTION_AUDIO_COLLISION/, "music-transform-preflight-must-reject-production-audio-collision");
requirePattern(preflight, /AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_NOT_PARKED_0_0/, "music-transform-preflight-must-require-parked-endpoint");
requirePattern(preflight, /AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE: SAFE_LEASE_LANE/, "music-transform-preflight-must-verify-candidate-template-lane");
requirePattern(preflight, /runpod_run_called:\s*false/, "music-transform-preflight-must-not-call-run");
requirePattern(preflight, /runpod_runsync_called:\s*false/, "music-transform-preflight-must-not-call-runsync");
requirePattern(preflight, /workers_opened:\s*false/, "music-transform-preflight-must-not-open-workers");
requirePattern(preflight, /endpoint_mutation_performed:\s*false/, "music-transform-preflight-must-be-read-only");
requirePattern(preflight, /ready_for_safe_lease_certification:\s*true/, "music-transform-preflight-must-produce-safe-lease-readiness");

requirePattern(benchmark, /SAFE_LEASE_LANE = "music-transform-candidate"/, "music-transform-benchmark-must-use-candidate-lane");
requirePattern(benchmark, /RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID/, "music-transform-benchmark-must-target-candidate-endpoint");
forbidPattern(benchmark, /RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID/, "music-transform-benchmark-must-not-target-production-audio-endpoint");
requirePattern(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/, "music-transform-benchmark-must-require-explicit-spend-approval");
requirePattern(benchmark, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED/, "music-transform-benchmark-must-require-source-rights-approval");
requirePattern(benchmark, /max_provider_jobs:\s*1/, "music-transform-benchmark-must-cap-provider-jobs-at-one");
requirePattern(benchmark, /human_review_required:\s*true/, "music-transform-benchmark-must-require-human-review");
requirePattern(benchmark, /production_activation_allowed:\s*false/, "music-transform-benchmark-must-not-activate-production");
requirePattern(benchmark, /pricing_activation_allowed:\s*false/, "music-transform-benchmark-must-not-activate-pricing");
requirePattern(benchmark, /XL_TURBO_REPAINT_RIGHT_OUTPAINT/, "music-transform-benchmark-must-prove-canonical-temporal-extend-strategy");

requirePattern(launcher, /PREFLIGHT_SCRIPT = resolve\("scripts\/preflight-avantiqo-music-transform-candidate-local\.mjs"\)/, "music-transform-launcher-must-bind-candidate-preflight");
requirePattern(launcher, /const preflight = spawnSync/, "music-transform-launcher-must-run-preflight-before-safe-lease");
requirePattern(launcher, /SAFE_LEASE_LANE = "music-transform-candidate"/, "music-transform-launcher-must-use-candidate-safe-lease-lane");
requirePattern(launcher, /--ttl-ms=1800000/, "music-transform-launcher-must-bound-safe-lease-ttl");
requirePattern(launcher, /AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES"/, "music-transform-launcher-must-open-only-through-safe-lease-controller");
forbidPattern(launcher, /--lane=audio/, "music-transform-launcher-must-not-open-production-audio-lane");

requirePattern(imageRequest, /"contract":\s*"AVANTIQO_AUDIO_WORKER_IMAGE_REQUEST_V11"/, "music-transform-image-request-must-use-candidate-aware-contract");
requirePattern(imageRequest, /"worker_entrypoint":\s*"handler_v2\.py"/, "music-transform-image-request-must-package-v2-worker");
requirePattern(imageRequest, /"transform_candidate_lane":\s*"music-transform-candidate"/, "music-transform-image-request-must-bind-candidate-lane");
requirePattern(imageRequest, /"transform_candidate_endpoint":\s*"avantiqo-music-transform-candidate-v1"/, "music-transform-image-request-must-bind-candidate-endpoint");
requirePattern(imageRequest, /"production_audio_endpoint_mutation_allowed":\s*false/, "music-transform-image-request-must-forbid-production-compose-mutation");
requirePattern(imageRequest, /"provider_job_submitted":\s*false/, "music-transform-image-request-must-submit-zero-provider-jobs");

if (failures.length) {
  console.error("MUSIC_TRANSFORM_CANDIDATE_RELEASE_AUDIT=FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MUSIC_TRANSFORM_CANDIDATE_RELEASE_AUDIT=PASS");
console.log("MUSIC_TRANSFORM_CANDIDATE_ENDPOINT=ISOLATED_FROM_PRODUCTION_COMPOSE");
console.log("MUSIC_TRANSFORM_CANDIDATE_RESTING_WORKERS=0_0");
console.log("MUSIC_TRANSFORM_CANDIDATE_PROVISION_CREDENTIAL_SCOPE=MANAGEMENT_ONLY_WITH_CANONICAL_FALLBACK");
console.log("MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT=ZERO_SPEND_BEFORE_SAFE_LEASE");
console.log("MUSIC_TRANSFORM_CANDIDATE_BENCHMARK=ONE_JOB_EXPLICIT_SPEND_AND_RIGHTS_APPROVAL_REQUIRED");
console.log("MUSIC_TRANSFORM_CANDIDATE_HUMAN_REVIEW=REQUIRED_BEFORE_ACTIVATION");
