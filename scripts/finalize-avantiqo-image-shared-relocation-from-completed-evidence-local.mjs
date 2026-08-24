import { spawnSync } from "node:child_process";
import {
  classifyManagedVolumeName,
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_SHARED_RELOCATION_COMPLETED_EVIDENCE_FINALIZER_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const CACHE_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");

function text(value) {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}

function required(value, code) {
  const resolved = text(value);
  if (!resolved) throw new Error(code);
  return resolved;
}

function validJobId(value, code) {
  const resolved = required(value, code);
  if (!/^[A-Za-z0-9-]+$/.test(resolved)) throw new Error(`${code}_INVALID`);
  return resolved;
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_FINALIZER_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_FINALIZER_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_FINALIZER_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_FINALIZER_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_FINALIZER_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }
  return head;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function endpointUsers(endpoints, volumeId) {
  return array(endpoints)
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
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

function blockingActivity(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    counters.workers.initializing +
    counters.workers.running +
    counters.workers.unhealthy
  );
}

function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: list(endpoint?.gpuTypeIds),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
  };
}

async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`);
  }
  return body;
}

async function rest(path, key, options = {}) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_REST",
  );
}

async function queue(endpointId, path, key) {
  return parseResponse(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_QUEUE",
  );
}

function resolveImageEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function validateCacheJob(job, expectedJobId) {
  if (text(job?.id) && text(job.id) !== expectedJobId) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_CACHE_JOB_ID_MISMATCH");
  }
  if (text(job?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_CACHE_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`);
  }
  const output = job?.output || {};
  const integrity = output?.cache_integrity || {};
  const valid =
    text(output.target_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(integrity.contract) === CACHE_CONTRACT &&
    integrity.completion_marker_valid === true &&
    Array.isArray(integrity.missing_required_files) &&
    integrity.missing_required_files.length === 0;
  if (!valid) throw new Error("AVANTIQO_IMAGE_FINALIZER_CACHE_JOB_EVIDENCE_INVALID");
  return {
    job_id: expectedJobId,
    status: "COMPLETED",
    cache_ready: true,
    completion_marker_valid: true,
    missing_required_files: 0,
    inference_performed: false,
  };
}

function validateProbeJob(job, expectedJobId) {
  if (text(job?.id) && text(job.id) !== expectedJobId) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_PROBE_JOB_ID_MISMATCH");
  }
  if (text(job?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_PROBE_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`);
  }
  const output = job?.output || {};
  const cache = output?.quality_cache || {};
  const valid =
    text(output.probe_contract) === PROBE_CONTRACT &&
    text(output.engine_contract) === ENGINE_CONTRACT &&
    text(output.operation) === "runtime_probe" &&
    text(output.entrypoint) === "handler_v3.py" &&
    text(output.quality_foundation_model) === TARGET_MODEL &&
    cache.cache_ready === true &&
    text(cache.completion_contract) === CACHE_CONTRACT &&
    cache.completion_marker_valid === true &&
    finite(cache.missing_required_file_count, -1) === 0 &&
    Array.isArray(cache.missing_required_files) &&
    cache.missing_required_files.length === 0 &&
    output.generation_requested === false &&
    output.inference_performed === false &&
    output.model_download_performed === false &&
    output.storage_upload_performed === false &&
    output.storage_mutation_performed === false &&
    output.generation_pipeline_loaded_by_probe === false;
  if (!valid) throw new Error("AVANTIQO_IMAGE_FINALIZER_PROBE_JOB_EVIDENCE_INVALID");
  return {
    job_id: expectedJobId,
    status: "COMPLETED",
    runtime_probe_safe: true,
    cache_ready: true,
    completion_marker_valid: true,
    missing_required_files: 0,
    generation_requested: false,
    inference_performed: false,
  };
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED=YES_REQUIRED");
}

const legacyVolumeId = validJobId(
  arg("legacy-volume-id") || process.env.AVANTIQO_IMAGE_LEGACY_VOLUME_ID,
  "AVANTIQO_IMAGE_LEGACY_VOLUME_ID_REQUIRED",
);
const cacheJobId = validJobId(
  arg("cache-job-id") || process.env.AVANTIQO_IMAGE_COMPLETED_CACHE_JOB_ID,
  "AVANTIQO_IMAGE_COMPLETED_CACHE_JOB_ID_REQUIRED",
);
const probeJobId = validJobId(
  arg("probe-job-id") || process.env.AVANTIQO_IMAGE_COMPLETED_PROBE_JOB_ID,
  "AVANTIQO_IMAGE_COMPLETED_PROBE_JOB_ID_REQUIRED",
);
const managementKey = required(process.env.RUNPOD_MANAGEMENT_API_KEY, "RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
const inferenceKey = required(
  process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY,
  "RUNPOD_IMAGE_API_KEY_REQUIRED",
);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const mainSha = requireCurrentMain();

console.log(`AVANTIQO_IMAGE_FINALIZER_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_FINALIZER_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_IMAGE_FINALIZER_REUSES_COMPLETED_CACHE_JOB=true");
console.log("AVANTIQO_IMAGE_FINALIZER_REUSES_COMPLETED_PROBE_JOB=true");
console.log("AVANTIQO_IMAGE_FINALIZER_NEW_CACHE_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_FINALIZER_NEW_PROBE_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_FINALIZER_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_FINALIZER_CODE_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_FINALIZER_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_FINALIZER_SECRETS_PRINTED=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_RUNPOD_LIST_INVALID");
}

const endpoint = resolveImageEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint.id);
const imageVolumes = groupCacheVolumes(volumes, GROUP);
const canonicalMatches = imageVolumes.filter((volume) => text(volume?.name) === GROUP.canonical_name);
if (canonicalMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_FINALIZER_CANONICAL_VOLUME_RESOLUTION_FAILED:matches=${canonicalMatches.length}`);
}
const canonicalVolume = canonicalMatches[0];
const canonicalVolumeId = text(canonicalVolume?.id);
if (!canonicalVolumeId || finite(canonicalVolume?.size, 0) < 80) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_CANONICAL_VOLUME_INVALID");
}
if (endpointVolumeIds(endpoint).length !== 1 || endpointVolumeIds(endpoint)[0] !== canonicalVolumeId) {
  throw new Error(
    `AVANTIQO_IMAGE_FINALIZER_CANONICAL_BINDING_REQUIRED:attached=${endpointVolumeIds(endpoint).join("|") || "NONE"}:expected=${canonicalVolumeId}`,
  );
}
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
  throw new Error(`AVANTIQO_IMAGE_FINALIZER_SCALING_INVALID:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`);
}

const legacyVolume = volumes.find((volume) => text(volume?.id) === legacyVolumeId) || null;
if (legacyVolume) {
  if (text(legacyVolume?.name) === GROUP.canonical_name) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_REFUSES_CANONICAL_VOLUME_DELETE");
  }
  if (classifyManagedVolumeName(legacyVolume?.name)?.id !== GROUP.id) {
    throw new Error(`AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_WRONG_GROUP:${text(legacyVolume?.name) || "UNKNOWN"}`);
  }
  if (finite(legacyVolume?.size, 0) < 80) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_SIZE_INVALID");
  }
}

const [healthRaw, cacheJob, probeJob] = await Promise.all([
  queue(endpointId, "/health", inferenceKey),
  queue(endpointId, `/status/${encodeURIComponent(cacheJobId)}`, inferenceKey),
  queue(endpointId, `/status/${encodeURIComponent(probeJobId)}`, inferenceKey),
]);
const health = healthCounters(healthRaw);
if (blockingActivity(health) !== 0) {
  throw new Error(`AVANTIQO_IMAGE_FINALIZER_LIVE_WORK_BLOCKS_RETIREMENT:${JSON.stringify(health)}`);
}
const cacheEvidence = validateCacheJob(cacheJob, cacheJobId);
const probeEvidence = validateProbeJob(probeJob, probeJobId);
const legacyUsers = legacyVolume ? endpointUsers(endpoints, legacyVolumeId) : [];
if (legacyUsers.length) {
  throw new Error(`AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_STILL_IN_USE:${JSON.stringify(legacyUsers)}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  endpoint: safeEndpoint(endpoint),
  canonical_volume: safeVolume(canonicalVolume),
  legacy_volume: legacyVolume ? safeVolume(legacyVolume) : null,
  legacy_volume_already_absent: !legacyVolume,
  legacy_volume_users: legacyUsers,
  health,
  cache_evidence: cacheEvidence,
  probe_evidence: probeEvidence,
  shared_policy_before: sharedVolumePolicySummary(volumes),
  new_cache_job_submitted: false,
  new_probe_job_submitted: false,
  image_generation: false,
  code_volume_mutation: false,
  production_deploy: false,
  mutation_performed: false,
  next_action: apply ? "RETIRE_EXACT_DETACHED_LEGACY_IMAGE_VOLUME" : "RUN_WITH_RELOCATION_APPROVAL",
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_FINALIZER_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (legacyVolume) {
  // Provider mutation must happen only from the newest local main.
  requireCurrentMain();

  const [freshEndpoints, freshVolumes, freshHealthRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/networkvolumes", managementKey),
    queue(endpointId, "/health", inferenceKey),
  ]);
  if (!Array.isArray(freshEndpoints) || !Array.isArray(freshVolumes)) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_FRESH_RUNPOD_LIST_INVALID");
  }
  const freshImage = resolveImageEndpoint(freshEndpoints, endpointId);
  if (endpointVolumeIds(freshImage).length !== 1 || endpointVolumeIds(freshImage)[0] !== canonicalVolumeId) {
    throw new Error("AVANTIQO_IMAGE_FINALIZER_BINDING_CHANGED_BEFORE_DELETE");
  }
  const freshLegacy = freshVolumes.find((volume) => text(volume?.id) === legacyVolumeId) || null;
  if (!freshLegacy) {
    console.log(`AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_ALREADY_ABSENT=${legacyVolumeId}`);
  } else {
    if (classifyManagedVolumeName(freshLegacy?.name)?.id !== GROUP.id || text(freshLegacy?.name) === GROUP.canonical_name) {
      throw new Error("AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_CLASSIFICATION_CHANGED");
    }
    const freshUsers = endpointUsers(freshEndpoints, legacyVolumeId);
    if (freshUsers.length) {
      throw new Error(`AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_GAINED_USERS:${JSON.stringify(freshUsers)}`);
    }
    const freshHealth = healthCounters(freshHealthRaw);
    if (blockingActivity(freshHealth) !== 0) {
      throw new Error(`AVANTIQO_IMAGE_FINALIZER_LIVE_WORK_APPEARED_BEFORE_DELETE:${JSON.stringify(freshHealth)}`);
    }
    await rest(`/networkvolumes/${encodeURIComponent(legacyVolumeId)}`, managementKey, { method: "DELETE" });
    console.log(`AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_DELETED=${legacyVolumeId}`);
  }
}

const [finalEndpoints, finalVolumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(finalEndpoints) || !Array.isArray(finalVolumes)) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_FINAL_RUNPOD_LIST_INVALID");
}
const finalImage = resolveImageEndpoint(finalEndpoints, endpointId);
if (endpointVolumeIds(finalImage).length !== 1 || endpointVolumeIds(finalImage)[0] !== canonicalVolumeId) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_FINAL_CANONICAL_BINDING_LOST");
}
if (finalVolumes.some((volume) => text(volume?.id) === legacyVolumeId)) {
  throw new Error("AVANTIQO_IMAGE_FINALIZER_LEGACY_VOLUME_STILL_PRESENT_AFTER_DELETE");
}
const finalImageVolumes = groupCacheVolumes(finalVolumes, GROUP);
if (finalImageVolumes.length !== 1 || text(finalImageVolumes[0]?.id) !== canonicalVolumeId) {
  throw new Error(`AVANTIQO_IMAGE_FINALIZER_IMAGE_VIDEO_GROUP_NOT_CONVERGED:count=${finalImageVolumes.length}`);
}

console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_FINALIZATION=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  mutation_performed: Boolean(legacyVolume),
  endpoint_after: safeEndpoint(finalImage),
  legacy_volume_retired: true,
  image_video_group_converged: true,
  final_shared_policy: sharedVolumePolicySummary(finalVolumes),
  new_cache_job_submitted: false,
  new_probe_job_submitted: false,
  image_generation: false,
  code_volume_mutation: false,
  production_deploy: false,
  next_action: "RUN_ONE_IMAGE_QUALITY_CERTIFICATION",
}, null, 2));
