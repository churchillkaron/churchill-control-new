import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_SOURCE_PATH = "services/avantiqo-image-engine";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V1";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const CACHE_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_IMAGE_CACHE_TIMEOUT_MS || 110 * 60 * 1000),
);
const QUIESCENCE_WAIT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_CACHE_QUIESCENCE_TIMEOUT_MS || 3 * 60 * 1000),
);
const MIN_VOLUME_GB = 64;

const CACHE_GPU_NAME_PATTERN = /(RTX\s*(?:PRO\s*)?6000|RTX\s*4090|RTX\s*3090|A5000|A6000|6000\s*Ada|\bA40\b|\bL4\b|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function command(commandName, args, errorCode) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function commandStatus(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function endpointDataCenterIds(endpoint = {}) {
  return Array.isArray(endpoint.dataCenterIds)
    ? unique(endpoint.dataCenterIds)
    : unique(text(endpoint.dataCenterIds).split(","));
}

function endpointFingerprint(endpoint = {}) {
  return {
    template_id: text(endpoint.templateId || endpoint.template?.id),
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: endpointDataCenterIds(endpoint),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
  };
}

function sameTemporaryConfig(left, right) {
  return (
    left.template_id === right.template_id &&
    sameSet(left.network_volume_ids, right.network_volume_ids) &&
    sameSet(left.data_center_ids, right.data_center_ids) &&
    sameSet(left.gpu_type_ids, right.gpu_type_ids) &&
    left.execution_timeout_ms === right.execution_timeout_ms
  );
}

function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
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

function activityCount(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0)
  );
}

function stockScore(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function economicalGpuPreference(value) {
  const label = text(value);
  if (/\bL4\b/i.test(label)) return 100;
  if (/A5000/i.test(label)) return 95;
  if (/RTX\s*3090/i.test(label)) return 90;
  if (/RTX\s*4090/i.test(label)) return 85;
  if (/\bA40\b/i.test(label)) return 80;
  if (/A6000/i.test(label)) return 75;
  if (/6000\s*Ada/i.test(label)) return 70;
  if (/\bL40S?\b/i.test(label)) return 65;
  if (/RTX\s*(?:PRO\s*)?6000/i.test(label)) return 60;
  if (/\bA100\b/i.test(label)) return 40;
  if (/\bH100\b/i.test(label)) return 30;
  if (/\bH200\b/i.test(label)) return 20;
  if (/\bB200\b/i.test(label)) return 10;
  return 0;
}

function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}

function strictCacheValid(job = {}) {
  const output = object(job.output);
  const integrity = object(output.cache_integrity);
  return (
    text(output.target_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(integrity.contract) === CACHE_COMPLETION_CONTRACT &&
    integrity.completion_marker_valid === true &&
    Array.isArray(integrity.missing_required_files) &&
    integrity.missing_required_files.length === 0
  );
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, path, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function endpointBoundTemplates(managementKey) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint.template);
  const templateId = text(endpoint.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_CACHE_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}

function immutableEvidenceFromCurrentOriginMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_CACHE_FETCH_MAIN_FAILED");
  let evidence = null;
  try {
    evidence = JSON.parse(
      command(
        "git",
        ["show", `origin/main:${IMAGE_EVIDENCE_PATH}`],
        "AVANTIQO_IMAGE_CACHE_EVIDENCE_READ_FAILED",
      ),
    );
  } catch (error) {
    if (text(error?.message).startsWith("AVANTIQO_IMAGE_CACHE_EVIDENCE_READ_FAILED")) throw error;
    throw new Error("AVANTIQO_IMAGE_CACHE_EVIDENCE_JSON_INVALID");
  }
  if (evidence?.success !== true || evidence?.contract !== IMAGE_EVIDENCE_CONTRACT) {
    throw new Error("AVANTIQO_IMAGE_CACHE_IMMUTABLE_EVIDENCE_INVALID");
  }
  const sourceSha = text(evidence.source_sha);
  if (
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== text(evidence.trigger_sha) ||
    !/^[a-f0-9]{40}$/i.test(sourceSha)
  ) {
    throw new Error("AVANTIQO_IMAGE_CACHE_IMMUTABLE_SOURCE_LOCK_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_CACHE_IMMUTABLE_REFERENCE_INVALID");
  }
  if (
    evidence.image_generation_submitted !== false ||
    evidence.provider_job_submitted !== false ||
    evidence.production_web_deploy !== false ||
    text(evidence.entrypoint) !== "handler_v3.py"
  ) {
    throw new Error("AVANTIQO_IMAGE_CACHE_IMMUTABLE_EVIDENCE_SAFETY_INVALID");
  }
  const sourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (sourceExists.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_SOURCE_COMMIT_MISSING:${sourceSha}`);
  }
  const sourceDiff = commandStatus(
    "git",
    ["diff", "--quiet", sourceSha, "origin/main", "--", IMAGE_SOURCE_PATH],
  );
  if (sourceDiff.status === 1) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_SOURCE_CHANGED_AFTER_IMMUTABLE_BUILD:${sourceSha}`);
  }
  if (sourceDiff.status !== 0) {
    throw new Error("AVANTIQO_IMAGE_CACHE_SOURCE_EQUIVALENCE_CHECK_FAILED");
  }
  return { image, source_sha: sourceSha };
}

async function discoverCacheGpuPool(managementKey, dataCenterId) {
  const query = `
    query AvantiqoImageCacheGpuPool($input: GpuAvailabilityInput) {
      dataCenters {
        id
        gpuAvailability(input: $input) {
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 16, secureCloud: true },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`AVANTIQO_IMAGE_CACHE_GPU_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const dataCenter = body.data.dataCenters.find((entry) => text(entry?.id) === dataCenterId);
  if (!dataCenter) throw new Error(`AVANTIQO_IMAGE_CACHE_DATACENTER_NOT_FOUND:${dataCenterId}`);
  const candidates = list(dataCenter.gpuAvailability)
    .map((gpu) => {
      const id = text(gpu?.gpuTypeId);
      const name = text(gpu?.gpuTypeDisplayName || gpu?.displayName || id);
      return {
        id,
        name,
        stock_status: text(gpu?.stockStatus) || "UNKNOWN",
        stock_score: stockScore(gpu?.stockStatus),
        economic_score: economicalGpuPreference(`${id} ${name}`),
      };
    })
    .filter(
      (gpu) =>
        gpu.id &&
        gpu.stock_score > 0 &&
        gpu.economic_score > 0 &&
        CACHE_GPU_NAME_PATTERN.test(`${gpu.id} ${gpu.name}`),
    )
    .sort(
      (a, b) =>
        b.stock_score - a.stock_score ||
        b.economic_score - a.economic_score ||
        a.id.localeCompare(b.id),
    );
  if (!candidates.length) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_NO_BOOTSTRAP_GPU_STOCK:${dataCenterId}`);
  }
  return candidates.slice(0, 3);
}

async function waitForQuiescence(endpointId, inferenceKey, label) {
  const deadline = Date.now() + QUIESCENCE_WAIT_MS;
  let lastPrinted = 0;
  while (Date.now() <= deadline) {
    const counters = healthCounters(await queueRequest(endpointId, "/health", inferenceKey));
    if (activityCount(counters) === 0) return counters;
    if (Date.now() - lastPrinted >= 30_000) {
      console.log(
        `AVANTIQO_IMAGE_CACHE_QUIESCENCE_WAIT label=${label} jobs=${counters.jobs.in_queue + counters.jobs.in_progress} workers=${Object.values(counters.workers).reduce((sum, value) => sum + value, 0)}`,
      );
      lastPrinted = Date.now();
    }
    await sleep(5_000);
  }
  throw new Error(`AVANTIQO_IMAGE_CACHE_QUIESCENCE_TIMEOUT:${label}`);
}

async function waitForJob(endpointId, jobId, inferenceKey, regionLabel) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastStatus = null;
  let lastPrinted = 0;
  while (Date.now() <= deadline) {
    const body = await queueRequest(
      endpointId,
      `/status/${encodeURIComponent(jobId)}`,
      inferenceKey,
    );
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return body;
    if (terminalFailure(status)) {
      throw new Error(
        `AVANTIQO_IMAGE_CACHE_${status}:region=${regionLabel}:${text(body?.error || body?.output?.error)}`,
      );
    }
    if (status !== lastStatus || Date.now() - lastPrinted >= 30_000) {
      console.log(
        `AVANTIQO_IMAGE_CACHE_PROGRESS region=${regionLabel} status=${status || "UNKNOWN"}`,
      );
      lastStatus = status;
      lastPrinted = Date.now();
    }
    await sleep(POLL_INTERVAL_MS);
  }
  try {
    await queueRequest(endpointId, `/cancel/${encodeURIComponent(jobId)}`, inferenceKey, {
      method: "POST",
    });
    console.log(`AVANTIQO_IMAGE_CACHE_TIMEOUT_CANCEL_REQUESTED region=${regionLabel}`);
  } catch (cancelError) {
    console.error(
      `AVANTIQO_IMAGE_CACHE_TIMEOUT_CANCEL_FAILED region=${regionLabel} error=${text(cancelError?.message || cancelError)}`,
    );
  }
  throw new Error(`AVANTIQO_IMAGE_CACHE_WAIT_TIMEOUT:region=${regionLabel}:job=${jobId}`);
}

async function verifyImmutableBinding(endpointId, managementKey, expectedTemplateId, immutableImage) {
  const [endpoint, templates] = await Promise.all([
    rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    ),
    endpointBoundTemplates(managementKey),
  ]);
  if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_IMAGE_CACHE_ENDPOINT_NAME_CHANGED");
  }
  const template = resolveTemplate(endpoint, templates);
  if (text(template.id || endpoint.templateId) !== expectedTemplateId) {
    throw new Error("AVANTIQO_IMAGE_CACHE_TEMPLATE_CHANGED_REPLAN_REQUIRED");
  }
  if (text(template.imageName) !== immutableImage) {
    throw new Error("AVANTIQO_IMAGE_CACHE_IMMUTABLE_BINDING_CHANGED_REPLAN_REQUIRED");
  }
  return endpoint;
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const evidence = immutableEvidenceFromCurrentOriginMain();

console.log(`AVANTIQO_IMAGE_CACHE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_CACHE_TARGET=${TARGET_MODEL}`);
console.log("AVANTIQO_IMAGE_CACHE_STRATEGY=PER_ATTACHED_VOLUME_CACHE_OR_VERIFY");
console.log("AVANTIQO_IMAGE_CACHE_ANCESTOR_SCAN=false");
console.log("AVANTIQO_IMAGE_CACHE_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_CACHE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_CACHE_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_CACHE_SECRETS_PRINTED=false");

const [endpoints, templates, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

let endpoint = null;
let resolution = null;
if (configuredEndpointId) {
  const matches = endpoints.filter((candidate) => text(candidate?.id) === configuredEndpointId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
  }
  endpoint = matches[0];
  resolution = "ENV_VERIFIED";
} else {
  const matches = endpoints.filter((candidate) => text(candidate?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_ENDPOINT_AUTO_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  endpoint = matches[0];
  resolution = "EXACT_NAME";
}

const endpointId = text(endpoint.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_CACHE_ENDPOINT_ID_REQUIRED");
const template = resolveTemplate(endpoint, templates);
const templateId = text(template.id || endpoint.templateId);
if (!templateId) throw new Error("AVANTIQO_IMAGE_CACHE_TEMPLATE_ID_REQUIRED");
if (text(template.imageName) !== evidence.image) {
  throw new Error("AVANTIQO_IMAGE_CACHE_REQUIRES_BOUND_IMMUTABLE_IMAGE");
}

const original = endpointFingerprint(endpoint);
if (original.workers_min !== 0) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_WORKERS_MIN_ZERO_REQUIRED:actual=${original.workers_min}`);
}
if (!Number.isFinite(original.workers_max) || original.workers_max < 1) {
  throw new Error("AVANTIQO_IMAGE_CACHE_WORKERS_MAX_REQUIRED");
}
if (!original.gpu_type_ids.length) {
  throw new Error("AVANTIQO_IMAGE_CACHE_GENERATION_GPU_POOL_REQUIRED");
}
if (!Number.isFinite(original.execution_timeout_ms) || original.execution_timeout_ms <= 0) {
  throw new Error("AVANTIQO_IMAGE_CACHE_EXECUTION_TIMEOUT_REQUIRED");
}
if (original.network_volume_ids.length < 1 || original.network_volume_ids.length > 2) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_EXPECTS_ONE_OR_TWO_VOLUMES:actual=${original.network_volume_ids.length}`,
  );
}

const attachedVolumes = original.network_volume_ids.map((volumeId) => {
  const volume = volumes.find((candidate) => text(candidate?.id) === volumeId);
  if (!volume) throw new Error("AVANTIQO_IMAGE_CACHE_ATTACHED_VOLUME_LOOKUP_FAILED");
  const dataCenterId = text(volume.dataCenterId);
  if (!dataCenterId) throw new Error("AVANTIQO_IMAGE_CACHE_VOLUME_DATACENTER_REQUIRED");
  if (finite(volume.size, 0) < MIN_VOLUME_GB) {
    throw new Error(
      `AVANTIQO_IMAGE_CACHE_VOLUME_TOO_SMALL:dc=${dataCenterId}:size_gb=${finite(volume.size, 0)}`,
    );
  }
  return {
    id: volumeId,
    name: text(volume.name) || null,
    size_gb: finite(volume.size),
    data_center_id: dataCenterId,
  };
});
const attachedDataCenters = unique(attachedVolumes.map((volume) => volume.data_center_id));
if (attachedDataCenters.length !== attachedVolumes.length) {
  throw new Error("AVANTIQO_IMAGE_CACHE_ONE_VOLUME_PER_DATACENTER_REQUIRED");
}
if (
  original.data_center_ids.length &&
  !sameSet(original.data_center_ids, attachedDataCenters)
) {
  throw new Error("AVANTIQO_IMAGE_CACHE_VOLUME_DATACENTER_BINDING_MISMATCH");
}

const initialHealth = await waitForQuiescence(endpointId, inferenceKey, "INITIAL");
const cachePools = {};
for (const volume of attachedVolumes) {
  cachePools[volume.data_center_id] = await discoverCacheGpuPool(
    managementKey,
    volume.data_center_id,
  );
}

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_2512_MULTI_VOLUME_CACHE_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: resolution,
  immutable_image_source_sha: evidence.source_sha,
  immutable_image_bound: true,
  image_source_tree_matches_current_origin_main: true,
  attached_volume_count: attachedVolumes.length,
  attached_volumes: attachedVolumes.map((volume) => ({
    name: volume.name,
    size_gb: volume.size_gb,
    data_center_id: volume.data_center_id,
  })),
  cache_gpu_candidates_by_data_center: Object.fromEntries(
    Object.entries(cachePools).map(([dataCenterId, candidates]) => [
      dataCenterId,
      candidates.map((gpu) => ({
        name: gpu.name,
        stock_status: gpu.stock_status,
      })),
    ]),
  ),
  initial_health: initialHealth,
  max_cache_jobs: attachedVolumes.length,
  one_job_per_attached_volume: true,
  partial_download_resume_supported: true,
  existing_complete_cache_returns_immediately: true,
  temporary_endpoint_rebind_required: attachedVolumes.length > 1,
  automatic_original_endpoint_restore: true,
  image_generation: false,
  inference_performed: false,
  production_deploy: false,
  mutation_performed: false,
  next_action: apply ? "CACHE_OR_VERIFY_EACH_ATTACHED_VOLUME" : "RUN_WITH_APPLY",
};

console.log(`AVANTIQO_IMAGE_CACHE_ENDPOINT_RESOLUTION=${resolution}`);
console.log(`AVANTIQO_IMAGE_CACHE_ATTACHED_VOLUME_COUNT=${attachedVolumes.length}`);

if (!apply) {
  console.log("AVANTIQO_IMAGE_CACHE_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let temporaryMutation = false;
let currentTemporaryFingerprint = null;
let activeJobId = null;
let signalHandling = false;
let restoreInProgress = false;
const regionalResults = [];

async function patchEndpointForVolume(volume, gpuPool) {
  const desired = {
    template_id: templateId,
    network_volume_ids: [volume.id],
    data_center_ids: [volume.data_center_id],
    gpu_type_ids: gpuPool.map((gpu) => gpu.id),
    execution_timeout_ms: CACHE_EXECUTION_TIMEOUT_MS,
    workers_min: original.workers_min,
    workers_max: original.workers_max,
  };
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volume.id,
      networkVolumeIds: [volume.id],
      dataCenterIds: [volume.data_center_id],
      gpuTypeIds: desired.gpu_type_ids,
      executionTimeoutMs: CACHE_EXECUTION_TIMEOUT_MS,
    },
  });
  temporaryMutation = true;
  currentTemporaryFingerprint = desired;
  const verified = await verifyImmutableBinding(
    endpointId,
    managementKey,
    templateId,
    evidence.image,
  );
  const actual = endpointFingerprint(verified);
  if (!sameTemporaryConfig(actual, desired)) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_TEMPORARY_REBIND_VERIFY_FAILED:dc=${volume.data_center_id}`);
  }
}

async function restoreOriginal(reason) {
  if (!temporaryMutation || restoreInProgress) return;
  restoreInProgress = true;
  try {
    const current = await verifyImmutableBinding(
      endpointId,
      managementKey,
      templateId,
      evidence.image,
    );
    const currentFingerprint = endpointFingerprint(current);
    if (
      currentTemporaryFingerprint &&
      !sameTemporaryConfig(currentFingerprint, currentTemporaryFingerprint)
    ) {
      throw new Error(
        `AVANTIQO_IMAGE_CACHE_RESTORE_BLOCKED_CONCURRENT_ENDPOINT_CHANGE:reason=${reason}`,
      );
    }
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: {
        networkVolumeId: original.network_volume_ids[0],
        networkVolumeIds: original.network_volume_ids,
        dataCenterIds: original.data_center_ids.length
          ? original.data_center_ids
          : attachedDataCenters,
        gpuTypeIds: original.gpu_type_ids,
        executionTimeoutMs: original.execution_timeout_ms,
      },
    });
    const verified = await verifyImmutableBinding(
      endpointId,
      managementKey,
      templateId,
      evidence.image,
    );
    const restored = endpointFingerprint(verified);
    const expectedDataCenters = original.data_center_ids.length
      ? original.data_center_ids
      : attachedDataCenters;
    if (
      !sameSet(restored.network_volume_ids, original.network_volume_ids) ||
      !sameSet(restored.data_center_ids, expectedDataCenters) ||
      !sameSet(restored.gpu_type_ids, original.gpu_type_ids) ||
      restored.execution_timeout_ms !== original.execution_timeout_ms
    ) {
      throw new Error(`AVANTIQO_IMAGE_CACHE_RESTORE_VERIFY_FAILED:reason=${reason}`);
    }
    temporaryMutation = false;
    currentTemporaryFingerprint = null;
    console.log(`AVANTIQO_IMAGE_CACHE_ORIGINAL_ENDPOINT_RESTORED=true reason=${reason}`);
  } finally {
    restoreInProgress = false;
  }
}

async function cancelActiveJob(reason) {
  if (!activeJobId) return;
  try {
    const body = await queueRequest(
      endpointId,
      `/cancel/${encodeURIComponent(activeJobId)}`,
      inferenceKey,
      { method: "POST" },
    );
    console.log(
      `AVANTIQO_IMAGE_CACHE_ACTIVE_JOB_CANCEL_REQUESTED=true reason=${reason} status=${text(body?.status).toUpperCase() || "UNKNOWN"}`,
    );
  } catch (error) {
    console.error(
      `AVANTIQO_IMAGE_CACHE_ACTIVE_JOB_CANCEL_FAILED reason=${reason} error=${text(error?.message || error)}`,
    );
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    if (signalHandling) return;
    signalHandling = true;
    try {
      await cancelActiveJob(signal);
      try {
        await waitForQuiescence(endpointId, inferenceKey, signal);
      } catch {
        // Restore still runs below; the cancel request prevents an intentional new cache job from continuing indefinitely.
      }
      await restoreOriginal(signal);
    } catch (error) {
      console.error(
        `AVANTIQO_IMAGE_CACHE_SIGNAL_CLEANUP_FAILED=${text(error?.message || error)}`,
      );
    } finally {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  });
}

try {
  for (let index = 0; index < attachedVolumes.length; index += 1) {
    const volume = attachedVolumes[index];
    const regionLabel = `${index + 1}/${attachedVolumes.length}:${volume.data_center_id}`;
    await waitForQuiescence(endpointId, inferenceKey, `BEFORE_${regionLabel}`);

    const fresh = await verifyImmutableBinding(
      endpointId,
      managementKey,
      templateId,
      evidence.image,
    );
    if (index === 0 && !temporaryMutation) {
      const freshFingerprint = endpointFingerprint(fresh);
      if (
        !sameSet(freshFingerprint.network_volume_ids, original.network_volume_ids) ||
        !sameSet(freshFingerprint.gpu_type_ids, original.gpu_type_ids)
      ) {
        throw new Error("AVANTIQO_IMAGE_CACHE_ENDPOINT_CHANGED_BEFORE_FIRST_REGION");
      }
    }

    const gpuPool = cachePools[volume.data_center_id];
    await patchEndpointForVolume(volume, gpuPool);
    console.log(
      `AVANTIQO_IMAGE_CACHE_REGION_READY region=${regionLabel} cache_gpu_candidates=${gpuPool.length}`,
    );

    const submit = await queueRequest(endpointId, "/run", inferenceKey, {
      method: "POST",
      body: {
        input: {
          contract: CONTRACT,
          operation: "cache_foundation_model",
          target_model: TARGET_MODEL,
        },
      },
    });
    activeJobId = text(submit?.id);
    let completed = null;
    const submitStatus = text(submit?.status).toUpperCase();
    if (!activeJobId && submitStatus !== "COMPLETED") {
      throw new Error(
        `AVANTIQO_IMAGE_CACHE_JOB_ID_MISSING:region=${regionLabel}:status=${submitStatus || "UNKNOWN"}`,
      );
    }
    console.log(
      `AVANTIQO_IMAGE_CACHE_JOB_SUBMITTED region=${regionLabel} job=${activeJobId || "completed-immediately"}`,
    );

    if (submitStatus === "COMPLETED") {
      completed = submit;
    } else {
      completed = await waitForJob(endpointId, activeJobId, inferenceKey, regionLabel);
    }
    if (!strictCacheValid(completed)) {
      console.log(JSON.stringify(completed?.output || {}, null, 2));
      throw new Error(`AVANTIQO_IMAGE_CACHE_STRICT_VALIDATION_FAILED:region=${regionLabel}`);
    }

    const output = object(completed.output);
    regionalResults.push({
      data_center_id: volume.data_center_id,
      volume_name: volume.name,
      cache_ready: true,
      already_cached: output.already_cached === true,
      snapshot_revision: text(output.cache_integrity?.snapshot_revision) || null,
      inference_performed: false,
    });
    console.log(
      `AVANTIQO_IMAGE_CACHE_REGION_COMPLETE region=${regionLabel} already_cached=${output.already_cached === true}`,
    );
    activeJobId = null;
    await waitForQuiescence(endpointId, inferenceKey, `AFTER_${regionLabel}`);
  }

  await restoreOriginal("CACHE_COMPLETE");
  const finalEndpoint = await verifyImmutableBinding(
    endpointId,
    managementKey,
    templateId,
    evidence.image,
  );
  const finalFingerprint = endpointFingerprint(finalEndpoint);
  const expectedDataCenters = original.data_center_ids.length
    ? original.data_center_ids
    : attachedDataCenters;
  if (
    !sameSet(finalFingerprint.network_volume_ids, original.network_volume_ids) ||
    !sameSet(finalFingerprint.data_center_ids, expectedDataCenters) ||
    !sameSet(finalFingerprint.gpu_type_ids, original.gpu_type_ids) ||
    finalFingerprint.execution_timeout_ms !== original.execution_timeout_ms
  ) {
    throw new Error("AVANTIQO_IMAGE_CACHE_FINAL_ENDPOINT_NOT_RESTORED");
  }

  console.log("AVANTIQO_IMAGE_CACHE_READY=YES");
  console.log(JSON.stringify({
    ...plan,
    mode: "APPLY",
    mutation_performed: true,
    cache_jobs_submitted: regionalResults.length,
    regional_results: regionalResults,
    all_attached_volumes_cache_ready: regionalResults.length === attachedVolumes.length,
    original_endpoint_restored: true,
    image_generation: false,
    inference_performed: false,
    production_deploy: false,
    next_action: "IMAGE_2512_CACHE_COMPLETE_ZERO_GENERATION_STOP_POINT",
  }, null, 2));
} catch (error) {
  if (activeJobId) {
    await cancelActiveJob("CACHE_FAILURE");
    activeJobId = null;
  }
  try {
    await restoreOriginal("CACHE_FAILURE");
  } catch (restoreError) {
    console.error(
      `AVANTIQO_IMAGE_CACHE_RESTORE_AFTER_FAILURE_FAILED=${text(restoreError?.message || restoreError)}`,
    );
  }
  throw error;
}
