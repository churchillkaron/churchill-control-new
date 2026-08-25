import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_RECOVERY_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const CURRENT_JOB_ID = "a6100711-05a4-4197-a764-39b1c267ead9-e2";
const REQUIRED_TRIGGER = "0ac618ff8cff5c70eae8973e7e1b40e87c93226a";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_AUDIO || path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_STATE || "/tmp/avantiqo-voice-tts-resident-recovery-state.json";
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_REPORT || "/tmp/avantiqo-voice-tts-resident-recovery-report.json";
const POLL_MS = 3000;
const BUILD_WAIT_MS = 45 * 60_000;
const JOB_WAIT_MS = 10 * 60_000;
const WARM_WAIT_MS = 10 * 60_000;

function text(v) { return String(v ?? "").trim(); }
function list(v) { return Array.isArray(v) ? v : []; }
function object(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
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
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function rest(pathname, key, options = {}) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_RESIDENT_REST");
}
async function queueRaw(pathname, key, options = {}) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
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
async function queue(pathname, credentials, options = {}) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await queueRaw(pathname, key, options);
    if (response.ok) return { body, key };
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_RESIDENT_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_RESIDENT_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_RESIDENT_QUEUE_CREDENTIAL_REQUIRED");
}
async function controlWorkers(key) {
  const body = await parseJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(ENDPOINT_ID)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_RESIDENT_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}
async function endpoint(key) {
  const value = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, key);
  if (text(value?.id) !== ENDPOINT_ID || text(value?.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_ENDPOINT_MISMATCH");
  return value;
}
async function workersMinZero(key) {
  let value = await endpoint(key);
  if (Number(value?.workersMin) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, key, { method: "PATCH", body: { workersMin: 0 } });
    value = await endpoint(key);
  }
  if (Number(value?.workersMin) !== 0) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_WORKERS_MIN_ZERO_VERIFY_FAILED");
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_TEMPLATE_LIST_INVALID");
  return templates;
}
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  return result.stdout;
}
function evidenceFromOrigin() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  return JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
}
function triggerIsAncestor(sourceSha) {
  return spawnSync("git", ["merge-base", "--is-ancestor", REQUIRED_TRIGGER, sourceSha], { stdio: "ignore" }).status === 0;
}
function validateEvidence(report) {
  const tts = object(report?.tts);
  const sourceSha = text(tts?.source_sha);
  const image = text(tts?.immutable_image_reference);
  const valid =
    report?.contract === "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" &&
    report?.success === true && tts?.success === true &&
    tts?.source_sha_matches_trigger === true && sourceSha === text(report?.trigger_sha) &&
    tts?.build_outcome === "success" && tts?.startup_probe_outcome === "success" &&
    tts?.blackwell_sm120_compiled === true &&
    text(tts?.foundation_model) === FOUNDATION && text(tts?.cuda_runtime_expected) === "12.8" &&
    /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) &&
    /^[a-f0-9]{40}$/i.test(sourceSha) && triggerIsAncestor(sourceSha) &&
    report?.provider_job_submitted === false && report?.production_web_deploy === false;
  return valid ? { image, source_sha: sourceSha, digest: text(tts?.image_digest), github_run_id: text(report?.github_run_id) } : null;
}
async function waitEvidence() {
  const deadline = Date.now() + BUILD_WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const report = evidenceFromOrigin();
      const valid = validateEvidence(report);
      if (valid) return valid;
      const source = text(report?.tts?.source_sha) || "NONE";
      if (source !== last) {
        console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_WAIT", current_source_sha: source, required_ancestor: REQUIRED_TRIGGER, generation_submitted: false, secrets_printed: false }));
        last = source;
      }
    } catch (error) {
      console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_WAIT", error: text(error?.message || error).slice(0, 300), generation_submitted: false, secrets_printed: false }));
    }
    await sleep(15_000);
  }
  throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_EVIDENCE_TIMEOUT");
}
async function waitJob(jobId, maxMs, label) {
  const deadline = Date.now() + maxMs;
  let last = "UNKNOWN";
  let lastPrint = 0;
  while (Date.now() < deadline) {
    const { body } = await queue(`/status/${encodeURIComponent(jobId)}`, credentials);
    const status = text(body?.status).toUpperCase() || "UNKNOWN";
    last = status;
    if (Date.now() - lastPrint > 15_000 || ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      console.log(JSON.stringify({ event: label, job_id: jobId, status, generation_submitted: false, duplicate_generation_submitted: false, secrets_printed: false }));
      lastPrint = Date.now();
    }
    if (status === "COMPLETED") return { terminal: true, completed: true, body, status };
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) return { terminal: true, completed: false, body, status };
    await sleep(POLL_MS);
  }
  return { terminal: false, completed: false, status: last };
}
function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_GHCR_AUTH_REQUIRED");
  return {
    containerDiskInGb: Math.max(1, Number(template?.containerDiskInGb) || 30),
    containerRegistryAuthId: authId,
    dockerEntrypoint: list(template?.dockerEntrypoint),
    dockerStartCmd: list(template?.dockerStartCmd),
    env: Object.fromEntries(Object.entries(object(template?.env)).map(([k, v]) => [k, String(v ?? "")])),
    imageName,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, Number(template?.volumeInGb) || 0),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}
async function bindImage(image, key) {
  const currentEndpoint = await endpoint(key);
  const templateId = text(currentEndpoint?.templateId || currentEndpoint?.template?.id);
  const templates = await endpointBoundTemplates(key);
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_BOUND_TEMPLATE_NOT_FOUND");
  if (text(template?.imageName) !== image) {
    await rest(`/templates/${encodeURIComponent(templateId)}/update`, key, { method: "POST", body: templateUpdateBody(template, image) });
  }
  const verified = (await endpointBoundTemplates(key)).find((item) => text(item?.id) === templateId);
  if (text(verified?.imageName) !== image) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_BIND_VERIFY_FAILED");
  return templateId;
}
async function warmFreshWorker(key) {
  await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, key, { method: "PATCH", body: { workersMin: 1 } });
  const deadline = Date.now() + WARM_WAIT_MS;
  try {
    while (Date.now() < deadline) {
      const workers = await controlWorkers(key);
      const freshReady = workers.find((worker) => !worker.is_stale && ["IDLE", "READY", "RUNNING", "THROTTLED"].includes(worker.status));
      console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_RESIDENT_WARM_PROGRESS", workers, fresh_ready: Boolean(freshReady), generation_submitted: false, secrets_printed: false }));
      if (freshReady) return freshReady;
      await sleep(5000);
    }
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_NON_STALE_WORKER_TIMEOUT");
  } finally {
    await workersMinZero(key);
  }
}
function validateAudio(body = {}) {
  const output = object(body?.output);
  const audio = Buffer.from(text(output?.audio_base64), "base64");
  if (
    audio.length <= 1000 || audio.subarray(0, 4).toString("ascii") !== "RIFF" ||
    text(output?.format).toLowerCase() !== "wav" || text(output?.capability) !== "ai.text.to.speech" ||
    text(output?.foundation_model) !== FOUNDATION || output?.voice_cloning_used !== false || output?.raw_reasoning_persisted !== false
  ) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_AUDIO_INVALID");
  return { audio, bytes: audio.length, sample_rate: Number(output?.sample_rate) || null, generation_seconds: Number(output?.generation_seconds) || null };
}
async function saveAndPlay(body, meta) {
  const validated = validateAudio(body);
  await mkdir(path.dirname(AUDIO_PATH), { recursive: true });
  await writeFile(AUDIO_PATH, validated.audio);
  await workersMinZero(credentials.management);
  const report = { success: true, contract: CONTRACT, endpoint_id: ENDPOINT_ID, job_id: meta.job_id, image: meta.image, source_sha: meta.source_sha || null, audio_path: AUDIO_PATH, audio_bytes: validated.bytes, sample_rate: validated.sample_rate, generation_seconds: validated.generation_seconds, workers_min: 0, always_on_billing_enabled: false, stt_submitted: false, production_deploy_performed: false, pricing_activation_performed: false, secrets_printed: false };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(STATE_PATH, `${JSON.stringify({ contract: CONTRACT, state: "COMPLETED", ...report }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`AVANTIQO_VOICE_TTS_RESIDENT_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") {
    const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
    console.log(`AVANTIQO_VOICE_TTS_RESIDENT_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
  }
}
async function submitOne(image, sourceSha) {
  const { body: health } = await queue("/health", credentials);
  const jobs = object(health?.jobs);
  if ((Number(jobs.inQueue ?? jobs.in_queue) || 0) > 0 || (Number(jobs.inProgress ?? jobs.in_progress) || 0) > 0) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_ENDPOINT_NOT_EMPTY");
  }
  const key = credentials.inference || credentials.management;
  const { response, body } = await queueRaw("/run", key, {
    method: "POST",
    body: { input: { contract: "AVANTIQO_VOICE_ENGINE_V1", capability: "ai.text.to.speech", foundation_model: FOUNDATION, organization_id: "benchmark-only", usage_id: `voice-tts-resident-${Date.now()}`, workload: { text: "Avantiqo voice generator is working and ready.", language: "en", voice: null, response_format: "wav" } } },
    timeoutMs: 12_000,
  });
  if (!response.ok) throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_SUBMIT_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  const jobId = text(body?.id);
  if (!jobId) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_ACCEPTED_WITHOUT_JOB_ID");
  await writeFile(STATE_PATH, `${JSON.stringify({ contract: CONTRACT, state: "SUBMITTED", endpoint_id: ENDPOINT_ID, job_id: jobId, image, source_sha: sourceSha, duplicate_generation_allowed: false, secrets_recorded: false }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_RESIDENT_JOB_SUBMITTED", job_id: jobId, new_job_count: 1, workers_min: 0, secrets_printed: false }));
  return jobId;
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_RESIDENT_RECOVERY_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_RECOVERY_APPROVED=YES_REQUIRED");
const credentials = { management: required("RUNPOD_MANAGEMENT_API_KEY"), inference: text(process.env.RUNPOD_API_KEY) };
await workersMinZero(credentials.management);

let state = null;
try { state = JSON.parse(await readFile(STATE_PATH, "utf8")); } catch { state = null; }
if (state?.contract === CONTRACT && text(state?.job_id) && state?.state !== "COMPLETED") {
  const resumed = await waitJob(text(state.job_id), JOB_WAIT_MS, "AVANTIQO_VOICE_TTS_RESIDENT_RESUME_PROGRESS");
  if (!resumed.terminal) throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_RESUME_TIMEOUT:${resumed.status}`);
  if (!resumed.completed) throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_RESUME_${resumed.status}`);
  await saveAndPlay(resumed.body, { job_id: text(state.job_id), image: text(state.image), source_sha: text(state.source_sha) });
} else if (state?.contract === CONTRACT && state?.state === "COMPLETED") {
  console.log(`AVANTIQO_VOICE_TTS_RESIDENT_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
} else {
  const current = await waitJob(CURRENT_JOB_ID, JOB_WAIT_MS, "AVANTIQO_VOICE_TTS_CURRENT_JOB_DRAIN_PROGRESS");
  if (!current.terminal) throw new Error(`AVANTIQO_VOICE_TTS_CURRENT_JOB_STILL_ACTIVE:${current.status}`);
  if (current.completed) {
    await saveAndPlay(current.body, { job_id: CURRENT_JOB_ID, image: null, source_sha: null });
  } else {
    const evidence = await waitEvidence();
    console.log(JSON.stringify({ event: "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_READY", source_sha: evidence.source_sha, image_digest: evidence.digest, github_run_id: evidence.github_run_id, generation_submitted: false, secrets_printed: false }));
    const templateId = await bindImage(evidence.image, credentials.management);
    await writeFile(STATE_PATH, `${JSON.stringify({ contract: CONTRACT, state: "IMAGE_BOUND", endpoint_id: ENDPOINT_ID, template_id: templateId, image: evidence.image, source_sha: evidence.source_sha, secrets_recorded: false }, null, 2)}\n`, "utf8");
    await warmFreshWorker(credentials.management);
    await workersMinZero(credentials.management);
    const jobId = await submitOne(evidence.image, evidence.source_sha);
    const completed = await waitJob(jobId, JOB_WAIT_MS, "AVANTIQO_VOICE_TTS_RESIDENT_JOB_PROGRESS");
    if (!completed.terminal) throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_JOB_TIMEOUT:${completed.status}`);
    if (!completed.completed) throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_JOB_${completed.status}`);
    await saveAndPlay(completed.body, { job_id: jobId, image: evidence.image, source_sha: evidence.source_sha });
  }
}
