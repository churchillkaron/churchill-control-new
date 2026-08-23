import { readFile, writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const inferenceKey = required("RUNPOD_API_KEY");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const staleJobId = String(
  process.env.INVESTOR_SCENE9_PROVIDER_JOB_ID ||
    "7149b284-b209-417f-acb6-71b4112e116c-e1",
).trim();
const repairEnabled = flag("AVANTIQO_CINEMA_RUNPOD_REPAIR");
const restoreMinOnly = flag("AVANTIQO_CINEMA_RUNPOD_RESTORE_MIN");
const cancelStale = flag("AVANTIQO_CINEMA_CANCEL_STALE_JOB");
const maxWaitMs = Math.max(
  30_000,
  Number(process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_WAIT_MS || 15 * 60 * 1000),
);
const backupPath =
  process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_BACKUP ||
  "/tmp/avantiqo-cinema-runpod-repair-backup.json";
const resultPath =
  process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT ||
  "/tmp/avantiqo-cinema-runpod-repair-result.json";

const TARGET_OVERRIDES = Object.freeze({
  AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES: "ai.video.generate",
  AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED: "0",
  AVANTIQO_VIDEO_I2V_MODEL: "",
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function flag(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ""));
}

function text(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEnv(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function sanitizedEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_name: text(endpoint.template?.name) || null,
    template_image: text(endpoint.template?.imageName) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds : [],
    network_volume_id: text(endpoint.networkVolumeId) || null,
    template_env_keys: Object.keys(normalizeEnv(endpoint.template?.env)).sort(),
    workers: Array.isArray(endpoint.workers)
      ? endpoint.workers.map((worker) => ({
          id_present: Boolean(text(worker?.id)),
          desired_status: text(worker?.desiredStatus) || null,
          last_status_change: text(worker?.lastStatusChange) || null,
          gpu: text(worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
        }))
      : [],
  };
}

function sanitizedHealth(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue) ?? 0,
      in_progress: finite(jobs.inProgress ?? jobs.in_progress) ?? 0,
      completed: finite(jobs.completed) ?? 0,
      failed: finite(jobs.failed) ?? 0,
    },
    workers: {
      idle: finite(workers.idle) ?? 0,
      initializing: finite(workers.initializing) ?? 0,
      ready: finite(workers.ready) ?? 0,
      running: finite(workers.running) ?? 0,
      throttled: finite(workers.throttled) ?? 0,
    },
  };
}

function queueSummary(body = {}) {
  return {
    job_id: staleJobId || null,
    status: text(body?.status) || null,
    delay_ms: finite(body?.delayTime),
    execution_ms: finite(body?.executionTime),
    worker_id_present: Boolean(text(body?.workerId)),
    has_error: Boolean(body?.error || body?.output?.error),
  };
}

async function request(url, options = {}, credential = managementKey) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function getEndpoint() {
  return request(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  );
}

async function listEndpoints() {
  const body = await request(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`);
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return body;
}

async function getTemplate(templateId) {
  return request(`${REST_BASE}/templates/${encodeURIComponent(templateId)}`);
}

async function updateTemplate(template, env) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb) ?? 50,
    dockerEntrypoint: Array.isArray(template.dockerEntrypoint) ? template.dockerEntrypoint : [],
    dockerStartCmd: Array.isArray(template.dockerStartCmd) ? template.dockerStartCmd : [],
    env,
    imageName: requiredTemplateField(template.imageName, "RUNPOD_TEMPLATE_IMAGE_REQUIRED"),
    isPublic: template.isPublic === true,
    name: requiredTemplateField(template.name, "RUNPOD_TEMPLATE_NAME_REQUIRED"),
    ports: Array.isArray(template.ports) ? template.ports : [],
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb) ?? 20,
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  if (text(template.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  }
  return request(`${REST_BASE}/templates/${encodeURIComponent(template.id)}/update`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function requiredTemplateField(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

async function patchWorkersMin(value) {
  return request(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: JSON.stringify({ workersMin: Number(value) }),
  });
}

async function health() {
  return request(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    { method: "GET" },
    inferenceKey,
  );
}

async function staleStatus() {
  if (!staleJobId) return null;
  return request(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(staleJobId)}`,
    { method: "GET" },
    inferenceKey,
  );
}

async function cancelStaleJob() {
  if (!staleJobId) return null;
  return request(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(staleJobId)}`,
    { method: "POST" },
    inferenceKey,
  );
}

async function writeResult(result) {
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`AVANTIQO_CINEMA_RUNPOD_RESULT_PATH=${resultPath}`);
}

async function restoreMinimumWorker() {
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  const original = Number(backup?.endpoint?.workers_min);
  if (!Number.isFinite(original) || original < 0) {
    throw new Error("RUNPOD_REPAIR_BACKUP_WORKERS_MIN_INVALID");
  }
  await patchWorkersMin(original);
  const result = {
    success: true,
    contract: "AVANTIQO_CINEMA_RUNPOD_WORKER_REPAIR_V3",
    mode: "RESTORE_MINIMUM_WORKER",
    endpoint_id: endpointId,
    workers_min_restored_to: original,
    generation_submitted: false,
    external_ai_provider_used: false,
  };
  await writeResult(result);
  console.log(`AVANTIQO_CINEMA_RUNPOD_WORKERS_MIN_RESTORED=${original}`);
}

if (restoreMinOnly) {
  await restoreMinimumWorker();
  process.exit(0);
}

const endpointBefore = await getEndpoint();
if (text(endpointBefore.id) !== endpointId) throw new Error("RUNPOD_VIDEO_ENDPOINT_ID_MISMATCH");
const templateId = text(endpointBefore.templateId || endpointBefore.template?.id);
if (!templateId) throw new Error("RUNPOD_VIDEO_TEMPLATE_ID_REQUIRED");
const template = await getTemplate(templateId);
if (text(template.id) !== templateId) throw new Error("RUNPOD_VIDEO_TEMPLATE_BINDING_MISMATCH");
const endpoints = await listEndpoints();
const consumers = endpoints.filter((entry) => text(entry?.templateId) === templateId);
if (consumers.length !== 1 || text(consumers[0]?.id) !== endpointId) {
  throw new Error(`RUNPOD_SHARED_TEMPLATE_REPAIR_BLOCKED:${consumers.length}`);
}

let staleBefore = null;
try {
  staleBefore = await staleStatus();
} catch (error) {
  if (!String(error?.message || "").startsWith("RUNPOD_HTTP_404:")) throw error;
}
const healthBefore = await health();
const templateEnv = normalizeEnv(template.env);
const backup = {
  contract: "AVANTIQO_CINEMA_RUNPOD_REPAIR_BACKUP_V3",
  created_at: new Date().toISOString(),
  endpoint: {
    id: endpointId,
    workers_min: finite(endpointBefore.workersMin) ?? 0,
    workers_max: finite(endpointBefore.workersMax),
    version: finite(endpointBefore.version),
    template_id: templateId,
  },
  modified_template_keys: Object.fromEntries(
    Object.keys(TARGET_OVERRIDES).map((key) => [
      key,
      {
        present: Object.prototype.hasOwnProperty.call(templateEnv, key),
        value: Object.prototype.hasOwnProperty.call(templateEnv, key) ? templateEnv[key] : null,
      },
    ]),
  ),
};
await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(`AVANTIQO_CINEMA_RUNPOD_BACKUP=${backupPath}`);
console.log(`AVANTIQO_CINEMA_ENDPOINT_BEFORE=${JSON.stringify(sanitizedEndpoint(endpointBefore))}`);
console.log(`AVANTIQO_CINEMA_HEALTH_BEFORE=${JSON.stringify(sanitizedHealth(healthBefore))}`);
console.log(`AVANTIQO_CINEMA_STALE_JOB_BEFORE=${JSON.stringify(queueSummary(staleBefore || {}))}`);

if (!repairEnabled) {
  await writeResult({
    success: true,
    contract: "AVANTIQO_CINEMA_RUNPOD_WORKER_REPAIR_V3",
    mode: "DRY_RUN",
    endpoint: sanitizedEndpoint(endpointBefore),
    health: sanitizedHealth(healthBefore),
    stale_job: queueSummary(staleBefore || {}),
    generation_submitted: false,
    external_ai_provider_used: false,
  });
  process.exit(0);
}

let staleCancelled = false;
const staleState = text(staleBefore?.status).toUpperCase();
if (cancelStale && ["IN_QUEUE", "IN_PROGRESS"].includes(staleState)) {
  const cancelled = await cancelStaleJob();
  staleCancelled = ["CANCELLED", "CANCELED"].includes(text(cancelled?.status).toUpperCase());
  console.log(`AVANTIQO_CINEMA_STALE_JOB_CANCELLED=${staleCancelled ? "YES" : "NO"}`);
}

const repairedEnv = { ...templateEnv, ...TARGET_OVERRIDES };
await updateTemplate(template, repairedEnv);
console.log("AVANTIQO_CINEMA_RUNPOD_TEMPLATE_UPDATE=APPLIED");
console.log("AVANTIQO_CINEMA_RUNPOD_MODE=T2V_ONLY_FAIL_CLOSED");

const originalMin = finite(endpointBefore.workersMin) ?? 0;
if (originalMin < 1) {
  await patchWorkersMin(1);
  console.log("AVANTIQO_CINEMA_RUNPOD_TEMPORARY_WORKERS_MIN=1");
}

const started = Date.now();
let last = "";
let ready = false;
let finalEndpoint = endpointBefore;
let finalHealth = healthBefore;
while (Date.now() - started < maxWaitMs) {
  await sleep(5000);
  finalEndpoint = await getEndpoint();
  finalHealth = await health();
  const safeHealth = sanitizedHealth(finalHealth);
  const workerCount =
    safeHealth.workers.idle + safeHealth.workers.ready + safeHealth.workers.running;
  const signature = JSON.stringify({
    version: finite(finalEndpoint.version),
    health: safeHealth,
  });
  if (signature !== last) {
    console.log(`AVANTIQO_CINEMA_RUNPOD_PROGRESS=${signature}`);
    last = signature;
  }
  if (workerCount > 0) {
    ready = true;
    break;
  }
}

const result = {
  success: ready,
  contract: "AVANTIQO_CINEMA_RUNPOD_WORKER_REPAIR_V3",
  mode: "REPAIR_AND_WARM",
  endpoint_before: sanitizedEndpoint(endpointBefore),
  endpoint_after: sanitizedEndpoint(finalEndpoint),
  health_before: sanitizedHealth(healthBefore),
  health_after: sanitizedHealth(finalHealth),
  stale_job_cancelled: staleCancelled,
  stale_job_id_present: Boolean(staleJobId),
  t2v_only_fail_closed: true,
  temporary_workers_min: originalMin < 1 ? 1 : originalMin,
  original_workers_min: originalMin,
  backup_path: backupPath,
  generation_submitted: false,
  external_ai_provider_used: false,
  secrets_in_output: false,
};
await writeResult(result);
if (!ready) throw new Error("AVANTIQO_CINEMA_WORKER_NOT_READY_AFTER_REPAIR");
console.log("AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=READY");
