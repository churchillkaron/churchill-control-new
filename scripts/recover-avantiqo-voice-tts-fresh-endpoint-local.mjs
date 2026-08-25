import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_FRESH_ENDPOINT_RECOVERY_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const RECOVERY_TEMPLATE_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const RECOVERY_ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_STATE || "/tmp/avantiqo-voice-tts-fresh-recovery-state.json";
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_REPORT || "/tmp/avantiqo-voice-tts-fresh-recovery-smoke.json";
const DOWNLOADS_AUDIO_PATH = path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO || DOWNLOADS_AUDIO_PATH;
const GPU_POOL = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA GeForce RTX 5090",
]);
const WORKER_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(15 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_FRESH_WORKER_TIMEOUT_MS || 8 * 60_000)),
);
const POLL_MS = 5_000;

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function normalizeList(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}
async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_FRESH_RECOVERY_REST");
}
async function controlWorkers(endpointId, key) {
  return readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_FRESH_RECOVERY_CONTROL");
}
async function queueRead(endpointId, key, pathname) {
  const candidates = [...new Set([text(process.env.RUNPOD_API_KEY), key].filter(Boolean))];
  let last = null;
  for (const credential of candidates) {
    try {
      return await readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }), "RUNPOD_VOICE_TTS_FRESH_RECOVERY_QUEUE");
    } catch (error) {
      last = error;
      if (![401, 403].includes(Number(error?.httpStatus))) throw error;
    }
  }
  throw last || new Error("RUNPOD_VOICE_TTS_FRESH_RECOVERY_QUEUE_CREDENTIAL_REQUIRED");
}
function exactByName(items, name, label) {
  const matches = items.filter((item) => text(item?.name) === name);
  if (matches.length > 1) throw new Error(`${label}_AMBIGUOUS:${matches.length}`);
  return matches[0] || null;
}
function activeWorkers(body = {}) {
  return list(body?.workers).filter((worker) => {
    const status = text(worker?.status).toUpperCase();
    return !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
  });
}
function safeWorkers(body = {}) {
  return activeWorkers(body).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}
function healthWorkers(body = {}) {
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function healthHasWorker(body = {}) {
  return Object.values(healthWorkers(body)).some((value) => value > 0);
}
async function writeState(patch) {
  let current = {};
  try { current = JSON.parse(await readFile(STATE_PATH, "utf8")); } catch { current = {}; }
  const next = {
    contract: CONTRACT,
    updated_at: new Date().toISOString(),
    ...current,
    ...patch,
    secret_values_recorded: false,
  };
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
async function readState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return parsed?.contract === CONTRACT ? parsed : null;
  } catch {
    return null;
  }
}
async function restoreWorkersMinZero(endpointId, key) {
  try {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
      method: "PATCH",
      body: { workersMin: 0 },
    });
    return true;
  } catch {
    return false;
  }
}
async function waitForFreshWorker(endpointId, key) {
  const deadline = Date.now() + WORKER_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const [workersRaw, healthRaw] = await Promise.all([
      controlWorkers(endpointId, key),
      queueRead(endpointId, key, "/health"),
    ]);
    const workers = safeWorkers(workersRaw);
    const health = healthWorkers(healthRaw);
    const ready = workers.some((worker) => ["IDLE", "READY", "RUNNING"].includes(worker.status)) ||
      health.idle > 0 || health.ready > 0 || health.running > 0;
    last = { workers, health };
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_WORKER_PROGRESS",
      endpoint_id: endpointId,
      workers,
      health_workers: health,
      ready_for_generation: ready,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (ready) return last;
    await sleep(POLL_MS);
  }
  const error = new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_WORKER_TIMEOUT");
  error.last_worker_state = last;
  throw error;
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_APPROVED=YES_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT || lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ORIGINAL_LOCK_REQUIRED");
}
if (text(lock?.immutable_image_reference) !== CERTIFIED_IMAGE || text(lock?.foundation_model) !== FOUNDATION) {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_CERTIFIED_BINDING_MISMATCH");
}

const existingState = await readState();
if (text(existingState?.job_id)) {
  const endpointId = text(existingState.endpoint_id);
  const jobId = text(existingState.job_id);
  if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_STATE_INVALID");
  const status = await queueRead(endpointId, managementKey, `/status/${encodeURIComponent(jobId)}`);
  const jobStatus = text(status?.status).toUpperCase() || "UNKNOWN";
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_EXISTING_JOB",
    endpoint_id: endpointId,
    job_id: jobId,
    status: jobStatus,
    new_generation_submitted: false,
    secrets_printed: false,
  }));
  if (jobStatus === "COMPLETED") {
    const output = status?.output || {};
    const audio = Buffer.from(text(output?.audio_base64), "base64");
    if (audio.length <= 1000 || audio.subarray(0, 4).toString("ascii") !== "RIFF") {
      throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_EXISTING_JOB_INVALID_AUDIO");
    }
    await mkdir(path.dirname(AUDIO_PATH), { recursive: true });
    await writeFile(AUDIO_PATH, audio);
    await restoreWorkersMinZero(endpointId, managementKey);
    await writeState({ state: "COMPLETED", audio_path: AUDIO_PATH, audio_bytes: audio.length });
    console.log(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO=${AUDIO_PATH}`);
    if (process.platform === "darwin") spawnSync("afplay", [AUDIO_PATH], { stdio: "ignore" });
  } else if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(jobStatus)) {
    await restoreWorkersMinZero(endpointId, managementKey);
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_JOB_${jobStatus}`);
  } else {
    process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID = endpointId;
    process.env.AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT = AUDIO_PATH;
    process.env.AVANTIQO_VOICE_TTS_COLD_START_REPORT_OUTPUT = REPORT_PATH;
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_JOB_STILL_ACTIVE:${jobStatus}:USE_STATUS_RESUME_ONLY`);
  }
} else {
  const [endpointsRaw, templatesRaw, authsRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
    rest("/containerregistryauth", managementKey),
  ]);
  let endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]) || [];
  let templates = normalizeList(templatesRaw, ["templates"]) || [];
  const auths = normalizeList(authsRaw, ["containerRegistryAuths", "registryAuths"]) || [];

  const originalTemplateId = text(lock?.endpoint_id)
    ? text(endpoints.find((endpoint) => text(endpoint?.id) === text(lock.endpoint_id))?.templateId)
    : "";
  const originalTemplate = templates.find((template) => text(template?.id) === originalTemplateId) || null;
  const originalAuthId = text(originalTemplate?.containerRegistryAuthId);
  const registryAuth = auths.find((auth) => text(auth?.id) === originalAuthId) ||
    auths.find((auth) => /ghcr|github/i.test([auth?.name, auth?.registry, auth?.registryUrl, auth?.host].map(text).join(" ")));
  if (!registryAuth || !text(registryAuth?.id)) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_GHCR_AUTH_REQUIRED");
  }

  let template = exactByName(templates, RECOVERY_TEMPLATE_NAME, "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_TEMPLATE");
  if (!template) {
    template = await rest("/templates", managementKey, {
      method: "POST",
      body: {
        imageName: CERTIFIED_IMAGE,
        name: RECOVERY_TEMPLATE_NAME,
        category: "NVIDIA",
        containerDiskInGb: 30,
        containerRegistryAuthId: text(registryAuth.id),
        dockerEntrypoint: [],
        dockerStartCmd: [],
        env: {
          AVANTIQO_VOICE_TTS_FOUNDATION_MODEL: FOUNDATION,
          AVANTIQO_VOICE_TTS_DEVICE: "cuda",
        },
        isPublic: false,
        isServerless: true,
        ports: [],
        readme: "Temporary fresh recovery template for certified Avantiqo multilingual TTS.",
        volumeInGb: 0,
        volumeMountPath: "/workspace",
      },
    });
    templates = [...templates, template];
  }
  const templateId = text(template?.id);
  if (!templateId || text(template?.imageName) !== CERTIFIED_IMAGE) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_TEMPLATE_VERIFY_FAILED");
  }

  let endpoint = exactByName(endpoints, RECOVERY_ENDPOINT_NAME, "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT");
  if (!endpoint) {
    endpoint = await rest("/endpoints", managementKey, {
      method: "POST",
      body: {
        templateId,
        computeType: "GPU",
        dataCenterIds: [],
        executionTimeoutMs: 900000,
        flashboot: true,
        gpuCount: 1,
        gpuTypeIds: GPU_POOL,
        idleTimeout: 30,
        minCudaVersion: "12.8",
        name: RECOVERY_ENDPOINT_NAME,
        scalerType: "QUEUE_DELAY",
        scalerValue: 4,
        workersMax: 1,
        workersMin: 1,
      },
    });
    endpoints = [...endpoints, endpoint];
  } else {
    if (text(endpoint?.templateId) !== templateId) {
      throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_EXISTING_ENDPOINT_TEMPLATE_MISMATCH");
    }
    if (finite(endpoint?.workersMin, 0) !== 1) {
      endpoint = await rest(`/endpoints/${encodeURIComponent(text(endpoint?.id))}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 1 },
      });
    }
  }

  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT_ID_REQUIRED");
  await writeState({
    state: "WAITING_FOR_WORKER",
    original_endpoint_id: text(lock?.endpoint_id),
    original_job_id: text(lock?.job_id),
    template_id: templateId,
    endpoint_id: endpointId,
    job_id: null,
    new_generation_authorized_by_user: true,
  });

  try {
    await waitForFreshWorker(endpointId, managementKey);
  } catch (error) {
    await restoreWorkersMinZero(endpointId, managementKey);
    await writeState({ state: "WORKER_PROVISIONING_FAILED", error_code: text(error?.message || error) });
    throw error;
  }

  const health = await queueRead(endpointId, managementKey, "/health");
  const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
  const inQueue = finite(jobs.inQueue ?? jobs.in_queue, 0);
  const inProgress = finite(jobs.inProgress ?? jobs.in_progress, 0);
  if (inQueue > 0 || inProgress > 0) {
    await restoreWorkersMinZero(endpointId, managementKey);
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT_NOT_EMPTY:queue=${inQueue}:progress=${inProgress}`);
  }

  process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID = endpointId;
  process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL = FOUNDATION;
  process.env.AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT = AUDIO_PATH;
  process.env.AVANTIQO_VOICE_TTS_COLD_START_REPORT_OUTPUT = REPORT_PATH;
  process.env.AVANTIQO_VOICE_TTS_COLD_START_TIMEOUT_MS = String(20 * 60_000);

  await writeState({ state: "READY_TO_SUBMIT", endpoint_id: endpointId, template_id: templateId });
  await import("./smoke-avantiqo-voice-tts-cold-start-local.mjs");

  let smoke = null;
  try { smoke = JSON.parse(await readFile(REPORT_PATH, "utf8")); } catch { smoke = null; }
  if (text(smoke?.job_id)) {
    await writeState({
      state: smoke?.success === true ? "COMPLETED" : "SUBMITTED_OR_FAILED",
      endpoint_id: endpointId,
      template_id: templateId,
      job_id: text(smoke.job_id),
      generation_submission_outcome: text(smoke?.generation_submission_outcome) || null,
      smoke_success: smoke?.success === true,
      audio_path: smoke?.success === true ? AUDIO_PATH : null,
      audio_bytes: finite(smoke?.tts?.audio_bytes),
      error_code: text(smoke?.error_code) || null,
    });
  }

  await restoreWorkersMinZero(endpointId, managementKey);

  if (smoke?.success !== true) {
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_SMOKE_FAILED:${text(smoke?.error_code) || "UNKNOWN"}`);
  }

  await access(AUDIO_PATH);
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: endpointId,
    template_id: templateId,
    job_id: text(smoke?.job_id),
    audio_path: AUDIO_PATH,
    audio_bytes: finite(smoke?.tts?.audio_bytes),
    wav_header: text(smoke?.tts?.wav_header),
    foundation_model: FOUNDATION,
    certified_image: CERTIFIED_IMAGE,
    original_stuck_job_preserved: true,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") {
    const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
    console.log(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
  }
}
