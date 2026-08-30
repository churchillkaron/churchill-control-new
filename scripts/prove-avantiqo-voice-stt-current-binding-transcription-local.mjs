import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF_V2";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const NATIVE_IMAGE_PREFIX = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:";
const SERVICE_LOCK = Object.freeze({
  "services/avantiqo-voice-stt/handler.py": "d9d24ff5e2cde494cebde0d2df0a333d74ad0d91",
  "services/avantiqo-voice-stt/Dockerfile": "20f78962557f83f826ea06ba3310adcfc8a1655e",
  "services/avantiqo-voice-stt/requirements.txt": "9b1f4d662a7b13b65d192493ed738998d2172698",
});
const PROOF_SCRIPT = resolve("scripts/run-avantiqo-voice-stt-existing-audio-proof-local.mjs");
const AUDIO_AIFF = "/tmp/avantiqo-voice-stt-current-binding-proof.aiff";
const AUDIO_WAV = "/tmp/avantiqo-voice-stt-current-binding-proof.wav";
const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const IDLE_TIMEOUT = 5;
const POLL_MS = 3000;
const CLEANUP_TIMEOUT_MS = 180_000;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 900);
}
function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`${CONTRACT}_GIT_FAILED:${args.join(" ")}:${redact(result.stderr || result.stdout)}`);
  return text(result.stdout);
}
function gitSucceeds(args) {
  return spawnSync("git", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).status === 0;
}
async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || raw)}`);
  return body;
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
function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}
async function inventory(managementKey) {
  const [endpointBody, templateBody] = await Promise.all([
    requestJson(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
    requestJson(`${REST}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
  ]);
  const endpoints = normalizeList(endpointBody, ["endpoints", "serverlessEndpoints"]) || [];
  const templates = normalizeList(templateBody, ["templates"]) || [];
  const matches = endpoints.filter((row) => text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = templates.find((row) => text(row?.id) === templateId);
  if (!endpointId || !templateId || !template) throw new Error(`${CONTRACT}_ENDPOINT_TEMPLATE_BINDING_REQUIRED`);
  const consumers = endpoints.filter((row) => text(row?.templateId || row?.template?.id) === templateId);
  if (consumers.length !== 1 || text(consumers[0]?.id) !== endpointId) throw new Error(`${CONTRACT}_TEMPLATE_NOT_EXCLUSIVE:${consumers.length}`);
  return { endpoint, endpointId, templateId, template };
}
async function health(endpointId, queueKey) {
  return requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, queueKey);
}
function jobs(body = {}) {
  const value = body?.jobs || {};
  return {
    queued: Math.max(0, finite(value.inQueue ?? value.in_queue, 0)),
    progress: Math.max(0, finite(value.inProgress ?? value.in_progress, 0)),
  };
}
async function controlWorkers(endpointId, managementKey) {
  const body = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.workers)) return body.workers;
  if (Array.isArray(body?.data?.workers)) return body.data.workers;
  return [];
}
function activeWorkerCount(workers) {
  return workers.filter((worker) => {
    if (worker?.isStale === true) return false;
    const status = text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase();
    return status && !TERMINAL.has(status);
  }).length;
}
async function assertResting(state, queueKey, managementKey) {
  if (finite(state.endpoint?.workersMin, -1) !== 0 || finite(state.endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_ENDPOINT_MUST_START_0_0:${finite(state.endpoint?.workersMin)}/${finite(state.endpoint?.workersMax)}`);
  }
  const jobState = jobs(await health(state.endpointId, queueKey));
  if (jobState.queued !== 0 || jobState.progress !== 0) throw new Error(`${CONTRACT}_QUEUE_NOT_CLEAN:${jobState.queued}/${jobState.progress}`);
  const active = activeWorkerCount(await controlWorkers(state.endpointId, managementKey));
  if (active !== 0) throw new Error(`${CONTRACT}_ACTIVE_WORKER_PRESENT_AT_START:${active}`);
}
function verifyNativeSource(image) {
  if (!image.startsWith(NATIVE_IMAGE_PREFIX)) throw new Error(`${CONTRACT}_RUNPOD_NATIVE_IMAGE_REQUIRED:${image || "MISSING"}`);
  const sourceRef = image.slice(NATIVE_IMAGE_PREFIX.length);
  if (!/^[a-f0-9]{7,40}$/i.test(sourceRef)) throw new Error(`${CONTRACT}_NATIVE_IMAGE_SOURCE_REF_INVALID:${sourceRef || "MISSING"}`);

  runGit(["fetch", "origin", "main", "--quiet"]);
  const sourceSha = runGit(["rev-parse", `${sourceRef}^{commit}`]);
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error(`${CONTRACT}_NATIVE_IMAGE_SOURCE_SHA_INVALID:${sourceSha}`);
  if (!gitSucceeds(["merge-base", "--is-ancestor", sourceSha, "origin/main"])) {
    throw new Error(`${CONTRACT}_NATIVE_IMAGE_SOURCE_NOT_ON_MAIN:${sourceSha}`);
  }

  const blobs = {};
  for (const [path, expected] of Object.entries(SERVICE_LOCK)) {
    const imageBlob = runGit(["rev-parse", `${sourceSha}:${path}`]);
    const newestMainBlob = runGit(["rev-parse", `origin/main:${path}`]);
    if (imageBlob !== expected) throw new Error(`${CONTRACT}_NATIVE_IMAGE_SOURCE_DRIFT:${path}:${imageBlob}`);
    if (newestMainBlob !== expected) throw new Error(`${CONTRACT}_NEWEST_MAIN_VOICE_DRIFT:${path}:${newestMainBlob}`);
    blobs[path] = imageBlob;
  }

  return {
    source_ref: sourceRef,
    source_sha: sourceSha,
    source_is_ancestor_of_main: true,
    newest_main_voice_equivalent: true,
    blobs,
  };
}
function templateUpdateBody(template, imageName, registryAuthId) {
  const name = text(template?.name);
  if (!name) throw new Error(`${CONTRACT}_TEMPLATE_NAME_REQUIRED`);
  return {
    containerDiskInGb: Math.max(1, finite(template?.containerDiskInGb, 30)),
    containerRegistryAuthId: registryAuthId,
    dockerEntrypoint: list(template?.dockerEntrypoint),
    dockerStartCmd: list(template?.dockerStartCmd),
    env: normalizeEnv(template?.env),
    imageName,
    isPublic: template?.isPublic === true,
    name,
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, finite(template?.volumeInGb, 0)),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}
async function clearNativeRegistryAuth(state, managementKey, queueKey) {
  const image = text(state.template?.imageName);
  const source = verifyNativeSource(image);
  const existingAuth = text(state.template?.containerRegistryAuthId);
  if (!existingAuth) return { state, source, auth_cleared: false };

  await assertResting(state, queueKey, managementKey);
  await requestJson(`${REST}/templates/${encodeURIComponent(state.templateId)}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(state.template, image, ""),
  });
  const verified = await inventory(managementKey);
  await assertResting(verified, queueKey, managementKey);
  if (text(verified.template?.imageName) !== image) throw new Error(`${CONTRACT}_IMAGE_CHANGED_DURING_AUTH_CLEAR`);
  if (text(verified.template?.containerRegistryAuthId)) throw new Error(`${CONTRACT}_NATIVE_REGISTRY_AUTH_CLEAR_FAILED`);
  return { state: verified, source, auth_cleared: true };
}
async function patchScaling(endpointId, max, managementKey) {
  await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workers: { min: 0, max, idleTimeout: IDLE_TIMEOUT } },
  });
  const endpoint = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey);
  const workers = endpoint?.workers || {};
  if (finite(workers.min, -1) !== 0 || finite(workers.max, -1) !== max || finite(workers.idleTimeout, -1) !== IDLE_TIMEOUT) {
    throw new Error(`${CONTRACT}_SCALING_VERIFY_FAILED:${workers.min}/${workers.max}/${workers.idleTimeout}`);
  }
}
async function cleanup(endpointId, managementKey, queueKey) {
  try { await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/purge-queue`, queueKey, { method: "POST" }); } catch {}
  await patchScaling(endpointId, 0, managementKey);
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const endpoint = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey);
    const workers = endpoint?.workers || {};
    const active = activeWorkerCount(await controlWorkers(endpointId, managementKey));
    const state = jobs(await health(endpointId, queueKey));
    latest = {
      min: finite(workers.min, -1),
      max: finite(workers.max, -1),
      idle_timeout: finite(workers.idleTimeout, -1),
      active_workers: active,
      jobs_in_queue: state.queued,
      jobs_in_progress: state.progress,
    };
    if (latest.min === 0 && latest.max === 0 && latest.idle_timeout === IDLE_TIMEOUT && active === 0 && state.queued === 0 && state.progress === 0) return latest;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT:${JSON.stringify(latest)}`);
}
function createFixture() {
  const say = spawnSync("say", ["-o", AUDIO_AIFF, "Avantiqo voice is working and ready"], { stdio: "inherit", encoding: "utf8" });
  if (say.error || say.status !== 0 || !existsSync(AUDIO_AIFF)) throw new Error(`${CONTRACT}_MACOS_SAY_FIXTURE_FAILED`);
  const convert = spawnSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", AUDIO_AIFF, AUDIO_WAV], { stdio: "inherit", encoding: "utf8" });
  if (convert.error || convert.status !== 0 || !existsSync(AUDIO_WAV)) throw new Error(`${CONTRACT}_MACOS_AFCONVERT_FIXTURE_FAILED`);
}

if (!approved(process.env.AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF_APPROVED=YES_REQUIRED");
}
if (!existsSync(PROOF_SCRIPT)) throw new Error(`${CONTRACT}_PROOF_SCRIPT_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
let current = await inventory(managementKey);
await assertResting(current, queueKey, managementKey);
const normalized = await clearNativeRegistryAuth(current, managementKey, queueKey);
current = normalized.state;
const source = verifyNativeSource(text(current.template?.imageName));
if (text(current.template?.containerRegistryAuthId)) throw new Error(`${CONTRACT}_NATIVE_REGISTRY_AUTH_MUST_BE_EMPTY`);
if (list(current.template?.dockerEntrypoint).length || list(current.template?.dockerStartCmd).length) {
  throw new Error(`${CONTRACT}_LAUNCH_OVERRIDE_PRESENT`);
}
await assertResting(current, queueKey, managementKey);
createFixture();

let scalingAttempted = false;
let cleaned = null;
let failure = null;
try {
  console.log(JSON.stringify({
    event: `${CONTRACT}_BEGIN`,
    endpoint_name: ENDPOINT_NAME,
    binding_mode: "RUNPOD_GITHUB_NATIVE",
    native_source_verified: true,
    native_source: source,
    stale_external_registry_auth_cleared: normalized.auth_cleared,
    registry_auth_present: false,
    real_stt_jobs_expected: 1,
    tts_touched: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));

  scalingAttempted = true;
  await patchScaling(current.endpointId, 1, managementKey);
  await sleep(5000);

  const proof = spawnSync(process.execPath, [PROOF_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_API_KEY: queueKey,
      RUNPOD_MANAGEMENT_API_KEY: managementKey,
      RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID: current.endpointId,
      AVANTIQO_VOICE_STT_EXISTING_AUDIO_APPROVED: "YES",
      AVANTIQO_VOICE_STT_EXISTING_AUDIO: AUDIO_WAV,
      AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
      AVANTIQO_RUNPOD_SAFE_LEASE_LANE: "voice-stt",
      AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: current.endpointId,
      AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() + 20 * 60_000).toISOString(),
    },
    stdio: "inherit",
    encoding: "utf8",
  });
  if (proof.error) throw proof.error;
  if (proof.status !== 0) throw new Error(`${CONTRACT}_REAL_TRANSCRIPTION_FAILED:exit=${proof.status}`);
} catch (error) {
  failure = error;
} finally {
  if (scalingAttempted) {
    try { cleaned = await cleanup(current.endpointId, managementKey, queueKey); }
    catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else console.error(`${CONTRACT}_SECONDARY_CLEANUP_ERROR:${redact(cleanupError?.message)}`);
    }
  }
}

if (failure) throw failure;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  binding_mode: "RUNPOD_GITHUB_NATIVE",
  native_source_verified: true,
  native_source_sha: source.source_sha,
  stale_external_registry_auth_cleared: normalized.auth_cleared,
  registry_auth_present: false,
  real_stt_transcription_proved: true,
  permanent_rest_state: cleaned,
  tts_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF=PASS");
