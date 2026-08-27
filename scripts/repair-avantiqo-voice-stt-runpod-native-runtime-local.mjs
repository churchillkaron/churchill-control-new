import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR_V2";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const FALLBACK_SOURCE_SHA = "3f300c60dc73e3717c19240fc87972d670a9311c";
const NATIVE_IMAGE_PREFIX = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:";
const FALLBACK_NATIVE_IMAGE = `${NATIVE_IMAGE_PREFIX}${FALLBACK_SOURCE_SHA.slice(0, 9)}`;
const SOURCE_LOCK = Object.freeze({
  handler_path: "services/avantiqo-voice-stt/handler.py",
  handler_blob_sha: "465da9267ababa6b2ded92f7ebb26e4bbeb34783",
  dockerfile_path: "services/avantiqo-voice-stt/Dockerfile",
  dockerfile_blob_sha: "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d",
  requirements_path: "services/avantiqo-voice-stt/requirements.txt",
  requirements_blob_sha: "9b1f4d662a7b13b65d192493ed738998d2172698",
});
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
function safeDetail(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 700);
}
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${safeDetail(result.stderr)}`);
  return text(result.stdout);
}
function verifyNativeImageSource(image) {
  const value = text(image);
  const result = {
    image: value || null,
    native_registry_image: value.startsWith(NATIVE_IMAGE_PREFIX),
    source_ref: null,
    source_sha: null,
    handler_blob_sha: null,
    dockerfile_blob_sha: null,
    requirements_blob_sha: null,
    source_verified: false,
  };
  if (!result.native_registry_image) return result;
  const sourceRef = value.slice(NATIVE_IMAGE_PREFIX.length);
  result.source_ref = sourceRef || null;
  if (!/^[a-f0-9]{7,40}$/i.test(sourceRef)) return result;
  try {
    const sourceSha = runGit(["rev-parse", `${sourceRef}^{commit}`]);
    const handlerBlob = runGit(["rev-parse", `${sourceSha}:${SOURCE_LOCK.handler_path}`]);
    const dockerfileBlob = runGit(["rev-parse", `${sourceSha}:${SOURCE_LOCK.dockerfile_path}`]);
    const requirementsBlob = runGit(["rev-parse", `${sourceSha}:${SOURCE_LOCK.requirements_path}`]);
    result.source_sha = sourceSha;
    result.handler_blob_sha = handlerBlob;
    result.dockerfile_blob_sha = dockerfileBlob;
    result.requirements_blob_sha = requirementsBlob;
    result.source_verified =
      handlerBlob === SOURCE_LOCK.handler_blob_sha &&
      dockerfileBlob === SOURCE_LOCK.dockerfile_blob_sha &&
      requirementsBlob === SOURCE_LOCK.requirements_blob_sha;
  } catch (error) {
    result.source_error = safeDetail(error?.message);
  }
  return result;
}
async function parseJsonResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = safeDetail(body?.message || body?.error || body?.detail || raw);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function rest(path, key, options = {}) {
  return parseJsonResponse(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_NATIVE_REST");
}
async function restAttempt(path, key, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return {
    ok: response.ok,
    status: response.status,
    body,
    detail: response.ok ? null : safeDetail(body?.message || body?.error || body?.detail || raw),
  };
}
async function queueHealth(endpointId, key) {
  return parseJsonResponse(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_NATIVE_QUEUE");
}
async function controlWorkers(endpointId, key) {
  const body = await parseJsonResponse(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
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
  const templateConsumers = endpoints.filter((item) => text(item?.templateId || item?.template?.id) === templateId);
  const [health, workers] = await Promise.all([
    queueHealth(endpointId, queueKey),
    controlWorkers(endpointId, managementKey),
  ]);
  return { endpoint, endpointId, template, templateId, templateConsumers, jobs: healthJobs(health), workers };
}
function assertClean(state) {
  const active = activeWorkers(state.workers);
  const reasons = [];
  if (Number(state.endpoint?.workersMin) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO");
  if (Number(state.endpoint?.workersMax) !== 0) reasons.push("WORKERS_MAX_NOT_ZERO");
  if (state.jobs.in_queue !== 0) reasons.push("JOBS_IN_QUEUE");
  if (state.jobs.in_progress !== 0) reasons.push("JOBS_IN_PROGRESS");
  if (active.length) reasons.push("ACTIVE_WORKER_PRESENT");
  if (state.templateConsumers.length !== 1 || text(state.templateConsumers[0]?.id) !== state.endpointId) {
    reasons.push("TEMPLATE_NOT_ENDPOINT_EXCLUSIVE");
  }
  if (reasons.length) throw new Error(`AVANTIQO_VOICE_STT_NATIVE_ENDPOINT_NOT_CLEAN:${reasons.join(",")}`);
}
function fullTemplateBody(template, imageName, authMode) {
  const body = {
    containerDiskInGb: Math.max(1, Number(template?.containerDiskInGb) || 30),
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
  if (authMode === "NULL") body.containerRegistryAuthId = null;
  if (authMode === "EMPTY") body.containerRegistryAuthId = "";
  return body;
}
async function attemptRegistryAuthClear(templateId, template, imageName, managementKey, queueKey) {
  const attempts = [];
  const strategies = [
    { name: "POST_UPDATE_NULL", path: `/templates/${encodeURIComponent(templateId)}/update`, method: "POST", body: fullTemplateBody(template, imageName, "NULL") },
    { name: "PATCH_NULL", path: `/templates/${encodeURIComponent(templateId)}`, method: "PATCH", body: { containerRegistryAuthId: null } },
    { name: "POST_UPDATE_OMIT", path: `/templates/${encodeURIComponent(templateId)}/update`, method: "POST", body: fullTemplateBody(template, imageName, "OMIT") },
    { name: "POST_UPDATE_EMPTY", path: `/templates/${encodeURIComponent(templateId)}/update`, method: "POST", body: fullTemplateBody(template, imageName, "EMPTY") },
  ];
  for (const strategy of strategies) {
    const response = await restAttempt(strategy.path, managementKey, { method: strategy.method, body: strategy.body });
    const row = { strategy: strategy.name, http_status: response.status, accepted: response.ok, detail: response.detail };
    attempts.push(row);
    if (!response.ok) continue;
    const state = await snapshot(managementKey, queueKey);
    assertClean(state);
    if (state.templateId !== templateId) throw new Error("AVANTIQO_VOICE_STT_NATIVE_TEMPLATE_CHANGED_DURING_AUTH_CLEAR");
    if (text(state.template?.imageName) !== imageName) throw new Error("AVANTIQO_VOICE_STT_NATIVE_IMAGE_CHANGED_DURING_AUTH_CLEAR");
    if (!text(state.template?.containerRegistryAuthId)) {
      return { cleared: true, strategy: strategy.name, attempts };
    }
  }
  return { cleared: false, strategy: null, attempts };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR_APPROVED=YES_REQUIRED");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
runGit(["fetch", "origin", "main", "--quiet"]);

const initial = await snapshot(managementKey, queueKey);
assertClean(initial);
const currentImage = text(initial.template?.imageName);
const currentSource = verifyNativeImageSource(currentImage);
const fallbackSource = verifyNativeImageSource(FALLBACK_NATIVE_IMAGE);
if (!fallbackSource.source_verified) throw new Error("AVANTIQO_VOICE_STT_NATIVE_FALLBACK_SOURCE_LOCK_INVALID");
const desiredImage = currentSource.source_verified ? currentImage : FALLBACK_NATIVE_IMAGE;
const desiredSource = currentSource.source_verified ? currentSource : fallbackSource;
const registryAuthPresent = Boolean(text(initial.template?.containerRegistryAuthId));
const launchOverridePresent = commandList(initial.template?.dockerEntrypoint).length > 0 || commandList(initial.template?.dockerStartCmd).length > 0;
const changeRequired = currentImage !== desiredImage || registryAuthPresent || launchOverridePresent;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  template_id_present: true,
  template_exclusive: initial.templateConsumers.length === 1,
  current_image: currentImage || null,
  current_native_source_verified: currentSource.source_verified,
  desired_runpod_native_image: desiredImage,
  desired_source_sha: desiredSource.source_sha,
  desired_source_verified: desiredSource.source_verified,
  source_blobs: {
    handler: desiredSource.handler_blob_sha,
    dockerfile: desiredSource.dockerfile_blob_sha,
    requirements: desiredSource.requirements_blob_sha,
  },
  registry_auth_present: registryAuthPresent,
  registry_auth_clear_required: registryAuthPresent,
  registry_auth_preserved: false,
  launch_override_clear_required: launchOverridePresent,
  image_change_required: currentImage !== desiredImage,
  template_change_required: changeRequired,
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
if (text(before.template?.containerRegistryAuthId) !== text(initial.template?.containerRegistryAuthId)) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_REGISTRY_AUTH_CHANGED_BEFORE_WRITE");
}

let clearResult = { cleared: !registryAuthPresent, strategy: registryAuthPresent ? null : "NOT_REQUIRED", attempts: [] };
if (changeRequired) {
  clearResult = await attemptRegistryAuthClear(before.templateId, before.template, desiredImage, managementKey, queueKey);
  if (!clearResult.cleared) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_REGISTRY_AUTH_CLEAR_FAILED:${JSON.stringify(clearResult.attempts)}`);
  }
}

const verified = await snapshot(managementKey, queueKey);
assertClean(verified);
if (verified.templateId !== initial.templateId) throw new Error("AVANTIQO_VOICE_STT_NATIVE_TEMPLATE_CHANGED_DURING_APPLY");
if (text(verified.template?.imageName) !== desiredImage) {
  throw new Error(`AVANTIQO_VOICE_STT_NATIVE_IMAGE_VERIFY_FAILED:${text(verified.template?.imageName)}`);
}
if (text(verified.template?.containerRegistryAuthId)) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_REGISTRY_AUTH_STILL_BOUND");
}
if (commandList(verified.template?.dockerEntrypoint).length || commandList(verified.template?.dockerStartCmd).length) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_COMMAND_OVERRIDE_VERIFY_FAILED");
}
const verifiedSource = verifyNativeImageSource(text(verified.template?.imageName));
if (!verifiedSource.source_verified) throw new Error("AVANTIQO_VOICE_STT_NATIVE_SOURCE_VERIFY_FAILED_AFTER_APPLY");

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  image_change_performed: currentImage !== desiredImage,
  registry_auth_clear_performed: registryAuthPresent,
  registry_auth_clear_strategy: clearResult.strategy,
  registry_auth_clear_attempts: clearResult.attempts,
  verified_registry_auth_present: false,
  verified_image: text(verified.template?.imageName),
  verified_source_sha: verifiedSource.source_sha,
  verified_workers_min: Number(verified.endpoint?.workersMin),
  verified_workers_max: Number(verified.endpoint?.workersMax),
  verified_jobs: verified.jobs,
  permanent_rest_state: "VOICE_STT_0_0",
  tts_touched: false,
  generation_submitted: false,
  queue_mutation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_RUNPOD_NATIVE_RUNTIME_REPAIR=PASS");
