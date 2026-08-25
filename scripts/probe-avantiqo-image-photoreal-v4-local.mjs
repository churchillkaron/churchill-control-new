import { writeFileSync } from "node:fs";
import {
  resolveReusableGroupVolume,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const API_BASE = "https://api.runpod.ai/v2";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const OPERATION = "runtime_probe";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const EXPECTED_ENTRYPOINT = "handler_v4.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V4_MULTI_FOUNDATION_CANDIDATE_V1";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_CANDIDATE_V1";
const EXPECTED_QWEN_RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V2";
const EXPECTED_FOUNDATION = "Tongyi-MAI/Z-Image";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V1";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V1";
const EXPECTED_CACHE_CONTRACT = "AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1";
const EXPECTED_GPU_POOL = ["NVIDIA RTX PRO 6000 Blackwell Server Edition"];
const EXPECTED_IDLE_TIMEOUT_SECONDS = 10;
const DEFAULT_ENDPOINT_NAME = "avantiqo-image-v1";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const POLL_MS = 3000;
const MAX_WAIT_MS = Math.max(
  30_000,
  Math.min(
    15 * 60 * 1000,
    Number(process.env.AVANTIQO_IMAGE_V4_PROBE_TIMEOUT_MS || 8 * 60 * 1000),
  ),
);
const OUTPUT_PATH = "/tmp/avantiqo-image-v4-photoreal-probe.json";

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
function activeJobs(health) {
  return health.jobs.in_queue + health.jobs.in_progress;
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`,
    );
  }
  return body ?? {};
}
async function rest(path, key) {
  return readJson(
    await fetch(`${REST_BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_REST",
  );
}
async function queue(endpointId, path, key, options = {}) {
  return readJson(
    await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_QUEUE",
  );
}
function resolveEndpoint(endpoints, explicitId) {
  if (explicitId) {
    const matches = endpoints.filter(
      (endpoint) => text(endpoint?.id) === explicitId && text(endpoint?.name) === DEFAULT_ENDPOINT_NAME,
    );
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_IMAGE_V4_PROBE_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    }
    return matches[0];
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === DEFAULT_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}
function validateCostGuard(endpoint) {
  const gpuPool = unique(list(endpoint?.gpuTypeIds));
  if (!sameSet(gpuPool, EXPECTED_GPU_POOL)) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_GPU_COST_GUARD_INVALID:${gpuPool.join("|")}`);
  }
  if (finite(endpoint?.idleTimeout) !== EXPECTED_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_IDLE_TIMEOUT_INVALID:${finite(endpoint?.idleTimeout)}`);
  }
  if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_V4_PROBE_SCALING_INVALID:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`,
    );
  }
}
function validateOutput(output) {
  const candidate = output?.photoreal_candidate || {};
  const storage = candidate?.storage || {};
  if (text(output?.probe_contract) !== EXPECTED_PROBE_CONTRACT) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_CONTRACT_MISMATCH:${text(output?.probe_contract)}`);
  }
  if (text(output?.entrypoint) !== EXPECTED_ENTRYPOINT) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_ENTRYPOINT_MISMATCH:${text(output?.entrypoint)}`);
  }
  if (text(output?.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION) {
    throw new Error("AVANTIQO_IMAGE_V4_PROBE_ENTRYPOINT_REVISION_MISMATCH");
  }
  if (text(output?.runtime_revision) !== EXPECTED_RUNTIME_REVISION) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_RUNTIME_REVISION_MISMATCH:${text(output?.runtime_revision)}`);
  }
  if (text(output?.qwen_runtime_revision) !== EXPECTED_QWEN_RUNTIME_REVISION) {
    throw new Error("AVANTIQO_IMAGE_V4_PROBE_QWEN_RUNTIME_REVISION_MISMATCH");
  }
  if (text(candidate?.foundation_model) !== EXPECTED_FOUNDATION) {
    throw new Error(`AVANTIQO_IMAGE_V4_PROBE_FOUNDATION_MISMATCH:${text(candidate?.foundation_model)}`);
  }
  if (text(candidate?.quality_profile) !== EXPECTED_PROFILE) {
    throw new Error("AVANTIQO_IMAGE_V4_PROBE_PROFILE_MISMATCH");
  }
  if (text(candidate?.quality_policy) !== EXPECTED_POLICY) {
    throw new Error("AVANTIQO_IMAGE_V4_PROBE_POLICY_MISMATCH");
  }
  if (text(candidate?.completion_contract) !== EXPECTED_CACHE_CONTRACT) {
    throw new Error("AVANTIQO_IMAGE_V4_PROBE_CACHE_CONTRACT_MISMATCH");
  }
  if (candidate?.automatic_production_routing_enabled !== false) {
    throw new Error("AVANTIQO_IMAGE_V4_PROBE_AUTOMATIC_ROUTING_MUST_BE_FALSE");
  }
  for (const [field, expected] of [
    ["generation_requested", false],
    ["inference_performed", false],
    ["model_download_performed", false],
    ["storage_mutation_performed", false],
  ]) {
    if (output?.[field] !== expected) {
      throw new Error(`AVANTIQO_IMAGE_V4_PROBE_UNSAFE_RUNTIME_FIELD:${field}=${output?.[field]}`);
    }
  }
  for (const name of ["disk_total_bytes", "disk_used_bytes", "disk_free_bytes", "required_free_bytes"]) {
    if (!Number.isFinite(Number(storage?.[name])) || Number(storage?.[name]) < 0) {
      throw new Error(`AVANTIQO_IMAGE_V4_PROBE_STORAGE_FIELD_INVALID:${name}`);
    }
  }
  return { candidate, storage };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const explicitEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const resumeJobId = arg("job-id") || text(process.env.AVANTIQO_IMAGE_V4_PROBE_JOB_ID);

console.log("AVANTIQO_IMAGE_V4_PROBE_CONTRACT=AVANTIQO_IMAGE_PHOTOREAL_V4_SINGLE_SHOT_PROBE_V1");
console.log("AVANTIQO_IMAGE_V4_PROBE_SINGLE_JOB_ONLY=true");
console.log("AVANTIQO_IMAGE_V4_PROBE_GENERATION=false");
console.log("AVANTIQO_IMAGE_V4_PROBE_INFERENCE=false");
console.log("AVANTIQO_IMAGE_V4_PROBE_MODEL_DOWNLOAD=false");
console.log("AVANTIQO_IMAGE_V4_PROBE_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_V4_PROBE_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_V4_PROBE_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V4_PROBE_B200_ALLOWED=false");
console.log(`AVANTIQO_IMAGE_V4_PROBE_IDLE_TIMEOUT_REQUIRED=${EXPECTED_IDLE_TIMEOUT_SECONDS}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_RESUME_EXISTING_JOB=${resumeJobId ? "true" : "false"}`);

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_V4_PROBE_INVENTORY_INVALID");
}

const endpoint = resolveEndpoint(endpoints, explicitEndpointId);
const endpointId = text(endpoint.id);
validateCostGuard(endpoint);

const reusable = resolveReusableGroupVolume(volumes, SHARED_GROUP);
const sharedVolume = reusable.volume;
if (!sharedVolume) throw new Error("AVANTIQO_IMAGE_V4_PROBE_SHARED_VOLUME_REQUIRED");
const attachedIds = endpointVolumeIds(endpoint);
if (attachedIds.length !== 1 || attachedIds[0] !== text(sharedVolume.id)) {
  throw new Error(
    `AVANTIQO_IMAGE_V4_PROBE_SHARED_VOLUME_ATTACHMENT_INVALID:${attachedIds.join("|") || "NONE"}`,
  );
}

const initialHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (!resumeJobId && activeJobs(initialHealth) !== 0) {
  throw new Error(
    `AVANTIQO_IMAGE_V4_PROBE_EXISTING_JOB_BLOCKED:in_queue=${initialHealth.jobs.in_queue}:in_progress=${initialHealth.jobs.in_progress}`,
  );
}
if (resumeJobId && activeJobs(initialHealth) > 1) {
  throw new Error(`AVANTIQO_IMAGE_V4_PROBE_RESUME_UNSAFE:active_jobs=${activeJobs(initialHealth)}`);
}

console.log(`AVANTIQO_IMAGE_V4_PROBE_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_GPU_POOL=${unique(list(endpoint.gpuTypeIds)).join("|")}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_INITIAL_HEALTH=${JSON.stringify(initialHealth)}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_SHARED_POLICY=${JSON.stringify(sharedVolumePolicySummary(volumes))}`);

let jobId = resumeJobId;
let statusBody = null;
let submitted = false;

if (resumeJobId) {
  statusBody = await queue(endpointId, `/status/${encodeURIComponent(resumeJobId)}`, inferenceKey);
} else {
  let submittedBody;
  try {
    submittedBody = await queue(endpointId, "/run", inferenceKey, {
      method: "POST",
      body: { input: { contract: CONTRACT, operation: OPERATION } },
    });
  } catch (error) {
    throw new Error(
      `AVANTIQO_IMAGE_V4_PROBE_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 600)}`,
    );
  }
  jobId = text(submittedBody?.id);
  if (!jobId) throw new Error("AVANTIQO_IMAGE_V4_PROBE_JOB_ID_MISSING");
  submitted = true;
  statusBody = submittedBody;
  console.log(`AVANTIQO_IMAGE_V4_PROBE_JOB_ID=${jobId}`);
}

const startedAt = Date.now();
let lastStatus = null;
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(statusBody?.status).toUpperCase();
  if (status !== lastStatus) {
    console.log(`AVANTIQO_IMAGE_V4_PROBE_STATUS=${status || "UNKNOWN"}`);
    lastStatus = status;
  }
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) {
    throw new Error(
      `AVANTIQO_IMAGE_V4_PROBE_JOB_FAILED:status=${status}:error=${text(statusBody?.error).slice(0, 800)}`,
    );
  }
  await sleep(POLL_MS);
  statusBody = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
}

if (text(statusBody?.status).toUpperCase() !== "COMPLETED") {
  throw new Error(`AVANTIQO_IMAGE_V4_PROBE_TIMEOUT:job_id=${jobId}`);
}

const output = statusBody?.output;
if (!output || typeof output !== "object" || Array.isArray(output)) {
  throw new Error("AVANTIQO_IMAGE_V4_PROBE_OUTPUT_INVALID");
}
const { candidate, storage } = validateOutput(output);

const report = {
  success: true,
  contract: "AVANTIQO_IMAGE_PHOTOREAL_V4_SINGLE_SHOT_PROBE_V1",
  endpoint_id: endpointId,
  job_id: jobId,
  new_job_submitted: submitted,
  status: text(statusBody.status).toUpperCase(),
  execution_time_ms: finite(statusBody.executionTime),
  delay_time_ms: finite(statusBody.delayTime),
  worker_id: text(statusBody.workerId) || null,
  runtime: {
    entrypoint: output.entrypoint,
    entrypoint_revision: output.entrypoint_revision,
    runtime_revision: output.runtime_revision,
    qwen_runtime_revision: output.qwen_runtime_revision,
  },
  photoreal_candidate: {
    foundation_model: candidate.foundation_model,
    quality_profile: candidate.quality_profile,
    quality_policy: candidate.quality_policy,
    cache_ready: candidate.cache_ready === true,
    completion_marker_valid: candidate.completion_marker_valid === true,
    snapshot_revision: text(candidate.snapshot_revision) || null,
    missing_required_file_count: finite(candidate.missing_required_file_count),
    estimated_model_bytes: finite(candidate.estimated_model_bytes),
    safe_to_cache_without_reclaim: candidate.safe_to_cache_without_reclaim === true,
    storage,
    automatic_production_routing_enabled: false,
  },
  cost_guard: {
    gpu_pool: unique(list(endpoint.gpuTypeIds)),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
  },
  shared_volume: {
    id: text(sharedVolume.id),
    name: text(sharedVolume.name),
    size_gb: finite(sharedVolume.size),
    data_center_id: text(sharedVolume.dataCenterId) || null,
  },
  generation_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  storage_mutation_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  next_action: candidate.safe_to_cache_without_reclaim === true
    ? candidate.cache_ready === true
      ? "CANDIDATE_ALREADY_CACHED_REVIEW_BEFORE_GENERATION"
      : "CAPACITY_SAFE_DECIDE_WHETHER_TO_CACHE_ONCE"
    : "DO_NOT_CACHE_VOLUME_CAPACITY_INSUFFICIENT",
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_V4_PROBE_OUTPUT=${OUTPUT_PATH}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_CACHE_READY=${report.photoreal_candidate.cache_ready ? "YES" : "NO"}`);
console.log(
  `AVANTIQO_IMAGE_V4_PROBE_SAFE_TO_CACHE_WITHOUT_RECLAIM=${report.photoreal_candidate.safe_to_cache_without_reclaim ? "YES" : "NO"}`,
);
console.log(`AVANTIQO_IMAGE_V4_PROBE_DISK_FREE_BYTES=${storage.disk_free_bytes}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_REQUIRED_FREE_BYTES=${storage.required_free_bytes}`);
console.log(`AVANTIQO_IMAGE_V4_PROBE_NEXT_ACTION=${report.next_action}`);
console.log("AVANTIQO_IMAGE_V4_PROBE_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
