import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_RESIDENT_JOB_WAKE_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:81e58234e242e03d207484497e7dff1689eb0bec91f96209462ac718af22174b";
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_STATE || "/tmp/avantiqo-voice-tts-resident-recovery-state.json";
const POLL_MS = 3000;
const WAKE_TIMEOUT_MS = 10 * 60_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 700);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_RESIDENT_WAKE_REST");
}

async function queueRaw(pathname, key) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, body: body || {} };
}

async function queueRead(pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await queueRaw(pathname, key);
    if (response.ok) return body;
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_RESIDENT_WAKE_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_RESIDENT_WAKE_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_RESIDENT_WAKE_QUEUE_CREDENTIAL_REQUIRED");
}

async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_WAKE_TEMPLATE_LIST_INVALID");
  return templates;
}

async function endpointState(key) {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, key);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_WAKE_ENDPOINT_MISMATCH");
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = (await endpointBoundTemplates(key)).find((item) => text(item?.id) === templateId);
  if (!template || text(template?.imageName) !== EXPECTED_IMAGE) {
    throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_WAKE_IMAGE_MISMATCH:${text(template?.imageName) || "NONE"}`);
  }
  if (Number(endpoint?.workersMax) !== 1 || ![0, 1].includes(Number(endpoint?.workersMin))) {
    throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_WAKE_SCALING_UNSAFE:min=${endpoint?.workersMin}:max=${endpoint?.workersMax}`);
  }
  return endpoint;
}

async function controlWorkers(key) {
  const body = await parseJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(ENDPOINT_ID)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_RESIDENT_WAKE_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

async function workersMin(managementKey, value) {
  const current = await endpointState(managementKey);
  if (Number(current?.workersMin) !== value) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, managementKey, {
      method: "PATCH",
      body: { workersMin: value },
    });
  }
  const verified = await endpointState(managementKey);
  if (Number(verified?.workersMin) !== value || Number(verified?.workersMax) !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_WAKE_SCALING_VERIFY_FAILED:min=${verified?.workersMin}:max=${verified?.workersMax}`);
  }
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_RESIDENT_JOB_WAKE_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_JOB_WAKE_APPROVED=YES_REQUIRED");

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
if (
  state?.contract !== "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_RECOVERY_V1" ||
  state?.state !== "SUBMITTED" ||
  text(state?.endpoint_id) !== ENDPOINT_ID ||
  text(state?.image) !== EXPECTED_IMAGE ||
  !text(state?.job_id) ||
  state?.duplicate_generation_allowed !== false
) {
  throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_WAKE_STATE_UNSAFE");
}

const jobId = text(state.job_id);
await endpointState(credentials.management);
let job = await queueRead(`/status/${encodeURIComponent(jobId)}`, credentials);
let status = text(job?.status).toUpperCase() || "UNKNOWN";

if (TERMINAL.has(status) || status === "IN_PROGRESS") {
  await workersMin(credentials.management, 0);
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    job_id: jobId,
    status,
    wake_performed: false,
    workers_min: 0,
    generation_submitted: false,
    duplicate_generation_submitted: false,
    secrets_printed: false,
  }, null, 2));
} else {
  if (status !== "IN_QUEUE") throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_WAKE_STATUS_UNSAFE:${status}`);

  let wakePerformed = false;
  try {
    await workersMin(credentials.management, 1);
    wakePerformed = true;
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    let freshSeen = false;

    while (Date.now() < deadline) {
      const [workers, latestJob] = await Promise.all([
        controlWorkers(credentials.management),
        queueRead(`/status/${encodeURIComponent(jobId)}`, credentials),
      ]);
      status = text(latestJob?.status).toUpperCase() || "UNKNOWN";
      const fresh = workers.find((worker) =>
        worker.is_stale === false &&
        (!worker.image || worker.image === EXPECTED_IMAGE) &&
        ["IDLE", "READY", "RUNNING", "THROTTLED"].includes(worker.status),
      );
      freshSeen = freshSeen || Boolean(fresh);
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_RESIDENT_EXISTING_JOB_WAKE_PROGRESS",
        job_id: jobId,
        status,
        workers,
        fresh_worker_seen: freshSeen,
        workers_min: 1,
        generation_submitted: false,
        duplicate_generation_submitted: false,
        secrets_printed: false,
      }));

      if (status === "IN_PROGRESS" || TERMINAL.has(status)) break;
      if (status !== "IN_QUEUE") throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_WAKE_STATUS_CHANGED_UNEXPECTEDLY:${status}`);
      await sleep(POLL_MS);
    }

    if (status === "IN_QUEUE") {
      throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_WAKE_TIMEOUT_IN_QUEUE");
    }
  } finally {
    await workersMin(credentials.management, 0);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    job_id: jobId,
    status,
    wake_performed: wakePerformed,
    workers_min: 0,
    always_on_billing_enabled: false,
    generation_submitted: false,
    duplicate_generation_submitted: false,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
}
