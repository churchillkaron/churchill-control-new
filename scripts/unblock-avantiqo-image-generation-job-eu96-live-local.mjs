const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const EU_DC = "EU-RO-1";
const US_DC = "US-WA-1";
const POLL_MS = 10_000;
const MAX_WAIT_MS = Math.max(
  POLL_MS,
  Number(process.env.AVANTIQO_IMAGE_EU96_WAIT_MS || 45 * 60 * 1000),
);
const REQUEST_TIMEOUT_MS = 30_000;
const TRANSIENT_RETRY_LIMIT = Math.max(
  2,
  Number(process.env.AVANTIQO_IMAGE_RUNPOD_TRANSIENT_RETRIES || 8),
);
const BASELINE_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);

function text(value) {
  return String(value ?? "").trim();
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function list(value) {
  return Array.isArray(value) ? value : [];
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
  const entry = process.argv.find((value) => value.startsWith("--job-id="));
  return text(entry ? entry.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_GENERATION_JOB_ID);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthSummary(health = {}) {
  const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
  const workers = health?.workers && typeof health.workers === "object" ? health.workers : {};
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    idle: finite(workers.idle, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function activeJobCount(health) {
  const value = healthSummary(health);
  return value.queued + value.in_progress;
}
function generationOutputValid(job = {}) {
  const output = job?.output || {};
  const guidance = output?.generation_guidance || {};
  return (
    text(job?.status).toUpperCase() === "COMPLETED" &&
    text(output.capability) === "ai.image.generate" &&
    text(output.foundation_model) === TARGET_MODEL &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(output.runtime_revision) === "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V1" &&
    Number(output.width) === 1328 &&
    Number(output.height) === 1328 &&
    Number(output.inference_steps) === 50 &&
    Number(output.size_bytes) > 10000 &&
    text(guidance.mode).toUpperCase() === "TRUE_CFG" &&
    Number(guidance.scale) === 4 &&
    guidance.negative_prompt_supplied === true &&
    guidance.negative_prompt_has_content === true &&
    text(guidance.quality_policy) === "QWEN_IMAGE_2512_REALISM_V1" &&
    output.raw_reasoning_persisted === false
  );
}
function transientError(error) {
  const code = text(error?.cause?.code || error?.code).toUpperCase();
  if ([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
  ].includes(code)) return true;
  const message = text(error?.message).toLowerCase();
  return message.includes("fetch failed") || message.includes("network") || message.includes("socket");
}
function transientHttp(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function requestJson(url, init, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= TRANSIENT_RETRY_LIMIT; attempt += 1) {
    try {
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
      if (response.ok) return body;
      const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
      if (!transientHttp(response.status) || attempt === TRANSIENT_RETRY_LIMIT) {
        throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
      }
      console.log(`AVANTIQO_IMAGE_EU96_TRANSIENT_HTTP_RETRY label=${label} status=${response.status} attempt=${attempt}`);
    } catch (error) {
      lastError = error;
      if (!transientError(error) || attempt === TRANSIENT_RETRY_LIMIT) throw error;
      const code = text(error?.cause?.code || error?.code) || "FETCH_FAILED";
      console.log(`AVANTIQO_IMAGE_EU96_TRANSIENT_NETWORK_RETRY label=${label} code=${code} attempt=${attempt}`);
    }
    await sleep(Math.min(5_000, 750 * attempt));
  }
  throw lastError || new Error(`${label}_RETRY_EXHAUSTED`);
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

const jobId = jobIdFromArgs();
if (!jobId) {
  throw new Error("AVANTIQO_IMAGE_EU96_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");

console.log("AVANTIQO_IMAGE_EU96_MODE=EXISTING_JOB_ONLY");
console.log(`AVANTIQO_IMAGE_EU96_JOB=${jobId}`);
console.log("AVANTIQO_IMAGE_EU96_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_EU96_MODEL_RECACHE=false");
console.log("AVANTIQO_IMAGE_EU96_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_EU96_GPU_CLASS=96GB_PRO");
console.log("AVANTIQO_IMAGE_EU96_TARGET_DATACENTER=EU-RO-1");
console.log("AVANTIQO_IMAGE_EU96_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_EU96_TRANSIENT_NETWORK_RETRY=true");

const endpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (endpointMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_EU96_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
}
const endpointId = text(endpointMatches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_EU96_ENDPOINT_ID_MISSING");

const [initialEndpoint, volumes, initialJob, initialHealth] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/networkvolumes", managementKey),
  queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
  queue(endpointId, "/health", inferenceKey),
]);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
if (text(initialEndpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_EU96_ENDPOINT_NAME_MISMATCH");
}

const templateId = text(initialEndpoint?.templateId || initialEndpoint?.template?.id);
if (!templateId) throw new Error("AVANTIQO_IMAGE_EU96_TEMPLATE_ID_MISSING");
const baselineVolumeIds = endpointVolumeIds(initialEndpoint);
if (baselineVolumeIds.length !== 2) {
  throw new Error(`AVANTIQO_IMAGE_EU96_EXPECTED_TWO_CACHE_VOLUMES:${baselineVolumeIds.length}`);
}
const attachedVolumes = baselineVolumeIds.map((id) => volumes.find((volume) => text(volume?.id) === id));
if (attachedVolumes.some((volume) => !volume)) {
  throw new Error("AVANTIQO_IMAGE_EU96_ATTACHED_VOLUME_NOT_FOUND");
}
const euVolume = attachedVolumes.find((volume) => text(volume?.dataCenterId) === EU_DC);
const usVolume = attachedVolumes.find((volume) => text(volume?.dataCenterId) === US_DC);
if (!euVolume || !usVolume) {
  throw new Error("AVANTIQO_IMAGE_EU96_EXPECTED_EU_AND_US_CACHE_VOLUMES");
}
const baselineGpuTypes = unique(list(initialEndpoint?.gpuTypeIds));
if (!sameSet(baselineGpuTypes, BASELINE_GPU_TYPES)) {
  throw new Error(`AVANTIQO_IMAGE_EU96_GPU_POOL_CHANGED:${baselineGpuTypes.join("|")}`);
}
const baselineTimeoutMs = finite(initialEndpoint?.executionTimeoutMs, 20 * 60 * 1000);
const baselineWorkersMin = finite(initialEndpoint?.workersMin);
const baselineWorkersMax = finite(initialEndpoint?.workersMax);
if (baselineWorkersMin !== 0 || baselineWorkersMax !== 1) {
  throw new Error(`AVANTIQO_IMAGE_EU96_SCALING_CHANGED:min=${baselineWorkersMin}:max=${baselineWorkersMax}`);
}
const baselinePrimaryVolumeId = text(initialEndpoint?.networkVolumeId) || text(euVolume?.id);
const baselineDataCenterIds = baselineVolumeIds.map((id) => {
  const volume = attachedVolumes.find((candidate) => text(candidate?.id) === id);
  return text(volume?.dataCenterId);
});
if (baselineDataCenterIds.some((value) => !value)) {
  throw new Error("AVANTIQO_IMAGE_EU96_BASELINE_DATACENTER_RESOLUTION_FAILED");
}

let status = text(initialJob?.status).toUpperCase();
if (!["IN_QUEUE", "IN_PROGRESS", ...TERMINAL].includes(status)) {
  throw new Error(`AVANTIQO_IMAGE_EU96_UNEXPECTED_JOB_STATUS:${status || "UNKNOWN"}`);
}
if (!TERMINAL.has(status) && activeJobCount(initialHealth) !== 1) {
  throw new Error(`AVANTIQO_IMAGE_EU96_ACTIVE_JOB_COUNT_UNSAFE:${activeJobCount(initialHealth)}`);
}
console.log(`AVANTIQO_IMAGE_EU96_INITIAL_STATUS=${status}`);
console.log(`AVANTIQO_IMAGE_EU96_INITIAL_HEALTH=${JSON.stringify(healthSummary(initialHealth))}`);
console.log(`AVANTIQO_IMAGE_EU96_EU_VOLUME_ID_PRESENT=${Boolean(text(euVolume?.id))}`);
console.log(`AVANTIQO_IMAGE_EU96_US_VOLUME_ID_PRESENT=${Boolean(text(usVolume?.id))}`);

let pinApplied = false;
let pinWasApplied = false;
let body = initialJob;

async function restoreBaseline(reason) {
  const live = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (text(live?.templateId || live?.template?.id) !== templateId) {
    throw new Error("AVANTIQO_IMAGE_EU96_RESTORE_REFUSED_TEMPLATE_CHANGED");
  }
  const liveVolumes = endpointVolumeIds(live);
  if (!sameSet(liveVolumes, [text(euVolume?.id)]) && !sameSet(liveVolumes, baselineVolumeIds)) {
    throw new Error(`AVANTIQO_IMAGE_EU96_RESTORE_REFUSED_VOLUME_CHANGED:${liveVolumes.join("|")}`);
  }
  if (!sameSet(unique(list(live?.gpuTypeIds)), BASELINE_GPU_TYPES)) {
    throw new Error("AVANTIQO_IMAGE_EU96_RESTORE_REFUSED_GPU_POOL_CHANGED");
  }
  if (sameSet(liveVolumes, baselineVolumeIds)) {
    console.log(`AVANTIQO_IMAGE_EU96_BASELINE_ALREADY_RESTORED=${reason}`);
    return;
  }
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: baselinePrimaryVolumeId,
      networkVolumeIds: baselineVolumeIds,
      dataCenterIds: baselineDataCenterIds,
      gpuTypeIds: BASELINE_GPU_TYPES,
      executionTimeoutMs: baselineTimeoutMs,
      workersMin: baselineWorkersMin,
      workersMax: baselineWorkersMax,
    },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (text(verified?.templateId || verified?.template?.id) !== templateId) {
    throw new Error("AVANTIQO_IMAGE_EU96_RESTORE_TEMPLATE_VERIFY_FAILED");
  }
  if (!sameSet(endpointVolumeIds(verified), baselineVolumeIds)) {
    throw new Error("AVANTIQO_IMAGE_EU96_RESTORE_VOLUME_VERIFY_FAILED");
  }
  if (!sameSet(unique(list(verified?.gpuTypeIds)), BASELINE_GPU_TYPES)) {
    throw new Error("AVANTIQO_IMAGE_EU96_RESTORE_GPU_VERIFY_FAILED");
  }
  if (finite(verified?.workersMin) !== baselineWorkersMin || finite(verified?.workersMax) !== baselineWorkersMax) {
    throw new Error("AVANTIQO_IMAGE_EU96_RESTORE_SCALING_VERIFY_FAILED");
  }
  console.log(`AVANTIQO_IMAGE_EU96_BASELINE_RESTORED=${reason}`);
}

if (status === "IN_QUEUE") {
  const [beforeWrite, jobBeforeWrite, healthBeforeWrite] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
    queue(endpointId, "/health", inferenceKey),
  ]);
  status = text(jobBeforeWrite?.status).toUpperCase();
  body = jobBeforeWrite;
  if (status === "IN_QUEUE") {
    if (activeJobCount(healthBeforeWrite) !== 1) {
      throw new Error(`AVANTIQO_IMAGE_EU96_ACTIVE_JOB_COUNT_CHANGED:${activeJobCount(healthBeforeWrite)}`);
    }
    const beforeHealthSummary = healthSummary(healthBeforeWrite);
    const workerAlreadyStarting =
      beforeHealthSummary.initializing > 0 ||
      beforeHealthSummary.ready > 0 ||
      beforeHealthSummary.running > 0 ||
      beforeHealthSummary.idle > 0;
    if (workerAlreadyStarting) {
      console.log(`AVANTIQO_IMAGE_EU96_PIN_SKIPPED_WORKER_ALREADY_STARTING=${JSON.stringify(beforeHealthSummary)}`);
    } else {
      if (text(beforeWrite?.templateId || beforeWrite?.template?.id) !== templateId) {
        throw new Error("AVANTIQO_IMAGE_EU96_TEMPLATE_CHANGED_BEFORE_PIN");
      }
      if (!sameSet(endpointVolumeIds(beforeWrite), baselineVolumeIds)) {
        throw new Error("AVANTIQO_IMAGE_EU96_VOLUMES_CHANGED_BEFORE_PIN");
      }
      if (!sameSet(unique(list(beforeWrite?.gpuTypeIds)), BASELINE_GPU_TYPES)) {
        throw new Error("AVANTIQO_IMAGE_EU96_GPU_POOL_CHANGED_BEFORE_PIN");
      }

      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: {
          networkVolumeId: text(euVolume?.id),
          networkVolumeIds: [text(euVolume?.id)],
          dataCenterIds: [EU_DC],
          gpuTypeIds: BASELINE_GPU_TYPES,
          executionTimeoutMs: baselineTimeoutMs,
          workersMin: 0,
          workersMax: 1,
        },
      });
      const verified = await rest(
        `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
        managementKey,
      );
      if (text(verified?.templateId || verified?.template?.id) !== templateId) {
        throw new Error("AVANTIQO_IMAGE_EU96_PIN_TEMPLATE_VERIFY_FAILED");
      }
      if (!sameSet(endpointVolumeIds(verified), [text(euVolume?.id)])) {
        throw new Error(`AVANTIQO_IMAGE_EU96_PIN_VOLUME_VERIFY_FAILED:${endpointVolumeIds(verified).join("|")}`);
      }
      if (!sameSet(unique(list(verified?.gpuTypeIds)), BASELINE_GPU_TYPES)) {
        throw new Error("AVANTIQO_IMAGE_EU96_PIN_GPU_VERIFY_FAILED");
      }
      if (finite(verified?.workersMin) !== 0 || finite(verified?.workersMax) !== 1) {
        throw new Error("AVANTIQO_IMAGE_EU96_PIN_SCALING_VERIFY_FAILED");
      }
      pinApplied = true;
      pinWasApplied = true;
      console.log("AVANTIQO_IMAGE_EU96_PIN_APPLIED=true");
      console.log("AVANTIQO_IMAGE_EU96_PIN_NEW_JOB_SUBMITTED=false");
    }
  }
}

const deadline = Date.now() + MAX_WAIT_MS;
let lastStatus = "";
let lastPrintedAt = 0;
while (!TERMINAL.has(status)) {
  if (Date.now() >= deadline) {
    if (status === "IN_QUEUE" && pinApplied) {
      const healthAtTimeout = await queue(endpointId, "/health", inferenceKey);
      const summary = healthSummary(healthAtTimeout);
      if (summary.in_progress === 0 && summary.initializing === 0 && summary.running === 0 && summary.ready === 0) {
        await restoreBaseline("QUEUE_TIMEOUT");
        pinApplied = false;
      } else {
        console.log("AVANTIQO_IMAGE_EU96_TIMEOUT_RESTORE_DEFERRED_ACTIVE_WORKER=true");
      }
    }
    throw new Error(`AVANTIQO_IMAGE_EU96_WAIT_TIMEOUT:${jobId}:status=${status}`);
  }

  try {
    body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
    status = text(body?.status).toUpperCase();
    const now = Date.now();
    if (status !== lastStatus || now - lastPrintedAt >= 30_000) {
      let health = null;
      try {
        health = await queue(endpointId, "/health", inferenceKey);
      } catch (error) {
        console.log(`AVANTIQO_IMAGE_EU96_HEALTH_READ_DEFERRED=${text(error?.cause?.code || error?.code || error?.message).slice(0, 120)}`);
      }
      console.log(
        `AVANTIQO_IMAGE_EU96_PROGRESS status=${status || "UNKNOWN"} health=${health ? JSON.stringify(healthSummary(health)) : "UNAVAILABLE"}`,
      );
      lastStatus = status;
      lastPrintedAt = now;
    }
  } catch (error) {
    if (!transientError(error)) throw error;
    console.log(`AVANTIQO_IMAGE_EU96_MONITOR_TRANSIENT_FAILURE=${text(error?.cause?.code || error?.code || error?.message).slice(0, 120)}`);
  }

  if (!TERMINAL.has(status)) await sleep(POLL_MS);
}

if (pinApplied) {
  await restoreBaseline(`TERMINAL_${status}`);
  pinApplied = false;
}

const outputValid = status === "COMPLETED" && generationOutputValid(body);
console.log(`AVANTIQO_IMAGE_EU96_TERMINAL_STATUS=${status}`);
console.log(`AVANTIQO_IMAGE_EU96_GENERATION_OUTPUT_VALID=${outputValid}`);
console.log(JSON.stringify({
  success: outputValid,
  contract: "AVANTIQO_IMAGE_EU96_EXISTING_JOB_RECOVERY_V1",
  job_id: jobId,
  final_status: status,
  new_job_submitted: false,
  model_recache_performed: false,
  temporary_data_center: pinWasApplied ? EU_DC : null,
  canonical_two_region_baseline_restored: true,
  generation_output_valid: outputValid,
  production_deploy: false,
}, null, 2));

if (!outputValid) process.exitCode = 2;
