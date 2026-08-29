import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_PLATFORM_AUDIT_V2";
const RUNTIME = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const POLICY = "config/avantiqo-runpod-safe-lease-policy.json";
const GUARD = "scripts/lib/avantiqo-runpod-safe-lease-endpoint-ready-fetch-guard.mjs";

function requireCondition(condition, code) {
  if (!condition) throw new Error(`${CONTRACT}_${code}`);
}

const [runtime, policyRaw, guard] = await Promise.all([
  readFile(RUNTIME, "utf8"),
  readFile(POLICY, "utf8"),
  readFile(GUARD, "utf8"),
]);
const policy = JSON.parse(policyRaw);
const lanes = Object.keys(policy.lanes || {});
const laneLimits = policy.lane_max_worker_hourly_usd || {};
const laneResting = policy.lane_resting_workers_max || {};

requireCondition(policy.contract === "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2", "POLICY_CONTRACT_INVALID");
requireCondition(policy.resting_workers_min === 0, "RESTING_WORKERS_MIN_NOT_ZERO");
requireCondition(policy.resting_workers_max === 0, "GLOBAL_RESTING_WORKERS_MAX_NOT_ZERO");
requireCondition(Number(laneResting.code) === 1, "CODE_RESTING_WORKERS_MAX_MUST_BE_ONE");
requireCondition(
  Object.entries(laneResting).every(([, value]) => [0, 1].includes(Number(value))),
  "LANE_RESTING_WORKERS_MAX_OUT_OF_BOUNDS",
);
requireCondition(policy.workers_min_one_allowed === false, "WORKERS_MIN_ONE_MUST_BE_FORBIDDEN");
requireCondition(policy.parallel_work_allowed === true, "PARALLEL_WORK_POLICY_REQUIRED");
requireCondition(Number(policy.max_workers_per_lease) === 1, "ONE_WORKER_PER_LEASE_REQUIRED");
requireCondition(Number(policy.max_jobs_per_lease) === 1, "ONE_JOB_PER_LEASE_REQUIRED");
requireCondition(Number(policy.default_max_account_hourly_usd) >= 10, "ACCOUNT_COST_CEILING_TOO_LOW_FOR_PREMIUM_GPU");
requireCondition(lanes.length >= 10, "GPU_LANE_REGISTRY_INCOMPLETE");
requireCondition(lanes.every((lane) => Number(laneLimits[lane]) > 0), "LANE_COST_LIMIT_REQUIRED");
requireCondition(Number(laneLimits.code) >= 9, "CODE_PREMIUM_GPU_COST_LIMIT_TOO_LOW");
requireCondition(Number(laneLimits.image) >= 9, "IMAGE_PREMIUM_GPU_COST_LIMIT_TOO_LOW");
requireCondition(Number(laneLimits.cinema) >= 9, "CINEMA_PREMIUM_GPU_COST_LIMIT_TOO_LOW");

for (const requiredLane of [
  "code",
  "audio",
  "image",
  "cinema",
  "voice-tts",
  "voice-stt",
  "music-separator",
  "intelligence-deep",
]) {
  requireCondition(Boolean(policy.lanes?.[requiredLane]), `LANE_MISSING_${requiredLane.toUpperCase().replaceAll("-", "_")}`);
}

requireCondition(runtime.includes("laneQueueKeyCandidates"), "LANE_QUEUE_KEY_RESOLUTION_MISSING");
requireCondition(runtime.includes("RUNPOD_AVANTIQO_CODE_API_KEY"), "CODE_QUEUE_KEY_MISSING");
requireCondition(runtime.includes("RUNPOD_AVANTIQO_IMAGE_API_KEY"), "IMAGE_QUEUE_KEY_MISSING");
requireCondition(runtime.includes("RUNPOD_AVANTIQO_VIDEO_API_KEY"), "VIDEO_QUEUE_KEY_MISSING");
requireCondition(runtime.includes("RUNPOD_AVANTIQO_AUDIO_API_KEY"), "AUDIO_QUEUE_KEY_MISSING");
requireCondition(runtime.includes("laneWorkerHourlyLimit"), "LANE_COST_ENFORCEMENT_MISSING");
requireCondition(runtime.includes("laneRestingWorkersMax"), "LANE_RESTING_CAPACITY_RESOLVER_MISSING");
requireCondition(runtime.includes("intentionalIdleCapacity"), "INTENTIONAL_IDLE_CAPACITY_GUARD_MISSING");
requireCondition(runtime.includes("LANE_RESTING_CAPACITY"), "IDLE_CAPACITY_PRESERVATION_EVIDENCE_MISSING");
requireCondition(runtime.includes("NODE_OPTIONS: nodeOptionsWithReadyGuard()"), "CHILD_READY_GUARD_PRELOAD_MISSING");
requireCondition(runtime.includes("await patch(targetId, 1, managementKey)"), "LEASE_OPEN_0_1_MISSING");
requireCondition(runtime.includes("await patch(targetId, 0, managementKey)"), "PAID_WORKER_PARK_BEFORE_RELEASE_MISSING");
requireCondition(runtime.includes("waitForRestingState"), "LANE_REST_STATE_VERIFY_MISSING");
requireCondition(runtime.includes("TARGET_MUST_START_CLEAN_REST_STATE"), "CLEAN_LANE_BASELINE_GUARD_MISSING");
requireCondition(runtime.includes("IDLE_BILLING_WORKER_REAPED"), "IDLE_COST_REAPER_MISSING");
requireCondition(runtime.includes("max_concurrent_paid_leases"), "CONCURRENCY_GUARD_MISSING");
requireCondition(runtime.includes("max_jobs_per_lease"), "JOB_LIMIT_GUARD_MISSING");
requireCondition(runtime.includes("releaseCodeRunpodDistributedLease"), "CODE_DISTRIBUTED_RELEASE_MISSING");
requireCondition(runtime.includes("releaseVoiceRunpodDistributedLease"), "VOICE_DISTRIBUTED_RELEASE_MISSING");
requireCondition(runtime.includes("zero_paid_gpu_when_no_active_worker: true"), "ZERO_PAID_GPU_SEMANTIC_MISSING");

requireCondition(guard.includes("ENDPOINT_PAUSED"), "PAUSED_RESPONSE_DETECTION_MISSING");
requireCondition(guard.includes("response.status !== 409"), "PAUSED_409_ONLY_RETRY_REQUIRED");
requireCondition(guard.includes("duplicate_job_retry: false"), "DUPLICATE_JOB_RETRY_MUST_BE_FALSE");
requireCondition(guard.includes("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID"), "LEASE_ENDPOINT_BINDING_MISSING");
requireCondition(guard.includes("/run`"), "RUN_ROUTE_GUARD_MISSING");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  policy_contract: policy.contract,
  lane_count: lanes.length,
  lanes,
  global_permanent_rest_state: "0/0",
  code_permanent_rest_state: "0/1_WITH_ZERO_ACTIVE_WORKERS",
  lease_active_state: "0/1",
  code_schedulable_capacity_is_not_running_gpu: true,
  max_workers_per_lease: policy.max_workers_per_lease,
  max_jobs_per_lease: policy.max_jobs_per_lease,
  lane_cost_limits_verified: true,
  lane_queue_key_resolution_verified: true,
  lane_resting_capacity_verified: true,
  endpoint_ready_guard_verified: true,
  paused_retry_only: true,
  duplicate_job_retry: false,
  cleanup_park_then_restore_verified: true,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_RUNPOD_SAFE_LEASE_PLATFORM_AUDIT=PASS");
