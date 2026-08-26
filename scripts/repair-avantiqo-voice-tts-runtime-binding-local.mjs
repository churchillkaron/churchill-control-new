import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_RUNTIME_BINDING_REPAIR_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const POLL_MS = 3000;
const DRAIN_TIMEOUT_MS = 5 * 60_000;
const ACTIVE_WORKER_STATUSES = new Set(["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING", "UNHEALTHY"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
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
  if (result.status !== 0) throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  return result.stdout;
}

function newestEvidence() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  return JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
}

function validateEvidence(report) {
  const tts = object(report?.tts);
  const image = text(tts?.immutable_image_reference);
  const sourceSha = text(tts?.source_sha);
  const valid =
    report?.contract === "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" &&
    tts?.success === true &&
    tts?.source_sha_matches_trigger === true &&
    tts?.startup_probe_outcome === "success" &&
    tts?.python_process_breadcrumb_baked === true &&
    /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) &&
    /^[a-f0-9]{40}$/i.test(sourceSha);
  if (!valid) throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_CERTIFIED_IMAGE_REQUIRED");

  const dockerfile = runGit(["show", `${sourceSha}:services/avantiqo-voice-tts/Dockerfile`]);
  const handler = runGit(["show", `${sourceSha}:services/avantiqo-voice-tts/handler.py`]);
  if (!dockerfile.includes('CMD ["python", "-u", "/app/handler.py"]')) {
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_DIRECT_PYTHON_IMAGE_REQUIRED");
  }
  if (!handler.includes("AVANTIQO_VOICE_TTS_PYTHON_PROCESS")) {
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_PYTHON_BREADCRUMB_REQUIRED");
  }
  return { image, sourceSha };
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
  }), "RUNPOD_VOICE_TTS_RUNTIME_BINDING_REST");
}

async function queueRead(endpointId, pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) return body || {};
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_RUNTIME_BINDING_QUEUE_HTTP_${response.status}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_RUNTIME_BINDING_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_RUNTIME_BINDING_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) },
  ), "RUNPOD_VOICE_TTS_RUNTIME_BINDING_CONTROL");
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
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_TEMPLATE_LIST_INVALID");
  return templates;
}

async function snapshot(endpointId, credentials) {
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    credentials.management,
  );
  if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_ENDPOINT_MISMATCH");
  const endpointName = text(endpoint?.name);
  if (!endpointName.startsWith("avantiqo-voice-tts-v1")) {
    throw new Error(`AVANTIQO_VOICE_TTS_RUNTIME_BINDING_ENDPOINT_NAME_UNSAFE:${endpointName || "NONE"}`);
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = (await boundTemplates(credentials.management)).find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_BOUND_TEMPLATE_NOT_FOUND");
  const healthBody = await queueRead(endpointId, "/health", credentials);
  const jobs = object(healthBody?.jobs);
  const health = {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
    workers: object(healthBody?.workers),
  };
  const workers = await controlWorkers(endpointId, credentials.management);
  return { endpoint, template, templateId, health, workers };
}

function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_GHCR_AUTH_REQUIRED");
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

function safety(snapshotValue) {
  const entrypoint = commandList(snapshotValue.template?.dockerEntrypoint);
  const startCmd = commandList(snapshotValue.template?.dockerStartCmd);
  const activeExecutionWorkers = snapshotValue.workers.filter((worker) =>
    ["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING"].includes(worker.status),
  );
  const reasons = [];
  if (Number(snapshotValue.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(snapshotValue.endpoint?.workersMax) !== 1) reasons.push("WORKERS_MAX_NOT_ONE");
  if (snapshotValue.health.jobs.in_queue !== 0) reasons.push("JOBS_IN_QUEUE");
  if (snapshotValue.health.jobs.in_progress !== 0) reasons.push("JOBS_IN_PROGRESS");
  if (activeExecutionWorkers.length) reasons.push("ACTIVE_EXECUTION_WORKER_PRESENT");
  if (entrypoint.length || startCmd.length) reasons.push("BOUND_TEMPLATE_LAUNCH_OVERRIDE_PRESENT");
  return { safe: reasons.length === 0, reasons, activeExecutionWorkers };
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
    throw new Error(`AVANTIQO_VOICE_TTS_RUNTIME_BINDING_SCALE_VERIFY_FAILED:min=${endpoint?.workersMin}:max=${endpoint?.workersMax}`);
  }
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_RUNTIME_BINDING_REPAIR_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_REPAIR_APPROVED=YES_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};
const certified = validateEvidence(newestEvidence());
const initial = await snapshot(endpointId, credentials);
const initialSafety = safety(initial);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: endpointId,
    name: text(initial.endpoint?.name) || null,
    workers_min: Number(initial.endpoint?.workersMin),
    workers_max: Number(initial.endpoint?.workersMax),
    template_id: initial.templateId,
  },
  current_image: text(initial.template?.imageName) || null,
  certified_image: certified.image,
  certified_source_sha: certified.sourceSha,
  image_change_required: text(initial.template?.imageName) !== certified.image,
  health: initial.health,
  workers: initial.workers,
  safety: initialSafety,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
if (!initialSafety.safe) {
  throw new Error(`AVANTIQO_VOICE_TTS_RUNTIME_BINDING_APPLY_UNSAFE:${initialSafety.reasons.join(",")}`);
}

let scaledDown = false;
try {
  await patchScale(endpointId, credentials.management, 0);
  scaledDown = true;

  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  while (Date.now() < deadline) {
    const workers = await controlWorkers(endpointId, credentials.management);
    const active = workers.filter((worker) => ACTIVE_WORKER_STATUSES.has(worker.status));
    stable = active.length === 0 ? stable + 1 : 0;
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_RUNTIME_BINDING_DRAIN",
      active_workers: active,
      stable_observations: stable,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (stable >= 2) break;
    await sleep(POLL_MS);
  }
  if (stable < 2) throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_DRAIN_TIMEOUT");

  const drained = await snapshot(endpointId, credentials);
  if (drained.health.jobs.in_queue !== 0 || drained.health.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_JOB_APPEARED_DURING_DRAIN");
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
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_IMAGE_VERIFY_FAILED");
  }
  if (commandList(boundAfter?.dockerEntrypoint).length || commandList(boundAfter?.dockerStartCmd).length) {
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_COMMAND_OVERRIDE_VERIFY_FAILED");
  }

  await patchScale(endpointId, credentials.management, 1);
  scaledDown = false;

  const finalState = await snapshot(endpointId, credentials);
  if (text(finalState.template?.imageName) !== certified.image) {
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_FINAL_IMAGE_MISMATCH");
  }
  if (finalState.health.jobs.in_queue !== 0 || finalState.health.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_RUNTIME_BINDING_FINAL_JOB_STATE_UNSAFE");
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    endpoint_id: endpointId,
    template_id: finalState.templateId,
    certified_image: certified.image,
    certified_source_sha: certified.sourceSha,
    workers_min: Number(finalState.endpoint?.workersMin),
    workers_max: Number(finalState.endpoint?.workersMax),
    workers: finalState.workers,
    health: finalState.health,
    mutation_performed: true,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
} finally {
  if (scaledDown) {
    try {
      await patchScale(endpointId, credentials.management, 1);
    } catch (error) {
      console.error(`AVANTIQO_VOICE_TTS_RUNTIME_BINDING_SCALE_RESTORE_FAILED:${text(error?.message || error)}`);
    }
  }
}
