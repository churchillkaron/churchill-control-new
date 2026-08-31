#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_BASE = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_GPU_POOL_WIDEN_V1";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const MIN_VRAM_GB = 80;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const RESULT_PATH = resolve(
  process.env.AVANTIQO_VIDEO_GPU_POOL_WIDEN_RESULT ||
    "artifacts/avantiqo-video-gpu-pool-widen.json",
);

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) =>
  ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map((entry) =>
      text(
        typeof entry === "string"
          ? entry
          : entry?.networkVolumeId ?? entry?.network_volume_id ?? entry?.id,
      ),
    ),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function workerActive(worker = {}) {
  const current = text(
    worker.status ?? worker.workerStatus ?? worker.runtimeStatus,
  ).toUpperCase();
  const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
  if (current) return !TERMINAL.has(current);
  if (desired) return !TERMINAL.has(desired);
  return true;
}

function queueState(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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

function stockRank(value) {
  return {
    HIGH: 5,
    MEDIUM: 4,
    LOW: 3,
    AVAILABLE: 2,
    UNAVAILABLE: 0,
  }[text(value).toUpperCase()] ?? 1;
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    workers_min: finite(endpoint.workersMin ?? endpoint.workers_min),
    workers_max: finite(endpoint.workersMax ?? endpoint.workers_max),
    gpu_type_ids: list(endpoint.gpuTypeIds ?? endpoint.gpu_type_ids)
      .map(text)
      .filter(Boolean),
    network_volume_ids: endpointVolumeIds(endpoint),
    active_management_workers: list(endpoint.workers).filter(workerActive).length,
  };
}

async function requestJson(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "User-Agent": "AvantiqoVideoGpuPoolWiden/1.0",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
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
    const detail = text(body?.message || body?.error || body?.detail || raw)
      .replace(/\s+/g, " ")
      .slice(0, 600);
    const error = new Error(
      `${CONTRACT}_HTTP_${response.status}:${detail || "UNKNOWN"}`,
    );
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function graphql(query, variables, credential) {
  const response = await requestJson(
    `${GRAPHQL_BASE}?api_key=${encodeURIComponent(credential)}`,
    credential,
    {
      method: "POST",
      body: { query, variables },
      timeoutMs: 30_000,
    },
  );
  const errors = list(response?.errors)
    .map((entry) => text(entry?.message))
    .filter(Boolean);
  if (errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${errors.join(" | ").slice(0, 600)}`);
  }
  if (!response?.data) throw new Error(`${CONTRACT}_GRAPHQL_DATA_REQUIRED`);
  return response.data;
}

async function writeResult(value) {
  await mkdir(dirname(RESULT_PATH), { recursive: true });
  await writeFile(RESULT_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`AVANTIQO_VIDEO_GPU_POOL_WIDEN_RESULT=${RESULT_PATH}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required(
  "RUNPOD_API_KEY",
  process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || managementKey,
);
const endpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const approved = yes(process.env.AVANTIQO_VIDEO_GPU_POOL_WIDEN_APPROVED);

const inventoryQuery = `
query AvantiqoVideoGpuPool($input: GpuAvailabilityInput) {
  gpuTypes {
    id
    memoryInGb
    secureCloud
  }
  dataCenters {
    id
    gpuAvailability(input: $input) {
      available
      stockStatus
      gpuTypeId
    }
  }
}`;

let result = {
  success: false,
  contract: CONTRACT,
  mode: approved ? "APPLY" : "PLAN",
  minimum_vram_gb: MIN_VRAM_GB,
  policy: "ALL_NVIDIA_SECURE_CLOUD_80GB_PLUS_IN_ATTACHED_DATACENTER",
  endpoint_name_expected: ENDPOINT_NAME,
  endpoint_id_present: true,
  endpoint_before: null,
  endpoint_after: null,
  datacenter_id: null,
  added_gpu_type_ids: [],
  target_gpu_type_ids: [],
  eligible_inventory: [],
  excluded_small_gpu_examples: [
    {
      gpu_type: "NVIDIA GeForce RTX 4090",
      reason: "24GB_BELOW_NATIVE_4K_DFR_FAST_LANE_MINIMUM",
    },
    {
      gpu_type: "NVIDIA L40S",
      reason: "48GB_BELOW_NATIVE_4K_DFR_FAST_LANE_MINIMUM",
    },
  ],
  workers_min_changed: false,
  workers_max_changed: false,
  network_volume_changed: false,
  generation_submitted: false,
  inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  mutation_performed: false,
  secrets_printed: false,
  error_code: null,
};

try {
  const [endpointBefore, rawVolumes, healthBefore] = await Promise.all([
    requestJson(
      `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    ),
    requestJson(`${REST_BASE}/networkvolumes`, managementKey),
    requestJson(
      `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
      inferenceKey,
      { timeoutMs: 20_000 },
    ),
  ]);

  if (text(endpointBefore.id) !== endpointId) {
    throw new Error(`${CONTRACT}_ENDPOINT_ID_MISMATCH`);
  }
  if (text(endpointBefore.name) !== ENDPOINT_NAME) {
    throw new Error(
      `${CONTRACT}_ENDPOINT_NAME_MISMATCH:${text(endpointBefore.name) || "MISSING"}`,
    );
  }

  const safeBefore = safeEndpoint(endpointBefore);
  result.endpoint_before = safeBefore;

  const queueBefore = queueState(healthBefore);
  const queueWorkerCount = Object.values(queueBefore.workers).reduce(
    (sum, value) => sum + finite(value, 0),
    0,
  );
  if (
    queueBefore.in_queue !== 0 ||
    queueBefore.in_progress !== 0 ||
    safeBefore.active_management_workers !== 0 ||
    queueWorkerCount !== 0
  ) {
    throw new Error(
      `${CONTRACT}_ENDPOINT_BUSY_NO_MUTATION:queue=${queueBefore.in_queue}:progress=${queueBefore.in_progress}:management_workers=${safeBefore.active_management_workers}:health_workers=${queueWorkerCount}`,
    );
  }

  const volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]);
  const volumeIds = safeBefore.network_volume_ids;
  if (!volumeIds.length) throw new Error(`${CONTRACT}_NETWORK_VOLUME_REQUIRED`);
  const attachedVolumes = volumes.filter((volume) =>
    volumeIds.includes(text(volume?.id)),
  );
  if (attachedVolumes.length !== volumeIds.length) {
    throw new Error(
      `${CONTRACT}_NETWORK_VOLUME_RESOLUTION_FAILED:${attachedVolumes.length}/${volumeIds.length}`,
    );
  }
  const dataCenters = [
    ...new Set(
      attachedVolumes
        .map((volume) => text(volume?.dataCenterId ?? volume?.data_center_id))
        .filter(Boolean),
    ),
  ];
  if (dataCenters.length !== 1) {
    throw new Error(`${CONTRACT}_SINGLE_DATACENTER_REQUIRED:${dataCenters.length}`);
  }
  const dataCenterId = dataCenters[0];
  result.datacenter_id = dataCenterId;

  const inventory = await graphql(
    inventoryQuery,
    {
      input: {
        gpuCount: 1,
        minDisk: 5,
        minMemoryInGb: MIN_VRAM_GB,
        secureCloud: true,
      },
    },
    managementKey,
  );

  const gpuTypes = list(inventory.gpuTypes);
  const dc = list(inventory.dataCenters).find(
    (entry) => text(entry?.id) === dataCenterId,
  );
  if (!dc) throw new Error(`${CONTRACT}_DATACENTER_INVENTORY_REQUIRED:${dataCenterId}`);

  const availabilityByGpu = new Map(
    list(dc.gpuAvailability)
      .map((entry) => [text(entry?.gpuTypeId), entry])
      .filter(([gpuTypeId]) => Boolean(gpuTypeId)),
  );

  const eligible = gpuTypes
    .map((gpu) => {
      const gpuTypeId = text(gpu?.id);
      const availability = availabilityByGpu.get(gpuTypeId) || null;
      return {
        gpu_type_id: gpuTypeId,
        memory_gb: finite(gpu?.memoryInGb, 0),
        secure_cloud: gpu?.secureCloud === true,
        available_now: availability?.available === true,
        stock_status: text(availability?.stockStatus).toUpperCase() || "UNAVAILABLE",
      };
    })
    .filter(
      (gpu) =>
        /^NVIDIA\b/i.test(gpu.gpu_type_id) &&
        gpu.memory_gb >= MIN_VRAM_GB &&
        gpu.secure_cloud === true &&
        availabilityByGpu.has(gpu.gpu_type_id),
    )
    .sort((left, right) => {
      if (left.available_now !== right.available_now) return left.available_now ? -1 : 1;
      const stockDelta = stockRank(right.stock_status) - stockRank(left.stock_status);
      if (stockDelta) return stockDelta;
      const memoryDelta = right.memory_gb - left.memory_gb;
      if (memoryDelta) return memoryDelta;
      return left.gpu_type_id.localeCompare(right.gpu_type_id);
    });

  if (!eligible.length) {
    throw new Error(`${CONTRACT}_NO_COMPATIBLE_80GB_PLUS_GPU_INVENTORY`);
  }
  result.eligible_inventory = eligible;

  const current = safeBefore.gpu_type_ids;
  if (!current.length) throw new Error(`${CONTRACT}_CURRENT_GPU_POOL_REQUIRED`);
  const additional = eligible
    .map((gpu) => gpu.gpu_type_id)
    .filter((gpuTypeId) => !current.includes(gpuTypeId));
  const target = [...current, ...additional];
  result.added_gpu_type_ids = additional;
  result.target_gpu_type_ids = target;

  if (!approved) {
    result.success = true;
    await writeResult(result);
    console.log(`${CONTRACT}=PLAN_PASS`);
    process.exit(0);
  }

  if (additional.length) {
    await requestJson(
      `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`,
      managementKey,
      {
        method: "PATCH",
        body: { gpuTypeIds: target },
        timeoutMs: 30_000,
      },
    );
    result.mutation_performed = true;
  }

  let endpointAfter = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    endpointAfter = await requestJson(
      `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    const afterPool = list(endpointAfter?.gpuTypeIds).map(text).filter(Boolean);
    if (target.every((gpuTypeId) => afterPool.includes(gpuTypeId))) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2500));
  }
  if (!endpointAfter) throw new Error(`${CONTRACT}_POST_PATCH_ENDPOINT_REQUIRED`);

  const safeAfter = safeEndpoint(endpointAfter);
  result.endpoint_after = safeAfter;
  if (!target.every((gpuTypeId) => safeAfter.gpu_type_ids.includes(gpuTypeId))) {
    throw new Error(`${CONTRACT}_POST_PATCH_GPU_POOL_VERIFY_FAILED`);
  }
  if (safeAfter.workers_min !== safeBefore.workers_min) {
    result.workers_min_changed = true;
    throw new Error(`${CONTRACT}_WORKERS_MIN_DRIFT`);
  }
  if (safeAfter.workers_max !== safeBefore.workers_max) {
    result.workers_max_changed = true;
    throw new Error(`${CONTRACT}_WORKERS_MAX_DRIFT`);
  }
  if (
    JSON.stringify([...safeAfter.network_volume_ids].sort()) !==
    JSON.stringify([...safeBefore.network_volume_ids].sort())
  ) {
    result.network_volume_changed = true;
    throw new Error(`${CONTRACT}_NETWORK_VOLUME_DRIFT`);
  }

  const healthAfter = await requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    inferenceKey,
    { timeoutMs: 20_000 },
  );
  const queueAfter = queueState(healthAfter);
  if (queueAfter.in_queue !== 0 || queueAfter.in_progress !== 0) {
    throw new Error(
      `${CONTRACT}_POST_PATCH_QUEUE_NOT_IDLE:${queueAfter.in_queue}/${queueAfter.in_progress}`,
    );
  }

  result.success = true;
  await writeResult(result);
  console.log(`AVANTIQO_VIDEO_GPU_POOL_BEFORE=${current.join(" | ")}`);
  console.log(`AVANTIQO_VIDEO_GPU_POOL_ADDED=${additional.join(" | ") || "NONE"}`);
  console.log(`AVANTIQO_VIDEO_GPU_POOL_AFTER=${safeAfter.gpu_type_ids.join(" | ")}`);
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  result.error_code = text(error?.message).split(":")[0] || `${CONTRACT}_UNKNOWN`;
  result.error_detail = text(error?.message).slice(0, 800);
  await writeResult(result).catch(() => null);
  console.error(`${CONTRACT}=FAIL:${result.error_code}`);
  throw error;
}
