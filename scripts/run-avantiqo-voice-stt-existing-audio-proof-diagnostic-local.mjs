import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_EXISTING_AUDIO_DIAGNOSTIC_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const EXPECTED_IMAGE = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:3f300c60d";
const PROOF_SCRIPT = resolve("scripts/run-avantiqo-voice-stt-existing-audio-proof-local.mjs");
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const GQL = "https://api.runpod.io/graphql";
const POLL_MS = 10_000;
const FORBIDDEN_PREMIUM = /\b(?:B200|B300|H100|H200|A100)\b|RTX\s*PRO\s*6000.*BLACKWELL|L40S?\b/i;

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
function workerSummary(worker = {}) {
  return {
    status: text(worker?.status || worker?.desiredStatus).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker?.adjustedCostPerHr ?? worker?.costPerHr),
    stale: worker?.isStale === true,
    image_matches_expected: !text(worker?.image) || text(worker?.image) === EXPECTED_IMAGE,
  };
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
async function discoverCapacity(key) {
  const queryText = `
    query AvantiqoVoiceSttDiagnosticCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: queryText,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 16, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = safeDetail(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw);
    throw new Error(`AVANTIQO_VOICE_STT_DIAGNOSTIC_CAPACITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
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
  const [health, workerRows] = await Promise.all([
    queue(endpointId, queueKey),
    workers(endpointId, managementKey),
  ]);
  return { endpoint, template, health: healthSummary(health), workers: workerRows.map(workerSummary) };
}

if (!yes(process.env.AVANTIQO_VOICE_STT_DIAGNOSTIC_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_APPROVED=YES_REQUIRED");
}
if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_SAFE_LEASE_REQUIRED");
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

const [preflight, capacity] = await Promise.all([
  resolveState(endpointId, managementKey, queueKey),
  discoverCapacity(managementKey),
]);
const gpuPool = list(preflight.endpoint?.gpuTypeIds).map(text).filter(Boolean);
const endpointDcs = dataCenters(preflight.endpoint);
const endpointVolumes = volumeIds(preflight.endpoint);
const liveCapacity = list(capacity).flatMap((dc) =>
  list(dc?.gpuAvailability)
    .filter((gpu) => gpu?.available === true && gpuPool.includes(text(gpu?.gpuTypeId)))
    .map((gpu) => ({
      data_center_id: text(dc?.id) || null,
      location: text(dc?.location || dc?.name) || null,
      gpu_type_id: text(gpu?.gpuTypeId) || null,
      stock_status: text(gpu?.stockStatus).toUpperCase() || "UNKNOWN",
    })),
);
const preflightChecks = {
  endpoint_name: text(preflight.endpoint?.name) === ENDPOINT_NAME,
  lease_workers_min_zero: Number(preflight.endpoint?.workersMin) === 0,
  lease_workers_max_one: Number(preflight.endpoint?.workersMax) === 1,
  gpu_pool_present: gpuPool.length > 0,
  premium_gpu_absent: gpuPool.every((id) => !FORBIDDEN_PREMIUM.test(id)),
  live_capacity_present: liveCapacity.length > 0,
  datacenter_unpinned: endpointDcs.length === 0,
  network_volume_absent: endpointVolumes.length === 0,
  native_image_bound: text(preflight.template?.imageName) === EXPECTED_IMAGE,
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
    image: text(preflight.template?.imageName) || null,
    expected_native_image: EXPECTED_IMAGE,
    registry_auth_present_but_not_required_for_native_image: Boolean(text(preflight.template?.containerRegistryAuthId)),
  },
  live_capacity: liveCapacity.slice(0, 40),
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
      native_image_bound: text(state.template?.imageName) === EXPECTED_IMAGE,
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
  final_diagnostic_error: finalState?.diagnostic_error || null,
  extra_stt_jobs_submitted: 0,
  tts_touched: false,
  secrets_printed: false,
}, null, 2));

if (exit?.signal) throw new Error(`${CONTRACT}_PROOF_SIGNAL:${exit.signal}`);
if (exit?.code !== 0) throw new Error(`${CONTRACT}_PROOF_FAILED:exit=${exit?.code}`);
console.log("AVANTIQO_VOICE_STT_EXISTING_AUDIO_DIAGNOSTIC=PASS");
