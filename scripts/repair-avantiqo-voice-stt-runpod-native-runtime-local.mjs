import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const SOURCE_SHA = "3f300c60dc73e3717c19240fc87972d670a9311c";
const SOURCE_SHORT = SOURCE_SHA.slice(0, 9);
const RUNPOD_NATIVE_IMAGE = `registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:${SOURCE_SHORT}`;
const HANDLER_PATH = "services/avantiqo-voice-stt/handler.py";
const DOCKERFILE_PATH = "services/avantiqo-voice-stt/Dockerfile";
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function commandList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
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
function verifySourceLock() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const handler = runGit(["show", `${SOURCE_SHA}:${HANDLER_PATH}`]);
  const dockerfile = runGit(["show", `${SOURCE_SHA}:${DOCKERFILE_PATH}`]);
  const checks = {
    handler_prompt_ids: handler.includes('generate_kwargs["prompt_ids"] = prompt_ids'),
    handler_vocab_applied: handler.includes('"vocabulary_context_applied": prompt_ids is not None'),
    whisper_turbo: handler.includes('EXPECTED_FOUNDATION_MODEL = "openai/whisper-large-v3-turbo"'),
    cuda_128_image: dockerfile.includes("pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime"),
    runpod_handler_cmd: dockerfile.includes('CMD ["python", "-u", "handler.py"]'),
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`AVANTIQO_VOICE_STT_RUNPOD_NATIVE_SOURCE_LOCK_INVALID:${JSON.stringify(checks)}`);
  }
  return checks;
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
async function rest(path, key, options = {}) {
  return parseJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_NATIVE_REST");
}
async function queueHealth(endpointId, key) {
  return parseJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_NATIVE_QUEUE");
}
async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_NATIVE_CONTROL");
  return list(body?.workers);
}
function healthJobs(body = {}) {
  const jobs = object(body?.jobs);
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}
function activeWorkers(workers) {
  return workers.filter((worker) => {
    const status = text(worker?.status || worker?.desiredStatus).toUpperCase();
    return status && !TERMINAL.has(status) && worker?.isStale !== true;
  });
}
async function snapshot(managementKey, queueKey) {
  const raw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const endpoints = normalizeList(raw, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_VOICE_STT_NATIVE_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_NATIVE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!endpointId || !templateId) throw new Error("AVANTIQO_VOICE_STT_NATIVE_ENDPOINT_BINDING_REQUIRED");
  const templatesRaw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_STT_NATIVE_TEMPLATE_LIST_INVALID");
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_STT_NATIVE_TEMPLATE_NOT_FOUND");
  const [health, workers] = await Promise.all([
    queueHealth(endpointId, queueKey),
    controlWorkers(endpointId, managementKey),
  ]);
  return { endpoint, endpointId, template, templateId, jobs: healthJobs(health), workers };
}
function assertClean(state) {
  const active = activeWorkers(state.workers);
  const reasons = [];
  if (Number(state.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(state.endpoint?.workersMax) !== 0) reasons.push("WORKERS_MAX_NOT_ZERO");
  if (state.jobs.in_queue !== 0) reasons.push("JOBS_IN_QUEUE");
  if (state.jobs.in_progress !== 0) reasons.push("JOBS_IN_PROGRESS");
  if (active.length) reasons.push("ACTIVE_WORKER_PRESENT");
  if (reasons.length) throw new Error(`AVANTIQO_VOICE_STT_NATIVE_ENDPOINT_NOT_CLEAN:${reasons.join(",")}`);
}
function templateBody(template) {
  return {
    containerDiskInGb: Math.max(1, Number(template?.containerDiskInGb) || 30),
    ...(text(template?.containerRegistryAuthId) ? { containerRegistryAuthId: text(template.containerRegistryAuthId) } : {}),
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: Object.fromEntries(Object.entries(object(template?.env)).map(([key, value]) => [key, String(value ?? "")])),
    imageName: RUNPOD_NATIVE_IMAGE,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, Number(template?.volumeInGb) || 0),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR_APPROVED=YES_REQUIRED");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const sourceChecks = verifySourceLock();
const initial = await snapshot(managementKey, queueKey);
assertClean(initial);
const currentImage = text(initial.template?.imageName);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  template_id_present: true,
  source_sha: SOURCE_SHA,
  source_checks: sourceChecks,
  current_image: currentImage || null,
  desired_runpod_native_image: RUNPOD_NATIVE_IMAGE,
  image_change_required: currentImage !== RUNPOD_NATIVE_IMAGE,
  registry_auth_preserved: Boolean(text(initial.template?.containerRegistryAuthId)),
  workers_min: 0,
  workers_max: 0,
  jobs: initial.jobs,
  tts_touched: false,
  generation_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const before = await snapshot(managementKey, queueKey);
assertClean(before);
if (before.templateId !== initial.templateId) throw new Error("AVANTIQO_VOICE_STT_NATIVE_TEMPLATE_CHANGED_BEFORE_WRITE");
if (text(before.template?.imageName) !== currentImage) throw new Error("AVANTIQO_VOICE_STT_NATIVE_IMAGE_CHANGED_BEFORE_WRITE");
if (commandList(before.template?.dockerEntrypoint).length || commandList(before.template?.dockerStartCmd).length) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_LAUNCH_OVERRIDE_PRESENT");
}
if (currentImage !== RUNPOD_NATIVE_IMAGE) {
  await rest(`/templates/${encodeURIComponent(before.templateId)}/update`, managementKey, {
    method: "POST",
    body: templateBody(before.template),
  });
}
const verified = await snapshot(managementKey, queueKey);
assertClean(verified);
if (verified.templateId !== initial.templateId) throw new Error("AVANTIQO_VOICE_STT_NATIVE_TEMPLATE_CHANGED_DURING_APPLY");
if (text(verified.template?.imageName) !== RUNPOD_NATIVE_IMAGE) {
  throw new Error(`AVANTIQO_VOICE_STT_NATIVE_IMAGE_VERIFY_FAILED:${text(verified.template?.imageName)}`);
}
if (commandList(verified.template?.dockerEntrypoint).length || commandList(verified.template?.dockerStartCmd).length) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_COMMAND_OVERRIDE_VERIFY_FAILED");
}
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  image_change_performed: currentImage !== RUNPOD_NATIVE_IMAGE,
  verified_image: text(verified.template?.imageName),
  verified_workers_min: Number(verified.endpoint?.workersMin),
  verified_workers_max: Number(verified.endpoint?.workersMax),
  verified_jobs: verified.jobs,
  permanent_rest_state: "VOICE_STT_0_0",
  tts_touched: false,
  generation_submitted: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR=PASS");
