import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_QUEUED_JOB_IMAGE_HANDOFF_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const POLL_MS = 3000;
const EVIDENCE_POLL_MS = 15000;
const EVIDENCE_WAIT_MS = Math.max(
  60000,
  Math.min(45 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_HANDOFF_EVIDENCE_WAIT_MS || 45 * 60_000)),
);
const DRAIN_TIMEOUT_MS = Math.max(
  30000,
  Math.min(10 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_HANDOFF_DRAIN_TIMEOUT_MS || 5 * 60_000)),
);
const OBSERVE_MS = Math.max(
  30000,
  Math.min(15 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_HANDOFF_OBSERVE_MS || 10 * 60_000)),
);
const ACTIVE_WORKER_STATUSES = new Set([
  "IDLE",
  "READY",
  "RUNNING",
  "THROTTLED",
  "INITIALIZING",
  "UNHEALTHY",
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
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
  if (result.status !== 0) {
    throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  }
  return result.stdout;
}

function newestEvidence() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  return JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
}

function validateEvidence(report, expectedSourceSha) {
  const tts = object(report?.tts);
  const sourceSha = text(tts?.source_sha);
  if (sourceSha !== expectedSourceSha) return null;
  if (
    report?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
    tts?.success !== true ||
    tts?.source_sha_matches_trigger !== true ||
    tts?.startup_probe_outcome !== "success" ||
    tts?.python_process_breadcrumb_baked !== true ||
    tts?.container_startup_probe_passed_by_github_build !== true ||
    report?.production_web_deploy !== false ||
    report?.provider_job_submitted !== false ||
    report?.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_EXPECTED_IMAGE_BUILD_NOT_CERTIFIED");
  }
  const image = text(tts?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_IMMUTABLE_IMAGE_REQUIRED");
  }
  return { image, sourceSha };
}

async function waitForCertifiedEvidence(expectedSourceSha) {
  const deadline = Date.now() + EVIDENCE_WAIT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const report = newestEvidence();
    const currentSourceSha = text(report?.tts?.source_sha) || null;
    const certified = validateEvidence(report, expectedSourceSha);
    if (certified) {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_HANDOFF_CERTIFIED_IMAGE_READY",
        expected_source_sha: expectedSourceSha,
        certified_image: certified.image,
        attempts: attempt,
        generation_submitted: false,
        secrets_printed: false,
      }));
      return certified;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_HANDOFF_WAITING_FOR_CERTIFIED_IMAGE",
      attempt,
      expected_source_sha: expectedSourceSha,
      current_source_sha: currentSourceSha,
      generation_submitted: false,
      secrets_printed: false,
    }));
    await sleep(EVIDENCE_POLL_MS);
  }
  throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_CERTIFIED_IMAGE_WAIT_TIMEOUT");
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
    signal: AbortSignal.timeout(30000),
  }), "RUNPOD_VOICE_TTS_HANDOFF_REST");
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
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) return body || {};
    if (![401, 403].includes(response.status)) {
      const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
      throw new Error(`RUNPOD_VOICE_TTS_HANDOFF_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_HANDOFF_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_HANDOFF_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) },
  ), "RUNPOD_VOICE_TTS_HANDOFF_CONTROL");
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
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_TEMPLATE_LIST_INVALID");
  return templates;
}

async function snapshot(endpointId, jobId, credentials) {
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    credentials.management,
  );
  if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_ENDPOINT_MISMATCH");
  const endpointName = text(endpoint?.name);
  if (!endpointName.startsWith("avantiqo-voice-tts-v1")) {
    throw new Error(`AVANTIQO_VOICE_TTS_HANDOFF_ENDPOINT_NAME_UNSAFE:${endpointName || "NONE"}`);
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = (await boundTemplates(credentials.management)).find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_BOUND_TEMPLATE_NOT_FOUND");

  const healthBody = await queueRequest(endpointId, "/health", credentials);
  const jobs = object(healthBody?.jobs);
  const workersHealth = object(healthBody?.workers);
  const job = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, credentials);
  const workers = await controlWorkers(endpointId, credentials.management);

  return {
    endpoint,
    template,
    templateId,
    health: {
      jobs: {
        in_queue: number(jobs.inQueue ?? jobs.in_queue),
        in_progress: number(jobs.inProgress ?? jobs.in_progress),
      },
      workers: workersHealth,
    },
    job: {
      id: jobId,
      status: text(job?.status).toUpperCase() || "UNKNOWN",
    },
    workers,
  };
}

function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_GHCR_AUTH_REQUIRED");
  return {
    containerDiskInGb: Math.max(1, Number(template?.containerDiskInGb) || 30),
    containerRegistryAuthId: authId,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: Object.fromEntries(Object.entries(object(template?.env)).map(([key, value]) => [key, String(value ?? "")])),
    imageName,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, Number(template?.volumeInGb) || 0),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}

function assertQueuedJobSafe(state) {
  const entrypoint = commandList(state.template?.dockerEntrypoint);
  const startCmd = commandList(state.template?.dockerStartCmd);
  const runningWorkers = state.workers.filter((worker) => worker.status === "RUNNING");
  const reasons = [];
  if (Number(state.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(state.endpoint?.workersMax) !== 1) reasons.push("WORKERS_MAX_NOT_ONE");
  if (state.job.status !== "IN_QUEUE") reasons.push(`EXACT_JOB_NOT_IN_QUEUE:${state.job.status}`);
  if (state.health.jobs.in_queue !== 1) reasons.push(`QUEUE_COUNT_NOT_ONE:${state.health.jobs.in_queue}`);
  if (state.health.jobs.in_progress !== 0) reasons.push(`IN_PROGRESS_NOT_ZERO:${state.health.jobs.in_progress}`);
  if (number(state.health.workers?.running) !== 0) reasons.push("HEALTH_RUNNING_WORKER_PRESENT");
  if (runningWorkers.length) reasons.push("CONTROL_RUNNING_WORKER_PRESENT");
  if (entrypoint.length || startCmd.length) reasons.push("BOUND_TEMPLATE_LAUNCH_OVERRIDE_PRESENT");
  if (reasons.length) {
    throw new Error(`AVANTIQO_VOICE_TTS_HANDOFF_INITIAL_STATE_UNSAFE:${reasons.join(",")}`);
  }
}

async function patchScale(endpointId, key, workersMax) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    key,
  );
  if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== workersMax) {
    throw new Error(`AVANTIQO_VOICE_TTS_HANDOFF_SCALE_VERIFY_FAILED:min=${endpoint?.workersMin}:max=${endpoint?.workersMax}`);
  }
}

const apply = process.argv.includes("--apply");
const approved = yes(process.env.AVANTIQO_VOICE_TTS_QUEUED_JOB_IMAGE_HANDOFF_APPROVED);
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUED_JOB_IMAGE_HANDOFF_APPROVED=YES_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const jobId = required("AVANTIQO_VOICE_TTS_QUEUED_JOB_ID");
const expectedSourceSha = required("AVANTIQO_VOICE_TTS_EXPECTED_REFRESH_SOURCE_SHA");
if (!/^[a-f0-9]{40}$/i.test(expectedSourceSha)) {
  throw new Error("AVANTIQO_VOICE_TTS_EXPECTED_REFRESH_SOURCE_SHA_INVALID");
}
const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_HANDOFF_BEGIN",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_id: endpointId,
  queued_job_id: jobId,
  expected_refresh_source_sha: expectedSourceSha,
  new_generation_submitted: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

const certified = await waitForCertifiedEvidence(expectedSourceSha);
const initial = await snapshot(endpointId, jobId, credentials);
assertQueuedJobSafe(initial);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_id: endpointId,
  template_id: initial.templateId,
  queued_job_id: jobId,
  queued_job_status: initial.job.status,
  current_image: text(initial.template?.imageName) || null,
  certified_image: certified.image,
  image_change_required: text(initial.template?.imageName) !== certified.image,
  health: initial.health,
  workers: initial.workers,
  mutation_performed: false,
  generation_submitted: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) process.exit(0);

let scaledDown = false;
try {
  await patchScale(endpointId, credentials.management, 0);
  scaledDown = true;

  const drainDeadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  while (Date.now() < drainDeadline) {
    const workers = await controlWorkers(endpointId, credentials.management);
    const active = workers.filter((worker) => ACTIVE_WORKER_STATUSES.has(worker.status));
    stable = active.length === 0 ? stable + 1 : 0;
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_HANDOFF_DRAIN",
      active_workers: active,
      stable_observations: stable,
      queued_job_id: jobId,
      generation_submitted: false,
      job_cancel_requested: false,
      secrets_printed: false,
    }));
    if (stable >= 2) break;
    await sleep(POLL_MS);
  }
  if (stable < 2) throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_DRAIN_TIMEOUT");

  const drained = await snapshot(endpointId, jobId, credentials);
  if (
    drained.job.status !== "IN_QUEUE" ||
    drained.health.jobs.in_queue !== 1 ||
    drained.health.jobs.in_progress !== 0
  ) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_HANDOFF_JOB_CHANGED_DURING_DRAIN:status=${drained.job.status}:queue=${drained.health.jobs.in_queue}:progress=${drained.health.jobs.in_progress}`,
    );
  }

  if (text(drained.template?.imageName) !== certified.image) {
    await rest(`/templates/${encodeURIComponent(drained.templateId)}/update`, credentials.management, {
      method: "POST",
      body: templateUpdateBody(drained.template, certified.image),
    });
  }

  const templatesAfter = await boundTemplates(credentials.management);
  const boundAfter = templatesAfter.find((item) => text(item?.id) === drained.templateId);
  if (text(boundAfter?.imageName) !== certified.image) {
    throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_IMAGE_VERIFY_FAILED");
  }
  if (commandList(boundAfter?.dockerEntrypoint).length || commandList(boundAfter?.dockerStartCmd).length) {
    throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_COMMAND_OVERRIDE_VERIFY_FAILED");
  }

  const beforeRestore = await snapshot(endpointId, jobId, credentials);
  if (
    beforeRestore.job.status !== "IN_QUEUE" ||
    beforeRestore.health.jobs.in_queue !== 1 ||
    beforeRestore.health.jobs.in_progress !== 0
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_JOB_CHANGED_BEFORE_RESTORE");
  }

  await patchScale(endpointId, credentials.management, 1);
  scaledDown = false;

  const observeDeadline = Date.now() + OBSERVE_MS;
  let finalStatus = "IN_QUEUE";
  let finalHealth = null;
  while (Date.now() < observeDeadline) {
    const state = await snapshot(endpointId, jobId, credentials);
    finalStatus = state.job.status;
    finalHealth = state.health;
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_HANDOFF_PROGRESS",
      queued_job_id: jobId,
      status: finalStatus,
      health: finalHealth,
      workers: state.workers,
      certified_image: certified.image,
      generation_submitted: false,
      job_cancel_requested: false,
      secrets_printed: false,
    }));
    if (["IN_PROGRESS", "COMPLETED"].includes(finalStatus)) break;
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(finalStatus)) {
      throw new Error(`AVANTIQO_VOICE_TTS_HANDOFF_EXISTING_JOB_TERMINAL_${finalStatus}`);
    }
    await sleep(5000);
  }

  console.log(JSON.stringify({
    success: ["IN_PROGRESS", "COMPLETED"].includes(finalStatus),
    contract: CONTRACT,
    mode: "APPLY",
    endpoint_id: endpointId,
    queued_job_id: jobId,
    final_job_status: finalStatus,
    certified_image: certified.image,
    certified_source_sha: certified.sourceSha,
    health: finalHealth,
    mutation_performed: true,
    generation_submitted: false,
    job_cancel_requested: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));

  if (!["IN_PROGRESS", "COMPLETED"].includes(finalStatus)) {
    process.exitCode = 2;
  }
} catch (error) {
  if (scaledDown) {
    await patchScale(endpointId, credentials.management, 1).catch(() => null);
  }
  throw error;
}
