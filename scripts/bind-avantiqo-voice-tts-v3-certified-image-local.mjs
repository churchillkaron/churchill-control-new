import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_V3_CERTIFIED_IMAGE_BINDING_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const EVIDENCE_POLL_MS = 15000;
const EVIDENCE_WAIT_MS = Math.max(
  60000,
  Math.min(45 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_V3_EVIDENCE_WAIT_MS || 45 * 60_000)),
);
const DRAIN_POLL_MS = 3000;
const DRAIN_WAIT_MS = 5 * 60_000;
const STARTUP_POLL_MS = 5000;
const STARTUP_WAIT_MS = Math.max(
  60000,
  Math.min(10 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_V3_STARTUP_WAIT_MS || 5 * 60_000)),
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
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
  if (result.status !== 0) {
    throw new Error(`GIT_${text(args[0]).toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
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
    throw new Error("AVANTIQO_VOICE_TTS_V3_EXPECTED_IMAGE_NOT_CERTIFIED");
  }
  const image = text(tts?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_IMMUTABLE_IMAGE_REQUIRED");
  }

  const requirements = runGit(["show", `${sourceSha}:services/avantiqo-voice-tts/requirements.txt`]);
  const dockerfile = runGit(["show", `${sourceSha}:services/avantiqo-voice-tts/Dockerfile`]);
  const handler = runGit(["show", `${sourceSha}:services/avantiqo-voice-tts/handler.py`]);
  if (!requirements.includes("65b18437192794391a0308a8f705b1e33e633948")) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_SOURCE_PIN_REQUIRED");
  }
  if (!dockerfile.includes("AVANTIQO_VOICE_TTS_CHATTERBOX_V3_API=PASS")) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_BUILD_API_GATE_REQUIRED");
  }
  if (!dockerfile.includes('CMD ["python", "-u", "/app/handler.py"]')) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_DIRECT_PYTHON_IMAGE_REQUIRED");
  }
  if (!handler.includes('t3_model="v3"')) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_HANDLER_MODEL_REQUIRED");
  }
  return { image, sourceSha };
}

async function waitForEvidence(expectedSourceSha) {
  const deadline = Date.now() + EVIDENCE_WAIT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const report = newestEvidence();
    const currentSourceSha = text(report?.tts?.source_sha) || null;
    const certified = validateEvidence(report, expectedSourceSha);
    if (certified) {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_V3_CERTIFIED_IMAGE_READY",
        expected_source_sha: expectedSourceSha,
        certified_image: certified.image,
        attempts: attempt,
        generation_submitted: false,
        secrets_printed: false,
      }));
      return certified;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_V3_WAITING_FOR_CERTIFIED_IMAGE",
      attempt,
      expected_source_sha: expectedSourceSha,
      current_source_sha: currentSourceSha,
      generation_submitted: false,
      secrets_printed: false,
    }));
    await sleep(EVIDENCE_POLL_MS);
  }
  throw new Error("AVANTIQO_VOICE_TTS_V3_CERTIFIED_IMAGE_WAIT_TIMEOUT");
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
  }), "RUNPOD_VOICE_TTS_V3_REST");
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
      const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
      throw new Error(`RUNPOD_VOICE_TTS_V3_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_V3_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_V3_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) },
  ), "RUNPOD_VOICE_TTS_V3_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  }));
}

async function boundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_V3_TEMPLATE_LIST_INVALID");
  return templates;
}

async function snapshot(endpointId, credentials) {
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    credentials.management,
  );
  if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_VOICE_TTS_V3_ENDPOINT_MISMATCH");
  const endpointName = text(endpoint?.name);
  if (!endpointName.startsWith("avantiqo-voice-tts-v1")) {
    throw new Error(`AVANTIQO_VOICE_TTS_V3_ENDPOINT_NAME_UNSAFE:${endpointName || "NONE"}`);
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = (await boundTemplates(credentials.management)).find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_V3_BOUND_TEMPLATE_NOT_FOUND");
  const healthBody = await queueRead(endpointId, "/health", credentials);
  const jobs = object(healthBody?.jobs);
  const workersHealth = object(healthBody?.workers);
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
      workers: {
        idle: number(workersHealth.idle),
        initializing: number(workersHealth.initializing),
        ready: number(workersHealth.ready),
        running: number(workersHealth.running),
        throttled: number(workersHealth.throttled),
        unhealthy: number(workersHealth.unhealthy),
      },
    },
    workers,
  };
}

function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_TTS_V3_GHCR_AUTH_REQUIRED");
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

function assertInitialSafe(state) {
  const reasons = [];
  if (Number(state.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(state.endpoint?.workersMax) !== 1) reasons.push("WORKERS_MAX_NOT_ONE");
  if (state.health.jobs.in_queue !== 0) reasons.push(`JOBS_IN_QUEUE:${state.health.jobs.in_queue}`);
  if (state.health.jobs.in_progress !== 0) reasons.push(`JOBS_IN_PROGRESS:${state.health.jobs.in_progress}`);
  if (state.health.workers.running !== 0) reasons.push("HEALTH_RUNNING_WORKER_PRESENT");
  if (state.workers.some((worker) => worker.status === "RUNNING")) reasons.push("CONTROL_RUNNING_WORKER_PRESENT");
  if (commandList(state.template?.dockerEntrypoint).length || commandList(state.template?.dockerStartCmd).length) {
    reasons.push("BOUND_TEMPLATE_LAUNCH_OVERRIDE_PRESENT");
  }
  if (reasons.length) throw new Error(`AVANTIQO_VOICE_TTS_V3_INITIAL_STATE_UNSAFE:${reasons.join(",")}`);
}

async function patchScale(endpointId, key, workersMin, workersMax) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin, workersMax },
  });
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    key,
  );
  if (Number(endpoint?.workersMin) !== workersMin || Number(endpoint?.workersMax) !== workersMax) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_V3_SCALE_VERIFY_FAILED:min=${endpoint?.workersMin}:max=${endpoint?.workersMax}`,
    );
  }
}

async function drain(endpointId, credentials) {
  const deadline = Date.now() + DRAIN_WAIT_MS;
  let stable = 0;
  while (Date.now() < deadline) {
    const workers = await controlWorkers(endpointId, credentials.management);
    const active = workers.filter((worker) => ACTIVE_WORKER_STATUSES.has(worker.status));
    stable = active.length === 0 ? stable + 1 : 0;
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_V3_DRAIN",
      active_workers: active,
      stable_observations: stable,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (stable >= 2) return;
    await sleep(DRAIN_POLL_MS);
  }
  throw new Error("AVANTIQO_VOICE_TTS_V3_DRAIN_TIMEOUT");
}

async function proveStartup(endpointId, certifiedImage, credentials) {
  const deadline = Date.now() + STARTUP_WAIT_MS;
  while (Date.now() < deadline) {
    const state = await snapshot(endpointId, credentials);
    if (state.health.jobs.in_queue !== 0 || state.health.jobs.in_progress !== 0) {
      throw new Error("AVANTIQO_VOICE_TTS_V3_JOB_APPEARED_DURING_STARTUP_PROBE");
    }
    const mismatched = state.workers.filter((worker) => worker.image && worker.image !== certifiedImage);
    if (mismatched.length) {
      throw new Error("AVANTIQO_VOICE_TTS_V3_STARTUP_WORKER_IMAGE_MISMATCH");
    }
    if (state.health.workers.unhealthy > 0 || state.workers.some((worker) => worker.status === "UNHEALTHY")) {
      throw new Error("AVANTIQO_VOICE_TTS_V3_STARTUP_WORKER_UNHEALTHY");
    }
    const matchingReady = state.workers.filter(
      (worker) => worker.image === certifiedImage && ["IDLE", "READY", "RUNNING"].includes(worker.status),
    );
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_V3_STARTUP_PROGRESS",
      health: state.health,
      workers: state.workers,
      certified_image: certifiedImage,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (
      matchingReady.length > 0 &&
      (state.health.workers.idle > 0 || state.health.workers.ready > 0 || matchingReady.some((worker) => worker.status === "IDLE" || worker.status === "READY"))
    ) {
      return state;
    }
    await sleep(STARTUP_POLL_MS);
  }
  throw new Error("AVANTIQO_VOICE_TTS_V3_STARTUP_PROBE_TIMEOUT");
}

const apply = process.argv.includes("--apply");
if (!apply) throw new Error("AVANTIQO_VOICE_TTS_V3_BINDING_APPLY_REQUIRED");
if (!yes(process.env.AVANTIQO_VOICE_TTS_V3_BIND_STARTUP_PROBE_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_TTS_V3_BIND_STARTUP_PROBE_APPROVED=YES_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const expectedSourceSha = required("AVANTIQO_VOICE_TTS_EXPECTED_CERTIFIED_SOURCE_SHA");
if (!/^[a-f0-9]{40}$/i.test(expectedSourceSha)) {
  throw new Error("AVANTIQO_VOICE_TTS_EXPECTED_CERTIFIED_SOURCE_SHA_INVALID");
}
const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_V3_BINDING_BEGIN",
  contract: CONTRACT,
  endpoint_id: endpointId,
  expected_certified_source_sha: expectedSourceSha,
  generation_submitted: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

const certified = await waitForEvidence(expectedSourceSha);
const initial = await snapshot(endpointId, credentials);
assertInitialSafe(initial);

let warmProbeEnabled = false;
try {
  await patchScale(endpointId, credentials.management, 0, 0);
  await drain(endpointId, credentials);

  const drained = await snapshot(endpointId, credentials);
  if (drained.health.jobs.in_queue !== 0 || drained.health.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_JOB_APPEARED_DURING_DRAIN");
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
    throw new Error("AVANTIQO_VOICE_TTS_V3_IMAGE_VERIFY_FAILED");
  }
  if (commandList(boundAfter?.dockerEntrypoint).length || commandList(boundAfter?.dockerStartCmd).length) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_COMMAND_OVERRIDE_VERIFY_FAILED");
  }

  await patchScale(endpointId, credentials.management, 1, 1);
  warmProbeEnabled = true;
  const startupState = await proveStartup(endpointId, certified.image, credentials);

  await patchScale(endpointId, credentials.management, 0, 1);
  warmProbeEnabled = false;

  const finalState = await snapshot(endpointId, credentials);
  if (text(finalState.template?.imageName) !== certified.image) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_FINAL_IMAGE_MISMATCH");
  }
  if (finalState.health.jobs.in_queue !== 0 || finalState.health.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_FINAL_JOB_STATE_UNSAFE");
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: endpointId,
    template_id: finalState.templateId,
    certified_source_sha: certified.sourceSha,
    certified_image: certified.image,
    startup_proof: {
      health: startupState.health,
      workers: startupState.workers,
      generation_submitted: false,
    },
    final: {
      workers_min: Number(finalState.endpoint?.workersMin),
      workers_max: Number(finalState.endpoint?.workersMax),
      health: finalState.health,
      workers: finalState.workers,
    },
    mutation_performed: true,
    generation_submitted: false,
    job_cancel_requested: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
} catch (error) {
  if (warmProbeEnabled) {
    try { await patchScale(endpointId, credentials.management, 0, 1); } catch {}
  } else {
    try {
      const endpoint = await rest(
        `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
        credentials.management,
      );
      if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== 1) {
        await patchScale(endpointId, credentials.management, 0, 1);
      }
    } catch {}
  }
  throw error;
}
