#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

const REQUIRED_NODE_MAJOR = 24;
const SELF_PATH = fileURLToPath(import.meta.url);

function text(value) {
  return String(value ?? "").trim();
}

function nodeMajor(version) {
  const match = text(version).replace(/^v/i, "").match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function probeNode(executable) {
  const candidate = text(executable);
  if (!candidate) return null;
  const result = spawnSync(candidate, ["--version"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return null;
  const version = text(result.stdout);
  return nodeMajor(version) >= REQUIRED_NODE_MAJOR ? { executable: candidate, version } : null;
}

function resolveNode24() {
  const candidates = [];
  const explicit = text(process.env.AVANTIQO_NODE24_BIN);
  if (explicit) candidates.push(explicit);

  const nvm = spawnSync(
    "/bin/zsh",
    ["-lc", 'source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1 && nvm which 24'],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (!nvm.error && nvm.status === 0 && text(nvm.stdout)) candidates.push(text(nvm.stdout));

  candidates.push(
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/opt/node@24/bin/node",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "node24",
  );

  for (const candidate of [...new Set(candidates)]) {
    const resolved = probeNode(candidate);
    if (resolved) return resolved;
  }
  return null;
}

if (nodeMajor(process.versions.node) < REQUIRED_NODE_MAJOR) {
  if (process.env.AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NODE24_REEXEC === "1") {
    throw new Error(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NODE24_REEXEC_FAILED:current=${process.version}`);
  }
  const node24 = resolveNode24();
  if (!node24) {
    throw new Error(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NODE24_REQUIRED:current=${process.version}`);
  }
  console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NODE_REEXEC=${process.version}->${node24.version}`);
  const reexec = spawnSync(node24.executable, [SELF_PATH, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NODE24_REEXEC: "1",
    },
    stdio: "inherit",
  });
  if (reexec.error) throw reexec.error;
  process.exit(Number.isInteger(reexec.status) ? reexec.status : 1);
}

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const MIN_SHARED_VOLUME_GB = 80;
const MIN_GPU_MEMORY_GB = 24;
const CONTRACT = "AVANTIQO_MUSIC_EXISTING_JOB_CAPACITY_UNBLOCK_V1";
const POLL_MS = Math.max(5_000, Number(process.env.AVANTIQO_MUSIC_CAPACITY_UNBLOCK_POLL_MS || 10_000));
const MAX_WAIT_MS = Math.max(
  POLL_MS,
  Number(process.env.AVANTIQO_MUSIC_CAPACITY_UNBLOCK_WAIT_MS || 20 * 60 * 1000),
);
const REQUEST_TIMEOUT_MS = 30_000;
const FLEX_24GB_GPU_TYPES = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
]);
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function jobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_MUSIC_GENERATION_JOB_ID);
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function healthSummary(health = {}) {
  const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
  const workers = health?.workers && typeof health.workers === "object" ? health.workers : {};
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    initializing: finite(workers.initializing),
    ready: finite(workers.ready),
    running: finite(workers.running),
    idle: finite(workers.idle),
    throttled: finite(workers.throttled),
    unhealthy: finite(workers.unhealthy),
  };
}

function activeJobCount(health) {
  const summary = healthSummary(health);
  return summary.queued + summary.in_progress;
}

function workerHasStarted(health) {
  const summary = healthSummary(health);
  return summary.initializing + summary.ready + summary.running + summary.idle > 0;
}

async function requestJson(url, init, label) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 800) || "EMPTY_BODY"}`,
    );
  }
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(
    `${REST_BASE}${path}`,
    {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    "RUNPOD_REST",
  );
}

async function queue(endpointId, path, key) {
  return requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    },
    "RUNPOD_QUEUE",
  );
}

async function discoverFlexCapacity(managementKey, dataCenterId) {
  const query = `
    query AvantiqoMusicQueuedJobCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        storageSupport
        gpuAvailability(input: $input) {
          available
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
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MIN_GPU_MEMORY_GB,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1000);
    throw new Error(`RUNPOD_CAPACITY_DISCOVERY_FAILED:${response.status}:${detail || "EMPTY_BODY"}`);
  }
  const dataCenters = body?.data?.dataCenters;
  if (!Array.isArray(dataCenters)) throw new Error("RUNPOD_CAPACITY_DISCOVERY_INVALID");
  const dataCenter = dataCenters.find((entry) => text(entry?.id) === dataCenterId);
  if (!dataCenter || dataCenter.storageSupport !== true) {
    throw new Error(`AVANTIQO_MUSIC_CACHE_DATACENTER_UNAVAILABLE:${dataCenterId}`);
  }
  const available = list(dataCenter.gpuAvailability)
    .filter((gpu) => gpu && typeof gpu === "object")
    .filter((gpu) => gpu.available === true)
    .filter((gpu) => !["NONE", "UNAVAILABLE", ""].includes(text(gpu.stockStatus).toUpperCase()))
    .map((gpu) => text(gpu.gpuTypeId))
    .filter((gpuTypeId) => FLEX_24GB_GPU_TYPES.includes(gpuTypeId));
  return unique(available);
}

const jobId = jobIdFromArgs();
if (!jobId) throw new Error("AVANTIQO_MUSIC_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);

console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_JOB=${jobId}`);
console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_EXISTING_JOB_ONLY=true");
console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_CACHE_MOVED=false");
console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_ECONOMICS_CLASS=RUNPOD_24GB_FLEX");

const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) =>
  configuredEndpointId
    ? text(endpoint?.id) === configuredEndpointId && text(endpoint?.name) === AUDIO_ENDPOINT_NAME
    : text(endpoint?.name) === AUDIO_ENDPOINT_NAME,
);
if (matches.length !== 1) throw new Error(`AVANTIQO_MUSIC_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
const endpoint = matches[0];
const endpointId = text(endpoint?.id);
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
const baselineGpuTypes = list(endpoint?.gpuTypeIds);
const baselineVolumeIds = endpointVolumeIds(endpoint);
const baselineWorkersMin = finite(endpoint?.workersMin, -1);
const baselineWorkersMax = finite(endpoint?.workersMax, -1);
if (!endpointId || !templateId) throw new Error("AVANTIQO_MUSIC_ENDPOINT_TEMPLATE_ID_REQUIRED");
if (baselineVolumeIds.length !== 1) throw new Error(`AVANTIQO_MUSIC_SINGLE_SHARED_VOLUME_REQUIRED:count=${baselineVolumeIds.length}`);
if (baselineWorkersMin !== 0 || baselineWorkersMax !== 1) {
  throw new Error(`AVANTIQO_MUSIC_SCALING_BASELINE_INVALID:min=${baselineWorkersMin}:max=${baselineWorkersMax}`);
}
if (!baselineGpuTypes.length || baselineGpuTypes.some((gpu) => !FLEX_24GB_GPU_TYPES.includes(gpu))) {
  throw new Error(`AVANTIQO_MUSIC_GPU_ECONOMICS_CLASS_MISMATCH:${baselineGpuTypes.join("|") || "NONE"}`);
}

const [volumes, initialJob, initialHealth] = await Promise.all([
  rest("/networkvolumes", managementKey),
  queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
  queue(endpointId, "/health", inferenceKey),
]);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
const sharedVolume = volumes.find((volume) => text(volume?.id) === baselineVolumeIds[0]);
if (!sharedVolume) throw new Error("AVANTIQO_MUSIC_SHARED_VOLUME_LOOKUP_FAILED");
if (text(sharedVolume?.name) !== SHARED_VOLUME_NAME) {
  throw new Error(`AVANTIQO_MUSIC_SHARED_VOLUME_NAME_MISMATCH:${text(sharedVolume?.name) || "MISSING"}`);
}
if (finite(sharedVolume?.size, 0) < MIN_SHARED_VOLUME_GB) {
  throw new Error(`AVANTIQO_MUSIC_SHARED_VOLUME_CAPACITY_INVALID:${finite(sharedVolume?.size, 0)}`);
}
const dataCenterId = text(sharedVolume?.dataCenterId);
if (!dataCenterId) throw new Error("AVANTIQO_MUSIC_SHARED_VOLUME_DATACENTER_REQUIRED");

let status = text(initialJob?.status).toUpperCase();
if (!["IN_QUEUE", "IN_PROGRESS", ...TERMINAL].includes(status)) {
  throw new Error(`AVANTIQO_MUSIC_JOB_STATUS_UNEXPECTED:${status || "UNKNOWN"}`);
}
if (!TERMINAL.has(status) && activeJobCount(initialHealth) !== 1) {
  throw new Error(`AVANTIQO_MUSIC_ACTIVE_JOB_COUNT_UNSAFE:${activeJobCount(initialHealth)}`);
}

console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_ENDPOINT=${endpointId}`);
console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_CACHE_DATACENTER=${dataCenterId}`);
console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_BASELINE_GPU_TYPES=${baselineGpuTypes.join("|")}`);
console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_INITIAL_STATUS=${status}`);
console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_INITIAL_HEALTH=${JSON.stringify(healthSummary(initialHealth))}`);

let expandedGpuTypes = baselineGpuTypes;
let gpuPoolExpanded = false;
let body = initialJob;

async function verifyInvariantEndpoint(live) {
  if (text(live?.id) !== endpointId || text(live?.name) !== AUDIO_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_MUSIC_ENDPOINT_IDENTITY_CHANGED");
  }
  if (text(live?.templateId || live?.template?.id) !== templateId) {
    throw new Error("AVANTIQO_MUSIC_TEMPLATE_CHANGED");
  }
  if (!sameSet(endpointVolumeIds(live), baselineVolumeIds)) {
    throw new Error("AVANTIQO_MUSIC_SHARED_VOLUME_BINDING_CHANGED");
  }
  if (finite(live?.workersMin, -1) !== baselineWorkersMin || finite(live?.workersMax, -1) !== baselineWorkersMax) {
    throw new Error("AVANTIQO_MUSIC_SCALING_CHANGED");
  }
}

async function restoreBaseline(reason) {
  const live = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  await verifyInvariantEndpoint(live);
  if (sameSet(list(live?.gpuTypeIds), baselineGpuTypes)) {
    console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_BASELINE_ALREADY_RESTORED=${reason}`);
    return;
  }
  if (!sameSet(list(live?.gpuTypeIds), expandedGpuTypes)) {
    throw new Error(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_RESTORE_REFUSED_GPU_POOL_CHANGED:${list(live?.gpuTypeIds).join("|")}`);
  }
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: baselineGpuTypes },
  });
  const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  await verifyInvariantEndpoint(verified);
  if (!sameSet(list(verified?.gpuTypeIds), baselineGpuTypes)) {
    throw new Error("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_RESTORE_VERIFY_FAILED");
  }
  console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_BASELINE_RESTORED=${reason}`);
}

const deadline = Date.now() + MAX_WAIT_MS;
let lastProgressAt = 0;

try {
  while (!TERMINAL.has(status)) {
    if (Date.now() >= deadline) {
      if (gpuPoolExpanded) {
        const healthAtTimeout = await queue(endpointId, "/health", inferenceKey);
        if (!workerHasStarted(healthAtTimeout)) {
          await restoreBaseline("WAIT_TIMEOUT");
          gpuPoolExpanded = false;
        } else {
          console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_TIMEOUT_RESTORE_DEFERRED_ACTIVE_WORKER=true");
        }
      }
      throw new Error(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_WAIT_TIMEOUT:${jobId}:status=${status}`);
    }

    const [liveEndpoint, liveJob, liveHealth] = await Promise.all([
      rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
      queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
      queue(endpointId, "/health", inferenceKey),
    ]);
    await verifyInvariantEndpoint(liveEndpoint);
    body = liveJob;
    status = text(liveJob?.status).toUpperCase();

    if (!TERMINAL.has(status) && activeJobCount(liveHealth) !== 1) {
      throw new Error(`AVANTIQO_MUSIC_ACTIVE_JOB_COUNT_CHANGED:${activeJobCount(liveHealth)}`);
    }

    if (status === "IN_QUEUE" && !workerHasStarted(liveHealth) && !gpuPoolExpanded) {
      const availableFlex = await discoverFlexCapacity(managementKey, dataCenterId);
      const candidateGpuTypes = unique([...baselineGpuTypes, ...availableFlex]);
      if (!sameSet(candidateGpuTypes, baselineGpuTypes)) {
        const [beforeWriteEndpoint, beforeWriteJob, beforeWriteHealth] = await Promise.all([
          rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
          queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
          queue(endpointId, "/health", inferenceKey),
        ]);
        await verifyInvariantEndpoint(beforeWriteEndpoint);
        if (text(beforeWriteJob?.status).toUpperCase() === "IN_QUEUE" && !workerHasStarted(beforeWriteHealth)) {
          if (activeJobCount(beforeWriteHealth) !== 1) {
            throw new Error(`AVANTIQO_MUSIC_ACTIVE_JOB_COUNT_CHANGED_BEFORE_WRITE:${activeJobCount(beforeWriteHealth)}`);
          }
          if (!sameSet(list(beforeWriteEndpoint?.gpuTypeIds), baselineGpuTypes)) {
            throw new Error("AVANTIQO_MUSIC_GPU_POOL_CHANGED_BEFORE_WRITE");
          }
          await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
            method: "PATCH",
            body: { gpuTypeIds: candidateGpuTypes },
          });
          const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
          await verifyInvariantEndpoint(verified);
          if (!sameSet(list(verified?.gpuTypeIds), candidateGpuTypes)) {
            throw new Error("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_GPU_POOL_VERIFY_FAILED");
          }
          expandedGpuTypes = candidateGpuTypes;
          gpuPoolExpanded = true;
          console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_GPU_POOL_EXPANDED=${candidateGpuTypes.join("|")}`);
          console.log("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NEW_JOB_SUBMITTED=false");
        }
      } else if (Date.now() - lastProgressAt >= 30_000) {
        console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_NO_ADDITIONAL_FLEX_STOCK=true available=${availableFlex.join("|") || "NONE"}`);
      }
    }

    if (Date.now() - lastProgressAt >= 30_000 || status !== "IN_QUEUE") {
      console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_PROGRESS status=${status || "UNKNOWN"} health=${JSON.stringify(healthSummary(liveHealth))}`);
      lastProgressAt = Date.now();
    }

    if (!TERMINAL.has(status)) await sleep(POLL_MS);
  }

  if (gpuPoolExpanded) {
    await restoreBaseline(`TERMINAL_${status}`);
    gpuPoolExpanded = false;
  }
} catch (error) {
  if (gpuPoolExpanded) {
    try {
      const health = await queue(endpointId, "/health", inferenceKey);
      if (!workerHasStarted(health)) {
        await restoreBaseline("ERROR_WITHOUT_ACTIVE_WORKER");
        gpuPoolExpanded = false;
      } else {
        console.error("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_ERROR_RESTORE_DEFERRED_ACTIVE_WORKER=true");
      }
    } catch (restoreError) {
      console.error(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_RESTORE_ERROR=${text(restoreError?.message || restoreError).slice(0, 1000)}`);
    }
  }
  throw error;
}

console.log(`AVANTIQO_MUSIC_CAPACITY_UNBLOCK_TERMINAL_STATUS=${status}`);
console.log(JSON.stringify({
  success: status === "COMPLETED",
  contract: CONTRACT,
  job_id: jobId,
  final_status: status,
  existing_job_only: true,
  new_job_submitted: false,
  cache_moved: false,
  template_mutation: false,
  shared_volume_id: baselineVolumeIds[0],
  shared_volume_data_center_id: dataCenterId,
  baseline_gpu_types: baselineGpuTypes,
  temporary_gpu_types: sameSet(expandedGpuTypes, baselineGpuTypes) ? null : expandedGpuTypes,
  baseline_gpu_pool_restored: true,
  economics_class_preserved: true,
  production_deploy: false,
}, null, 2));

if (status !== "COMPLETED") process.exitCode = 2;
