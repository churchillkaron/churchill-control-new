import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_CACHED_IMAGE_RECOVERY_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const OLD_JOB_ID = "28aa9f37-f926-4c8a-845c-51efcf507c17-e2";
const OLD_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const IMAGE_REFRESH_TRIGGER = "d8cd9c4db94009e3b83c4b4d4dc7746be7a444a7";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_CACHED_RECOVERY_STATE || "/tmp/avantiqo-voice-tts-cached-recovery-state.json";
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_CACHED_RECOVERY_REPORT || "/tmp/avantiqo-voice-tts-cached-recovery-report.json";
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_CACHED_RECOVERY_AUDIO || path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const BUILD_WAIT_MS = Math.max(60_000, Math.min(50 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_CACHED_BUILD_WAIT_MS || 45 * 60_000)));
const OLD_JOB_WAIT_MS = Math.max(30_000, Math.min(15 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_OLD_JOB_WAIT_MS || 8 * 60_000)));
const WARM_WAIT_MS = Math.max(60_000, Math.min(15 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_CACHED_WARM_WAIT_MS || 10 * 60_000)));
const JOB_WAIT_MS = Math.max(60_000, Math.min(15 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_CACHED_JOB_WAIT_MS || 8 * 60_000)));
const POLL_MS = 3000;

function text(v) { return String(v ?? "").trim(); }
function list(v) { return Array.isArray(v) ? v : []; }
function object(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function finite(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
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
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
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
async function jsonResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}
async function rest(pathname, key, options = {}) {
  return jsonResponse(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_CACHED_RECOVERY_REST");
}
async function rawQueue(endpointId, pathname, key, options = {}) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, body: body || {} };
}
async function queue(endpointId, pathname, credentials, options = {}) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    try {
      const { response, body } = await rawQueue(endpointId, pathname, key, options);
      if (response.ok) return { body, key };
      if (![401, 403].includes(response.status)) {
        throw new Error(`RUNPOD_CACHED_RECOVERY_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
      }
      last = new Error(`RUNPOD_CACHED_RECOVERY_QUEUE_HTTP_${response.status}`);
    } catch (error) {
      last = error;
      if (![401, 403].includes(Number(error?.httpStatus))) {
        if (!/QUEUE_HTTP_(401|403)/.test(text(error?.message))) throw error;
      }
    }
  }
  throw last || new Error("RUNPOD_CACHED_RECOVERY_QUEUE_CREDENTIAL_REQUIRED");
}
async function controlWorkers(endpointId, key) {
  return jsonResponse(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_CACHED_RECOVERY_CONTROL");
}
function safeWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    status: text(worker?.status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_CACHED_TEMPLATE_LIST_INVALID");
  return templates;
}
async function getEndpoint(key) {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, key);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_CACHED_ENDPOINT_MISMATCH");
  }
  return endpoint;
}
async function workersMinZero(key) {
  let endpoint = await getEndpoint(key);
  if (Number(endpoint?.workersMin) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, key, { method: "PATCH", body: { workersMin: 0 } });
    endpoint = await getEndpoint(key);
  }
  if (Number(endpoint?.workersMin) !== 0) throw new Error("AVANTIQO_VOICE_TTS_CACHED_WORKERS_MIN_ZERO_VERIFY_FAILED");
  return endpoint;
}
function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_TTS_CACHED_GHCR_AUTH_REQUIRED");
  return {
    containerDiskInGb: Math.max(1, finite(template?.containerDiskInGb, 30)),
    containerRegistryAuthId: authId,
    dockerEntrypoint: list(template?.dockerEntrypoint),
    dockerStartCmd: list(template?.dockerStartCmd),
    env: Object.fromEntries(Object.entries(object(template?.env)).map(([k, v]) => [k, String(v ?? "")])),
    imageName,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, finite(template?.volumeInGb, 0)),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  return result.stdout;
}
function evidenceFromOrigin() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const raw = runGit(["show", `origin/main:${EVIDENCE_PATH}`]);
  return JSON.parse(raw);
}
function sourceContainsRefresh(sourceSha) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", IMAGE_REFRESH_TRIGGER, sourceSha], { stdio: "ignore" });
  return result.status === 0;
}
function validateEvidence(report) {
  const tts = object(report?.tts);
  const sourceSha = text(tts?.source_sha);
  const image = text(tts?.immutable_image_reference);
  if (
    report?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
    report?.success !== true || tts?.success !== true ||
    tts?.source_sha_matches_trigger !== true || sourceSha !== text(report?.trigger_sha) ||
    tts?.preflight_outcome !== "success" || tts?.build_outcome !== "success" || tts?.startup_probe_outcome !== "success" ||
    tts?.blackwell_sm120_compiled !== true || tts?.import_smoke_passed_by_docker_build !== true ||
    text(tts?.foundation_model) !== FOUNDATION || text(tts?.cuda_runtime_expected) !== "12.8" ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) || image === OLD_IMAGE ||
    !/^[a-f0-9]{40}$/i.test(sourceSha) || !sourceContainsRefresh(sourceSha) ||
    report?.provider_job_submitted !== false || report?.production_web_deploy !== false || report?.pricing_activation_performed !== false
  ) return null;
  return { image, source_sha: sourceSha, digest: text(tts?.image_digest), github_run_id: text(report?.github_run_id) || null };
}
async function waitForEvidence() {
  const deadline = Date.now() + BUILD_WAIT_MS;
  let lastSource = null;
  while (Date.now() < deadline) {
    try {
      const report = evidenceFromOrigin();
      const valid = validateEvidence(report);
      if (valid) return valid;
      const current = text(report?.tts?.source_sha) || "NONE";
      if (current !== lastSource) {
        console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_CACHED_IMAGE_WAIT", current_tts_source_sha: current, required_ancestor: IMAGE_REFRESH_TRIGGER, generation_submitted: false, secrets_printed: false }));
        lastSource = current;
      }
    } catch (error) {
      console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_CACHED_IMAGE_WAIT", evidence_read_error: text(error?.message || error).slice(0, 300), generation_submitted: false, secrets_printed: false }));
    }
    await sleep(15_000);
  }
  throw new Error("AVANTIQO_VOICE_TTS_CACHED_IMAGE_BUILD_EVIDENCE_TIMEOUT");
}
async function writeState(patch) {
  let current = {};
  try { current = JSON.parse(await readFile(STATE_PATH, "utf8")); } catch { current = {}; }
  const next = { contract: CONTRACT, updated_at: new Date().toISOString(), ...current, ...patch, secrets_recorded: false };
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
async function readState() {
  try { const value = JSON.parse(await readFile(STATE_PATH, "utf8")); return value?.contract === CONTRACT ? value : null; } catch { return null; }
}
function validateAudio(body = {}) {
  const output = body?.output || {};
  const audio = Buffer.from(text(output?.audio_base64), "base64");
  const passed = audio.length > 1000 && audio.subarray(0, 4).toString("ascii") === "RIFF" && text(output?.format).toLowerCase() === "wav" && text(output?.capability) === "ai.text.to.speech" && text(output?.foundation_model) === FOUNDATION && output?.voice_cloning_used === false && output?.raw_reasoning_persisted === false;
  if (!passed) throw new Error("AVANTIQO_VOICE_TTS_CACHED_AUDIO_INVALID");
  return { audio, bytes: audio.length, sample_rate: finite(output?.sample_rate), generation_seconds: finite(output?.generation_seconds) };
}
async function saveAndPlay(completed, meta = {}) {
  const validated = validateAudio(completed);
  await mkdir(path.dirname(AUDIO_PATH), { recursive: true });
  await writeFile(AUDIO_PATH, validated.audio);
  await workersMinZero(credentials.management);
  await writeState({ state: "COMPLETED", audio_path: AUDIO_PATH, audio_bytes: validated.bytes, ...meta });
  const report = { success: true, contract: CONTRACT, endpoint_id: ENDPOINT_ID, job_id: meta.job_id || null, image: meta.image || null, audio_path: AUDIO_PATH, audio_bytes: validated.bytes, sample_rate: validated.sample_rate, generation_seconds: validated.generation_seconds, workers_min: 0, always_on_billing_enabled: false, stt_submitted: false, production_deploy_performed: false, pricing_activation_performed: false, secrets_printed: false };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`AVANTIQO_VOICE_TTS_CACHED_RECOVERY_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") {
    const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
    console.log(`AVANTIQO_VOICE_TTS_CACHED_RECOVERY_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
  }
}
async function waitJob(jobId, maxMs, label) {
  const deadline = Date.now() + maxMs;
  let last = "UNKNOWN";
  let lastPrint = 0;
  while (Date.now() < deadline) {
    const { body } = await queue(ENDPOINT_ID, `/status/${encodeURIComponent(jobId)}`, credentials);
    const status = text(body?.status).toUpperCase() || "UNKNOWN";
    last = status;
    if (Date.now() - lastPrint > 15_000 || ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      console.log(JSON.stringify({ event: label, job_id: jobId, status, generation_submitted: false, secrets_printed: false }));
      lastPrint = Date.now();
    }
    if (status === "COMPLETED") return { terminal: true, completed: true, body, status };
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) return { terminal: true, completed: false, body, status };
    await sleep(POLL_MS);
  }
  return { terminal: false, completed: false, body: null, status: last };
}
async function bindImage(image) {
  const endpoint = await getEndpoint(credentials.management);
  const templates = await endpointBoundTemplates(credentials.management);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_CACHED_BOUND_TEMPLATE_NOT_FOUND");
  const allRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", credentials.management);
  const endpoints = normalizeList(allRaw, ["endpoints", "serverlessEndpoints"]) || [];
  const consumers = endpoints.filter((item) => text(item?.templateId || item?.template?.id) === templateId);
  if (consumers.length !== 1 || text(consumers[0]?.id) !== ENDPOINT_ID) throw new Error("AVANTIQO_VOICE_TTS_CACHED_TEMPLATE_NOT_EXCLUSIVE");
  if (text(template?.imageName) !== image) {
    await rest(`/templates/${encodeURIComponent(templateId)}/update`, credentials.management, { method: "POST", body: templateUpdateBody(template, image) });
  }
  const verifyTemplates = await endpointBoundTemplates(credentials.management);
  const verified = verifyTemplates.find((item) => text(item?.id) === templateId);
  if (text(verified?.imageName) !== image) throw new Error("AVANTIQO_VOICE_TTS_CACHED_IMAGE_BIND_VERIFY_FAILED");
  return templateId;
}
async function warmWorker() {
  await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, credentials.management, { method: "PATCH", body: { workersMin: 1 } });
  const deadline = Date.now() + WARM_WAIT_MS;
  try {
    while (Date.now() < deadline) {
      const [workersRaw, healthRaw] = await Promise.all([controlWorkers(ENDPOINT_ID, credentials.management), queue(ENDPOINT_ID, "/health", credentials).then((x) => x.body)]);
      const workers = safeWorkers(workersRaw);
      const health = healthSummary(healthRaw);
      const ready = health.workers.idle > 0 || health.workers.ready > 0 || health.workers.running > 0 || workers.some((worker) => ["IDLE", "READY", "RUNNING", "THROTTLED"].includes(worker.status));
      console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_CACHED_WARM_PROGRESS", workers, health_workers: health.workers, ready, generation_submitted: false, secrets_printed: false }));
      if (ready) return;
      await sleep(5000);
    }
    throw new Error("AVANTIQO_VOICE_TTS_CACHED_WARM_TIMEOUT");
  } finally {
    await workersMinZero(credentials.management);
  }
}
async function submitOne(image) {
  const { body: healthBody } = await queue(ENDPOINT_ID, "/health", credentials);
  const health = healthSummary(healthBody);
  if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_ENDPOINT_NOT_EMPTY:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}`);
  const key = credentials.inference || credentials.management;
  const payload = {
    input: {
      contract: "AVANTIQO_VOICE_ENGINE_V1",
      capability: "ai.text.to.speech",
      foundation_model: FOUNDATION,
      organization_id: "benchmark-only",
      usage_id: `voice-tts-cached-${Date.now()}`,
      workload: { text: "Avantiqo voice generator is working and ready.", language: "en", voice: null, response_format: "wav" },
    },
  };
  const { response, body } = await rawQueue(ENDPOINT_ID, "/run", key, { method: "POST", body: payload, timeoutMs: 12_000 });
  if (!response.ok) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_SUBMIT_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  const jobId = text(body?.id);
  if (!jobId) throw new Error("AVANTIQO_VOICE_TTS_CACHED_ACCEPTED_WITHOUT_JOB_ID");
  await writeState({ state: "SUBMITTED", endpoint_id: ENDPOINT_ID, job_id: jobId, image, generation_count: 1, duplicate_generation_allowed: false });
  console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_CACHED_JOB_SUBMITTED", endpoint_id: ENDPOINT_ID, job_id: jobId, new_job_count: 1, workers_min: 0, secrets_printed: false }));
  return jobId;
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_CACHED_RECOVERY_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_CACHED_RECOVERY_APPROVED=YES_REQUIRED");
const credentials = { management: required("RUNPOD_MANAGEMENT_API_KEY"), inference: text(process.env.RUNPOD_API_KEY) };
await workersMinZero(credentials.management);

const existing = await readState();
if (text(existing?.job_id) && existing?.state !== "COMPLETED") {
  const resumed = await waitJob(text(existing.job_id), JOB_WAIT_MS, "AVANTIQO_VOICE_TTS_CACHED_RESUME_PROGRESS");
  if (!resumed.terminal) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_RESUME_TIMEOUT:${resumed.status}`);
  if (!resumed.completed) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_RESUME_${resumed.status}`);
  await saveAndPlay(resumed.body, { job_id: text(existing.job_id), image: text(existing.image), resumed_existing_job: true });
} else if (existing?.state === "COMPLETED") {
  await access(AUDIO_PATH);
  console.log(`AVANTIQO_VOICE_TTS_CACHED_RECOVERY_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
} else {
  const old = await waitJob(OLD_JOB_ID, OLD_JOB_WAIT_MS, "AVANTIQO_VOICE_TTS_OLD_JOB_DRAIN_PROGRESS");
  if (!old.terminal) throw new Error(`AVANTIQO_VOICE_TTS_OLD_JOB_STILL_ACTIVE:${old.status}`);
  if (old.completed) {
    await saveAndPlay(old.body, { job_id: OLD_JOB_ID, image: OLD_IMAGE, recovered_old_job: true });
  } else {
    const evidence = await waitForEvidence();
    console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_CACHED_IMAGE_READY", source_sha: evidence.source_sha, image_digest: evidence.digest, github_run_id: evidence.github_run_id, generation_submitted: false, secrets_printed: false }));
    const { body: healthBefore } = await queue(ENDPOINT_ID, "/health", credentials);
    const before = healthSummary(healthBefore);
    if (before.jobs.in_queue > 0 || before.jobs.in_progress > 0) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_REBIND_BLOCKED_ACTIVE_JOBS:queue=${before.jobs.in_queue}:progress=${before.jobs.in_progress}`);
    const templateId = await bindImage(evidence.image);
    await writeState({ state: "IMAGE_BOUND", endpoint_id: ENDPOINT_ID, template_id: templateId, image: evidence.image, source_sha: evidence.source_sha, old_job_terminal_status: old.status });
    await warmWorker();
    await workersMinZero(credentials.management);
    const jobId = await submitOne(evidence.image);
    const completed = await waitJob(jobId, JOB_WAIT_MS, "AVANTIQO_VOICE_TTS_CACHED_JOB_PROGRESS");
    if (!completed.terminal) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_JOB_WAIT_TIMEOUT:${completed.status}`);
    if (!completed.completed) throw new Error(`AVANTIQO_VOICE_TTS_CACHED_JOB_${completed.status}`);
    await saveAndPlay(completed.body, { job_id: jobId, image: evidence.image, source_sha: evidence.source_sha, recovered_from_cached_image: true });
  }
}
