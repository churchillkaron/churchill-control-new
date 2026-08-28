import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_RUNTIME_PROBE_RUNNER_V4";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "voice-stt";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const TARGET_SOURCE_SHA = "ff11761b2876c70b74b0eaa45081dcaac592e9bc";
const NATIVE_IMAGE_PREFIX = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:";
const TARGET_IMAGE = `${NATIVE_IMAGE_PREFIX}${TARGET_SOURCE_SHA.slice(0, 9)}`;
const EXPECTED_HANDLER_BLOB = "d9d24ff5e2cde494cebde0d2df0a333d74ad0d91";
const EXPECTED_DOCKERFILE_BLOB = "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d";
const EXPECTED_REQUIREMENTS_BLOB = "9b1f4d662a7b13b65d192493ed738998d2172698";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_VOICE_STT_HANDLER_RUNTIME_PROBE_V1";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_VOICE_STT_RUNTIME_PROBE_V1";
const EXPECTED_FOUNDATION = "openai/whisper-large-v3-turbo";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const POLL_MS = 2000;
const CLAIM_TIMEOUT_MS = 180_000;
const COMPLETE_TIMEOUT_MS = 240_000;
const SAFE_LEASE_TTL_MS = 300_000;
const SAFE_LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1000);
}
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`);
  return text(result.stdout);
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VOICE_STT_PROBE_REST");
}
async function queue(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VOICE_STT_PROBE_QUEUE");
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
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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
function verifyNativeSource(image) {
  const value = text(image);
  if (value !== TARGET_IMAGE) {
    throw new Error(`AVANTIQO_VOICE_STT_PROBE_CORRECTED_NATIVE_IMAGE_REQUIRED:${value || "MISSING"}`);
  }
  runGit(["fetch", "origin", "main", "--quiet"]);
  const sourceSha = runGit(["rev-parse", `${TARGET_SOURCE_SHA}^{commit}`]);
  if (sourceSha !== TARGET_SOURCE_SHA) throw new Error(`AVANTIQO_VOICE_STT_PROBE_SOURCE_SHA_INVALID:${sourceSha}`);
  const handlerBlob = runGit(["rev-parse", `${sourceSha}:services/avantiqo-voice-stt/handler.py`]);
  const dockerfileBlob = runGit(["rev-parse", `${sourceSha}:services/avantiqo-voice-stt/Dockerfile`]);
  const requirementsBlob = runGit(["rev-parse", `${sourceSha}:services/avantiqo-voice-stt/requirements.txt`]);
  if (handlerBlob !== EXPECTED_HANDLER_BLOB) throw new Error(`AVANTIQO_VOICE_STT_PROBE_HANDLER_SOURCE_NOT_CURRENT:${handlerBlob}`);
  if (dockerfileBlob !== EXPECTED_DOCKERFILE_BLOB) throw new Error(`AVANTIQO_VOICE_STT_PROBE_DOCKERFILE_SOURCE_CHANGED:${dockerfileBlob}`);
  if (requirementsBlob !== EXPECTED_REQUIREMENTS_BLOB) throw new Error(`AVANTIQO_VOICE_STT_PROBE_REQUIREMENTS_SOURCE_CHANGED:${requirementsBlob}`);
  return {
    source_sha: sourceSha,
    source_ref: TARGET_SOURCE_SHA.slice(0, 9),
    handler_blob: handlerBlob,
    dockerfile_blob: dockerfileBlob,
    requirements_blob: requirementsBlob,
    native_image: TARGET_IMAGE,
  };
}
async function inventory(managementKey) {
  const [endpointsRaw, templatesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!endpoints || !templates) throw new Error("AVANTIQO_VOICE_STT_PROBE_INVENTORY_INVALID");
  const matches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_PROBE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
  if (templateMatches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_PROBE_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
  return { endpoint, template: templateMatches[0] };
}
async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try { await queue(endpointId, "/health", key); return { source, key }; } catch {}
  }
  throw new Error("AVANTIQO_VOICE_STT_PROBE_QUEUE_CREDENTIAL_NOT_FOUND");
}
async function cancel(endpointId, jobId, key) {
  if (!jobId) return;
  try { await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" }); } catch {}
}

if (!approved(process.env.AVANTIQO_VOICE_STT_RUNTIME_PROBE_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_APPROVED=YES_REQUIRED");
}

if (!approved(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  if (!approved(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED)) {
    throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
  }
  const result = spawnSync(
    process.execPath,
    [SAFE_LEASE_SCRIPT, "--lane=voice-stt", `--ttl-ms=${SAFE_LEASE_TTL_MS}`, "--", process.execPath, resolve(process.argv[1])],
    { cwd: process.cwd(), env: process.env, stdio: "inherit", encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_SAFE_LEASE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_SAFE_LEASE_FAILED:exit=${result.status}`);
  process.exit(0);
}

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT || text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_VALID_SAFE_LEASE_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const { endpoint, template } = await inventory(managementKey);
const endpointId = text(endpoint.id);
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_LEASE_ENDPOINT_MISMATCH");
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) {
  throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_LEASE_CAPACITY_REQUIRED:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
}
if (text(template.containerRegistryAuthId)) throw new Error("AVANTIQO_VOICE_STT_PROBE_NATIVE_REGISTRY_AUTH_MUST_BE_EMPTY");
if (list(template.dockerEntrypoint).length || list(template.dockerStartCmd).length) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_LAUNCH_OVERRIDE_PRESENT");
const source = verifyNativeSource(text(template.imageName));
const credential = await selectQueueCredential(endpointId, managementKey);
const before = healthSummary(await queue(endpointId, "/health", credential.key));
if (before.jobs.in_queue !== 0 || before.jobs.in_progress !== 0) throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_QUEUE_NOT_CLEAN:${JSON.stringify(before.jobs)}`);

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_PREFLIGHT",
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  workers_min: finite(endpoint.workersMin),
  workers_max: finite(endpoint.workersMax),
  template_image: text(template.imageName),
  source_verified: true,
  source,
  registry_auth_present: false,
  queue_credential_source: credential.source,
  queue_before: before,
  claim_timeout_seconds: Math.round(CLAIM_TIMEOUT_MS / 1000),
  completion_timeout_seconds: Math.round(COMPLETE_TIMEOUT_MS / 1000),
  safe_lease_ttl_seconds: Math.round(SAFE_LEASE_TTL_MS / 1000),
  transcription_requested: false,
  inference_requested: false,
  tts_touched: false,
  secrets_printed: false,
}, null, 2));

let jobId = null;
let claimed = false;
let completed = false;
let terminal = null;
const started = Date.now();
try {
  const submitted = await queue(endpointId, "/run", credential.key, {
    method: "POST",
    body: {
      input: {
        contract: "AVANTIQO_VOICE_ENGINE_V1",
        capability: "ai.speech.to.text",
        foundation_model: EXPECTED_FOUNDATION,
        operation: "runtime_probe",
      },
    },
    timeoutMs: 120_000,
  });
  jobId = text(submitted.id);
  if (!jobId) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_JOB_ID_REQUIRED");
  console.log(JSON.stringify({ event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_SUBMITTED", job_id_present: true, probe_jobs_submitted: 1, transcription_jobs_submitted: 0 }));

  while (Date.now() - started < COMPLETE_TIMEOUT_MS) {
    await sleep(POLL_MS);
    const [status, health] = await Promise.all([
      queue(endpointId, `/status/${encodeURIComponent(jobId)}`, credential.key),
      queue(endpointId, "/health", credential.key),
    ]);
    const state = text(status.status).toUpperCase();
    const summary = healthSummary(health);
    if (["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(state) || summary.jobs.in_progress > 0) claimed = true;
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_PROGRESS",
      elapsed_seconds: Math.round((Date.now() - started) / 1000),
      state: state || null,
      claimed,
      jobs: summary.jobs,
      workers: summary.workers,
    }));
    if (!claimed && Date.now() - started > CLAIM_TIMEOUT_MS) {
      throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_NOT_CLAIMED:state=${state || "UNKNOWN"}`);
    }
    if (state === "COMPLETED") {
      terminal = status;
      completed = true;
      break;
    }
    if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(state)) {
      terminal = status;
      throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_TERMINAL_${state}:${redact(status.error || status.output?.error)}`);
    }
  }
  if (!completed || !terminal) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_COMPLETION_TIMEOUT");
  const output = object(terminal.output);
  if (text(output.status) !== "completed") throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_OUTPUT_STATUS_INVALID");
  if (text(output.operation) !== "runtime_probe") throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_OPERATION_INVALID");
  if (text(output.probe_contract) !== EXPECTED_PROBE_CONTRACT) throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_CONTRACT_INVALID:${text(output.probe_contract)}`);
  if (text(output.runtime_revision) !== EXPECTED_RUNTIME_REVISION) throw new Error(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_REVISION_INVALID:${text(output.runtime_revision)}`);
  if (text(output.foundation_model) !== EXPECTED_FOUNDATION) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_FOUNDATION_INVALID");
  if (output.cuda_available !== true) throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_CUDA_NOT_AVAILABLE");
  if (output.inference_performed !== false || output.model_download_performed !== false || output.storage_mutation_performed !== false) {
    throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_SIDE_EFFECT_CONTRACT_INVALID");
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    probe_jobs_submitted: 1,
    transcription_jobs_submitted: 0,
    job_claimed: claimed,
    job_completed: completed,
    runtime: {
      probe_contract: output.probe_contract,
      entrypoint: output.entrypoint,
      runtime_revision: output.runtime_revision,
      model: output.model,
      foundation_model: output.foundation_model,
      device: output.device,
      cuda_available: output.cuda_available,
      torch_version: output.torch_version,
      torch_cuda_version: output.torch_cuda_version,
      recognizer_initialized: output.recognizer_initialized,
      inference_performed: output.inference_performed,
      model_download_performed: output.model_download_performed,
      storage_mutation_performed: output.storage_mutation_performed,
    },
    source,
    real_transcription_allowed_next: true,
    tts_touched: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VOICE_STT_RUNTIME_PROBE=PASS");
} catch (error) {
  if (jobId) await cancel(endpointId, jobId, credential.key);
  throw error;
}
