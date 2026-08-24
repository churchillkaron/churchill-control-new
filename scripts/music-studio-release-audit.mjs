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

const route = read("app/api/creative/music/studio/route.js");
const workspace = read("components/creative/ProductionStudio/workspaces/MusicWorkspace.jsx");
const engine = read("lib/creative/runtime/engines/MusicEngine.js");
const finishing = read("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js");
const worker = read("services/avantiqo-audio-engine/handler.py");
const audioDockerfile = read("services/avantiqo-audio-engine/Dockerfile");
const registration = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js");
const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");
const registry = read("lib/creative/registry/applyCreativeWorkspaceRegistry.js");
const preflight = read("scripts/preflight-avantiqo-music-local.mjs");
const benchmark = read("scripts/benchmark-avantiqo-music.mjs");
const economics = read("scripts/avantiqo-music-economics.mjs");
const reviewPrep = read("scripts/prepare-avantiqo-music-human-review.mjs");
const reviewFinalizer = read("scripts/finalize-avantiqo-music-human-review.mjs");
const promotionPlan = read("scripts/plan-avantiqo-music-promotion.mjs");
const runpodInspector = read("scripts/inspect-avantiqo-audio-runpod-worker-local.mjs");
const endpointBinder = read("scripts/bind-avantiqo-audio-endpoint-local.mjs");
const endpointAutoBinder = read("scripts/bind-avantiqo-audio-endpoint-auto-local.mjs");
const endpointProvisioner = read("scripts/provision-avantiqo-audio-runpod-endpoint-local.mjs");
const storageProvisioner = read("scripts/provision-avantiqo-audio-runpod-storage-local.mjs");
const sharedVolumePolicy = read("scripts/lib/avantiqo-runpod-shared-volumes.mjs");
const workerRepair = read("scripts/repair-avantiqo-audio-runpod-worker-local.mjs");
const runpodPrepare = read("scripts/prepare-avantiqo-music-runpod-local.sh");
const imageWorkflow = read(".github/workflows/avantiqo-audio-worker-image.yml");
const certificationWorkflow = read(".github/workflows/avantiqo-music-certification.yml");

requirePattern(route, /UsageRuntime\.get\(usageId\)/, "music-status-must-resolve-governed-usage-server-side");
requirePattern(route, /CreativeMusicFinishingRuntime\.ensureMaster/, "music-route-must-trigger-automatic-mastering");
requirePattern(route, /action === "history"/, "music-route-must-expose-version-history");
requirePattern(route, /provider_selection_exposed:\s*false/, "music-route-must-hide-provider-selection");
forbidPattern(route, /const provider = text\(body\.provider\)/, "music-route-must-not-trust-client-provider");
forbidPattern(route, /pricing:\s*body\.pricing/, "music-route-must-not-trust-client-pricing");

requirePattern(workspace, /action:\s*"status"[\s\S]*usage_id:\s*session\.usage_id/, "music-workspace-must-poll-by-usage-id");
forbidPattern(workspace, /provider_job_id:\s*session\./, "music-workspace-must-not-send-provider-job-id");
forbidPattern(workspace, /pricing:\s*session\.pricing/, "music-workspace-must-not-send-pricing");
requirePattern(workspace, /Version history/, "music-workspace-must-show-version-history");
requirePattern(workspace, /Automatic studio finishing/, "music-workspace-must-show-automatic-finishing");
requirePattern(workspace, /resolutionFailures/, "music-private-playback-must-be-retry-bounded");

requirePattern(finishing, /music_asset_kind:\s*SOURCE_KIND/, "music-source-assets-must-be-versioned");
requirePattern(finishing, /music_asset_kind:\s*MASTER_KIND/, "music-master-assets-must-be-separate");
requirePattern(finishing, /dispatchAudioTask\(finishTask\)/, "music-mastering-must-use-canonical-audio-finisher");
requirePattern(finishing, /target_lufs/, "music-mastering-must-carry-loudness-target");
requirePattern(finishing, /true_peak_dbtp/, "music-mastering-must-carry-true-peak-target");
requirePattern(finishing, /release-wav/, "music-mastering-must-deliver-wav");
requirePattern(finishing, /release-mp3/, "music-mastering-must-deliver-mp3");
requirePattern(finishing, /waveform/, "music-mastering-must-produce-waveform-evidence");
requirePattern(finishing, /musicStorageReference/, "music-persistence-must-resolve-nested-storage-reference");

requirePattern(engine, /ai\.music\.generate/, "music-engine-must-own-generation-contract");
requirePattern(engine, /ai\.audio\.remix/, "music-engine-must-model-remix-contract");
requirePattern(engine, /ai\.audio\.edit/, "music-engine-must-model-edit-contract");
requirePattern(engine, /acestep-v15-base/, "music-engine-must-declare-base-model-lane");
requirePattern(engine, /BASE_MODEL_AND_BENCHMARK_REQUIRED/, "base-model-features-must-stay-gated");

requirePattern(worker, /"ai\.audio\.remix":\s*"cover"/, "owned-audio-worker-must-map-remix-to-cover");
requirePattern(worker, /"ai\.audio\.edit":\s*"repaint"/, "owned-audio-worker-must-map-edit-to-repaint");
requirePattern(worker, /DEFAULT_CERTIFIED_CAPABILITIES\s*=\s*\{"ai\.music\.generate"\}/, "owned-audio-worker-default-certification-must-remain-generation-only");
requirePattern(worker, /AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED/, "owned-audio-worker-must-fail-closed-on-uncertified-capability");
requirePattern(worker, /MAX_SOURCE_BYTES/, "owned-audio-worker-must-bound-source-downloads");
requirePattern(worker, /allow_redirects=False/, "owned-audio-worker-source-download-must-not-follow-redirects");

requirePattern(audioDockerfile, /ARG CUDA_VERSION=12\.8\.1/, "music-worker-image-must-pin-cuda-12-8-runtime");
requirePattern(audioDockerfile, /FROM nvidia\/cuda:\$\{CUDA_VERSION\}-runtime-ubuntu22\.04/, "music-worker-image-must-use-nvidia-cuda-runtime");
requirePattern(audioDockerfile, /libsndfile1/, "music-worker-image-must-install-native-audio-runtime");
requirePattern(audioDockerfile, /git checkout 14c0211d5a0653b0f63e27686f4c3f151b4d8629/, "music-worker-image-must-pin-ace-step-source");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_IMAGE_IMPORT_SMOKE=PASS/, "music-worker-image-must-run-owned-handler-import-smoke");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_CUDA_12_8_TORCH_REQUIRED/, "music-worker-image-must-fail-build-without-cuda-12-8-torch");
requirePattern(audioDockerfile, /AVANTIQO_AUDIO_NATIVE_AUDIO_IMPORTS=PASS/, "music-worker-image-must-prove-native-audio-imports");

requirePattern(registration, /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\["ai\.music\.generate"\]\)/, "audio-provider-default-certification-must-remain-generation-only");
requirePattern(registration, /"ai\.audio\.remix"/, "audio-provider-must-register-implemented-remix-contract");
requirePattern(registration, /"ai\.audio\.edit"/, "audio-provider-must-register-implemented-edit-contract");
requirePattern(registration, /base_model_required_capabilities/, "audio-provider-must-declare-base-model-required-capabilities");

requirePattern(preflight, /assertSharedVolumeGroupCompatible\(volumes, AUDIO_VOICE_GROUP\)/, "music-preflight-must-validate-audio-voice-shared-group");
requirePattern(preflight, /resolveReusableGroupVolume\(volumes, AUDIO_VOICE_GROUP\)/, "music-preflight-must-resolve-reusable-audio-voice-cache");
requirePattern(preflight, /AVANTIQO_MUSIC_PREFLIGHT_DURABLE_NETWORK_VOLUME_REQUIRED/, "music-preflight-must-require-durable-network-volume");
requirePattern(preflight, /AVANTIQO_MUSIC_PREFLIGHT_SHARED_AUDIO_VOICE_VOLUME_NOT_ATTACHED/, "music-preflight-must-require-shared-audio-voice-cache-attachment");
requirePattern(preflight, /shared_volume_policy_scope:\s*AUDIO_VOICE_GROUP\.id/, "music-preflight-must-record-audio-voice-policy-scope");
requirePattern(preflight, /shared_volume_policy_compliant:\s*true/, "music-preflight-must-record-shared-policy-compliance");
requirePattern(preflight, /network_volume_attached:\s*true/, "music-preflight-must-record-network-volume-attachment");
requirePattern(preflight, /persistent:\s*true/, "music-preflight-must-record-persistent-model-cache");
requirePattern(preflight, /signed_upload_creation_passed:\s*true/, "music-preflight-must-prove-signed-upload-creation");
requirePattern(preflight, /signed_read_creation_passed:\s*true/, "music-preflight-must-prove-signed-read-creation");
requirePattern(preflight, /object_written:\s*false/, "music-preflight-must-not-write-storage-object");
requirePattern(preflight, /runpod_run_called:\s*false/, "music-preflight-must-not-submit-run-job");
requirePattern(preflight, /runpod_runsync_called:\s*false/, "music-preflight-must-not-submit-runsync-job");
requirePattern(preflight, /storage_objects_written:\s*0/, "music-preflight-must-record-zero-storage-writes");
requirePattern(preflight, /database_rows_written:\s*0/, "music-preflight-must-record-zero-database-writes");
requirePattern(preflight, /endpoint_mutations_performed:\s*0/, "music-preflight-must-record-zero-endpoint-mutations");
requirePattern(preflight, /production_deploy_performed:\s*false/, "music-preflight-must-not-deploy-production");

requirePattern(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/, "music-benchmark-must-require-explicit-spend-approval");
requirePattern(benchmark, /AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V2/, "music-benchmark-must-require-current-zero-generation-preflight");
requirePattern(benchmark, /runRequiredPreflight\(\)/, "music-benchmark-must-run-preflight-before-paid-job");
requirePattern(benchmark, /ready_for_controlled_benchmark/, "music-benchmark-must-require-preflight-readiness");
requirePattern(benchmark, /EXPECTED_SHARED_VOLUME_GROUP = "AUDIO_VOICE"/, "music-benchmark-must-bind-audio-voice-shared-group");
requirePattern(benchmark, /EXPECTED_SHARED_VOLUME_NAME = "avantiqo-shared-audio-voice-cache"/, "music-benchmark-must-bind-canonical-audio-voice-cache");
requirePattern(benchmark, /result\?\.model_cache\?\.network_volume_attached === true/, "music-benchmark-must-require-network-volume-attachment");
requirePattern(benchmark, /result\?\.model_cache\?\.attached_volume_count === 1/, "music-benchmark-must-require-single-attached-cache");
requirePattern(benchmark, /result\?\.model_cache\?\.shared_volume_policy_compliant === true/, "music-benchmark-must-require-shared-cache-policy-compliance");
requirePattern(benchmark, /result\?\.model_cache\?\.persistent === true/, "music-benchmark-must-require-persistent-model-cache");
requirePattern(benchmark, /result\?\.safety\?\.shared_volume_policy_verified === true/, "music-benchmark-must-require-shared-cache-policy-evidence");
requirePattern(benchmark, /result\?\.safety\?\.runpod_run_called === false/, "music-benchmark-must-prove-preflight-did-not-submit-run");
requirePattern(benchmark, /result\?\.safety\?\.runpod_runsync_called === false/, "music-benchmark-must-prove-preflight-did-not-submit-runsync");
requirePattern(benchmark, /result\?\.storage\?\.signed_upload_creation_passed === true/, "music-benchmark-must-require-signed-upload-preflight");
requirePattern(benchmark, /result\?\.storage\?\.signed_read_creation_passed === true/, "music-benchmark-must-require-signed-read-preflight");
requirePattern(benchmark, /result\?\.model_contract\?\.ace_step_lm_enabled === false/, "music-benchmark-must-require-ace-step-lm-disabled");
requirePattern(benchmark, /AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3/, "music-benchmark-must-use-current-evidence-contract");
requirePattern(benchmark, /runpod_execution_ms/, "music-benchmark-must-capture-runpod-billed-execution-time");
requirePattern(benchmark, /organization_record_created:\s*false/, "music-benchmark-must-not-create-business-organization-records");
requirePattern(benchmark, /MUST_BE_SYNTHETIC/, "music-benchmark-must-reject-real-organization-scope");
requirePattern(benchmark, /activation_allowed:\s*false/, "music-benchmark-must-not-activate-production-routing");
requirePattern(benchmark, /\/run`/, "music-benchmark-must-use-queued-runpod-transport");
requirePattern(benchmark, /\/status\//, "music-benchmark-must-poll-runpod-job-status");
requirePattern(benchmark, /AVANTIQO_AUDIO_BENCHMARK_QUEUE_TIMEOUT_MS/, "music-benchmark-must-bound-queue-wait");
requirePattern(benchmark, /AVANTIQO_AUDIO_BENCHMARK_EXECUTION_TIMEOUT_MS/, "music-benchmark-must-bound-execution-wait");

requirePattern(economics, /AVANTIQO_MUSIC_ECONOMICS_V1/, "music-economics-contract-required");
requirePattern(economics, /AVANTIQO_AUDIO_GPU_USD_PER_HOUR_REQUIRED/, "music-economics-must-require-real-gpu-rate");
requirePattern(economics, /runpod_execution_ms/, "music-economics-must-use-runpod-billed-execution-time");
requirePattern(economics, /utilization_adjusted_compute_usd_per_audio_second/, "music-economics-must-measure-unit-cost");
requirePattern(economics, /human_audio_quality_certified:\s*false/, "music-economics-must-keep-human-quality-gate-open");
requirePattern(economics, /pricing_activation_performed:\s*false/, "music-economics-must-not-activate-pricing");
requirePattern(economics, /activation_allowed:\s*false/, "music-economics-must-remain-measurement-only");

requirePattern(reviewPrep, /AVANTIQO_MUSIC_HUMAN_REVIEW_V1/, "music-human-review-contract-required");
requirePattern(reviewPrep, /automatic_human_approval_forbidden:\s*true/, "music-human-review-must-forbid-automatic-approval");
requirePattern(reviewPrep, /instrumental_integrity/, "music-human-review-must-check-unintended-vocals");
requirePattern(reviewPrep, /commercial_release_readiness/, "music-human-review-must-check-release-readiness");
requirePattern(reviewPrep, /review_status:\s*"PENDING"/, "music-human-review-must-start-pending");

requirePattern(reviewFinalizer, /AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1/, "music-human-review-must-produce-shared-media-evidence-contract");
requirePattern(reviewFinalizer, /REVIEWER_REQUIRED/, "music-human-review-finalization-must-require-reviewer");
requirePattern(reviewFinalizer, /score_0_100/, "music-human-review-finalization-must-validate-scores");
requirePattern(reviewFinalizer, /production_certified:\s*false/, "music-human-review-must-not-self-certify-production");
requirePattern(reviewFinalizer, /activation_allowed:\s*false/, "music-human-review-must-not-activate-routing");

requirePattern(promotionPlan, /AVANTIQO_MUSIC_PROMOTION_PLAN_V1/, "music-promotion-plan-contract-required");
requirePattern(promotionPlan, /human_quality_certified/, "music-promotion-plan-must-require-human-quality");
requirePattern(promotionPlan, /human_quality_reviewer/, "music-promotion-plan-must-bind-reviewer");
requirePattern(promotionPlan, /certified_capability:\s*CAPABILITY/, "music-promotion-plan-must-bind-capability");
requirePattern(promotionPlan, /certified_model:\s*MODEL/, "music-promotion-plan-must-bind-model");
requirePattern(promotionPlan, /automatic_activation_forbidden:\s*true/, "music-promotion-plan-must-forbid-automatic-activation");
requirePattern(promotionPlan, /pricing_mutation_performed:\s*false/, "music-promotion-plan-must-not-mutate-pricing");
requirePattern(promotionPlan, /ready_for_explicit_promotion:\s*false/, "music-promotion-plan-must-require-explicit-promotion-step");

requirePattern(runpodInspector, /includeEndpointBoundTemplates=true/, "music-runpod-inspector-must-resolve-endpoint-bound-templates");
requirePattern(runpodInspector, /RUNPOD_MANAGEMENT_API_KEY/, "music-runpod-inspector-must-use-dedicated-management-credential");
requirePattern(runpodInspector, /read_only:\s*true/, "music-runpod-inspector-must-remain-read-only");
requirePattern(runpodInspector, /runpod_generation_jobs_submitted:\s*0/, "music-runpod-inspector-must-not-spend-provider-generation");
requirePattern(runpodInspector, /secret_values_in_output:\s*false/, "music-runpod-inspector-must-not-print-secret-values");

requirePattern(endpointBinder, /AVANTIQO_AUDIO_ENGINE_V1/, "music-endpoint-binder-must-fingerprint-audio-contract");
requirePattern(endpointBinder, /AVANTIQO_AUDIO_CAPABILITY_NOT_IMPLEMENTED/, "music-endpoint-binder-must-prove-audio-worker-identity");
requirePattern(endpointBinder, /COLLIDES_WITH_OTHER_CONFIGURED_ENGINE/, "music-endpoint-binder-must-reject-cross-engine-endpoint-collision");
requirePattern(endpointBinder, /RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID_BOUND_LOCAL=true/, "music-endpoint-binder-must-only-bind-local-audio-endpoint");
requirePattern(endpointBinder, /MODEL_GENERATION_PERFORMED=false/, "music-endpoint-binder-fingerprint-must-not-generate-music");
requirePattern(endpointBinder, /PRODUCTION_DEPLOY_PERFORMED=false/, "music-endpoint-binder-must-not-deploy-production");
requirePattern(endpointAutoBinder, /avantiqo-audio-v1/, "music-auto-binder-must-resolve-exact-audio-endpoint-name");
requirePattern(endpointAutoBinder, /bind-avantiqo-audio-endpoint-local\.mjs/, "music-auto-binder-must-delegate-to-fingerprint-binder");

requirePattern(endpointProvisioner, /AVANTIQO_AUDIO_RUNPOD_ENDPOINT_PROVISION_V3/, "music-endpoint-provisioner-must-use-current-contract");
requirePattern(endpointProvisioner, /AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V2/, "music-endpoint-provisioner-must-require-hardened-worker-image-evidence");
requirePattern(endpointProvisioner, /EXPECTED_CUDA_RUNTIME = "12\.8"/, "music-endpoint-provisioner-must-require-cuda-12-8-image");
requirePattern(endpointProvisioner, /source_sha_matches_trigger/, "music-endpoint-provisioner-must-bind-image-source-to-trigger");
requirePattern(endpointProvisioner, /cuda_enabled_torch_required/, "music-endpoint-provisioner-must-require-cuda-enabled-torch-evidence");
requirePattern(endpointProvisioner, /owned_handler_import_smoke_required/, "music-endpoint-provisioner-must-require-owned-handler-import-evidence");
requirePattern(endpointProvisioner, /native_audio_import_smoke_required/, "music-endpoint-provisioner-must-require-native-audio-evidence");
requirePattern(endpointProvisioner, /native_audio_import_smoke_passed_by_docker_build/, "music-endpoint-provisioner-must-require-native-audio-runtime-smoke");
requirePattern(endpointProvisioner, /cuda_import_smoke_passed_by_docker_build/, "music-endpoint-provisioner-must-require-image-runtime-smoke");
requirePattern(endpointProvisioner, /@sha256:/, "music-endpoint-provisioner-must-require-image-digest");
requirePattern(endpointProvisioner, /workersMin:\s*0/, "music-endpoint-provisioner-must-scale-to-zero");
requirePattern(endpointProvisioner, /ECONOMICAL_24GB_NO_LM_PRIORITY/, "music-endpoint-provisioner-must-prefer-economic-no-lm-gpus");
requirePattern(endpointProvisioner, /ACESTEP_CHECKPOINTS_DIR:\s*"\/opt\/ace-step\/checkpoints"/, "music-endpoint-provisioner-must-not-fake-persistent-cache-before-volume-attachment");
requirePattern(endpointProvisioner, /containerRegistryAuthId/, "music-endpoint-provisioner-must-support-private-ghcr-auth");
requirePattern(endpointProvisioner, /production_deploy_performed:\s*false/, "music-endpoint-provisioner-must-not-deploy-production");
requirePattern(endpointProvisioner, /generation_submitted:\s*false/, "music-endpoint-provisioner-must-not-submit-generation");

requirePattern(storageProvisioner, /AVANTIQO_AUDIO_RUNPOD_STORAGE_V2/, "music-storage-provisioner-contract-v2-required");
requirePattern(storageProvisioner, /sharedVolumeGroup\("AUDIO_VOICE"\)/, "music-storage-provisioner-must-use-shared-audio-voice-group");
requirePattern(storageProvisioner, /DEFAULT_VOLUME_NAME = SHARED_VOLUME_GROUP\.canonical_name/, "music-storage-provisioner-must-use-canonical-shared-volume-name");
requirePattern(storageProvisioner, /resolveReusableGroupVolume\(volumes, SHARED_VOLUME_GROUP\)/, "music-storage-provisioner-must-reuse-existing-shared-audio-voice-volume");
requirePattern(storageProvisioner, /assertManagedVolumeCreationAllowed\(freshVolumes, SHARED_VOLUME_GROUP\)/, "music-storage-provisioner-must-enforce-shared-volume-creation-limit");
requirePattern(storageProvisioner, /additional_audio_voice_volume_forbidden:\s*true/, "music-storage-provisioner-must-forbid-extra-audio-voice-cache");
requirePattern(storageProvisioner, /AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED=YES_REQUIRED/, "music-storage-provisioner-must-require-explicit-apply-approval");
requirePattern(storageProvisioner, /DEFAULT_VOLUME_SIZE_GB = 30/, "music-storage-provisioner-must-default-to-30gb-cache");
requirePattern(storageProvisioner, /MIN_VOLUME_SIZE_GB = 20/, "music-storage-provisioner-must-protect-minimum-cache-headroom");
requirePattern(storageProvisioner, /MIN_GPU_MEMORY_GB = 24/, "music-storage-provisioner-must-target-supported-24gb-gpu-lane");
requirePattern(storageProvisioner, /NETWORK_VOLUME_MOUNT_ROOT = "\/runpod-volume"/, "music-storage-provisioner-must-use-runpod-serverless-network-volume-root");
requirePattern(storageProvisioner, /\/networkvolumes/, "music-storage-provisioner-must-use-runpod-network-volume-api");
requirePattern(storageProvisioner, /networkVolumeId:\s*volumeId/, "music-storage-provisioner-must-attach-created-or-reused-volume");
requirePattern(storageProvisioner, /dataCenterIds:\s*\[selectedDatacenter\.id\]/, "music-storage-provisioner-must-bind-compatible-datacenter");
requirePattern(storageProvisioner, /generation_submitted:\s*false/, "music-storage-provisioner-must-not-submit-generation");
requirePattern(storageProvisioner, /production_deploy_performed:\s*false/, "music-storage-provisioner-must-not-deploy-production");

requirePattern(sharedVolumePolicy, /AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY_V2/, "music-shared-volume-policy-v2-required");
requirePattern(sharedVolumePolicy, /maximum_managed_cache_volumes:\s*3/, "music-shared-volume-policy-must-cap-managed-caches-at-three");
requirePattern(sharedVolumePolicy, /AUDIO_VOICE:\s*Object\.freeze/, "music-shared-volume-policy-must-define-audio-voice-group");
requirePattern(sharedVolumePolicy, /canonical_name:\s*"avantiqo-shared-audio-voice-cache"/, "music-shared-volume-policy-must-use-canonical-audio-voice-cache");
requirePattern(sharedVolumePolicy, /"avantiqo-audio-v1"/, "music-shared-volume-policy-must-include-audio-endpoint");
requirePattern(sharedVolumePolicy, /"avantiqo-voice-stt-v1"/, "music-shared-volume-policy-must-include-voice-stt-endpoint");
requirePattern(sharedVolumePolicy, /"avantiqo-voice-tts-v1"/, "music-shared-volume-policy-must-include-voice-tts-endpoint");
requirePattern(sharedVolumePolicy, /resolveReusableGroupVolume/, "music-shared-volume-policy-must-resolve-single-reusable-group-cache");
requirePattern(sharedVolumePolicy, /AVANTIQO_RUNPOD_SHARED_VOLUME_CONSOLIDATION_REQUIRED/, "music-shared-volume-policy-must-fail-on-duplicate-group-caches");

requirePattern(workerRepair, /AUDIO_VOICE_VOLUME_NAME = "avantiqo-shared-audio-voice-cache"/, "music-worker-repair-must-bind-canonical-audio-voice-cache");
requirePattern(workerRepair, /NETWORK_VOLUME_MOUNT_ROOT = "\/runpod-volume"/, "music-worker-repair-must-know-runpod-network-volume-root");
requirePattern(workerRepair, /NETWORK_VOLUME_CHECKPOINT_ROOT/, "music-worker-repair-must-route-checkpoints-to-network-volume");
requirePattern(workerRepair, /durableAudioVoiceVolumeReady/, "music-worker-repair-must-compute-durable-audio-voice-readiness");
requirePattern(workerRepair, /NETWORK_VOLUME_REQUIRED_BEFORE_APPLY/, "music-worker-repair-must-block-ephemeral-cache-apply");
requirePattern(workerRepair, /DURABLE_CACHE_REQUIRED_BEFORE_APPLY=true/, "music-worker-repair-must-report-durable-cache-apply-gate");
requirePattern(workerRepair, /AVANTIQO_AUDIO_TEMPLATE_REPAIR_SHARED_AUDIO_VOICE_VOLUME_REQUIRED/, "music-worker-repair-must-fail-closed-without-shared-cache");
forbidPattern(workerRepair, /EPHEMERAL_CHECKPOINT_ROOT/, "music-worker-repair-must-not-retain-ephemeral-checkpoint-fallback");
requirePattern(workerRepair, /RUNPOD_REPAIR_GENERATION_SUBMITTED=false/, "music-worker-repair-must-not-generate-music");
requirePattern(workerRepair, /RUNPOD_REPAIR_PRODUCTION_DEPLOY_PERFORMED=false/, "music-worker-repair-must-not-deploy-production");

requirePattern(runpodPrepare, /provision-avantiqo-audio-runpod-storage-local\.mjs/, "music-runpod-prepare-must-plan-and-apply-durable-cache");
requirePattern(runpodPrepare, /AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED/, "music-runpod-prepare-must-require-storage-approval");
requirePattern(runpodPrepare, /STEP 6: ATTACH DURABLE AUDIO MODEL CACHE/, "music-runpod-prepare-must-attach-cache-before-final-repair");
requirePattern(runpodPrepare, /STEP 7: APPLY AUDIO WORKER REPAIR/, "music-runpod-prepare-must-repair-template-after-cache-attachment");
requirePattern(runpodPrepare, /STEP 8: PROVE AUDIO IDENTITY AND BIND LOCALLY/, "music-runpod-prepare-must-fingerprint-after-storage-and-repair");
requirePattern(runpodPrepare, /REAL_MUSIC_GENERATION_SUBMITTED=false/, "music-runpod-prepare-must-stop-before-real-benchmark-generation");

requirePattern(imageWorkflow, /ref:\s*\$\{\{ github\.sha \}\}/, "music-worker-image-workflow-must-checkout-exact-trigger-sha");
requirePattern(imageWorkflow, /AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V2/, "music-worker-image-workflow-must-emit-current-evidence-contract");
requirePattern(imageWorkflow, /source_sha_matches_trigger/, "music-worker-image-workflow-must-record-source-trigger-match");
requirePattern(imageWorkflow, /cuda_runtime_expected:\s*"12\.8"/, "music-worker-image-workflow-must-record-cuda-12-8-runtime");
requirePattern(imageWorkflow, /native_audio_import_smoke_required:\s*true/, "music-worker-image-workflow-must-record-native-audio-requirement");
requirePattern(imageWorkflow, /native_audio_import_smoke_passed_by_docker_build:\s*true/, "music-worker-image-workflow-must-record-native-audio-smoke");
requirePattern(imageWorkflow, /cuda_import_smoke_passed_by_docker_build:\s*true/, "music-worker-image-workflow-must-record-runtime-smoke");
requirePattern(imageWorkflow, /test \"\$RELEASE_SHA\" = \"\$TRIGGER_SHA\"/, "music-worker-image-workflow-must-fail-on-source-trigger-mismatch");
requirePattern(imageWorkflow, /AVANTIQO_AUDIO_WORKER_IMAGE_PRODUCTION_WEB_DEPLOY=false/, "music-worker-image-workflow-must-not-deploy-production-app");
requirePattern(imageWorkflow, /AVANTIQO_AUDIO_WORKER_IMAGE_PROVIDER_JOB_SUBMITTED=false/, "music-worker-image-workflow-must-not-submit-provider-generation");
requirePattern(imageWorkflow, /AVANTIQO_AUDIO_WORKER_IMAGE_PRICING_ACTIVATION=false/, "music-worker-image-workflow-must-not-activate-pricing");

requirePattern(certificationWorkflow, /audits\/avantiqo-music-certification-request\.json/, "music-certification-workflow-must-use-dedicated-request-trigger");
requirePattern(certificationWorkflow, /RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID/, "music-certification-workflow-must-bind-owned-audio-endpoint");
requirePattern(certificationWorkflow, /NEXT_PUBLIC_SUPABASE_URL/, "music-certification-workflow-must-have-private-storage-url-secret");
requirePattern(certificationWorkflow, /SUPABASE_SERVICE_ROLE_KEY/, "music-certification-workflow-must-have-private-storage-service-secret");
requirePattern(certificationWorkflow, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED:\s*"YES"/, "music-certification-workflow-must-explicitly-approve-single-controlled-spend");
requirePattern(certificationWorkflow, /AVANTIQO_AUDIO_BENCHMARK_RUNS:\s*"1"/, "music-certification-workflow-must-default-to-one-controlled-run");
requirePattern(certificationWorkflow, /AVANTIQO_AUDIO_BENCHMARK_DURATION_SECONDS:\s*"12"/, "music-certification-workflow-must-default-to-short-controlled-duration");
requirePattern(certificationWorkflow, /activation_allowed !== false/, "music-certification-workflow-must-verify-no-production-activation");

requirePattern(router, /music:\s*MusicWorkspace/, "creative-router-must-route-music-workspace");
requirePattern(registry, /id:\s*"music"/, "creative-registry-must-own-music-workspace");

if (failures.length) {
  console.error("MUSIC_STUDIO_RELEASE_AUDIT=FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MUSIC_STUDIO_RELEASE_AUDIT=PASS");
console.log("MUSIC_GENERATION_CONTRACT=OWNED");
console.log("MUSIC_ASSET_PERSISTENCE=DURABLE");
console.log("MUSIC_AUTOMATIC_MASTERING=REQUIRED");
console.log("MUSIC_VERSION_HISTORY=REQUIRED");
console.log("MUSIC_CLIENT_PROVIDER_SELECTION=HIDDEN");
console.log("MUSIC_PREFLIGHT=SCOPED_AUDIO_VOICE_CACHE_SIGNED_STORAGE_ZERO_MUTATION_REQUIRED");
console.log("MUSIC_BENCHMARK=SPEND_GUARDED_FULL_PREFLIGHT_EVIDENCE_QUEUED_AND_SYNTHETIC_SCOPE_ONLY");
console.log("MUSIC_RUNPOD_INSPECTION=READ_ONLY_ENDPOINT_BOUND_TEMPLATE_AWARE");
console.log("MUSIC_WORKER_IMAGE=EXACT_SOURCE_CUDA_12_8_NATIVE_AUDIO_SMOKE_REQUIRED");
console.log("MUSIC_ENDPOINT_PROVISIONING=HARDENED_IMMUTABLE_IMAGE_PRIVATE_REGISTRY_SCALE_TO_ZERO");
console.log("MUSIC_RUNPOD_CACHE=SHARED_AUDIO_VOICE_NETWORK_VOLUME_RUNPOD_VOLUME_ROOT");
console.log("MUSIC_RUNPOD_SHARED_CACHE_POLICY=THREE_MANAGED_GROUPS_MAX_DUPLICATE_AUDIO_VOICE_FORBIDDEN");
console.log("MUSIC_WORKER_REPAIR=DURABLE_AUDIO_VOICE_CACHE_REQUIRED_BEFORE_APPLY");
console.log("MUSIC_ENDPOINT_BINDING=FINGERPRINT_PROVEN_LOCAL_ONLY");
console.log("MUSIC_CERTIFICATION_WORKFLOW=DEDICATED_MEASURE_ONLY");
console.log("MUSIC_ECONOMICS=MEASUREMENT_REQUIRED_BEFORE_PRICING_PROMOTION");
console.log("MUSIC_HUMAN_QUALITY=EXPLICIT_LISTENING_REVIEW_REQUIRED");
console.log("MUSIC_PROMOTION=PLAN_ONLY_EXPLICIT_ACTIVATION_REQUIRED");
console.log("MUSIC_REMIX_EDIT=IMPLEMENTED_BENCHMARK_GATED");
console.log("MUSIC_EXTEND_STEMS=BASE_MODEL_GATED");
