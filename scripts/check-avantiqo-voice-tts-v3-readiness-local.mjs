import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_V3_READINESS_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function commandList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const scalar = text(value);
  return scalar ? [scalar] : [];
}
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
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${text(args[0]).toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  return result.stdout;
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
async function rest(pathname, key) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), "RUNPOD_VOICE_TTS_READINESS_REST");
}
async function queueRead(endpointId, pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) return body || {};
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_READINESS_QUEUE_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_READINESS_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_READINESS_QUEUE_CREDENTIAL_REQUIRED");
}
async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) },
  ), "RUNPOD_VOICE_TTS_READINESS_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}
async function boundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_READINESS_TEMPLATE_LIST_INVALID");
  return templates;
}

runGit(["fetch", "origin", "main", "--quiet"]);
const evidence = JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
const tts = object(evidence?.tts);
const certifiedImage = text(tts?.immutable_image_reference);
const certifiedSourceSha = text(tts?.source_sha);
if (
  evidence?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
  tts?.success !== true ||
  tts?.source_sha_matches_trigger !== true ||
  tts?.startup_probe_outcome !== "success" ||
  tts?.container_startup_probe_passed_by_github_build !== true ||
  tts?.foundation_model !== "resemble-ai/chatterbox:multilingual-v3" ||
  tts?.blackwell_sm120_compiled !== true ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(certifiedImage)
) {
  throw new Error("AVANTIQO_VOICE_TTS_READINESS_CERTIFIED_V3_IMAGE_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

const endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  credentials.management,
);
if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_VOICE_TTS_READINESS_ENDPOINT_MISMATCH");
if (!text(endpoint?.name).startsWith("avantiqo-voice-tts-v1")) {
  throw new Error("AVANTIQO_VOICE_TTS_READINESS_ENDPOINT_NAME_UNSAFE");
}
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
const template = (await boundTemplates(credentials.management)).find((item) => text(item?.id) === templateId);
if (!template) throw new Error("AVANTIQO_VOICE_TTS_READINESS_BOUND_TEMPLATE_NOT_FOUND");

const [healthBody, workers] = await Promise.all([
  queueRead(endpointId, "/health", credentials),
  controlWorkers(endpointId, credentials.management),
]);
const jobs = object(healthBody?.jobs);
const workersHealth = object(healthBody?.workers);
const health = {
  jobs: {
    in_queue: number(jobs.inQueue ?? jobs.in_queue),
    in_progress: number(jobs.inProgress ?? jobs.in_progress),
  },
  workers: {
    idle: number(workersHealth.idle),
    initializing: number(workersHealth.initializing),
    ready: number(workersHealth.ready),
    running: number(workersHealth.running),
    throttled: number(workersHealth.throttled),
    unhealthy: number(workersHealth.unhealthy),
  },
};

const reasons = [];
if (Number(endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
if (Number(endpoint?.workersMax) !== 1) reasons.push("WORKERS_MAX_NOT_ONE");
if (health.jobs.in_queue !== 0) reasons.push(`JOBS_IN_QUEUE:${health.jobs.in_queue}`);
if (health.jobs.in_progress !== 0) reasons.push(`JOBS_IN_PROGRESS:${health.jobs.in_progress}`);
if (health.workers.unhealthy !== 0) reasons.push(`UNHEALTHY_WORKERS:${health.workers.unhealthy}`);
if (text(template?.imageName) !== certifiedImage) reasons.push("BOUND_IMAGE_NOT_CERTIFIED_V3");
if (commandList(template?.dockerEntrypoint).length || commandList(template?.dockerStartCmd).length) {
  reasons.push("BOUND_TEMPLATE_LAUNCH_OVERRIDE_PRESENT");
}
const mismatchedWorkers = workers.filter((worker) => worker.image && worker.image !== certifiedImage);
if (mismatchedWorkers.length) reasons.push("LIVE_WORKER_IMAGE_MISMATCH");
const staleWorkers = workers.filter((worker) => worker.is_stale);
if (staleWorkers.length) reasons.push("STALE_WORKER_PRESENT");

const result = {
  success: reasons.length === 0,
  contract: CONTRACT,
  ready_for_controlled_generation: reasons.length === 0,
  blockers: reasons,
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name) || null,
    template_id: templateId,
    workers_min: Number(endpoint?.workersMin),
    workers_max: Number(endpoint?.workersMax),
  },
  certified: {
    source_sha: certifiedSourceSha,
    image: certifiedImage,
    foundation_model: text(tts?.foundation_model) || null,
    cuda_runtime_expected: text(tts?.cuda_runtime_expected) || null,
    torch_runtime_expected: text(tts?.torch_runtime_expected) || null,
    blackwell_sm120_compiled: tts?.blackwell_sm120_compiled === true,
    runpod_fitness_sdk_required: text(tts?.runpod_fitness_sdk_required) || null,
  },
  bound_image: text(template?.imageName) || null,
  health,
  workers,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(result, null, 2));
if (!result.success) process.exitCode = 2;
