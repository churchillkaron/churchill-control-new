import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const JOB_ID = "a6100711-05a4-4197-a764-39b1c267ead9-e2";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:a727294eb80221487de797c82552c2ef0924b89733037f27ee6724a2133c9c54";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_CACHED_RECOVERY_AUDIO || path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_CACHED_RESUME_REPORT || "/tmp/avantiqo-voice-tts-cached-job-resume.json";
const TIMEOUT_MS = Math.max(60_000, Math.min(20 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_CACHED_RESUME_TIMEOUT_MS || 12 * 60_000)));
const POLL_MS = 3000;

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}
async function rest(pathname, key, options = {}) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_CACHED_RESUME_REST");
}
async function rawQueue(pathname, key) {
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
    const { response, body } = await rawQueue(pathname, key);
    if (response.ok) return body;
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_CACHED_RESUME_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_CACHED_RESUME_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_CACHED_RESUME_QUEUE_CREDENTIAL_REQUIRED");
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_CACHED_RESUME_TEMPLATE_LIST_INVALID");
  return templates;
}
async function verifyEndpointAndCostGuard(managementKey) {
  let endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_CACHED_RESUME_ENDPOINT_MISMATCH");
  }
  if (Number(endpoint?.workersMin) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, managementKey, { method: "PATCH", body: { workersMin: 0 } });
    endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);
  }
  if (Number(endpoint?.workersMin) !== 0) throw new Error("AVANTIQO_VOICE_TTS_CACHED_RESUME_WORKERS_MIN_ZERO_VERIFY_FAILED");
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const templates = await endpointBoundTemplates(managementKey);
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_CACHED_RESUME_BOUND_TEMPLATE_NOT_FOUND");
  if (text(template?.imageName) !== EXPECTED_IMAGE) {
    throw new Error(`AVANTIQO_VOICE_TTS_CACHED_RESUME_IMAGE_MISMATCH:${text(template?.imageName) || "NONE"}`);
  }
  return { endpoint_id: ENDPOINT_ID, template_id: templateId, image: EXPECTED_IMAGE, workers_min: 0 };
}
function validateAudio(body = {}) {
  const output = object(body?.output);
  const audio = Buffer.from(text(output?.audio_base64), "base64");
  const contract = text(output?.contract || output?.engine_contract);
  const passed =
    audio.length > 1000 &&
    audio.subarray(0, 4).toString("ascii") === "RIFF" &&
    text(output?.format).toLowerCase() === "wav" &&
    text(output?.capability) === "ai.text.to.speech" &&
    text(output?.foundation_model) === FOUNDATION &&
    output?.voice_cloning_used === false &&
    output?.raw_reasoning_persisted === false &&
    (!contract || contract === "AVANTIQO_VOICE_ENGINE_V1");
  if (!passed) throw new Error("AVANTIQO_VOICE_TTS_CACHED_RESUME_INVALID_AUDIO");
  return {
    audio,
    bytes: audio.length,
    sample_rate: Number(output?.sample_rate) || null,
    generation_seconds: Number(output?.generation_seconds) || null,
  };
}

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

const binding = await verifyEndpointAndCostGuard(credentials.management);
console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_CACHED_RESUME_GUARD",
  ...binding,
  job_id: JOB_ID,
  generation_submitted: false,
  duplicate_generation_submitted: false,
  always_on_billing_enabled: false,
  secrets_printed: false,
}, null, 2));

const deadline = Date.now() + TIMEOUT_MS;
let completed = null;
let finalStatus = "UNKNOWN";
let lastPrint = 0;
while (Date.now() < deadline) {
  const body = await queueRead(`/status/${encodeURIComponent(JOB_ID)}`, credentials);
  const status = text(body?.status).toUpperCase() || "UNKNOWN";
  finalStatus = status;
  if (Date.now() - lastPrint >= 15_000 || ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_CACHED_RESUME_PROGRESS",
      job_id: JOB_ID,
      status,
      generation_submitted: false,
      duplicate_generation_submitted: false,
      secrets_printed: false,
    }));
    lastPrint = Date.now();
  }
  if (status === "COMPLETED") {
    completed = body;
    break;
  }
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const detail = text(body?.error || body?.message).slice(0, 400);
    throw new Error(`AVANTIQO_VOICE_TTS_CACHED_RESUME_JOB_${status}${detail ? `:${detail}` : ""}`);
  }
  await sleep(POLL_MS);
}

if (!completed) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_RESUME_TIMEOUT:${finalStatus}`);

const validated = validateAudio(completed);
await mkdir(path.dirname(AUDIO_PATH), { recursive: true });
await writeFile(AUDIO_PATH, validated.audio);
await verifyEndpointAndCostGuard(credentials.management);

const report = {
  success: true,
  contract: "AVANTIQO_VOICE_TTS_CACHED_JOB_RESUME_V1",
  endpoint_id: ENDPOINT_ID,
  job_id: JOB_ID,
  image: EXPECTED_IMAGE,
  final_status: "COMPLETED",
  audio_path: AUDIO_PATH,
  audio_bytes: validated.bytes,
  sample_rate: validated.sample_rate,
  generation_seconds: validated.generation_seconds,
  workers_min: 0,
  always_on_billing_enabled: false,
  generation_submitted: false,
  duplicate_generation_submitted: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_VOICE_TTS_CACHED_RECOVERY_AUDIO=${AUDIO_PATH}`);
if (process.platform === "darwin") {
  const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
  console.log(`AVANTIQO_VOICE_TTS_CACHED_RESUME_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
}
