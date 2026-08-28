import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_EXISTING_AUDIO_DIAGNOSTIC_V3";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const NATIVE_IMAGE_PREFIX = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:";
const STT_SOURCE = Object.freeze({
  handler_path: "services/avantiqo-voice-stt/handler.py",
  handler_blob_sha: "d9d24ff5e2cde494cebde0d2df0a333d74ad0d91",
  dockerfile_path: "services/avantiqo-voice-stt/Dockerfile",
  dockerfile_blob_sha: "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d",
  requirements_path: "services/avantiqo-voice-stt/requirements.txt",
  requirements_blob_sha: "9b1f4d662a7b13b65d192493ed738998d2172698",
});
const PROOF_SCRIPT = resolve("scripts/run-avantiqo-voice-stt-existing-audio-proof-local.mjs");
const LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const POLL_MS = 10_000;
const FORBIDDEN_PREMIUM = /\b(?:B200|B300|H100|H200|A100)\b|RTX\s*PRO\s*6000.*BLACKWELL|L40S?\b/i;
const ACTIVE_WORKER_STATUSES = new Set(["INITIALIZING", "READY", "RUNNING", "IDLE", "THROTTLED", "UNHEALTHY"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function safeDetail(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 500);
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
function commandList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const scalar = text(value);
  return scalar ? [scalar] : [];
}
function dataCenters(endpoint = {}) {
  if (Array.isArray(endpoint?.dataCenterIds)) return endpoint.dataCenterIds.map(text).filter(Boolean);
  if (text(endpoint?.dataCenterIds)) return text(endpoint.dataCenterIds).split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}
function volumeIds(endpoint = {}) {
  return [...new Set([endpoint?.networkVolumeId, ...list(endpoint?.networkVolumeIds)].map(text).filter(Boolean))];
}
function healthSummary(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
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
function workerSummary(worker = {}, templateImage = "") {
  const status = text(worker?.status || worker?.desiredStatus).toUpperCase() || null;
  const workerImage = text(worker?.image);
  return {
    status,
    active: Boolean(status && ACTIVE_WORKER_STATUSES.has(status) && worker?.isStale !== true),
    gpu_type_id: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker?.adjustedCostPerHr ?? worker?.costPerHr),
    stale: worker?.isStale === true,
    worker_image_present: Boolean(workerImage),
    image_matches_template: workerImage ? workerImage === templateImage : null,
  };
}
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`GIT_${text(args[0]).toUpperCase()}_FAILED:${safeDetail(result.stderr)}`);
  }
  return text(result.stdout);
}
function gitSucceeds(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0;
}
function sourceBlobs(ref) {
  return {
    handler_blob_sha: runGit(["rev-parse", `${ref}:${STT_SOURCE.handler_path}`]),
    dockerfile_blob_sha: runGit(["rev-parse", `${ref}:${STT_SOURCE.dockerfile_path}`]),
    requirements_blob_sha: runGit(["rev-parse", `${ref}:${STT_SOURCE.requirements_path}`]),
  };
}
function correctedSource(blobs) {
  return blobs.handler_blob_sha === STT_SOURCE.handler_blob_sha &&
    blobs.dockerfile_blob_sha === STT_SOURCE.dockerfile_blob_sha &&
    blobs.requirements_blob_sha === STT_SOURCE.requirements_blob_sha;
}
function verifyNativeImageSource(image) {
  const value = text(image);
  const base = {
    image: value || null,
    native_registry_image: value.startsWith(NATIVE_IMAGE_PREFIX),
    source_ref: null,
    source_sha: null,
    source_is_ancestor_of_main: false,
    newest_main_voice_equivalent: false,
    handler_blob_sha: null,
    dockerfile_blob_sha: null,
    requirements_blob_sha: null,
    newest_main_handler_blob_sha: null,
    newest_main_dockerfile_blob_sha: null,
    newest_main_requirements_blob_sha: null,
    source_verified: false,
  };
  if (!base.native_registry_image) return base;
  const sourceRef = value.slice(NATIVE_IMAGE_PREFIX.length);
  base.source_ref = sourceRef || null;
  if (!/^[a-f0-9]{7,40}$/i.test(sourceRef)) return base;
  try {
    const sourceSha = runGit(["rev-parse", `${sourceRef}^{commit}`]);
    const imageBlobs = sourceBlobs(sourceSha);
    const mainBlobs = sourceBlobs("origin/main");
    base.source_sha = sourceSha;
    base.source_is_ancestor_of_main = gitSucceeds(["merge-base", "--is-ancestor", sourceSha, "origin/main"]);
    base.handler_blob_sha = imageBlobs.handler_blob_sha;
    base.dockerfile_blob_sha = imageBlobs.dockerfile_blob_sha;
    base.requirements_blob_sha = imageBlobs.requirements_blob_sha;
    base.newest_main_handler_blob_sha = mainBlobs.handler_blob_sha;
    base.newest_main_dockerfile_blob_sha = mainBlobs.dockerfile_blob_sha;
    base.newest_main_requirements_blob_sha = mainBlobs.requirements_blob_sha;
    base.newest_main_voice_equivalent =
      imageBlobs.handler_blob_sha === mainBlobs.handler_blob_sha &&
      imageBlobs.dockerfile_blob_sha === mainBlobs.dockerfile_blob_sha &&
      imageBlobs.requirements_blob_sha === mainBlobs.requirements_blob_sha;
    base.source_verified =
      base.source_is_ancestor_of_main &&
      base.newest_main_voice_equivalent &&
      correctedSource(imageBlobs) &&
      correctedSource(mainBlobs);
  } catch (error) {
    base.source_error = safeDetail(error?.message);
  }
  return base;
}

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = safeDetail(body?.message || body?.error || body?.detail || raw);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function rest(path, key) {
  return parseJson(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_DIAGNOSTIC_REST");
}
async function queue(endpointId, key) {
  return parseJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_DIAGNOSTIC_QUEUE");
}
async function workers(endpointId, key) {
  const body = await parseJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_DIAGNOSTIC_CONTROL");
  return list(body?.workers);
}
async function resolveState(endpointId, managementKey, queueKey) {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_ENDPOINT_MISMATCH");
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_TEMPLATE_ID_REQUIRED");
  const templatesRaw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_TEMPLATE_LIST_INVALID");
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_TEMPLATE_NOT_FOUND");
  const templateImage = text(template?.imageName);
  const [health, workerRows] = await Promise.all([
    queue(endpointId, queueKey),
    workers(endpointId, managementKey),
  ]);
  return {
    endpoint,
    template,
    health: healthSummary(health),
    workers: workerRows.map((worker) => workerSummary(worker, templateImage)),
  };
}

if (!yes(process.env.AVANTIQO_VOICE_STT_DIAGNOSTIC_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_APPROVED=YES_REQUIRED");
}

if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED)) {
    throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
  }
  required("RUNPOD_MANAGEMENT_API_KEY");
  const result = spawnSync(
    process.execPath,
    [LEASE_SCRIPT, "--lane=voice-stt", "--ttl-ms=1200000", "--", process.execPath, resolve(process.argv[1])],
    { cwd: process.cwd(), env: process.env, stdio: "inherit", encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_SAFE_LEASE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_SAFE_LEASE_FAILED:exit=${result.status}`);
  process.exit(0);
}

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
  throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_SAFE_LEASE_V2_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-stt") {
  throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_LANE_MISMATCH");
}
const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;

runGit(["fetch", "origin", "main", "--quiet"]);
const preflight = await resolveState(endpointId, managementKey, queueKey);
const gpuPool = list(preflight.endpoint?.gpuTypeIds).map(text).filter(Boolean);
const endpointDcs = dataCenters(preflight.endpoint);
const endpointVolumes = volumeIds(preflight.endpoint);
const templateImage = text(preflight.template?.imageName);
const nativeSource = verifyNativeImageSource(templateImage);
const allocatedWorkers = preflight.workers.filter((worker) => worker.active);
const preflightChecks = {
  endpoint_name: text(preflight.endpoint?.name) === ENDPOINT_NAME,
  lease_workers_min_zero: Number(preflight.endpoint?.workersMin) === 0,
  lease_workers_max_one: Number(preflight.endpoint?.workersMax) === 1,
  gpu_pool_present: gpuPool.length > 0,
  premium_gpu_absent: gpuPool.every((id) => !FORBIDDEN_PREMIUM.test(id)),
  datacenter_unpinned: endpointDcs.length === 0,
  network_volume_absent: endpointVolumes.length === 0,
  native_image_source_verified: nativeSource.source_verified === true,
  native_image_source_on_main: nativeSource.source_is_ancestor_of_main === true,
  newest_main_voice_equivalent: nativeSource.newest_main_voice_equivalent === true,
  docker_entrypoint_clear: commandList(preflight.template?.dockerEntrypoint).length === 0,
  docker_start_cmd_clear: commandList(preflight.template?.dockerStartCmd).length === 0,
  queue_clean: preflight.health.jobs.in_queue === 0 && preflight.health.jobs.in_progress === 0,
};
console.log(JSON.stringify({
  success: Object.values(preflightChecks).every(Boolean),
  contract: CONTRACT,
  mode: "PREFLIGHT",
  checks: preflightChecks,
  endpoint: {
    workers_min: finite(preflight.endpoint?.workersMin),
    workers_max: finite(preflight.endpoint?.workersMax),
    gpu_type_ids: gpuPool,
    data_center_ids: endpointDcs,
    network_volume_present: endpointVolumes.length > 0,
  },
  template: {
    image: templateImage || null,
    native_image_prefix: NATIVE_IMAGE_PREFIX,
    source_ref: nativeSource.source_ref,
    source_sha: nativeSource.source_sha,
    source_verified: nativeSource.source_verified,
    source_is_ancestor_of_main: nativeSource.source_is_ancestor_of_main,
    newest_main_voice_equivalent: nativeSource.newest_main_voice_equivalent,
    handler_blob_sha: nativeSource.handler_blob_sha,
    dockerfile_blob_sha: nativeSource.dockerfile_blob_sha,
    requirements_blob_sha: nativeSource.requirements_blob_sha,
    newest_main_handler_blob_sha: nativeSource.newest_main_handler_blob_sha,
    newest_main_dockerfile_blob_sha: nativeSource.newest_main_dockerfile_blob_sha,
    newest_main_requirements_blob_sha: nativeSource.newest_main_requirements_blob_sha,
    expected_handler_blob_sha: STT_SOURCE.handler_blob_sha,
    expected_dockerfile_blob_sha: STT_SOURCE.dockerfile_blob_sha,
    expected_requirements_blob_sha: STT_SOURCE.requirements_blob_sha,
    registry_auth_present_but_not_required_for_native_image: Boolean(text(preflight.template?.containerRegistryAuthId)),
  },
  scheduler_observation: {
    allocated_worker_observed: allocatedWorkers.length > 0,
    allocated_workers: allocatedWorkers,
    catalog_capacity_gate_used: false,
  },
  health: preflight.health,
  workers: preflight.workers,
  extra_stt_jobs_submitted: 0,
  tts_touched: false,
  secrets_printed: false,
}, null, 2));
if (!Object.values(preflightChecks).every(Boolean)) {
  throw new Error(`AVANTIQO_VOICE_STT_DIAGNOSTIC_PREFLIGHT_FAILED:${Object.entries(preflightChecks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
}

const startedAt = Date.now();
const child = spawn(process.execPath, [PROOF_SCRIPT], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
let exit = null;
child.on("exit", (code, signal) => { exit = { code, signal }; });

while (!exit) {
  await sleep(POLL_MS);
  if (exit) break;
  try {
    const state = await resolveState(endpointId, managementKey, queueKey);
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_DIAGNOSTIC_PROGRESS",
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      health: state.health,
      workers: state.workers,
      endpoint_gpu_type_ids: list(state.endpoint?.gpuTypeIds).map(text).filter(Boolean),
      endpoint_data_center_ids: dataCenters(state.endpoint),
      template_image: text(state.template?.imageName) || null,
      template_image_same_as_preflight: text(state.template?.imageName) === templateImage,
      extra_stt_jobs_submitted: 0,
      tts_touched: false,
      secrets_printed: false,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_DIAGNOSTIC_PROGRESS_ERROR",
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      error: safeDetail(error?.message),
      secrets_printed: false,
    }));
  }
}

const finalState = await resolveState(endpointId, managementKey, queueKey).catch((error) => ({ diagnostic_error: safeDetail(error?.message) }));
console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_DIAGNOSTIC_FINAL",
  elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
  child_exit_code: exit?.code ?? null,
  child_signal: exit?.signal ?? null,
  final_health: finalState?.health || null,
  final_workers: finalState?.workers || [],
  final_template_image: finalState?.template ? text(finalState.template?.imageName) || null : null,
  final_diagnostic_error: finalState?.diagnostic_error || null,
  extra_stt_jobs_submitted: 0,
  tts_touched: false,
  secrets_printed: false,
}, null, 2));

if (exit?.signal) throw new Error(`${CONTRACT}_PROOF_SIGNAL:${exit.signal}`);
if (exit?.code !== 0) throw new Error(`${CONTRACT}_PROOF_FAILED:exit=${exit?.code}`);
console.log("AVANTIQO_VOICE_STT_EXISTING_AUDIO_DIAGNOSTIC=PASS");