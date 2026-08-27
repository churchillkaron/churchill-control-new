import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_STT_RUNTIME_BINDING_REPAIR_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-stt-worker-image.json";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
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
  const image = text(report?.immutable_image_reference);
  const sourceSha = text(report?.source_sha);
  const valid =
    report?.success === true &&
    report?.contract === "AVANTIQO_VOICE_STT_WORKER_IMAGE_RESULT_V1" &&
    report?.source_sha_matches_trigger === true &&
    report?.vocabulary_context_prompt_ids_baked === true &&
    text(report?.foundation_model) === "openai/whisper-large-v3-turbo" &&
    text(report?.cuda_runtime_expected) === "12.8" &&
    /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) &&
    /^[a-f0-9]{40}$/i.test(sourceSha);
  if (!valid) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_CERTIFIED_IMAGE_REQUIRED");

  const handler = runGit(["show", `${sourceSha}:services/avantiqo-voice-stt/handler.py`]);
  if (!handler.includes('generate_kwargs["prompt_ids"] = prompt_ids')) {
    throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_VOCABULARY_PROMPT_IDS_REQUIRED");
  }
  if (!handler.includes('"vocabulary_context_applied": prompt_ids is not None')) {
    throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_VOCABULARY_EVIDENCE_REQUIRED");
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
  }), "RUNPOD_VOICE_STT_RUNTIME_BINDING_REST");
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
      throw new Error(`RUNPOD_VOICE_STT_RUNTIME_BINDING_QUEUE_HTTP_${response.status}`);
    }
    last = new Error(`RUNPOD_VOICE_STT_RUNTIME_BINDING_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_STT_RUNTIME_BINDING_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) },
  ), "RUNPOD_VOICE_STT_RUNTIME_BINDING_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    is_stale: worker?.isStale === true,
  }));
}

async function endpointByExactName(key) {
  const raw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", key);
  const endpoints = normalizeList(raw, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((item) => text(item?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_BINDING_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function boundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_TEMPLATE_LIST_INVALID");
  return templates;
}

async function snapshot(credentials) {
  const endpoint = await endpointByExactName(credentials.management);
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_ENDPOINT_ID_REQUIRED");
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID);
  if (configuredEndpointId && configuredEndpointId !== endpointId) {
    throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_BINDING_CONFIGURED_ENDPOINT_MISMATCH:${configuredEndpointId}:${endpointId}`);
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_TEMPLATE_ID_REQUIRED");
  const template = (await boundTemplates(credentials.management)).find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_BOUND_TEMPLATE_NOT_FOUND");
  const healthBody = await queueRead(endpointId, "/health", credentials);
  const jobs = object(healthBody?.jobs);
  const health = {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
  };
  const workers = await controlWorkers(endpointId, credentials.management);
  return { endpoint, endpointId, template, templateId, health, workers };
}

function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_GHCR_AUTH_REQUIRED");
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

function activeExecutionWorkers(workers) {
  return workers.filter((worker) => ACTIVE_WORKER_STATUSES.has(worker.status) && worker.is_stale !== true);
}

function safety(snapshotValue) {
  const entrypoint = commandList(snapshotValue.template?.dockerEntrypoint);
  const startCmd = commandList(snapshotValue.template?.dockerStartCmd);
  const active = activeExecutionWorkers(snapshotValue.workers);
  const workersMin = Number(snapshotValue.endpoint?.workersMin);
  const workersMax = Number(snapshotValue.endpoint?.workersMax);
  const reasons = [];
  if (workersMin !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (![0, 1].includes(workersMax)) reasons.push("WORKERS_MAX_NOT_SAFE_REST_OR_SINGLE");
  if (snapshotValue.health.jobs.in_queue !== 0) reasons.push("JOBS_IN_QUEUE");
  if (snapshotValue.health.jobs.in_progress !== 0) reasons.push("JOBS_IN_PROGRESS");
  if (active.length) reasons.push("ACTIVE_EXECUTION_WORKER_PRESENT");
  if (entrypoint.length || startCmd.length) reasons.push("BOUND_TEMPLATE_LAUNCH_OVERRIDE_PRESENT");
  return { safe: reasons.length === 0, reasons, active_execution_workers: active };
}

async function patchScale(endpointId, key, workersMax) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const endpoint = await endpointByExactName(key);
  if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== workersMax) {
    throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_BINDING_SCALE_VERIFY_FAILED:min=${endpoint?.workersMin}:max=${endpoint?.workersMax}`);
  }
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_STT_RUNTIME_BINDING_REPAIR_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_REPAIR_APPROVED=YES_REQUIRED");
}

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};
const certified = validateEvidence(newestEvidence());
const initial = await snapshot(credentials);
const initialSafety = safety(initial);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: initial.endpointId,
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
  permanent_rest_state: "VOICE_STT_0_0",
  tts_image_touched: false,
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
  throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_BINDING_APPLY_UNSAFE:${initialSafety.reasons.join(",")}`);
}

await patchScale(initial.endpointId, credentials.management, 0);

const deadline = Date.now() + DRAIN_TIMEOUT_MS;
let stable = 0;
while (Date.now() < deadline) {
  const workers = await controlWorkers(initial.endpointId, credentials.management);
  const active = activeExecutionWorkers(workers);
  stable = active.length === 0 ? stable + 1 : 0;
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_STT_RUNTIME_BINDING_DRAIN",
    active_workers: active,
    stable_observations: stable,
    generation_submitted: false,
    tts_image_touched: false,
    secrets_printed: false,
  }));
  if (stable >= 2) break;
  await sleep(POLL_MS);
}
if (stable < 2) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_DRAIN_TIMEOUT");

const drained = await snapshot(credentials);
if (drained.health.jobs.in_queue !== 0 || drained.health.jobs.in_progress !== 0) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_JOB_APPEARED_DURING_DRAIN");
}

if (text(drained.template?.imageName) !== certified.image) {
  await rest(`/templates/${encodeURIComponent(drained.templateId)}/update`, credentials.management, {
    method: "POST",
    body: templateUpdateBody(drained.template, certified.image),
  });
  plan.mutation_performed = true;
}

const templatesAfter = await boundTemplates(credentials.management);
const boundAfter = templatesAfter.find((item) => text(item?.id) === drained.templateId);
if (text(boundAfter?.imageName) !== certified.image) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_IMAGE_VERIFY_FAILED");
}
if (commandList(boundAfter?.dockerEntrypoint).length || commandList(boundAfter?.dockerStartCmd).length) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_COMMAND_OVERRIDE_VERIFY_FAILED");
}

await patchScale(initial.endpointId, credentials.management, 0);
const finalState = await snapshot(credentials);
if (text(finalState.template?.imageName) !== certified.image) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_FINAL_IMAGE_MISMATCH");
}
if (Number(finalState.endpoint?.workersMin) !== 0 || Number(finalState.endpoint?.workersMax) !== 0) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_FINAL_REST_STATE_MISMATCH");
}
if (finalState.health.jobs.in_queue !== 0 || finalState.health.jobs.in_progress !== 0) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_BINDING_FINAL_JOB_STATE_UNSAFE");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  endpoint_id: finalState.endpointId,
  endpoint_name: text(finalState.endpoint?.name) || null,
  template_id: finalState.templateId,
  certified_image: certified.image,
  certified_source_sha: certified.sourceSha,
  image_change_performed: plan.mutation_performed,
  workers_min: 0,
  workers_max: 0,
  permanent_rest_state: "VOICE_STT_0_0",
  vocabulary_context_prompt_ids_baked: true,
  tts_image_touched: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_RUNTIME_BINDING_REPAIR=PASS");
