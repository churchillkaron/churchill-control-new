import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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
  }), "RUNPOD_VOICE_TTS_FORCE_ZERO");
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_FORCE_WORKERS_MIN_ZERO_APPROVED).toUpperCase() === "YES";
if (!approved) {
  throw new Error("AVANTIQO_VOICE_TTS_FORCE_WORKERS_MIN_ZERO_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
let endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);

if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_FORCE_ZERO_ENDPOINT_MISMATCH");
}

const before = {
  workers_min: Number(endpoint?.workersMin),
  workers_max: Number(endpoint?.workersMax),
};

if (Number(endpoint?.workersMin) !== 0) {
  await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0 },
  });
}

endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (Number(endpoint?.workersMin) !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_FORCE_ZERO_VERIFY_FAILED:${endpoint?.workersMin}`);
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_VOICE_TTS_FORCE_WORKERS_MIN_ZERO_V1",
  endpoint_id: ENDPOINT_ID,
  endpoint_name: ENDPOINT_NAME,
  before,
  after: {
    workers_min: Number(endpoint?.workersMin),
    workers_max: Number(endpoint?.workersMax),
  },
  always_on_billing_enabled: false,
  generation_submitted: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
