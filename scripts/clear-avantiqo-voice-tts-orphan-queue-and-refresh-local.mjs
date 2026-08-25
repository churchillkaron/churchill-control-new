import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const CURRENT_JOB_ID = "a6100711-05a4-4197-a764-39b1c267ead9-e2";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:81e58234e242e03d207484497e7dff1689eb0bec91f96209462ac718af22174b";
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_STATE || "/tmp/avantiqo-voice-tts-resident-recovery-state.json";
const STABLE_OBSERVATIONS_REQUIRED = 4;
const POLL_MS = 3000;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
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
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}

async function rest(pathname, key) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_ORPHAN_REST");
}

async function queueRaw(pathname, key, options = {}) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, body: body || {} };
}

async function queueRequest(pathname, credentials, options = {}) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await queueRaw(pathname, key, options);
    if (response.ok) return { body, key };
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_ORPHAN_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_ORPHAN_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_ORPHAN_QUEUE_CREDENTIAL_REQUIRED");
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
      idle: number(workers.idle),
      ready: number(workers.ready),
      initializing: number(workers.initializing),
    },
  };
}

async function verifyResidentState() {
  const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
  if (
    state?.contract !== "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_RECOVERY_V1" ||
    state?.state !== "IMAGE_BOUND" ||
    text(state?.endpoint_id) !== ENDPOINT_ID ||
    text(state?.image) !== EXPECTED_IMAGE ||
    text(state?.job_id)
  ) {
    throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_STATE_UNSAFE:${JSON.stringify({
      contract: state?.contract || null,
      state: state?.state || null,
      endpoint_id: state?.endpoint_id || null,
      image: state?.image || null,
      job_id_present: Boolean(text(state?.job_id)),
    })}`);
  }
  return state;
}

async function verifyEndpointImage(managementKey) {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_ORPHAN_ENDPOINT_MISMATCH");
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const templatesRaw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
  const templates = normalizeList(templatesRaw, ["templates"]);
  const template = templates?.find((item) => text(item?.id) === templateId);
  if (!template || text(template?.imageName) !== EXPECTED_IMAGE) {
    throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_IMAGE_MISMATCH:${text(template?.imageName) || "NONE"}`);
  }
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_CLEAN_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_CLEAN_APPROVED=YES_REQUIRED");

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

await verifyResidentState();
await verifyEndpointImage(credentials.management);

const { body: jobBody } = await queueRequest(`/status/${encodeURIComponent(CURRENT_JOB_ID)}`, credentials);
const currentJobStatus = text(jobBody?.status).toUpperCase() || "UNKNOWN";
if (!["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(currentJobStatus)) {
  throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_CURRENT_JOB_NOT_TERMINAL:${currentJobStatus}`);
}

let stableQueuedOne = 0;
let latest = null;
for (let observation = 1; observation <= STABLE_OBSERVATIONS_REQUIRED; observation += 1) {
  await verifyResidentState();
  const { body: healthBody } = await queueRequest("/health", credentials);
  latest = healthSummary(healthBody);
  if (latest.jobs.in_progress > 0 || latest.workers.running > 0 || latest.workers.throttled > 0) {
    throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_ACTIVE_WORK:${JSON.stringify(latest)}`);
  }
  if (latest.jobs.in_queue === 0) {
    stableQueuedOne = 0;
    break;
  }
  if (latest.jobs.in_queue !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_COUNT_UNSAFE:${latest.jobs.in_queue}`);
  }
  stableQueuedOne += 1;
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_OBSERVATION",
    observation,
    current_job_status: currentJobStatus,
    health: latest,
    resident_state: "IMAGE_BOUND",
    generation_submitted: false,
    secrets_printed: false,
  }));
  if (observation < STABLE_OBSERVATIONS_REQUIRED) await sleep(POLL_MS);
}

let purgePerformed = false;
if (stableQueuedOne === STABLE_OBSERVATIONS_REQUIRED) {
  await verifyResidentState();
  const purge = await queueRequest("/purge-queue", credentials, { method: "POST" });
  purgePerformed = true;
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_PURGED",
    endpoint_id: ENDPOINT_ID,
    purged_pending_jobs: 1,
    purge_status: text(purge.body?.status) || null,
    generation_submitted: false,
    secrets_printed: false,
  }));
  await sleep(1500);
}

const { body: afterBody } = await queueRequest("/health", credentials);
const after = healthSummary(afterBody);
if (after.jobs.in_queue !== 0 || after.jobs.in_progress !== 0 || after.workers.running !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_NOT_CLEAN:${JSON.stringify(after)}`);
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_CLEAN_V1",
  endpoint_id: ENDPOINT_ID,
  current_job_status: currentJobStatus,
  purge_performed: purgePerformed,
  before_or_latest: latest,
  after,
  generation_submitted: false,
  duplicate_generation_submitted: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));

const child = spawnSync(process.execPath, ["scripts/refresh-avantiqo-voice-tts-resident-stale-worker-local.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    AVANTIQO_VOICE_TTS_RESIDENT_STALE_REFRESH_APPROVED: "YES",
  },
});

if (child.error) throw child.error;
if (child.status !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_ORPHAN_REFRESH_CHILD_FAILED:${child.status ?? "UNKNOWN"}`);
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_VOICE_TTS_ORPHAN_QUEUE_AND_REFRESH_V1",
  endpoint_id: ENDPOINT_ID,
  purge_performed: purgePerformed,
  stale_worker_refresh_status: "SUCCESS",
  generation_submitted: false,
  duplicate_generation_submitted: false,
  secrets_printed: false,
}, null, 2));
