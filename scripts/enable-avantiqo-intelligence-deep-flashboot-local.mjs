const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_FLASHBOOT_ACTIVATION_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-v1";
const EXPECTED_ENDPOINT_ID = "wis31stihqk0yo";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_DEEP_FLASHBOOT_APPROVED";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map((value) => text(value, 500)).filter(Boolean))].sort();

function yes(value) {
  return ["YES", "TRUE", "1", "ON", "APPROVED"].includes(text(value, 40).toUpperCase());
}

function managementKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 8000);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function queueKey(management) {
  const value = text(
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY ||
      process.env.RUNPOD_API_KEY ||
      management,
    8000,
  );
  if (!value) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY_REQUIRED");
  return value;
}

function redact(value) {
  return text(value, 1800)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bhf_[A-Za-z0-9]{8,}\b/g, "hf_[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body;
}

const rest = (path, key, options = {}) => requestJson(`${REST_BASE}${path}`, key, options);
const health = (endpointId, key) => requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20000 });

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function flashBootEnabled(endpoint = {}) {
  return endpoint.flashboot === true ||
    endpoint.flashBoot === true ||
    text(endpoint.flashBootType, 100).toUpperCase() === "FLASHBOOT";
}

function activeManagementWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 100).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 100).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
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

function assertParked(endpoint, summary, label) {
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${label}_SCALING_0_0_REQUIRED`);
  }
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${label}_QUEUE_NOT_EMPTY`);
  }
  if (activeManagementWorkers(endpoint).length || Object.values(summary.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${label}_ACTIVE_WORKER_PRESENT`);
  }
}

function volumeIds(endpoint = {}) {
  return unique([
    endpoint?.networkVolumeId,
    ...list(endpoint?.networkVolumeIds).map((entry) => typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id),
  ]);
}

function stable(endpoint = {}) {
  return {
    id: text(endpoint?.id, 300),
    name: text(endpoint?.name, 300),
    template_id: text(endpoint?.templateId || endpoint?.template?.id, 300),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 200) || null,
    scaler_value: finite(endpoint?.scalerValue),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: unique(list(endpoint?.gpuTypeIds)),
    allowed_cuda_versions: unique(list(endpoint?.allowedCudaVersions)),
    minimum_cuda_version: text(endpoint?.minCudaVersion, 100) || null,
    network_volume_ids: volumeIds(endpoint),
    data_center_ids: unique(list(endpoint?.dataCenterIds)),
  };
}

function assertIdentity(endpoint) {
  if (text(endpoint?.id, 300) !== EXPECTED_ENDPOINT_ID) {
    throw new Error(`${CONTRACT}_ENDPOINT_ID_MISMATCH`);
  }
  if (text(endpoint?.name, 300) !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_ENDPOINT_NAME_MISMATCH`);
  }
  if (!text(endpoint?.templateId || endpoint?.template?.id, 300)) {
    throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);
  }
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const management = managementKey();
const runtime = queueKey(management);
const endpointPath = `/endpoints/${encodeURIComponent(EXPECTED_ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`;

const before = await rest(endpointPath, management);
assertIdentity(before);
const beforeHealth = healthSummary(await health(EXPECTED_ENDPOINT_ID, runtime));
assertParked(before, beforeHealth, `${CONTRACT}_PREFLIGHT`);
const beforeStable = stable(before);
const alreadyEnabled = flashBootEnabled(before);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: ENDPOINT_NAME,
  before: { ...beforeStable, flashboot_enabled: alreadyEnabled },
  health: beforeHealth,
  requested_change: { flashboot: true },
  one_variable_only: true,
  workers_remain_0_0: true,
  inference_performed: false,
  generation_submitted: false,
  gpu_worker_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply || alreadyEnabled) {
  console.log(`${CONTRACT}=${alreadyEnabled ? "ALREADY_ENABLED" : "PLAN_READY"}`);
  process.exit(0);
}

const fresh = await rest(endpointPath, management);
assertIdentity(fresh);
const freshHealth = healthSummary(await health(EXPECTED_ENDPOINT_ID, runtime));
assertParked(fresh, freshHealth, `${CONTRACT}_PREPATCH`);
if (JSON.stringify(stable(fresh)) !== JSON.stringify(beforeStable)) {
  throw new Error(`${CONTRACT}_ENDPOINT_CHANGED_REPLAN_REQUIRED`);
}
if (flashBootEnabled(fresh)) {
  console.log(`${CONTRACT}=ALREADY_ENABLED_AFTER_RECHECK`);
  process.exit(0);
}

await rest(`/endpoints/${encodeURIComponent(EXPECTED_ENDPOINT_ID)}`, management, {
  method: "PATCH",
  body: { flashboot: true },
});

const after = await rest(endpointPath, management);
assertIdentity(after);
const afterHealth = healthSummary(await health(EXPECTED_ENDPOINT_ID, runtime));
assertParked(after, afterHealth, `${CONTRACT}_POSTPATCH`);
if (!flashBootEnabled(after)) {
  throw new Error(`${CONTRACT}_FLASHBOOT_VERIFY_FAILED`);
}
if (JSON.stringify(stable(after)) !== JSON.stringify(beforeStable)) {
  throw new Error(`${CONTRACT}_NON_FLASHBOOT_FIELD_CHANGED`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  mutation_performed: true,
  after: { ...stable(after), flashboot_enabled: true },
  health: afterHealth,
  verified_one_variable_change: "FLASHBOOT_ONLY",
  workers_remain_0_0: true,
  inference_performed: false,
  generation_submitted: false,
  gpu_worker_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
  next_action: "MEASURE_ONE_COLD_BOOT_THEN_FLASHBOOT_RESUME_BEFORE_CACHE_TEMPLATE_CHANGES",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
