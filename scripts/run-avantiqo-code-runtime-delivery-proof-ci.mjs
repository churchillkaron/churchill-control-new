import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_RUNTIME_DELIVERY_PROOF_V1";
const REQUEST_CONTRACT = "AVANTIQO_CODE_RUNTIME_DELIVERY_PROOF_REQUEST_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const REQUIRED_NETWORK_VOLUME_ID = "qcg1rbzc3g";
const REQUIRED_DATACENTER_ID = "EUR-IS-1";
const REQUIRED_GPU_TYPE_ID = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const EXPECTED_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const IMAGE_REPOSITORY = "ghcr.io/churchillkaron/avantiqo-code-worker";
const PLACEMENT_STALL_MS = 90_000;
const JOB_TIMEOUT_MS = 12 * 60_000;
const REQUEST_PATH = process.env.AVANTIQO_CODE_RUNTIME_DELIVERY_PROOF_REQUEST || "audits/avantiqo-code-runtime-delivery-proof-request.json";
const REPORT_PATH = process.env.AVANTIQO_CODE_RUNTIME_DELIVERY_PROOF_REPORT || "/tmp/avantiqo-code-runtime-delivery-proof.json";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name], 2000);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200) || "UNKNOWN"}`);
  }
  return body;
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}

async function queue(pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_QUEUE`);
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

function healthSummary(body = {}) {
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

function activeWorkers(summary) {
  return Object.values(summary.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
}

function isIdle(summary) {
  return summary.jobs.in_queue === 0 && summary.jobs.in_progress === 0 && activeWorkers(summary) === 0;
}

function endpointVolumeIds(endpoint = {}) {
  const ids = list(endpoint.networkVolumeIds).map((entry) => typeof entry === "string" ? text(entry) : text(entry?.networkVolumeId)).filter(Boolean);
  const legacy = text(endpoint.networkVolumeId || endpoint.network_volume_id);
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  return [...new Set(ids)];
}

function endpointSummary(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    idle_timeout_seconds: finite(endpoint.idleTimeout, -1),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    scaler_type: text(endpoint.scalerType).toUpperCase(),
    scaler_value: finite(endpoint.scalerValue, null),
    network_volume_id: text(endpoint.networkVolumeId || endpoint.network_volume_id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: list(endpoint.gpuTypeIds).map((entry) => text(entry)).filter(Boolean),
  };
}

async function request() {
  const value = JSON.parse(await readFile(REQUEST_PATH, "utf8"));
  if (text(value.contract) !== REQUEST_CONTRACT) throw new Error(`${CONTRACT}_REQUEST_CONTRACT_INVALID`);
  if (value.approved !== true) throw new Error(`${CONTRACT}_REQUEST_NOT_APPROVED`);
  const imageDigest = text(value.image_digest).toLowerCase();
  const sourceSha = text(value.source_sha).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error(`${CONTRACT}_IMAGE_DIGEST_INVALID`);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error(`${CONTRACT}_SOURCE_SHA_INVALID`);
  if (text(value.image_repository).toLowerCase() !== IMAGE_REPOSITORY) throw new Error(`${CONTRACT}_IMAGE_REPOSITORY_INVALID`);
  return {
    source_sha: sourceSha,
    image_digest: imageDigest,
    immutable_image: `${IMAGE_REPOSITORY}@${imageDigest}`,
  };
}

async function snapshot(managementKey, runtimeKey) {
  const [endpoint, templatesRaw, healthRaw, boundVolume] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
    queue("/health", runtimeKey),
    rest(`/networkvolumes/${REQUIRED_NETWORK_VOLUME_ID}`, managementKey),
  ]);
  const summary = endpointSummary(endpoint);
  if (summary.id !== ENDPOINT_ID || summary.name !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_MISMATCH`);
  if (summary.workers_min !== 0) throw new Error(`${CONTRACT}_WORKERS_MIN_NOT_ZERO:${summary.workers_min}`);
  if (![0, 1].includes(summary.workers_max)) throw new Error(`${CONTRACT}_WORKERS_MAX_UNEXPECTED:${summary.workers_max}`);
  if (!summary.flashboot) throw new Error(`${CONTRACT}_FLASHBOOT_REQUIRED`);
  if (summary.scaler_type !== "QUEUE_DELAY" || summary.scaler_value !== 1) throw new Error(`${CONTRACT}_SCALER_MISMATCH`);
  if (summary.network_volume_id !== REQUIRED_NETWORK_VOLUME_ID) throw new Error(`${CONTRACT}_NETWORK_VOLUME_MISMATCH:${summary.network_volume_id || "NONE"}`);
  if (JSON.stringify(summary.network_volume_ids) !== JSON.stringify([REQUIRED_NETWORK_VOLUME_ID])) throw new Error(`${CONTRACT}_NETWORK_VOLUME_SET_MISMATCH:${JSON.stringify(summary.network_volume_ids)}`);
  if (JSON.stringify(summary.gpu_type_ids) !== JSON.stringify([REQUIRED_GPU_TYPE_ID])) throw new Error(`${CONTRACT}_GPU_PLACEMENT_MISMATCH:${JSON.stringify(summary.gpu_type_ids)}`);
  if (text(boundVolume?.id) !== REQUIRED_NETWORK_VOLUME_ID || text(boundVolume?.dataCenterId ?? boundVolume?.data_center_id) !== REQUIRED_DATACENTER_ID) {
    throw new Error(`${CONTRACT}_DATACENTER_MISMATCH:${text(boundVolume?.dataCenterId ?? boundVolume?.data_center_id) || "NONE"}`);
  }
  if (!summary.template_id) throw new Error(`${CONTRACT}_TEMPLATE_REQUIRED`);
  const templates = normalizeRows(templatesRaw, ["templates"]);
  const matches = templates.filter((entry) => text(entry?.id) === summary.template_id);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return {
    endpoint_summary: summary,
    image_name: text(matches[0]?.imageName),
    placement: {
      data_center_id: REQUIRED_DATACENTER_ID,
      network_volume_id: REQUIRED_NETWORK_VOLUME_ID,
      gpu_type_id: REQUIRED_GPU_TYPE_ID,
    },
    health: healthSummary(healthRaw),
  };
}

async function waitForJob(jobId, runtimeKey) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  const timeline = [];
  let zeroWorkerQueuedSince = null;
  while (Date.now() < deadline) {
    const [response, healthRaw] = await Promise.all([
      queue(`/status/${encodeURIComponent(jobId)}`, runtimeKey),
      queue("/health", runtimeKey),
    ]);
    const status = text(response?.status).toUpperCase();
    const health = healthSummary(healthRaw);
    const at = Date.now();
    timeline.push({
      at_ms: at,
      status,
      delay_time_ms: finite(response?.delayTime),
      execution_time_ms: finite(response?.executionTime),
      health,
    });
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
      return { response, timeline, timed_out: false };
    }

    const queuedWithoutWorker =
      ["IN_QUEUE", "QUEUED"].includes(status) &&
      health.jobs.in_queue >= 1 &&
      health.jobs.in_progress === 0 &&
      activeWorkers(health) === 0;
    if (queuedWithoutWorker) {
      if (zeroWorkerQueuedSince === null) zeroWorkerQueuedSince = at;
      if (at - zeroWorkerQueuedSince >= PLACEMENT_STALL_MS) {
        const error = new Error(`${CONTRACT}_PLACEMENT_STALLED_QUEUED_WITH_ZERO_WORKERS:${Math.floor((at - zeroWorkerQueuedSince) / 1000)}s`);
        error.timeline = timeline;
        throw error;
      }
    } else {
      zeroWorkerQueuedSince = null;
    }
    await sleep(4000);
  }
  return { response: null, timeline, timed_out: true };
}

async function cancelIfNeeded(jobId, runtimeKey) {
  if (!jobId) return { attempted: false };
  try {
    const status = await queue(`/status/${encodeURIComponent(jobId)}`, runtimeKey);
    const state = text(status?.status).toUpperCase();
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(state)) return { attempted: false, terminal_status: state };
    await queue(`/cancel/${encodeURIComponent(jobId)}`, runtimeKey, { method: "POST" });
    return { attempted: true, terminal_status: state };
  } catch (error) {
    return { attempted: true, error: text(error?.message, 800) };
  }
}

async function forcePark(managementKey, runtimeKey) {
  let patchError = null;
  try {
    await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0, workersMax: 0 },
    });
  } catch (error) {
    patchError = text(error?.message, 1000);
  }

  const deadline = Date.now() + 5 * 60_000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await snapshot(managementKey, runtimeKey);
      if (last.endpoint_summary.workers_min === 0 && last.endpoint_summary.workers_max === 0 && isIdle(last.health)) {
        return { success: true, patch_error: patchError, snapshot: last };
      }
    } catch (error) {
      last = { error: text(error?.message, 1000) };
    }
    await sleep(3000);
  }
  return { success: false, patch_error: patchError, snapshot: last };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!runtimeKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");
if (text(process.env.AVANTIQO_CODE_RUNTIME_DELIVERY_PROOF_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_RUNTIME_DELIVERY_PROOF_APPROVED=YES_REQUIRED");
}

const target = await request();
let jobId = null;
let primaryError = null;
let result = null;
let before = null;
let active = null;
let completion = null;
let cancellation = null;
let cleanup = null;
const startedAt = Date.now();

try {
  before = await snapshot(managementKey, runtimeKey);
  if (before.image_name !== target.immutable_image) throw new Error(`${CONTRACT}_BOUND_IMAGE_MISMATCH:${before.image_name}`);
  if (!isIdle(before.health)) throw new Error(`${CONTRACT}_BEFORE_NOT_IDLE:${JSON.stringify(before.health)}`);
  if (before.endpoint_summary.workers_max !== 0) throw new Error(`${CONTRACT}_BEFORE_NOT_PARKED_0_0:${before.endpoint_summary.workers_max}`);

  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  });
  active = await snapshot(managementKey, runtimeKey);
  if (active.image_name !== target.immutable_image) throw new Error(`${CONTRACT}_IMAGE_CHANGED_DURING_ACTIVATION`);
  if (active.endpoint_summary.workers_min !== 0 || active.endpoint_summary.workers_max !== 1) {
    throw new Error(`${CONTRACT}_ACTIVE_CAPACITY_NOT_0_1`);
  }

  const submission = await queue("/run", runtimeKey, {
    method: "POST",
    body: {
      input: {
        contract: "AVANTIQO_CODE_ENGINE_V1",
        capability: "ai.code.generate",
        organization_id: "runtime-delivery-proof",
        instruction: "Create a production-safe JavaScript ES module. Return only the module source code, no markdown. It must export a function named normalizeName(value). The function must convert null or undefined to an empty string, convert other values with String(value), trim surrounding whitespace, collapse every run of internal whitespace to one ASCII space, and return the normalized string. Include no dependencies and no additional exports.",
        structured_specification: {
          proof_contract: CONTRACT,
          repository_write_allowed: false,
          required_language: "javascript",
          required_export: "normalizeName",
          concise_output: true,
        },
      },
    },
  });
  jobId = text(submission?.id);
  if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
  await writeFile("/tmp/avantiqo-code-runtime-delivery-proof-job-id", `${jobId}\n`, "utf8");

  completion = await waitForJob(jobId, runtimeKey);
  if (completion.timed_out) throw new Error(`${CONTRACT}_JOB_TIMEOUT:${jobId}`);
  const runpodStatus = text(completion.response?.status).toUpperCase();
  if (runpodStatus !== "COMPLETED") throw new Error(`${CONTRACT}_RUNPOD_STATUS:${runpodStatus}`);
  const output = object(completion.response?.output);
  if (text(output.status) !== "completed") throw new Error(`${CONTRACT}_OUTPUT_STATUS:${text(output.status)}`);
  if (text(output.provider) !== "avantiqo-code") throw new Error(`${CONTRACT}_PROVIDER:${text(output.provider)}`);
  if (text(output.model) !== "avantiqo-code-v1") throw new Error(`${CONTRACT}_PRODUCT_MODEL:${text(output.model)}`);
  if (text(output.runtime_model) !== EXPECTED_MODEL) throw new Error(`${CONTRACT}_RUNTIME_MODEL:${text(output.runtime_model)}`);
  if (text(output.serving_runtime) !== "vllm") throw new Error(`${CONTRACT}_SERVING_RUNTIME:${text(output.serving_runtime)}`);
  if (text(output.quantization).toLowerCase() !== "fp8") throw new Error(`${CONTRACT}_QUANTIZATION:${text(output.quantization)}`);
  if (text(output.runtime_model_source) !== "runpod-cache") throw new Error(`${CONTRACT}_MODEL_CACHE_NOT_USED:${text(output.runtime_model_source)}`);
  if (output.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_POLICY_FAILED`);
  const deliverable = text(output.result, 12000);
  if (deliverable.length < 60) throw new Error(`${CONTRACT}_DELIVERABLE_TOO_SHORT`);
  if (!/export\s+(?:function|const|let|var)\s+normalizeName\b/.test(deliverable)) throw new Error(`${CONTRACT}_REQUIRED_EXPORT_MISSING`);
  if (!/\.trim\s*\(/.test(deliverable)) throw new Error(`${CONTRACT}_TRIM_BEHAVIOR_MISSING`);
  if (!/replace\s*\(/.test(deliverable)) throw new Error(`${CONTRACT}_WHITESPACE_COLLAPSE_MISSING`);

  result = {
    runpod_status: runpodStatus,
    provider_status: text(output.status),
    runtime_model: text(output.runtime_model),
    runtime_model_source: text(output.runtime_model_source),
    serving_runtime: text(output.serving_runtime),
    quantization: text(output.quantization),
    generation_seconds: finite(output.generation_seconds),
    delay_time_ms: finite(completion.response?.delayTime),
    execution_time_ms: finite(completion.response?.executionTime),
    usage: object(output.usage),
    deliverable_chars: deliverable.length,
    required_export_present: true,
    trim_behavior_present: true,
    whitespace_collapse_present: true,
    raw_reasoning_persisted: false,
    deliverable_preview: deliverable.slice(0, 600),
  };
} catch (error) {
  primaryError = error;
  if (!completion && Array.isArray(error?.timeline)) completion = { timeline: error.timeline, response: null, timed_out: false };
} finally {
  cancellation = await cancelIfNeeded(jobId, runtimeKey);
  cleanup = await forcePark(managementKey, runtimeKey);
}

const report = {
  success: !primaryError && cleanup?.success === true,
  contract: CONTRACT,
  source_sha: target.source_sha,
  immutable_image: target.immutable_image,
  endpoint_id: ENDPOINT_ID,
  target_placement: {
    data_center_id: REQUIRED_DATACENTER_ID,
    network_volume_id: REQUIRED_NETWORK_VOLUME_ID,
    gpu_type_id: REQUIRED_GPU_TYPE_ID,
  },
  placement_stall_fail_fast_ms: PLACEMENT_STALL_MS,
  started_at_ms: startedAt,
  completed_at_ms: Date.now(),
  job_id: jobId,
  before: before ? { endpoint: before.endpoint_summary, image_name: before.image_name, placement: before.placement, health: before.health } : null,
  active: active ? { endpoint: active.endpoint_summary, image_name: active.image_name, placement: active.placement, health: active.health } : null,
  result,
  status_timeline: completion?.timeline || [],
  cancellation,
  cleanup,
  final_parked_0_0: cleanup?.success === true,
  provider_inference_performed: Boolean(jobId),
  wallet_mutation_performed: false,
  production_web_deploy_performed: false,
  repository_write_performed: false,
  secrets_printed: false,
  error: primaryError ? text(primaryError?.message, 1600) : null,
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (primaryError) throw primaryError;
if (!cleanup?.success) throw new Error(`${CONTRACT}_FINAL_ZERO_IDLE_CLEANUP_FAILED`);
