import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CATALOG = "https://api.runpod.io/v2/catalog/gpus";
const CONTRACT = "AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";

// Keep Voice STT on modest single-GPU classes only. Do not let scheduler repair
// silently introduce H100/H200/B200/A100/RTX PRO 6000 class spend.
const COST_GUARDED_GPU_PRIORITY = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
  "NVIDIA RTX 4000 Ada Generation",
  "NVIDIA GeForce RTX 4090",
  "NVIDIA RTX A4500",
  "NVIDIA RTX A4000",
]);
const FORBIDDEN_PREMIUM = /\b(?:B200|B300|H100|H200|A100)\b|RTX\s*PRO\s*6000/i;

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sameSet(a, b) {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function deepRows(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 5) return [];
  for (const key of ["data", "items", "results", "gpus", "catalog", "gpuTypes"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = deepRows(value[key], depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}
function gpuId(row = {}) {
  return text(row?.id || row?.gpuTypeId || row?.gpu_type_id || row?.name || row?.displayName);
}
function availabilityEntries(row = {}) {
  for (const value of [row?.availability, row?.availabilities, row?.dataCenters, row?.datacenters, row?.regions, row?.locations]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}
function availableSlotCount(row = {}) {
  return availabilityEntries(row).filter((entry) =>
    entry?.available === true ||
    Number(entry?.available) > 0 ||
    Number(entry?.count) > 0 ||
    Number(entry?.quantity) > 0 ||
    Number(entry?.availableCount) > 0 ||
    ["HIGH", "MEDIUM", "LOW", "AVAILABLE"].includes(text(entry?.stockStatus || entry?.status).toUpperCase())
  ).length;
}

async function json(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}
async function rest(path, key, options = {}) {
  return json(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_SCHEDULER_REST");
}
async function catalog(key) {
  const url = new URL(CATALOG);
  url.searchParams.set("include", "AVAILABILITY");
  url.searchParams.set("product", "SERVERLESS");
  return json(await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_SCHEDULER_CATALOG");
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const [endpointsRaw, catalogRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  catalog(managementKey),
]);
const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items || endpointsRaw?.results);
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_POOL_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
const endpoint = matches[0];
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_ENDPOINT_ID_REQUIRED");
if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== 0) {
  throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_POOL_ENDPOINT_NOT_RESTING:${endpoint?.workersMin}:${endpoint?.workersMax}`);
}
const activeWorkers = list(endpoint?.workers).filter((worker) => {
  const status = text(worker?.status || worker?.desiredStatus).toUpperCase();
  return status && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status) && worker?.isStale !== true;
});
if (activeWorkers.length) throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_ACTIVE_WORKER_PRESENT");

const rows = deepRows(catalogRaw);
if (!rows.length) throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_CATALOG_EMPTY");
const byId = new Map(rows.map((row) => [gpuId(row), row]).filter(([id]) => id));
const liveCandidates = COST_GUARDED_GPU_PRIORITY
  .map((id) => ({ id, row: byId.get(id) }))
  .filter((item) => item.row)
  .map((item) => ({ id: item.id, available_slots: availableSlotCount(item.row) }))
  .filter((item) => item.available_slots > 0);

if (!liveCandidates.length) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_NO_COST_GUARDED_SERVERLESS_CAPACITY");
}
const selectedPool = liveCandidates.slice(0, 3).map((item) => item.id);
if (selectedPool.some((id) => FORBIDDEN_PREMIUM.test(id))) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_PREMIUM_GPU_FORBIDDEN");
}
const currentPool = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  workers_min: 0,
  workers_max: 0,
  current_gpu_pool: currentPool,
  live_cost_guarded_capacity: liveCandidates,
  selected_gpu_pool: selectedPool,
  mutation_required: !sameSet(currentPool, selectedPool),
  premium_gpu_allowed: false,
  tts_touched: false,
  generation_submitted: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const before = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (text(before?.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_ENDPOINT_CHANGED");
if (Number(before?.workersMin) !== 0 || Number(before?.workersMax) !== 0) throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_CONCURRENT_SCALE_CHANGE");
if (text(before?.templateId || before?.template?.id) !== text(endpoint?.templateId || endpoint?.template?.id)) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_TEMPLATE_CHANGED");
}

if (!sameSet(list(before?.gpuTypeIds).map(text).filter(Boolean), selectedPool)) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: selectedPool, workersMin: 0, workersMax: 0 },
  });
}
const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
const verifiedPool = list(verified?.gpuTypeIds).map(text).filter(Boolean);
if (!sameSet(verifiedPool, selectedPool)) {
  throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_POOL_VERIFY_FAILED:${verifiedPool.join("|")}`);
}
if (Number(verified?.workersMin) !== 0 || Number(verified?.workersMax) !== 0) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_REST_STATE_VERIFY_FAILED");
}
if (text(verified?.templateId || verified?.template?.id) !== text(endpoint?.templateId || endpoint?.template?.id)) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_TEMPLATE_CHANGED_DURING_APPLY");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_performed: !sameSet(currentPool, selectedPool),
  verified_gpu_pool: verifiedPool,
  verified_workers_min: 0,
  verified_workers_max: 0,
  tts_touched: false,
  generation_submitted: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR=PASS");
