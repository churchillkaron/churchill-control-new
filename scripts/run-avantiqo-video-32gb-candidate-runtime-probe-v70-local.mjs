#!/usr/bin/env node

import { open, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  VIDEO_32GB_CANDIDATE_APPROVED_GPUS,
  VIDEO_32GB_CANDIDATE_DATA_CENTER,
  VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  VIDEO_32GB_CANDIDATE_ENTRYPOINT_REVISION,
  VIDEO_32GB_CANDIDATE_MEMORY_CONTRACT,
  VIDEO_32GB_CANDIDATE_POOL_ID,
  VIDEO_32GB_CANDIDATE_QUALITY_CONTRACT,
  VIDEO_32GB_CANDIDATE_RUNTIME_REVISION,
  VIDEO_I2V_MODEL,
  VIDEO_T2V_MODEL,
  activeManagementWorkers,
  assertVideoProductionUnchanged,
  finite,
  inspectVideo32gbCandidate,
  managementHourlyCost,
  runpodRest,
  stableEndpointSnapshot,
  text,
  workersMax,
  workersMin,
} from "./lib/avantiqo-video-32gb-candidate-contract-v69.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNTIME_PROBE_V70";
const APPROVAL_ENV = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNTIME_PROBE_V70_APPROVED";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const STATUS_TIMEOUT_MS = 10 * 60 * 1000;
const ZERO_WORKER_QUEUE_TIMEOUT_MS = 4 * 60 * 1000;
const CLEANUP_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_MS = 5_000;
const LOCK_FILE = path.join(os.tmpdir(), "avantiqo-video-32gb-candidate-v70.lock");
const TERMINAL_JOB = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);
const TERMINAL_WORKER = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const approved = (value) => text(value).toUpperCase() === "YES";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeHardware = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function queueRequest(endpointId, pathname, key, options = {}) {
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
    const detail = redact(body?.error || body?.message || body?.detail || raw).slice(0, 900);
    throw new Error(`AVANTIQO_VIDEO_V70_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
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

async function selectQueueKey(endpointId) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", text(process.env.RUNPOD_MANAGEMENT_API_KEY)],
  ];
  const seen = new Set();
  const failures = [];
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const health = await queueRequest(endpointId, "/health", key);
      return { source, key, health: healthSummary(health) };
    } catch (error) {
      failures.push({ source, error: redact(error?.message).slice(0, 250) });
    }
  }
  throw new Error(`AVANTIQO_VIDEO_V70_QUEUE_CREDENTIAL_REQUIRED:${JSON.stringify(failures)}`);
}

async function supabaseActiveVideoLeases() {
  const base = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const now = encodeURIComponent(new Date().toISOString());
  const response = await fetch(
    `${base}/rest/v1/avantiqo_video_runpod_leases?select=id,lane,endpoint_id,endpoint_name,state,expires_at&state=eq.ACTIVE&expires_at=gt.${now}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Cache-Control": "no-store",
      },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || !Array.isArray(body)) {
    throw new Error(`AVANTIQO_VIDEO_V70_DURABLE_LEASE_READ_FAILED:${response.status}`);
  }
  return body;
}

async function patchScaling(endpointId, managementKey, workersMaxValue) {
  await runpodRest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: workersMaxValue },
  });
  const endpoint = await runpodRest(
    managementKey,
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
  if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== workersMaxValue) {
    throw new Error(`AVANTIQO_VIDEO_V70_SCALE_VERIFY_FAILED:${workersMin(endpoint)}/${workersMax(endpoint)}`);
  }
  return endpoint;
}

function activeWorkers(endpoint = {}) {
  return (Array.isArray(endpoint?.workers) ? endpoint.workers : []).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !TERMINAL_WORKER.has(status)) return true;
    if (desired && !TERMINAL_WORKER.has(desired)) return true;
    return !status && !desired;
  });
}

async function waitForRest(endpointId, managementKey, queueKey) {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const [endpoint, healthRaw] = await Promise.all([
      runpodRest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
      queueRequest(endpointId, "/health", queueKey).catch(() => null),
    ]);
    const health = healthRaw ? healthSummary(healthRaw) : null;
    latest = {
      endpoint,
      health,
      active_workers: activeWorkers(endpoint).length,
      hourly_cost_usd: managementHourlyCost(endpoint),
    };
    if (
      workersMin(endpoint) === 0 &&
      workersMax(endpoint) === 0 &&
      latest.active_workers === 0 &&
      latest.hourly_cost_usd === 0 &&
      (!health || (health.jobs.in_queue === 0 && health.jobs.in_progress === 0 && health.worker_total === 0))
    ) return latest;
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_VIDEO_V70_CLEANUP_TIMEOUT:${JSON.stringify({
    workers_min: workersMin(latest?.endpoint),
    workers_max: workersMax(latest?.endpoint),
    active_workers: latest?.active_workers ?? null,
    hourly_cost_usd: latest?.hourly_cost_usd ?? null,
    health: latest?.health || null,
  })}`);
}

async function cancelJob(endpointId, jobId, queueKey, reason) {
  if (!jobId) return { attempted: false, reason };
  try {
    const result = await queueRequest(endpointId, `/cancel/${encodeURIComponent(jobId)}`, queueKey, { method: "POST" });
    return { attempted: true, success: true, reason, status: text(result?.status) || null };
  } catch (error) {
    return { attempted: true, success: false, reason, error: redact(error?.message).slice(0, 400) };
  }
}

function approvedPhysicalGpu(deviceName) {
  const normalized = normalizeHardware(deviceName);
  return VIDEO_32GB_CANDIDATE_APPROVED_GPUS.find((candidate) => {
    const expected = normalizeHardware(candidate);
    return normalized === expected || normalized.includes(expected.replace(/^nvidia/, ""));
  }) || null;
}

function validateProbe(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("AVANTIQO_VIDEO_V70_PROBE_OUTPUT_INVALID");
  }
  if (text(output?.probe_contract) !== "AVANTIQO_VIDEO_RUNTIME_PROBE_V1") {
    throw new Error(`AVANTIQO_VIDEO_V70_PROBE_CONTRACT_INVALID:${text(output?.probe_contract)}`);
  }
  if (
    output?.generation_requested !== false ||
    output?.inference_performed !== false ||
    output?.model_download_performed !== false ||
    output?.storage_mutation_performed !== false
  ) {
    throw new Error("AVANTIQO_VIDEO_V70_PROBE_MUTATION_OR_INFERENCE_FORBIDDEN");
  }
  if (text(output?.entrypoint) !== "handler_v5.py") {
    throw new Error(`AVANTIQO_VIDEO_V70_ENTRYPOINT_INVALID:${text(output?.entrypoint)}`);
  }
  if (text(output?.entrypoint_revision) !== VIDEO_32GB_CANDIDATE_ENTRYPOINT_REVISION) {
    throw new Error("AVANTIQO_VIDEO_V70_ENTRYPOINT_REVISION_INVALID");
  }
  if (text(output?.runtime_revision) !== VIDEO_32GB_CANDIDATE_RUNTIME_REVISION) {
    throw new Error("AVANTIQO_VIDEO_V70_RUNTIME_REVISION_INVALID");
  }
  if (text(output?.quality_contract) !== VIDEO_32GB_CANDIDATE_QUALITY_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_V70_QUALITY_CONTRACT_INVALID");
  }
  if (text(output?.memory_contract) !== VIDEO_32GB_CANDIDATE_MEMORY_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_V70_MEMORY_CONTRACT_INVALID");
  }
  if (
    text(output?.configured_text_to_video_foundation) !== VIDEO_T2V_MODEL ||
    text(output?.configured_image_to_video_foundation) !== VIDEO_I2V_MODEL ||
    output?.text_to_video_default_foundation !== true ||
    output?.image_to_video_default_foundation !== true ||
    output?.require_cached_model !== true
  ) {
    throw new Error("AVANTIQO_VIDEO_V70_FOUNDATION_ROUTING_INVALID");
  }
  for (const [label, foundation, model] of [
    ["T2V", output?.foundations?.text_to_video, VIDEO_T2V_MODEL],
    ["I2V", output?.foundations?.image_to_video, VIDEO_I2V_MODEL],
  ]) {
    if (
      text(foundation?.model) !== model ||
      foundation?.cache_ready !== true ||
      foundation?.cache_path_present !== true ||
      foundation?.completion_marker_valid !== true ||
      !text(foundation?.snapshot_revision)
    ) {
      throw new Error(`AVANTIQO_VIDEO_V70_${label}_CACHE_NOT_READY`);
    }
  }
  const memory = output?.memory_profile || {};
  const physicalGpu = approvedPhysicalGpu(memory?.device_name);
  if (!physicalGpu) {
    throw new Error(`AVANTIQO_VIDEO_V70_PHYSICAL_GPU_NOT_APPROVED:${text(memory?.device_name) || "MISSING"}`);
  }
  const vram = finite(memory?.device_total_memory_gb, null);
  if (
    finite(memory?.target_minimum_vram_gb, null) !== 32 ||
    memory?.cuda_available !== true ||
    !(vram >= 30 && vram < 40) ||
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
    throw new Error(`AVANTIQO_VIDEO_V70_MEMORY_PROFILE_INVALID:${JSON.stringify(memory)}`);
  }
  const systemMemory = finite(memory?.system_memory_gb, null);
  if (!(systemMemory > 0)) {
    throw new Error("AVANTIQO_VIDEO_V70_SYSTEM_MEMORY_REQUIRED");
  }
  return {
    physical_gpu: physicalGpu,
    reported_device_name: text(memory?.device_name),
    device_total_memory_gb: vram,
    system_memory_gb: systemMemory,
    bfloat16_supported: true,
    group_offload_type: text(memory?.group_offload_type),
  };
}

if (!approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const productionEndpointId = required("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID");
let lock = null;
let inspected = null;
let endpointId = "";
let queueCredential = null;
let scalingOpened = false;
let jobId = "";
let jobTerminal = false;
let probeEvidence = null;
let failure = null;
let finalState = null;
let productionAfter = null;

try {
  lock = await open(LOCK_FILE, "wx", 0o600);
  await lock.writeFile(`${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`, "utf8");

  const activeDurableVideoLeases = await supabaseActiveVideoLeases();
  if (activeDurableVideoLeases.length) {
    throw new Error(`AVANTIQO_VIDEO_V70_ACTIVE_VIDEO_DURABLE_LEASE:${activeDurableVideoLeases.length}`);
  }

  inspected = await inspectVideo32gbCandidate({ managementKey, productionEndpointId });
  endpointId = text(inspected?.candidate_endpoint?.id);
  if (!endpointId) throw new Error("AVANTIQO_VIDEO_V70_CANDIDATE_ENDPOINT_ID_REQUIRED");
  if (inspected?.candidate_serverless_pool_id !== VIDEO_32GB_CANDIDATE_POOL_ID) {
    throw new Error("AVANTIQO_VIDEO_V70_CANDIDATE_POOL_INVALID");
  }
  if (workersMin(inspected?.candidate_endpoint) !== 0 || workersMax(inspected?.candidate_endpoint) !== 0) {
    throw new Error("AVANTIQO_VIDEO_V70_CANDIDATE_NOT_PARKED");
  }
  if (activeManagementWorkers(inspected?.candidate_endpoint).length || managementHourlyCost(inspected?.candidate_endpoint) !== 0) {
    throw new Error("AVANTIQO_VIDEO_V70_CANDIDATE_ACTIVE_BEFORE_PROBE");
  }

  queueCredential = await selectQueueKey(endpointId);
  if (
    queueCredential.health.jobs.in_queue !== 0 ||
    queueCredential.health.jobs.in_progress !== 0 ||
    queueCredential.health.worker_total !== 0
  ) {
    throw new Error(`AVANTIQO_VIDEO_V70_CANDIDATE_QUEUE_NOT_CLEAN:${JSON.stringify(queueCredential.health)}`);
  }

  console.log(`AVANTIQO_VIDEO_V70_BASELINE=${JSON.stringify({
    endpoint_id: endpointId,
    endpoint_name: VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
    serverless_pool_id: VIDEO_32GB_CANDIDATE_POOL_ID,
    data_center_id: VIDEO_32GB_CANDIDATE_DATA_CENTER,
    approved_physical_gpus: VIDEO_32GB_CANDIDATE_APPROVED_GPUS,
    workers_min: 0,
    workers_max: 0,
    queue_credential_source: queueCredential.source,
    generation_allowed: false,
    model_load_allowed: false,
  })}`);

  await patchScaling(endpointId, managementKey, 1);
  scalingOpened = true;

  const submitted = await queueRequest(endpointId, "/run", queueCredential.key, {
    method: "POST",
    body: { input: { operation: "runtime_probe" } },
  });
  jobId = text(submitted?.id || submitted?.jobId || submitted?.job_id);
  if (!jobId) throw new Error("AVANTIQO_VIDEO_V70_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_VIDEO_V70_RUNTIME_PROBE_SUBMITTED=${jobId}`);

  const started = Date.now();
  let zeroWorkerQueuedSince = null;
  let latestStatus = null;
  let latestHealth = queueCredential.health;
  while (Date.now() - started < STATUS_TIMEOUT_MS) {
    latestStatus = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, queueCredential.key);
    const status = text(latestStatus?.status).toUpperCase();
    latestHealth = healthSummary(await queueRequest(endpointId, "/health", queueCredential.key));
    console.log(`AVANTIQO_VIDEO_V70_PROGRESS=${JSON.stringify({
      elapsed_seconds: Math.floor((Date.now() - started) / 1000),
      status,
      health: latestHealth,
    })}`);

    if (status === "COMPLETED") {
      jobTerminal = true;
      probeEvidence = validateProbe(latestStatus?.output ?? latestStatus?.result);
      break;
    }
    if (TERMINAL_JOB.has(status)) {
      jobTerminal = true;
      throw new Error(`AVANTIQO_VIDEO_V70_RUNTIME_PROBE_TERMINAL_${status}:${redact(latestStatus?.error || latestStatus?.output || latestStatus?.message).slice(0, 900)}`);
    }
    if (status === "IN_QUEUE" && latestHealth.worker_total === 0) {
      zeroWorkerQueuedSince ??= Date.now();
      if (Date.now() - zeroWorkerQueuedSince >= ZERO_WORKER_QUEUE_TIMEOUT_MS) {
        const cancel = await cancelJob(endpointId, jobId, queueCredential.key, "IN_QUEUE_ZERO_WORKERS_TIMEOUT");
        jobTerminal = cancel?.success === true;
        throw new Error(`AVANTIQO_VIDEO_V70_UNSCHEDULED_ZERO_WORKERS:${JSON.stringify(cancel)}`);
      }
    } else {
      zeroWorkerQueuedSince = null;
    }
    if (latestHealth.workers.unhealthy > 0) {
      const cancel = await cancelJob(endpointId, jobId, queueCredential.key, "UNHEALTHY_WORKER");
      jobTerminal = cancel?.success === true;
      throw new Error(`AVANTIQO_VIDEO_V70_UNHEALTHY_WORKER:${JSON.stringify(cancel)}`);
    }
    await sleep(POLL_MS);
  }
  if (!probeEvidence) {
    const cancel = await cancelJob(endpointId, jobId, queueCredential.key, "STATUS_TIMEOUT");
    jobTerminal = cancel?.success === true;
    throw new Error(`AVANTIQO_VIDEO_V70_STATUS_TIMEOUT:${JSON.stringify(cancel)}`);
  }
} catch (error) {
  failure = error;
} finally {
  if (endpointId && jobId && !jobTerminal && queueCredential?.key) {
    await cancelJob(endpointId, jobId, queueCredential.key, "V70_FAILURE_CLEANUP");
  }
  if (endpointId && scalingOpened) {
    try { await patchScaling(endpointId, managementKey, 0); }
    catch (error) { if (!failure) failure = error; }
  }
  if (endpointId && queueCredential?.key) {
    try { finalState = await waitForRest(endpointId, managementKey, queueCredential.key); }
    catch (error) { if (!failure) failure = error; }
  }
  if (inspected) {
    try {
      productionAfter = await assertVideoProductionUnchanged({
        managementKey,
        productionEndpointId,
        before: inspected.production_endpoint_snapshot,
      });
    } catch (error) {
      if (!failure) failure = error;
    }
  }
  if (lock) await lock.close().catch(() => {});
  await unlink(LOCK_FILE).catch(() => {});
}

const success = Boolean(
  !failure &&
  probeEvidence &&
  finalState &&
  workersMin(finalState.endpoint) === 0 &&
  workersMax(finalState.endpoint) === 0 &&
  finalState.active_workers === 0 &&
  finalState.hourly_cost_usd === 0 &&
  productionAfter,
);

console.log(JSON.stringify({
  success,
  contract: CONTRACT,
  endpoint_name: VIDEO_32GB_CANDIDATE_ENDPOINT_NAME,
  endpoint_id: endpointId || null,
  serverless_pool_id: inspected?.candidate_serverless_pool_id || null,
  approved_runtime_gpu_types: [...VIDEO_32GB_CANDIDATE_APPROVED_GPUS],
  runtime_probe: probeEvidence,
  queue_credential_source: queueCredential?.source || null,
  scaling_opened_0_1: scalingOpened,
  generation_requested: false,
  inference_performed: false,
  model_load_performed: false,
  model_download_performed: false,
  storage_mutation_performed: false,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  safe_lease_modified: false,
  production_endpoint_mutation_performed: false,
  production_endpoint_after: productionAfter,
  final_candidate_state: finalState ? {
    endpoint: stableEndpointSnapshot(finalState.endpoint),
    health: finalState.health,
    active_workers: finalState.active_workers,
    hourly_cost_usd: finalState.hourly_cost_usd,
  } : null,
  permanent_rest_state: "0/0",
  transient_worker_spend_possible: true,
  secrets_printed: false,
  failure: failure ? redact(failure?.message).slice(0, 1200) : null,
  next_action: success ? "V71_MODEL_LOAD_PROBE_ONLY" : "FIX_V70_BEFORE_MODEL_LOAD",
}, null, 2));
console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
if (!success) process.exit(3);
