#!/usr/bin/env node

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_32GB_RUNTIME_PROBE_V70B_CHILD";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "video-32gb-candidate";
const ENDPOINT_NAME = "avantiqo-video-32gb-candidate-v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const STATUS_TIMEOUT_MS = 10 * 60_000;
const ZERO_WORKER_QUEUE_TIMEOUT_MS = 4 * 60_000;
const POLL_MS = 5_000;
const APPROVED_RUNTIME_GPUS = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX 5000 Ada Generation",
  "NVIDIA L40S",
]);
const EXACT_32GB_GPUS = new Set([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX 5000 Ada Generation",
]);
const TERMINAL = new Set(["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function queue(endpointId, pathname, key, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`AVANTIQO_VIDEO_V70B_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  const normalizedWorkers = {
    idle: finite(workers?.idle, 0),
    initializing: finite(workers?.initializing, 0),
    ready: finite(workers?.ready, 0),
    running: finite(workers?.running, 0),
    throttled: finite(workers?.throttled, 0),
    unhealthy: finite(workers?.unhealthy, 0),
  };
  return {
    jobs: {
      in_queue: finite(jobs?.inQueue ?? jobs?.in_queue, 0),
      in_progress: finite(jobs?.inProgress ?? jobs?.in_progress, 0),
    },
    workers: normalizedWorkers,
    worker_total: Object.values(normalizedWorkers).reduce((sum, value) => sum + value, 0),
  };
}

async function queueCredential(endpointId) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", text(process.env.RUNPOD_MANAGEMENT_API_KEY)],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await queue(endpointId, "/health", key);
      return { source, key };
    } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V70B_QUEUE_CREDENTIAL_REQUIRED");
}

async function cancel(endpointId, jobId, key, reason) {
  if (!jobId) return { attempted: false, reason };
  try {
    const body = await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" });
    return { attempted: true, success: true, reason, status: text(body?.status) || null };
  } catch (error) {
    return { attempted: true, success: false, reason, error: redact(error?.message).slice(0, 400) };
  }
}

function approvedPhysicalGpu(deviceName) {
  const observed = normalize(deviceName);
  return APPROVED_RUNTIME_GPUS.find((candidate) => {
    const expected = normalize(candidate);
    return observed === expected || observed.includes(expected.replace(/^nvidia/, ""));
  }) || null;
}

function validateProbe(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("AVANTIQO_VIDEO_V70B_PROBE_OUTPUT_INVALID");
  }
  if (text(output?.probe_contract) !== "AVANTIQO_VIDEO_RUNTIME_PROBE_V1") {
    throw new Error(`AVANTIQO_VIDEO_V70B_PROBE_CONTRACT_INVALID:${text(output?.probe_contract) || "MISSING"}`);
  }
  if (
    output?.generation_requested !== false ||
    output?.inference_performed !== false ||
    output?.model_download_performed !== false ||
    output?.storage_mutation_performed !== false
  ) {
    throw new Error("AVANTIQO_VIDEO_V70B_PROBE_SIDE_EFFECT_FORBIDDEN");
  }
  if (
    text(output?.entrypoint) !== "handler_v5.py" ||
    text(output?.entrypoint_revision) !== "AVANTIQO_VIDEO_HANDLER_V5_WAN22_32GB_GROUP_OFFLOAD_V1" ||
    text(output?.runtime_revision) !== "AVANTIQO_VIDEO_WAN22_A14B_32GB_GROUP_OFFLOAD_V1" ||
    text(output?.quality_contract) !== "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1" ||
    text(output?.memory_contract) !== "AVANTIQO_VIDEO_WAN22_A14B_32GB_MEMORY_PROFILE_V1"
  ) {
    throw new Error("AVANTIQO_VIDEO_V70B_RUNTIME_IDENTITY_INVALID");
  }
  if (
    text(output?.configured_text_to_video_foundation) !== "Wan-AI/Wan2.2-T2V-A14B-Diffusers" ||
    text(output?.configured_image_to_video_foundation) !== "Wan-AI/Wan2.2-I2V-A14B-Diffusers" ||
    output?.require_cached_model !== true
  ) {
    throw new Error("AVANTIQO_VIDEO_V70B_FOUNDATION_CONFIG_INVALID");
  }
  for (const [label, foundation, model] of [
    ["T2V", output?.foundations?.text_to_video, "Wan-AI/Wan2.2-T2V-A14B-Diffusers"],
    ["I2V", output?.foundations?.image_to_video, "Wan-AI/Wan2.2-I2V-A14B-Diffusers"],
  ]) {
    if (
      text(foundation?.model) !== model ||
      foundation?.cache_ready !== true ||
      foundation?.cache_path_present !== true ||
      foundation?.completion_marker_valid !== true ||
      !text(foundation?.snapshot_revision)
    ) {
      throw new Error(`AVANTIQO_VIDEO_V70B_${label}_CACHE_NOT_READY`);
    }
  }
  const memory = output?.memory_profile || {};
  const physicalGpu = approvedPhysicalGpu(memory?.device_name);
  if (!physicalGpu) {
    throw new Error(`AVANTIQO_VIDEO_V70B_PHYSICAL_GPU_NOT_APPROVED:${text(memory?.device_name) || "MISSING"}`);
  }
  const vram = finite(memory?.device_total_memory_gb, null);
  const exact32 = EXACT_32GB_GPUS.has(physicalGpu);
  const expectedVram = exact32 ? (vram >= 30 && vram < 40) : (vram >= 45 && vram < 55);
  if (
    finite(memory?.target_minimum_vram_gb, null) !== 32 ||
    memory?.cuda_available !== true ||
    !expectedVram ||
    memory?.bfloat16_supported !== true ||
    memory?.group_offload_enabled !== true ||
    text(memory?.group_offload_type) !== "leaf_level" ||
    memory?.group_offload_stream !== true ||
    memory?.quantization_enabled !== false ||
    memory?.layerwise_casting_enabled !== false ||
    text(memory?.diffusion_dtype) !== "bfloat16" ||
    text(memory?.vae_decode_dtype) !== "float32" ||
    memory?.quality_profile_changed !== false
  ) {
    throw new Error(`AVANTIQO_VIDEO_V70B_MEMORY_PROFILE_INVALID:${JSON.stringify(memory)}`);
  }
  const systemMemory = finite(memory?.system_memory_gb, null);
  if (!(systemMemory > 0)) throw new Error("AVANTIQO_VIDEO_V70B_SYSTEM_MEMORY_REQUIRED");
  return {
    physical_gpu: physicalGpu,
    reported_device_name: text(memory?.device_name),
    device_total_memory_gb: vram,
    system_memory_gb: systemMemory,
    exact_32gb_profile_proved: exact32,
    fallback_48gb_runtime_only: !exact32,
    bfloat16_supported: true,
    group_offload_type: "leaf_level",
  };
}

if (
  text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||
  text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT ||
  text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE
) {
  throw new Error("AVANTIQO_VIDEO_V70B_VALID_SAFE_LEASE_REQUIRED");
}

const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const queueKey = await queueCredential(endpointId);
const baseline = healthSummary(await queue(endpointId, "/health", queueKey.key));
if (baseline.jobs.in_queue !== 0 || baseline.jobs.in_progress !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V70B_QUEUE_NOT_CLEAN:${JSON.stringify(baseline)}`);
}

console.log(`AVANTIQO_VIDEO_V70B_CHILD_BASELINE=${JSON.stringify({
  endpoint_id: endpointId,
  endpoint_name: ENDPOINT_NAME,
  safe_lease_lane: SAFE_LEASE_LANE,
  queue_credential_source: queueKey.source,
  gpu_priority: APPROVED_RUNTIME_GPUS,
  generation_allowed: false,
  model_load_allowed: false,
})}`);

let submitted = null;
let submitAttempt = 0;
const propagationDeadline = Date.now() + 25_000;
while (!submitted) {
  submitAttempt += 1;
  try {
    submitted = await queue(endpointId, "/run", queueKey.key, {
      method: "POST",
      body: { input: { operation: "runtime_probe" } },
    });
  } catch (error) {
    const message = redact(error?.message || error);
    const retryable = /AVANTIQO_VIDEO_V70B_QUEUE_HTTP_409/i.test(message) &&
      /Endpoint is paused/i.test(message) && /max_workers=0/i.test(message);
    if (!retryable) throw error;
    if (Date.now() >= propagationDeadline) {
      throw new Error(`AVANTIQO_VIDEO_V70B_QUEUE_PROPAGATION_TIMEOUT:${submitAttempt}:${message}`);
    }
    console.log(`AVANTIQO_VIDEO_V70B_QUEUE_PROPAGATION_WAIT=${JSON.stringify({
      attempt: submitAttempt,
      retry_in_ms: 1000,
    })}`);
    await sleep(1_000);
  }
}

const jobId = text(submitted?.id || submitted?.jobId || submitted?.job_id);
if (!jobId) throw new Error("AVANTIQO_VIDEO_V70B_JOB_ID_REQUIRED");
console.log(`AVANTIQO_VIDEO_V70B_RUNTIME_PROBE_SUBMITTED=${JSON.stringify({ job_id: jobId, submit_attempts: submitAttempt })}`);

const started = Date.now();
let zeroWorkerQueuedSince = null;
let evidence = null;
while (Date.now() - started < STATUS_TIMEOUT_MS) {
  const [statusBody, healthBody] = await Promise.all([
    queue(endpointId, `/status/${encodeURIComponent(jobId)}`, queueKey.key),
    queue(endpointId, "/health", queueKey.key),
  ]);
  const status = text(statusBody?.status).toUpperCase();
  const health = healthSummary(healthBody);
  console.log(`AVANTIQO_VIDEO_V70B_PROGRESS=${JSON.stringify({
    elapsed_seconds: Math.floor((Date.now() - started) / 1000),
    status,
    health,
  })}`);

  if (status === "COMPLETED") {
    evidence = validateProbe(statusBody?.output ?? statusBody?.result);
    break;
  }
  if (TERMINAL.has(status)) {
    throw new Error(`AVANTIQO_VIDEO_V70B_RUNTIME_PROBE_${status}:${redact(statusBody?.error || statusBody?.message).slice(0, 900)}`);
  }
  if (health.workers.unhealthy > 0) {
    const cancelled = await cancel(endpointId, jobId, queueKey.key, "UNHEALTHY_WORKER");
    throw new Error(`AVANTIQO_VIDEO_V70B_UNHEALTHY_WORKER:${JSON.stringify(cancelled)}`);
  }
  if (status === "IN_QUEUE" && health.worker_total === 0) {
    zeroWorkerQueuedSince ??= Date.now();
    if (Date.now() - zeroWorkerQueuedSince >= ZERO_WORKER_QUEUE_TIMEOUT_MS) {
      const cancelled = await cancel(endpointId, jobId, queueKey.key, "IN_QUEUE_ZERO_WORKERS_TIMEOUT");
      throw new Error(`AVANTIQO_VIDEO_V70B_UNSCHEDULED_ZERO_WORKERS:${JSON.stringify(cancelled)}`);
    }
  } else {
    zeroWorkerQueuedSince = null;
  }
  await sleep(POLL_MS);
}

if (!evidence) {
  const cancelled = await cancel(endpointId, jobId, queueKey.key, "STATUS_TIMEOUT");
  throw new Error(`AVANTIQO_VIDEO_V70B_STATUS_TIMEOUT:${JSON.stringify(cancelled)}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: endpointId,
  endpoint_name: ENDPOINT_NAME,
  runtime_probe: evidence,
  exact_32gb_profile_proved: evidence.exact_32gb_profile_proved,
  fallback_48gb_runtime_only: evidence.fallback_48gb_runtime_only,
  generation_requested: false,
  inference_performed: false,
  model_load_performed: false,
  model_download_performed: false,
  storage_mutation_performed: false,
  scaling_mutation_performed_by_child: false,
  safe_lease_owns_scaling: true,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  secrets_printed: false,
  next_action: evidence.exact_32gb_profile_proved
    ? "V71_MODEL_LOAD_PROBE_ON_PROVEN_32GB_RUNTIME"
    : "RETRY_32GB_PLACEMENT_OR_CERTIFY_48GB_PROFILE_SEPARATELY",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
