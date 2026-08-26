import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_GPU_FALLBACK_REPAIR_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_GPU_FALLBACK_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_GPU_FALLBACK_APPROVED";

const RTX_SERVER = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const RTX_WORKSTATION = "NVIDIA RTX PRO 6000 Blackwell Workstation Edition";
const RTX_MAXQ = "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition";
const H200 = "NVIDIA H200";
const B200 = "NVIDIA B200";

const EXPECTED_SOURCE_GPU_TYPES = [RTX_SERVER, RTX_WORKSTATION, RTX_MAXQ];
const TARGET_GPU_TYPES = [RTX_SERVER, H200, B200];

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const approved = (name) => text(process.env[name]).toUpperCase() === "YES";

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") {
    throw new Error(`${CONTRACT}_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
    if (head !== expected) {
      throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    }
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  if (head !== remote) {
    throw new Error(`${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return { head, pinned: false };
}

function managementCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
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
  if (!response.ok || body === null) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, {
    timeoutMs: 20_000,
  });
}

async function controlWorkers(endpointId, key) {
  return requestJson(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    key,
    { timeoutMs: 20_000 },
  );
}

async function graphql(query, key) {
  const body = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query },
    timeoutMs: 30_000,
  });
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new Error(
      `${CONTRACT}_GRAPHQL:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 900)}`,
    );
  }
  return body?.data || {};
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name, code) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
}

function healthSummary(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
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

function activeControlWorkers(body = {}) {
  return list(body?.workers).filter((worker) => {
    const status = text(worker?.status).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    return ![status, desired].some((value) =>
      ["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value),
    );
  });
}

function arraysEqual(left, right) {
  return JSON.stringify(list(left)) === JSON.stringify(list(right));
}

function sortedUnique(value) {
  return [...new Set(list(value).map(text).filter(Boolean))].sort();
}

function stableEndpointSnapshot(endpoint = {}) {
  return {
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    compute_type: text(endpoint?.computeType) || null,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    gpu_count: finite(endpoint?.gpuCount),
    data_center_ids: sortedUnique(endpoint?.dataCenterIds),
    allowed_cuda_versions: sortedUnique(endpoint?.allowedCudaVersions),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    network_volume_ids: sortedUnique(endpoint?.networkVolumeIds),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    idle_timeout: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    flashboot: endpoint?.flashboot === true,
  };
}

function differentFields(left, right) {
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return fields.filter((field) => JSON.stringify(left[field]) !== JSON.stringify(right[field]));
}

async function loadLive(managementKey, runtimeKey) {
  const endpointsRaw = await rest(
    "/endpoints?includeTemplate=true&includeWorkers=true",
    managementKey,
  );
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
  const fast = resolveOne(endpoints, FAST_NAME, `${CONTRACT}_FAST_RESOLUTION_FAILED`);
  const deepId = text(deep?.id);
  const fastId = text(fast?.id);
  const [deepHealthRaw, fastHealthRaw, fastControlRaw] = await Promise.all([
    queueHealth(deepId, runtimeKey),
    queueHealth(fastId, runtimeKey),
    controlWorkers(fastId, managementKey),
  ]);
  return {
    deep,
    fast,
    deepId,
    fastId,
    deepHealth: healthSummary(deepHealthRaw),
    fastHealth: healthSummary(fastHealthRaw),
    fastControlWorkers: activeControlWorkers(fastControlRaw),
  };
}

function assertCanonicalParked(live, code) {
  const failures = [];
  if (finite(live.deep?.workersMin, -1) !== 0 || finite(live.deep?.workersMax, -1) !== 1) {
    failures.push("DEEP_NOT_CANONICAL");
  }
  if (finite(live.fast?.workersMin, -1) !== 0 || finite(live.fast?.workersMax, -1) !== 0) {
    failures.push("FAST_NOT_PARKED");
  }
  if (live.deepHealth.jobs.in_queue !== 0 || live.deepHealth.jobs.in_progress !== 0) {
    failures.push("DEEP_JOBS_ACTIVE");
  }
  if (live.fastHealth.jobs.in_queue !== 0 || live.fastHealth.jobs.in_progress !== 0) {
    failures.push("FAST_JOBS_ACTIVE");
  }
  if (
    live.fastControlWorkers.length !== 0 ||
    live.fastHealth.workers.initializing !== 0 ||
    live.fastHealth.workers.running !== 0 ||
    live.fastHealth.workers.ready !== 0 ||
    live.fastHealth.workers.idle !== 0
  ) {
    failures.push("FAST_WORKER_ACTIVE");
  }
  if (failures.length > 0) {
    throw new Error(`${code}:${failures.join(",")}`);
  }
}

const CAPACITY_QUERY = `
query AvantiqoFastGpuFallbackRepairCapacity {
  gpuTypes {
    id
    displayName
    memoryInGb
  }
  dataCenters {
    id
    name
    location
    gpuAvailability {
      gpuTypeId
      displayName
      stockStatus
    }
  }
}`;

function capacitySummary(data = {}) {
  const required = new Set(TARGET_GPU_TYPES);
  const types = list(data?.gpuTypes)
    .filter((row) => required.has(text(row?.id)))
    .map((row) => ({
      gpu_type_id: text(row?.id),
      display_name: text(row?.displayName) || null,
      memory_gb: finite(row?.memoryInGb),
    }));
  const availability = [];
  for (const dc of list(data?.dataCenters)) {
    for (const row of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(row?.gpuTypeId);
      if (!required.has(gpuTypeId)) continue;
      availability.push({
        gpu_type_id: gpuTypeId,
        data_center_id: text(dc?.id) || null,
        location: text(dc?.location || dc?.name) || null,
        stock_status: text(row?.stockStatus) || null,
      });
    }
  }
  return { types, availability };
}

function assertTargetCapacity(summary) {
  const byId = new Map(summary.types.map((row) => [row.gpu_type_id, row]));
  const h200 = byId.get(H200);
  const b200 = byId.get(B200);
  const rtx = byId.get(RTX_SERVER);
  if (!rtx || finite(rtx.memory_gb, 0) < 96) throw new Error(`${CONTRACT}_RTX_SERVER_CAPACITY_INVALID`);
  if (!h200 || finite(h200.memory_gb, 0) < 141) throw new Error(`${CONTRACT}_H200_CAPACITY_INVALID`);
  if (!b200 || finite(b200.memory_gb, 0) < 180) throw new Error(`${CONTRACT}_B200_CAPACITY_INVALID`);
  for (const gpuType of TARGET_GPU_TYPES) {
    if (!summary.availability.some((row) => row.gpu_type_id === gpuType)) {
      throw new Error(`${CONTRACT}_GPU_NOT_VISIBLE_IN_SERVERLESS_CAPACITY:${gpuType}`);
    }
  }
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL_ENV)) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const runtimeKey = runtimeCredential(managementKey);
const live = await loadLive(managementKey, runtimeKey);
assertCanonicalParked(live, `${CONTRACT}_CANONICAL_STATE_REQUIRED`);

const currentGpuTypes = list(live.fast?.gpuTypeIds).map(text).filter(Boolean);
const alreadyTarget = arraysEqual(currentGpuTypes, TARGET_GPU_TYPES);
const sourceMatchesExpected = arraysEqual(currentGpuTypes, EXPECTED_SOURCE_GPU_TYPES);
if (!alreadyTarget && !sourceMatchesExpected) {
  throw new Error(
    `${CONTRACT}_UNEXPECTED_SOURCE_GPU_TYPES:${JSON.stringify(currentGpuTypes)}`,
  );
}

const capacity = capacitySummary(await graphql(CAPACITY_QUERY, managementKey));
assertTargetCapacity(capacity);
const beforeStable = stableEndpointSnapshot(live.fast);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  fast_endpoint_id: live.fastId,
  current_gpu_type_ids: currentGpuTypes,
  target_gpu_type_ids: TARGET_GPU_TYPES,
  target_priority: {
    primary: RTX_SERVER,
    secondary: H200,
    tertiary: B200,
  },
  target_memory_floor_gb: {
    primary: 96,
    secondary: 141,
    tertiary: 180,
  },
  data_centers_unrestricted: sortedUnique(live.fast?.dataCenterIds).length === 0,
  live_target_gpu_capacity: capacity,
  canonical_deep_active_fast_parked: true,
  already_target: alreadyTarget,
  proposed_action: alreadyTarget ? "NONE" : "PATCH_FAST_GPU_PRIORITY_ONLY",
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  mutation_performed: false,
  secrets_in_output: false,
};

if (!apply || alreadyTarget) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=${alreadyTarget ? "ALREADY_REPAIRED" : "PLAN_READY"}`);
  process.exit(0);
}

await rest(`/endpoints/${encodeURIComponent(live.fastId)}`, managementKey, {
  method: "PATCH",
  body: { gpuTypeIds: TARGET_GPU_TYPES },
});

let verified = null;
let verificationError = null;
try {
  verified = await loadLive(managementKey, runtimeKey);
  assertCanonicalParked(verified, `${CONTRACT}_POST_PATCH_CANONICAL_STATE_REQUIRED`);
  const afterGpuTypes = list(verified.fast?.gpuTypeIds).map(text).filter(Boolean);
  if (!arraysEqual(afterGpuTypes, TARGET_GPU_TYPES)) {
    throw new Error(`${CONTRACT}_TARGET_GPU_TYPES_NOT_PERSISTED:${JSON.stringify(afterGpuTypes)}`);
  }
  const invariantDifferences = differentFields(beforeStable, stableEndpointSnapshot(verified.fast));
  if (invariantDifferences.length > 0) {
    throw new Error(`${CONTRACT}_INVARIANT_DIFFERENCES:${invariantDifferences.join(",")}`);
  }
} catch (error) {
  verificationError = error instanceof Error ? error : new Error(String(error));
}

if (verificationError) {
  let rollback = "NOT_ATTEMPTED";
  try {
    await rest(`/endpoints/${encodeURIComponent(live.fastId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: currentGpuTypes },
    });
    const rolledBack = await loadLive(managementKey, runtimeKey);
    assertCanonicalParked(rolledBack, `${CONTRACT}_ROLLBACK_CANONICAL_STATE_REQUIRED`);
    const rollbackGpuTypes = list(rolledBack.fast?.gpuTypeIds).map(text).filter(Boolean);
    const rollbackInvariants = differentFields(beforeStable, stableEndpointSnapshot(rolledBack.fast));
    rollback =
      arraysEqual(rollbackGpuTypes, currentGpuTypes) && rollbackInvariants.length === 0
        ? "PASS"
        : `FAIL:gpu_types=${JSON.stringify(rollbackGpuTypes)}:invariants=${rollbackInvariants.join(",") || "NONE"}`;
  } catch (rollbackError) {
    rollback = `FAIL:${redact(rollbackError instanceof Error ? rollbackError.message : rollbackError).slice(0, 700)}`;
  }
  throw new Error(
    `${CONTRACT}_VERIFY_FAILED:${redact(verificationError.message)}:rollback=${rollback}`,
  );
}

const finalGpuTypes = list(verified.fast?.gpuTypeIds).map(text).filter(Boolean);
console.log(
  JSON.stringify(
    {
      ...plan,
      mode: "APPLY",
      current_gpu_type_ids: currentGpuTypes,
      final_gpu_type_ids: finalGpuTypes,
      gpu_fallback_priority_repaired: true,
      canonical_deep_active_fast_parked_after: true,
      invariant_differences: [],
      mutation_performed: true,
      endpoint_mutation_performed: true,
      generation_submitted: false,
      inference_performed: false,
      gpu_activation_performed: false,
      queue_mutation_performed: false,
      template_mutation_performed: false,
      production_deploy_performed: false,
      next_action: "RUN_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_ON_FALLBACK_GPU_PRIORITY",
    },
    null,
    2,
  ),
);
console.log(`${CONTRACT}=PASS`);
