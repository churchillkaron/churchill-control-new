import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [
  engineConfigRaw,
  policyRaw,
  handler,
  dockerfile,
  workflow,
  provisioner,
  preflight,
  extendProvider,
  audioProvider,
] = await Promise.all([
  read("config/avantiqo-music-extend-engine.json"),
  read("config/avantiqo-runpod-safe-lease-policy.json"),
  read("services/avantiqo-music-extend-engine/handler.py"),
  read("services/avantiqo-music-extend-engine/Dockerfile"),
  read(".github/workflows/avantiqo-music-extend-worker-image.yml"),
  read("scripts/provision-avantiqo-music-extend-runpod-local.mjs"),
  read("scripts/preflight-avantiqo-music-extend-runpod-local.mjs"),
  read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicExtendProvider.js"),
  read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js"),
]);

const engine = JSON.parse(engineConfigRaw);
const policy = JSON.parse(policyRaw);

assert.equal(engine.contract, "AVANTIQO_MUSIC_EXTEND_ENGINE_V1");
assert.equal(engine.scope, "MUSIC_ONLY");
assert.equal(engine.capability, "ai.audio.extend");
assert.equal(engine.task_type, "complete");
assert.equal(engine.model_variant, "acestep-v15-base");
assert.equal(engine.endpoint_name, "avantiqo-music-extend-v1");
assert.equal(engine.safe_lease_lane, "music-extend");
assert.equal(engine.resting_workers_min, 0);
assert.equal(engine.resting_workers_max, 0);
assert.equal(engine.max_workers_per_lease, 1);
assert.equal(engine.max_jobs_per_lease, 1);
assert.equal(engine.production_certified, false);
assert.equal(engine.benchmark_required, true);
assert.equal(engine.human_review_required, true);
assert.equal(engine.xl_turbo_fallback_allowed, false);
assert.equal(engine.compose_endpoint_mutation_allowed, false);

assert.equal(policy.lanes["music-extend"], "avantiqo-music-extend-v1");
assert.equal(policy.resting_workers_min, 0);
assert.equal(policy.resting_workers_max, 0);
assert.equal(policy.max_workers_per_lease, 1);
assert.equal(policy.max_jobs_per_lease, 1);
assert.equal(policy.workers_min_one_allowed, false);

assert.match(handler, /MODEL_VARIANT = os\.getenv\("AVANTIQO_MUSIC_EXTEND_MODEL_VARIANT", "acestep-v15-base"\)/);
assert.match(handler, /CERTIFICATION_JOB_CONTRACT = "AVANTIQO_MUSIC_EXTEND_CERTIFICATION_JOB_V1"/);
assert.match(handler, /SAFE_LEASE_LANE = "music-extend"/);
assert.match(handler, /task_type="complete"/);
assert.match(handler, /generate_music\(\s*dit_handler,\s*None,/s);
assert.match(handler, /"arrangement_completion": True/);
assert.match(handler, /"temporal_extension_proven": False/);
assert.match(handler, /"ace_step_lm_used": False/);
assert.match(handler, /AVANTIQO_MUSIC_EXTEND_LM_FORBIDDEN_FOR_PINNED_DIRECT_CONDITIONING/);
assert.doesNotMatch(handler, /acestep-v15-xl-turbo/);

assert.match(dockerfile, /AVANTIQO_MUSIC_EXTEND_MODEL_VARIANT=acestep-v15-base/);
assert.match(dockerfile, /ACESTEP_INIT_LLM=false/);
assert.match(dockerfile, /'complete' in TASK_TYPES_BASE/);
assert.match(dockerfile, /'complete' not in TASK_TYPES_TURBO/);
assert.match(dockerfile, /'complete' in DIRECT_CONDITIONING_TASKS/);
assert.match(dockerfile, /AVANTIQO_MUSIC_EXTEND_BASE_COMPLETE_CONTRACT=PASS/);

assert.match(workflow, /AVANTIQO_MUSIC_EXTEND_WORKER_IMAGE_RESULT_V1/);
assert.match(workflow, /avantiqo-music-extend-worker:sha-/);
assert.match(workflow, /temporal_extension_proven: false/);
assert.match(workflow, /production_certified: false/);
assert.match(workflow, /safe_lease_lane: "music-extend"/);
assert.match(workflow, /provider_job_submitted: false/);
assert.match(workflow, /production_web_deploy: false/);
assert.match(workflow, /pricing_activation_performed: false/);

assert.match(provisioner, /AVANTIQO_MUSIC_EXTEND_RUNPOD_PROVISION_V1/);
assert.match(provisioner, /AVANTIQO_MUSIC_EXTEND_PROVISION_APPROVED/);
assert.match(provisioner, /avantiqo-shared-audio-voice-cache/);
assert.match(provisioner, /MIN_VOLUME_GB = 80/);
assert.match(provisioner, /workersMin: 0,\s*workersMax: 0/);
assert.match(provisioner, /networkVolumeId: volume\.id/);
assert.match(provisioner, /PREFLIGHT_THEN_CERTIFY_ONLY_THROUGH_SAFE_LEASE_V2/);
assert.match(provisioner, /compose_endpoint_mutation_performed: false/);
assert.match(provisioner, /volume_mutation_performed: false/);
assert.doesNotMatch(provisioner, /workersMin:\s*1/);
assert.doesNotMatch(provisioner, /workersMax:\s*1/);
assert.doesNotMatch(provisioner, /\/run["'`]/);
assert.doesNotMatch(provisioner, /\/runsync/);

assert.match(preflight, /AVANTIQO_MUSIC_EXTEND_RUNPOD_PREFLIGHT_V1/);
assert.match(preflight, /ready_for_safe_lease_certification/);
assert.match(preflight, /policy\?\.lanes\?\.\["music-extend"\]/);
assert.match(preflight, /read_only: true/);
assert.match(preflight, /provider_job_submitted: false/);
assert.match(preflight, /runpod_run_called: false/);
assert.match(preflight, /runpod_runsync_called: false/);
assert.match(preflight, /endpoint_mutation_performed: false/);
assert.match(preflight, /volume_mutation_performed: false/);
assert.match(preflight, /compose_endpoint_mutation_performed: false/);
assert.match(preflight, /production_deploy_performed: false/);
assert.match(preflight, /pricing_activation_performed: false/);

assert.match(extendProvider, /const SAFE_LEASE_LANE = "music-extend"/);
assert.match(extendProvider, /RUNPOD_AVANTIQO_MUSIC_EXTEND_ENDPOINT_ID/);
assert.match(extendProvider, /AVANTIQO_MUSIC_EXTEND_ENGINE_CERTIFIED/);
assert.match(extendProvider, /AVANTIQO_MUSIC_EXTEND_ENGINE_NOT_CERTIFIED/);
assert.match(extendProvider, /AVANTIQO_MUSIC_EXTEND_SOURCE_RIGHTS_CONFIRMATION_REQUIRED/);
assert.match(extendProvider, /contract: ENGINE_CONTRACT/);
assert.match(extendProvider, /capability: CAPABILITY/);
assert.match(extendProvider, /arrangement_completion: true/);
assert.match(extendProvider, /temporal_extension_proven: false/);
assert.match(extendProvider, /\$\{baseUrl\}\/run/);

const workerSet = audioProvider.match(/const MUSIC_OWNED_WORKER_CAPABILITIES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
assert.doesNotMatch(workerSet, /ai\.audio\.extend/);
assert.match(audioProvider, /AvantiqoMusicExtendProvider/);
assert.match(audioProvider, /AVANTIQO_MUSIC_EXTEND_JOB_PREFIX/);
assert.match(audioProvider, /isExtendCapability/);
assert.match(audioProvider, /return AvantiqoMusicExtendProvider\.execute\(input\)/);
assert.match(audioProvider, /return AvantiqoMusicExtendProvider\.getStatus\(input\)/);

console.log("MUSIC_EXTEND_BASE_MODEL_CONTRACT=PASS");
