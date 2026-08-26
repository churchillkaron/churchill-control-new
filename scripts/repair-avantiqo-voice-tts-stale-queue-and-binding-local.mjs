import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_STALE_QUEUE_BINDING_REPAIR_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const STALE_JOB_ID = "cd7fcbaa-80c6-46c8-8ae6-fcbdc4966ba4-e2";
const OLD_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:8a161dbb77e543d50222a414b1abd28d8e20987e5ad37375c85195b854d89642";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const POLL_MS = 3000;
const CANCEL_TIMEOUT_MS = 3 * 60_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);
const EXECUTING_WORKER_STATUSES = new Set(["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
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

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  }
  return result.stdout;
}

function certifiedImage() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const report = JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
  const tts = object(report?.tts);
  const image = text(tts?.immutable_image_reference);
  if (
    report?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
    tts?.success !== true ||
    tts?.startup_probe_outcome !== "success" ||
    tts?.python_process_breadcrumb_baked !== true ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_CERTIFIED_IMAGE_REQUIRED");
  }
  if (image === OLD_IMAGE) {
    throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_CERTIFIED_IMAGE_NOT_NEW");
  }
  return image;
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
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_STALE_QUEUE_REST");
}

async function queueRequest(endpointId, pathname, credentials, options = {}) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) return body || {};
    if (![401, 403].includes(response.status)) {
      const detail = text(body?.error || body?.message || raw).slice(0, 500);
      throw new Error(`RUNPOD_VOICE_TTS_STALE_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_STALE_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_STALE_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_VOICE_TTS_STALE_QUEUE_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

async function boundTemplate(endpoint, key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_TEMPLATE_LIST_INVALID");
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = templates.find((candidate) => text(candidate?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_TEMPLATE_NOT_FOUND");
  return { templateId, template };
}

async function snapshot(credentials) {
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`,
    credentials.management,
  );
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_ENDPOINT_MISMATCH");
  }
  const { templateId, template } = await boundTemplate(endpoint, credentials.management);
  const healthBody = await queueRequest(ENDPOINT_ID, "/health", credentials);
  const jobs = object(healthBody?.jobs);
  const health = {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
    workers: object(healthBody?.workers),
  };
  const exactJob = await queueRequest(
    ENDPOINT_ID,
    `/status/${encodeURIComponent(STALE_JOB_ID)}`,
    credentials,
  );
  const workers = await controlWorkers(ENDPOINT_ID, credentials.management);
  return {
    endpoint,
    templateId,
    template,
    health,
    exact_job: {
      id: STALE_JOB_ID,
      status: text(exactJob?.status).toUpperCase() || "UNKNOWN",
      delay_time_ms: number(exactJob?.delayTime ?? exactJob?.delay_time),
      execution_time_ms: number(exactJob?.executionTime ?? exactJob?.execution_time),
    },
    workers,
  };
}

function assess(state, nextImage) {
  const executingWorkers = state.workers.filter((worker) => EXECUTING_WORKER_STATUSES.has(worker.status));
  const reasons = [];
  if (Number(state.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(state.endpoint?.workersMax) !== 1) reasons.push("WORKERS_MAX_NOT_ONE");
  if (text(state.template?.imageName) !== OLD_IMAGE) reasons.push("CURRENT_IMAGE_NOT_EXPECTED_OLD_IMAGE");
  if (!nextImage || nextImage === OLD_IMAGE) reasons.push("CERTIFIED_IMAGE_INVALID");
  if (state.health.jobs.in_queue !== 1) reasons.push("QUEUE_COUNT_NOT_EXACTLY_ONE");
  if (state.health.jobs.in_progress !== 0) reasons.push("JOB_IN_PROGRESS_PRESENT");
  if (state.exact_job.status !== "IN_QUEUE") reasons.push("RECORDED_STALE_JOB_NOT_IN_QUEUE");
  if (executingWorkers.length) reasons.push("ACTIVE_EXECUTION_WORKER_PRESENT");
  const foreignWorkerImages = state.workers.filter((worker) => worker.image && worker.image !== OLD_IMAGE);
  if (foreignWorkerImages.length) reasons.push("UNEXPECTED_WORKER_IMAGE_PRESENT");
  return {
    safe_to_apply: reasons.length === 0,
    exact_stale_job_match:
      state.health.jobs.in_queue === 1 &&
      state.health.jobs.in_progress === 0 &&
      state.exact_job.status === "IN_QUEUE",
    reasons,
    executing_workers: executingWorkers,
    foreign_worker_images: foreignWorkerImages,
  };
}

function runBindingRepairApply() {
  const result = spawnSync(
    process.execPath,
    ["--env-file=.env.local", "scripts/repair-avantiqo-voice-tts-runtime-binding-local.mjs", "--apply"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        AVANTIQO_VOICE_TTS_RUNTIME_BINDING_REPAIR_APPROVED: "YES",
      },
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_VOICE_TTS_STALE_QUEUE_BINDING_CHILD_FAILED:${result.status}`);
  }
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_STALE_QUEUE_BINDING_REPAIR_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_BINDING_REPAIR_APPROVED=YES_REQUIRED");
}

const configuredEndpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
if (configuredEndpointId !== ENDPOINT_ID) {
  throw new Error(`AVANTIQO_VOICE_TTS_STALE_QUEUE_ENDPOINT_ENV_MISMATCH:${configuredEndpointId}`);
}

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};
const nextImage = certifiedImage();
const initial = await snapshot(credentials);
const assessment = assess(initial, nextImage);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    template_id: initial.templateId,
    workers_min: Number(initial.endpoint?.workersMin),
    workers_max: Number(initial.endpoint?.workersMax),
  },
  current_image: text(initial.template?.imageName) || null,
  certified_image: nextImage,
  stale_job: initial.exact_job,
  health: initial.health,
  workers: initial.workers,
  assessment,
  planned_actions: assessment.safe_to_apply
    ? [
        `cancel_exact_job:${STALE_JOB_ID}`,
        "wait_for_queue_zero",
        "drain_unhealthy_old_image_workers",
        "bind_certified_image",
        "restore_scale_to_zero_workers_max_1",
      ]
    : [],
  queue_purge_planned: false,
  generation_submitted: false,
  mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) process.exit(0);
if (!assessment.safe_to_apply) {
  throw new Error(`AVANTIQO_VOICE_TTS_STALE_QUEUE_APPLY_UNSAFE:${assessment.reasons.join(",")}`);
}

await queueRequest(
  ENDPOINT_ID,
  `/cancel/${encodeURIComponent(STALE_JOB_ID)}`,
  credentials,
  { method: "POST" },
);

const cancelDeadline = Date.now() + CANCEL_TIMEOUT_MS;
let terminalStatus = "IN_QUEUE";
let queueZeroObservations = 0;
while (Date.now() < cancelDeadline) {
  const [job, healthBody] = await Promise.all([
    queueRequest(ENDPOINT_ID, `/status/${encodeURIComponent(STALE_JOB_ID)}`, credentials),
    queueRequest(ENDPOINT_ID, "/health", credentials),
  ]);
  terminalStatus = text(job?.status).toUpperCase() || "UNKNOWN";
  const jobs = object(healthBody?.jobs);
  const inQueue = number(jobs.inQueue ?? jobs.in_queue);
  const inProgress = number(jobs.inProgress ?? jobs.in_progress);
  queueZeroObservations = inQueue === 0 && inProgress === 0 ? queueZeroObservations + 1 : 0;
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_STALE_QUEUE_CANCEL_PROGRESS",
    job_id: STALE_JOB_ID,
    status: terminalStatus,
    jobs: { in_queue: inQueue, in_progress: inProgress },
    queue_zero_observations: queueZeroObservations,
    generation_submitted: false,
    secrets_printed: false,
  }));
  if (TERMINAL.has(terminalStatus) && queueZeroObservations >= 2) break;
  await sleep(POLL_MS);
}

if (!TERMINAL.has(terminalStatus) || queueZeroObservations < 2) {
  throw new Error(`AVANTIQO_VOICE_TTS_STALE_QUEUE_CANCEL_TIMEOUT:${terminalStatus}`);
}

const afterCancel = await snapshot(credentials);
if (afterCancel.health.jobs.in_queue !== 0 || afterCancel.health.jobs.in_progress !== 0) {
  throw new Error("AVANTIQO_VOICE_TTS_STALE_QUEUE_NOT_EMPTY_AFTER_EXACT_CANCEL");
}

runBindingRepairApply();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  endpoint_id: ENDPOINT_ID,
  cancelled_job_id: STALE_JOB_ID,
  cancelled_job_status: terminalStatus,
  queue_purged: false,
  exact_job_cancelled: true,
  binding_repair_invoked: true,
  certified_image: nextImage,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
