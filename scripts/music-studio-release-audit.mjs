import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) { failures.push(`missing:${relativePath}`); return ""; }
  return fs.readFileSync(absolute, "utf8");
}
function requirePattern(source, pattern, label) { if (!pattern.test(source)) failures.push(label); }
function forbidPattern(source, pattern, label) { if (pattern.test(source)) failures.push(label); }

const route = read("app/api/creative/music/studio/route.js");
const workspace = read("components/creative/ProductionStudio/workspaces/MusicWorkspace.jsx");
const engine = read("lib/creative/runtime/engines/MusicEngine.js");
const finishing = read("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js");
const worker = read("services/avantiqo-audio-engine/handler.py");
const workerV2 = read("services/avantiqo-audio-engine/handler_v2.py");
const audioDockerfile = read("services/avantiqo-audio-engine/Dockerfile");
const registration = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js");
const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");
const registry = read("lib/creative/registry/applyCreativeWorkspaceRegistry.js");
const preflight = read("scripts/preflight-avantiqo-music-local.mjs");
const benchmark = read("scripts/benchmark-avantiqo-music.mjs");
const economics = read("scripts/avantiqo-music-economics.mjs");
const runpodPrepare = read("scripts/prepare-avantiqo-music-runpod-local.sh");
const imageWorkflow = read(".github/workflows/avantiqo-audio-worker-image.yml");
const certificationWorkflow = read(".github/workflows/avantiqo-music-certification.yml");

requirePattern(route, /UsageRuntime\.get\(usageId\)/, "music-status-must-resolve-governed-usage-server-side");
requirePattern(route, /CreativeMusicFinishingRuntime\.ensureMaster/, "music-route-must-trigger-automatic-mastering");
requirePattern(route, /action === "history"/, "music-route-must-expose-version-history");
requirePattern(route, /provider_selection_exposed:\s*false/, "music-route-must-hide-provider-selection");
forbidPattern(route, /const provider = text\(body\.provider\)/, "music-route-must-not-trust-client-provider");

requirePattern(workspace, /Version history/, "music-workspace-must-show-version-history");
requirePattern(workspace, /Automatic studio finishing/, "music-workspace-must-show-automatic-finishing");
requirePattern(finishing, /target_lufs/, "music-mastering-must-carry-loudness-target");
requirePattern(finishing, /true_peak_dbtp/, "music-mastering-must-carry-true-peak-target");
requirePattern(finishing, /release-wav/, "music-mastering-must-deliver-wav");
requirePattern(finishing, /release-mp3/, "music-mastering-must-deliver-mp3");
requirePattern(finishing, /musicStorageReference/, "music-persistence-must-resolve-storage-reference");

requirePattern(engine, /ai\.music\.generate/, "music-engine-must-own-generation-contract");
requirePattern(engine, /ai\.audio\.remix/, "music-engine-must-model-remix-contract");
requirePattern(engine, /ai\.audio\.edit/, "music-engine-must-model-edit-contract");
requirePattern(engine, /ai\.audio\.extend/, "music-engine-must-model-extend-contract");
requirePattern(engine, /acestep-v15-xl-turbo/, "music-engine-must-use-xl-transform-lane");
requirePattern(engine, /XL_TURBO_REPAINT_RIGHT_OUTPAINT/, "music-engine-must-use-temporal-right-outpaint-strategy");

requirePattern(worker, /SUPPORTED_MODEL_VARIANTS = \{"acestep-v15-xl-turbo"\}/, "owned-audio-worker-must-require-xl-model");
requirePattern(worker, /SUPPORTED_LM_MODELS = \{"acestep-5Hz-lm-1\.7B"\}/, "owned-audio-worker-must-require-1-7b-lm");
requirePattern(worker, /thinking=use_lm/, "owned-audio-worker-must-enable-lm-thinking");
requirePattern(worker, /AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED/, "owned-audio-worker-must-fail-closed-on-uncertified-capability");
requirePattern(workerV2, /TEMPORAL_EXTEND_CAPABILITY = "ai\.audio\.extend"/, "owned-audio-worker-v2-must-own-temporal-extend");
requirePattern(workerV2, /TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT"/, "owned-audio-worker-v2-must-use-right-outpaint");
requirePattern(workerV2, /repaint_start = max\(0\.0, source_duration - overlap\)/, "owned-audio-worker-v2-must-use-tail-overlap");
requirePattern(workerV2, /"repainting_start": repaint_start/, "owned-audio-worker-v2-must-bind-tail-overlap-to-worker-request");
requirePattern(workerV2, /repaint_end = target_duration/, "owned-audio-worker-v2-must-outpaint-to-target-duration");
requirePattern(workerV2, /temporal_extension_observed/, "owned-audio-worker-v2-must-measure-extension-result");

requirePattern(audioDockerfile, /ARG CUDA_VERSION=12\.8\.1/, "music-worker-image-must-pin-cuda-12-8-runtime");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_MODEL_VARIANT=acestep-v15-xl-turbo/, "music-worker-image-must-pin-xl-model");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_LM_MODEL=acestep-5Hz-lm-1\.7B/, "music-worker-image-must-pin-1-7b-lm");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_LM_BACKEND=vllm/, "music-worker-image-must-pin-vllm-lm-backend");
requirePattern(audioDockerfile, /ACESTEP_INIT_LLM=true/, "music-worker-image-must-initialize-lm");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_NATIVE_AUDIO_IMPORTS=PASS/, "music-worker-image-must-prove-native-audio-imports");
requirePattern(audioDockerfile, /handler_v2/, "music-worker-image-must-package-v2-worker");

requirePattern(registration, /EXPECTED_MODEL_VARIANT = "acestep-v15-xl-turbo"/, "audio-provider-must-declare-xl-runtime");
requirePattern(registration, /EXPECTED_LM_MODEL = "acestep-5Hz-lm-1\.7B"/, "audio-provider-must-declare-1-7b-lm");
requirePattern(registration, /EXPECTED_LM_BACKEND = "vllm"/, "audio-provider-must-declare-vllm");
requirePattern(registration, /modelVariant === EXPECTED_MODEL_VARIANT/, "audio-provider-must-require-xl-runtime");
requirePattern(registration, /lmModel === EXPECTED_LM_MODEL/, "audio-provider-must-require-1-7b-lm");
requirePattern(registration, /lmBackend === EXPECTED_LM_BACKEND/, "audio-provider-must-require-vllm");
requirePattern(registration, /ace_step_lm_enabled:\s*lmEnabled/, "audio-provider-must-advertise-runtime-lm-state");
requirePattern(registration, /vocal_correction_runtime/, "audio-provider-must-describe-vocal-runtime");
requirePattern(registration, /elastic_audio_runtime/, "audio-provider-must-describe-elastic-runtime");

requirePattern(preflight, /AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V3/, "music-preflight-must-use-current-contract");
requirePattern(preflight, /runpod_run_called:\s*false/, "music-preflight-must-not-submit-run-job");
requirePattern(preflight, /runpod_runsync_called:\s*false/, "music-preflight-must-not-submit-runsync-job");
requirePattern(preflight, /production_deploy_performed:\s*false/, "music-preflight-must-not-deploy-production");
requirePattern(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/, "music-benchmark-must-require-explicit-spend-approval");
requirePattern(benchmark, /AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3/, "music-benchmark-must-use-current-evidence-contract");
requirePattern(benchmark, /activation_allowed:\s*false/, "music-benchmark-must-not-activate-production-routing");

requirePattern(economics, /AVANTIQO_MUSIC_ECONOMICS_V1/, "music-economics-contract-required");
requirePattern(economics, /RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE/, "music-economics-must-have-verifiable-gpu-rate-map");
requirePattern(economics, /AVANTIQO_AUDIO_GPU_USD_PER_HOUR/, "music-economics-must-allow-operator-rate-override");
requirePattern(economics, /capturedWorkerRate/, "music-economics-must-bind-rate-to-captured-worker");
requirePattern(economics, /runpod_execution_ms/, "music-economics-must-use-runpod-billed-execution-time");
requirePattern(economics, /utilization_adjusted_compute_usd_per_audio_second/, "music-economics-must-measure-unit-cost");

requirePattern(runpodPrepare, /REGISTRY_BACKED_READY/, "music-runpod-prepare-must-use-registry-backed-ready-state");
requirePattern(runpodPrepare, /REGISTRY_BACKED_PREFLIGHT_ALREADY_GREEN/, "music-runpod-prepare-must-skip-legacy-mutation-when-green");
requirePattern(runpodPrepare, /LEGACY_TEMPLATE_REPAIR_ATTEMPTED=false/, "music-runpod-prepare-must-not-run-legacy-template-repair");
requirePattern(runpodPrepare, /MUTATION_PERFORMED=false/, "music-runpod-prepare-must-remain-zero-mutation");
requirePattern(runpodPrepare, /REAL_MUSIC_GENERATION_SUBMITTED=false/, "music-runpod-prepare-must-stop-before-generation");

requirePattern(imageWorkflow, /ref:\s*\$\{\{ github\.sha \}\}/, "music-worker-image-workflow-must-checkout-exact-trigger-sha");
requirePattern(imageWorkflow, /AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3/, "music-worker-image-workflow-must-emit-xl-lm-evidence-contract");
requirePattern(imageWorkflow, /runtime_variant:\s*"acestep-v15-xl-turbo"/, "music-worker-image-workflow-must-record-xl-model");
requirePattern(imageWorkflow, /lm_model:\s*"acestep-5Hz-lm-1\.7B"/, "music-worker-image-workflow-must-record-lm-model");
requirePattern(imageWorkflow, /xl_model_contract_passed_by_docker_build:\s*true/, "music-worker-image-workflow-must-record-xl-build-contract");
requirePattern(imageWorkflow, /lm_contract_passed_by_docker_build:\s*true/, "music-worker-image-workflow-must-record-lm-build-contract");
requirePattern(imageWorkflow, /native_audio_import_smoke_passed_by_docker_build:\s*true/, "music-worker-image-workflow-must-record-native-audio-smoke");
requirePattern(imageWorkflow, /cuda_import_smoke_passed_by_docker_build:\s*true/, "music-worker-image-workflow-must-record-runtime-smoke");
requirePattern(imageWorkflow, /production_web_deploy:\s*false/, "music-worker-image-workflow-must-not-deploy-production-app");
requirePattern(imageWorkflow, /provider_job_submitted:\s*false/, "music-worker-image-workflow-must-not-submit-provider-generation");
requirePattern(imageWorkflow, /pricing_activation_performed:\s*false/, "music-worker-image-workflow-must-not-activate-pricing");

requirePattern(certificationWorkflow, /audits\/avantiqo-music-certification-request\.json/, "music-certification-workflow-must-use-dedicated-request-trigger");
requirePattern(certificationWorkflow, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED:\s*"YES"/, "music-certification-workflow-must-explicitly-approve-controlled-spend");
requirePattern(certificationWorkflow, /AVANTIQO_AUDIO_BENCHMARK_RUNS:\s*"1"/, "music-certification-workflow-must-default-to-one-controlled-run");
requirePattern(certificationWorkflow, /activation_allowed !== false/, "music-certification-workflow-must-verify-no-production-activation");

requirePattern(router, /music:\s*MusicStudioWorkspace/, "creative-router-must-route-music-studio-workspace");
requirePattern(registry, /id:\s*"music"/, "creative-registry-must-own-music-workspace");

if (failures.length) {
  console.error("MUSIC_STUDIO_RELEASE_AUDIT=FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MUSIC_STUDIO_RELEASE_AUDIT=PASS");
console.log("MUSIC_GENERATION_CONTRACT=OWNED_XL_TURBO_1_7B_LM");
console.log("MUSIC_PROVIDER_RUNTIME=REGISTRY_BACKED_FAIL_CLOSED");
console.log("MUSIC_RUNPOD_PREPARE=ZERO_GENERATION_ZERO_MUTATION");
console.log("MUSIC_WORKER_IMAGE=IMMUTABLE_EXACT_SOURCE_WITH_BUILD_EVIDENCE");
console.log("MUSIC_ECONOMICS=CAPTURED_WORKER_RATE_OR_OPERATOR_OVERRIDE");
console.log("MUSIC_CERTIFICATION=EXPLICIT_SPEND_AND_NO_AUTOMATIC_ACTIVATION");
