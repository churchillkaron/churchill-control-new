import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const JOB_ID = "a6100711-05a4-4197-a764-39b1c267ead9-e2";
const POLL_MS = 3000;
const TERMINAL_WAIT_MS = 90_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 600);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
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
  }), "RUNPOD_VOICE_TTS_STALE_CANCEL_REST");
}

async function rawQueue(pathname, key, options = {}) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
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
  return { response, body: body || {} };
}

async function queueRequest(pathname, credentials, options = {}) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await rawQueue(pathname, key, options);
    if (response.ok) return body;
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_STALE_CANCEL_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_STALE_CANCEL_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_STALE_CANCEL_QUEUE_CREDENTIAL_REQUIRED");
}

async function workersMinZero(managementKey) {
  let endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_STALE_CANCEL_ENDPOINT_MISMATCH");
  }
  if (Number(endpoint?.workersMin) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0 },
    });
    endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);
  }
  if (Number(endpoint?.workersMin) !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_STALE_CANCEL_WORKERS_MIN_ZERO_VERIFY_FAILED");
  }
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_STALE_JOB_CANCEL_APPROVED).toUpperCase() === "YES";
if (!approved) {
  throw new Error("AVANTIQO_VOICE_TTS_STALE_JOB_CANCEL_APPROVED=YES_REQUIRED");
}

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

await workersMinZero(credentials.management);

let statusBody = await queueRequest(`/status/${encodeURIComponent(JOB_ID)}`, credentials);
let status = text(statusBody?.status).toUpperCase() || "UNKNOWN";
console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_STALE_JOB_CANCEL_BEGIN",
  endpoint_id: ENDPOINT_ID,
  job_id: JOB_ID,
  status_before: status,
  workers_min: 0,
  generation_submitted: false,
  stt_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let cancelPerformed = false;
if (!TERMINAL.has(status)) {
  await queueRequest(`/cancel/${encodeURIComponent(JOB_ID)}`, credentials, { method: "POST" });
  cancelPerformed = true;

  const deadline = Date.now() + TERMINAL_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    statusBody = await queueRequest(`/status/${encodeURIComponent(JOB_ID)}`, credentials);
    status = text(statusBody?.status).toUpperCase() || "UNKNOWN";
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_STALE_JOB_CANCEL_PROGRESS",
      job_id: JOB_ID,
      status,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (TERMINAL.has(status)) break;
  }
}

await workersMinZero(credentials.management);

if (!TERMINAL.has(status)) {
  throw new Error(`AVANTIQO_VOICE_TTS_STALE_JOB_CANCEL_TERMINAL_VERIFY_FAILED:${status}`);
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_VOICE_TTS_STALE_JOB_CANCEL_V1",
  endpoint_id: ENDPOINT_ID,
  job_id: JOB_ID,
  cancel_performed: cancelPerformed,
  final_status: status,
  workers_min: 0,
  always_on_billing_enabled: false,
  generation_submitted: false,
  duplicate_generation_submitted: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
