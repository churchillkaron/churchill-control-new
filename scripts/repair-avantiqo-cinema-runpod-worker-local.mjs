import { writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const providerJobId = String(
  process.env.INVESTOR_SCENE9_PROVIDER_JOB_ID ||
    "7149b284-b209-417f-acb6-71b4112e116c-e1",
).trim();
const repairEnabled = /^(1|true|yes|on)$/i.test(
  String(process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR || ""),
);
const maxWaitMs = Math.max(
  30_000,
  Number(process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_WAIT_MS || 10 * 60 * 1000),
);
const backupPath =
  process.env.AVANTIQO_CINEMA_RUNPOD_REPAIR_BACKUP ||
  "/tmp/avantiqo-cinema-runpod-repair-backup.json";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEnv(value) {
  if (!value) return {};
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((entry) => entry && typeof entry === "object" && entry.key)
        .map((entry) => [String(entry.key), String(entry.value ?? "")]),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [String(key), String(child ?? "")]),
    );
  }
  return {};
}

function sanitizeWorker(worker = {}) {
  return {
    id: worker.id || worker.workerId || worker.podId || null,
    desired_status: worker.desiredStatus || null,
    status: worker.status || worker.runtimeStatus || null,
    last_started_at: worker.lastStartedAt || null,
    gpu: worker.gpu?.displayName || worker.gpu?.id || worker.gpuTypeId || null,
    data_center_id: worker.dataCenterId || null,
  };
}

function sanitizeEndpoint(endpoint = {}) {
  const endpointEnv = normalizeEnv(endpoint.env);
  const templateEnv = normalizeEnv(endpoint.template?.env);
  return {
    id: endpoint.id || null,
    name: endpoint.name || null,
    version: endpoint.version ?? null,
    template_id: endpoint.templateId || endpoint.template?.id || null,
    template_name: endpoint.template?.name || null,
    template_image: endpoint.template?.imageName || endpoint.template?.image || null,
    workers_min: endpoint.workersMin ?? null,
    workers_max: endpoint.workersMax ?? null,
    scaler_type: endpoint.scalerType || null,
    scaler_value: endpoint.scalerValue ?? null,
    gpu_type_ids: endpoint.gpuTypeIds || null,
    data_center_ids: endpoint.dataCenterIds || null,
    network_volume_ids: endpoint.networkVolumeIds ||
      (endpoint.networkVolumeId ? [endpoint.networkVolumeId] : []),
    endpoint_env_keys: Object.keys(endpointEnv).sort(),
    template_env_keys: Object.keys(templateEnv).sort(),
    workers: Array.isArray(endpoint.workers)
      ? endpoint.workers.map(sanitizeWorker)
      : [],
  };
}

async function runpodFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    const message =
      body?.message || body?.error || body?.detail || raw || "UNKNOWN_RUNPOD_ERROR";
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${typeof message === "string" ? message.slice(0, 1000) : JSON.stringify(message).slice(0, 1000)}`,
    );
  }
  return body;
}

async function listEndpoints() {
  const body = await runpodFetch(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
  );
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return body;
}

async function endpoint() {
  const endpoints = await listEndpoints();
  const found = endpoints.find((entry) => String(entry?.id || "") === endpointId);
  if (!found) throw new Error(`RUNPOD_VIDEO_ENDPOINT_NOT_FOUND:${endpointId}`);
  return found;
}

async function template(templateId) {
  return runpodFetch(
    `${REST_BASE}/templates/${encodeURIComponent(templateId)}?includeEndpointBoundTemplates=true`,
  );
}

async function queueStatus() {
  if (!providerJobId) return null;
  return runpodFetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(providerJobId)}`,
  );
}

function queueSummary(body = {}) {
  return {
    job_id: providerJobId || null,
    status: body?.status || null,
    delay_ms: Number.isFinite(Number(body?.delayTime)) ? Number(body.delayTime) : null,
    execution_ms: Number.isFinite(Number(body?.executionTime))
      ? Number(body.executionTime)
      : null,
    worker_id: body?.workerId || null,
    has_error: Boolean(body?.error || body?.output?.error),
  };
}

function templateUpdateFallbackPayload(currentTemplate, env) {
  const payload = { env };
  for (const key of [
    "name",
    "imageName",
    "containerDiskInGb",
    "volumeInGb",
    "volumeMountPath",
    "dockerEntrypoint",
    "dockerStartCmd",
    "ports",
    "isPublic",
    "containerRegistryAuthId",
  ]) {
    if (currentTemplate?.[key] !== undefined && currentTemplate?.[key] !== null) {
      payload[key] = currentTemplate[key];
    }
  }
  return payload;
}

async function updateTemplate(templateId, currentTemplate, env) {
  const url = `${REST_BASE}/templates/${encodeURIComponent(templateId)}/update`;
  try {
    return await runpodFetch(url, {
      method: "POST",
      body: JSON.stringify({ env }),
    });
  } catch (error) {
    if (!/^RUNPOD_HTTP_(400|422):/.test(String(error?.message || ""))) throw error;
    return runpodFetch(url, {
      method: "POST",
      body: JSON.stringify(templateUpdateFallbackPayload(currentTemplate, env)),
    });
  }
}

const beforeEndpoint = await endpoint();
const beforeSanitized = sanitizeEndpoint(beforeEndpoint);
console.log("AVANTIQO_CINEMA_RUNPOD_ENDPOINT_BEFORE");
console.log(JSON.stringify(beforeSanitized, null, 2));

const beforeQueue = await queueStatus();
console.log("AVANTIQO_CINEMA_SCENE9_QUEUE_BEFORE");
console.log(JSON.stringify(queueSummary(beforeQueue), null, 2));

const templateId = beforeEndpoint.templateId || beforeEndpoint.template?.id;
if (!templateId) throw new Error("RUNPOD_VIDEO_TEMPLATE_ID_REQUIRED");
const currentTemplate = await template(templateId);
const templateEnv = normalizeEnv(currentTemplate?.env);
const endpointEnv = normalizeEnv(beforeEndpoint?.env);

const conflictingEndpointOverrides = Object.keys(TARGET_OVERRIDES).filter(
  (key) => Object.prototype.hasOwnProperty.call(endpointEnv, key),
);
if (conflictingEndpointOverrides.length) {
  throw new Error(
    `RUNPOD_ENDPOINT_ENV_OVERRIDE_BLOCKS_SAFE_TEMPLATE_REPAIR:${conflictingEndpointOverrides.join(",")}`,
  );
}

const backup = {
  contract: "AVANTIQO_CINEMA_RUNPOD_REPAIR_BACKUP_V1",
  endpoint_id: endpointId,
  template_id: templateId,
  created_at: new Date().toISOString(),
  modified_keys: Object.fromEntries(
    Object.keys(TARGET_OVERRIDES).map((key) => [
      key,
      {
        present: Object.prototype.hasOwnProperty.call(templateEnv, key),
        value: Object.prototype.hasOwnProperty.call(templateEnv, key)
          ? templateEnv[key]
          : null,
      },
    ]),
  ),
};
await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(`AVANTIQO_CINEMA_RUNPOD_BACKUP=${backupPath}`);

if (!repairEnabled) {
  console.log("AVANTIQO_CINEMA_RUNPOD_REPAIR=DRY_RUN");
  console.log(
    "Set AVANTIQO_CINEMA_RUNPOD_REPAIR=1 to apply the guarded T2V-only rolling repair.",
  );
  process.exit(0);
}

const repairedEnv = {
  ...templateEnv,
  ...TARGET_OVERRIDES,
};
await updateTemplate(templateId, currentTemplate, repairedEnv);
console.log("AVANTIQO_CINEMA_RUNPOD_TEMPLATE_UPDATE=APPLIED");
console.log("AVANTIQO_CINEMA_RUNPOD_MODE=T2V_ONLY_FAIL_CLOSED");

const started = Date.now();
let lastEndpointVersion = beforeEndpoint.version ?? null;
let lastQueueStatus = String(beforeQueue?.status || "");
while (Date.now() - started < maxWaitMs) {
  await sleep(5000);
  const currentEndpoint = await endpoint();
  const currentQueue = await queueStatus();
  const currentVersion = currentEndpoint.version ?? null;
  const currentStatus = String(currentQueue?.status || "");
  if (currentVersion !== lastEndpointVersion || currentStatus !== lastQueueStatus) {
    console.log("AVANTIQO_CINEMA_RUNPOD_PROGRESS");
    console.log(
      JSON.stringify(
        {
          endpoint: sanitizeEndpoint(currentEndpoint),
          scene9_queue: queueSummary(currentQueue),
        },
        null,
        2,
      ),
    );
    lastEndpointVersion = currentVersion;
    lastQueueStatus = currentStatus;
  }

  if (["IN_PROGRESS", "COMPLETED"].includes(currentStatus)) {
    console.log(`AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=${currentStatus}`);
    process.exit(0);
  }
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(currentStatus)) {
    console.log(`AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=${currentStatus}`);
    process.exitCode = 2;
    process.exit();
  }
}

const finalEndpoint = await endpoint();
const finalQueue = await queueStatus();
console.log("AVANTIQO_CINEMA_RUNPOD_REPAIR_RESULT=WAIT_TIMEOUT");
console.log(
  JSON.stringify(
    {
      endpoint: sanitizeEndpoint(finalEndpoint),
      scene9_queue: queueSummary(finalQueue),
    },
    null,
    2,
  ),
);
process.exitCode = 3;
