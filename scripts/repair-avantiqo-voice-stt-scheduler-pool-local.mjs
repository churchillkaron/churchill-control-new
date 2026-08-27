import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR_V2";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";

// Ordered from preferred Voice-sized classes to moderate last-resort classes.
// The repair never introduces datacenter-class premium GPUs.
const GPU_PRIORITY_RULES = Object.freeze([
  Object.freeze({ rank: 0, family: "L4", pattern: /^NVIDIA\s+L4$/i, tier: "PRIMARY" }),
  Object.freeze({ rank: 1, family: "RTX_A4000", pattern: /RTX\s+A4000/i, tier: "PRIMARY" }),
  Object.freeze({ rank: 2, family: "RTX_4000_ADA", pattern: /RTX\s+4000.*ADA/i, tier: "PRIMARY" }),
  Object.freeze({ rank: 3, family: "RTX_A4500", pattern: /RTX\s+A4500/i, tier: "PRIMARY" }),
  Object.freeze({ rank: 4, family: "RTX_A5000", pattern: /RTX\s+A5000/i, tier: "PRIMARY" }),
  Object.freeze({ rank: 5, family: "RTX_3090", pattern: /RTX\s+3090/i, tier: "PRIMARY" }),
  Object.freeze({ rank: 6, family: "RTX_4090", pattern: /RTX\s+4090/i, tier: "FALLBACK" }),
  Object.freeze({ rank: 7, family: "RTX_5000_ADA", pattern: /RTX\s+5000.*ADA/i, tier: "FALLBACK" }),
  Object.freeze({ rank: 8, family: "RTX_A6000", pattern: /RTX\s+A6000/i, tier: "FALLBACK" }),
  Object.freeze({ rank: 9, family: "RTX_6000_ADA", pattern: /RTX\s+6000.*ADA/i, tier: "FALLBACK" }),
  Object.freeze({ rank: 10, family: "RTX_5090", pattern: /RTX\s+5090/i, tier: "FALLBACK" }),
]);
const FORBIDDEN_PREMIUM = /\b(?:B200|B300|H100|H200|A100)\b|RTX\s*PRO\s*6000.*BLACKWELL|L40S?\b/i;
const STOCK_RANK = Object.freeze({ HIGH: 4, MEDIUM: 3, LOW: 2, AVAILABLE: 1 });

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function sameSet(a, b) {
  const left = unique(a).sort();
  const right = unique(b).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function stockRank(value) { return STOCK_RANK[text(value).toUpperCase()] || 0; }
function endpointDataCenters(endpoint = {}) {
  if (Array.isArray(endpoint?.dataCenterIds)) return endpoint.dataCenterIds.map(text).filter(Boolean);
  if (text(endpoint?.dataCenterIds)) return text(endpoint.dataCenterIds).split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint?.networkVolumeId, ...list(endpoint?.networkVolumeIds)]);
}
function gpuDescriptor(row = {}) {
  return [row?.gpuTypeId, row?.gpuTypeDisplayName, row?.displayName].map(text).filter(Boolean).join(" ");
}
function allowedRule(row = {}) {
  const descriptor = gpuDescriptor(row);
  if (!descriptor || FORBIDDEN_PREMIUM.test(descriptor)) return null;
  return GPU_PRIORITY_RULES.find((rule) => rule.pattern.test(descriptor)) || null;
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
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_SCHEDULER_REST");
}
async function discoverCapacity(key) {
  const query = `
    query AvantiqoVoiceSttSchedulerCapacity($input: GpuAvailabilityInput) {
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
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 16,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 900);
    throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_CAPACITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function liveRows(dataCenters) {
  return list(dataCenters).flatMap((dc) =>
    list(dc?.gpuAvailability).map((gpu) => {
      const rule = allowedRule(gpu);
      return {
        data_center_id: text(dc?.id) || null,
        data_center_name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        gpu_type_id: text(gpu?.gpuTypeId) || null,
        gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus).toUpperCase() || "UNKNOWN",
        stock_rank: stockRank(gpu?.stockStatus),
        allowed: Boolean(rule),
        family: rule?.family || null,
        priority_rank: rule?.rank ?? null,
        tier: rule?.tier || null,
        premium_forbidden: FORBIDDEN_PREMIUM.test(gpuDescriptor(gpu)),
      };
    }),
  ).filter((row) => row.gpu_type_id);
}

function groupedCandidates(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.allowed || !row.available || row.stock_rank <= 0 || row.premium_forbidden) continue;
    const current = map.get(row.gpu_type_id) || {
      id: row.gpu_type_id,
      name: row.gpu_name,
      family: row.family,
      tier: row.tier,
      priority_rank: row.priority_rank,
      available_data_centers: [],
      best_stock_rank: 0,
      best_stock_status: null,
    };
    current.available_data_centers.push(row.data_center_id);
    if (row.stock_rank > current.best_stock_rank) {
      current.best_stock_rank = row.stock_rank;
      current.best_stock_status = row.stock_status;
    }
    map.set(row.gpu_type_id, current);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, available_data_centers: unique(entry.available_data_centers) }))
    .sort((a, b) =>
      a.priority_rank - b.priority_rank ||
      b.available_data_centers.length - a.available_data_centers.length ||
      b.best_stock_rank - a.best_stock_rank ||
      String(a.id).localeCompare(String(b.id)),
    );
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const [endpointsRaw, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  discoverCapacity(managementKey),
]);
const endpoints = Array.isArray(endpointsRaw)
  ? endpointsRaw
  : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items || endpointsRaw?.results);
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

const currentPool = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
const currentDataCenters = endpointDataCenters(endpoint);
const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length) {
  throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_POOL_UNEXPECTED_NETWORK_VOLUME:${volumeIds.length}`);
}

const capacityRows = liveRows(dataCenters);
const liveCandidates = groupedCandidates(capacityRows);
if (!liveCandidates.length) {
  const observedNonPremium = capacityRows
    .filter((row) => row.available && row.stock_rank > 0 && !row.premium_forbidden)
    .map((row) => row.gpu_type_id)
    .filter(Boolean);
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_name: ENDPOINT_NAME,
    current_gpu_pool: currentPool,
    current_data_center_ids: currentDataCenters,
    live_allowed_candidates: [],
    observed_available_nonpremium_gpu_type_ids: unique(observedNonPremium).slice(0, 40),
    premium_gpu_allowed: false,
    tts_touched: false,
    generation_submitted: false,
    secrets_printed: false,
  }, null, 2));
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_NO_ALLOWED_LIVE_SERVERLESS_CAPACITY");
}

// Keep the endpoint globally schedulable across live datacenters. The endpoint is stateless
// and has no network volume, so datacenter pinning only reduces capacity without benefit.
const selectedPool = liveCandidates.slice(0, 3).map((item) => item.id);
const selectedLiveDataCenters = unique(
  liveCandidates
    .filter((item) => selectedPool.includes(item.id))
    .flatMap((item) => item.available_data_centers),
);
if (selectedPool.some((id) => FORBIDDEN_PREMIUM.test(id))) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_PREMIUM_GPU_FORBIDDEN");
}

const dataCenterPinNeedsClearing = currentDataCenters.length > 0;
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  workers_min: 0,
  workers_max: 0,
  current_gpu_pool: currentPool,
  current_data_center_ids: currentDataCenters,
  live_allowed_capacity: liveCandidates,
  selected_gpu_pool: selectedPool,
  selected_gpu_live_data_centers: selectedLiveDataCenters,
  selected_tiers: unique(liveCandidates.filter((item) => selectedPool.includes(item.id)).map((item) => item.tier)),
  gpu_pool_mutation_required: !sameSet(currentPool, selectedPool),
  datacenter_pin_clear_required: dataCenterPinNeedsClearing,
  premium_gpu_allowed: false,
  network_volume_present: false,
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
if (!sameSet(list(before?.gpuTypeIds).map(text).filter(Boolean), currentPool)) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_CONCURRENT_GPU_POOL_CHANGE");
}
if (!sameSet(endpointDataCenters(before), currentDataCenters)) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_CONCURRENT_DATACENTER_CHANGE");
}
if (endpointVolumeIds(before).length) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_NETWORK_VOLUME_APPEARED");
}

if (!sameSet(currentPool, selectedPool) || dataCenterPinNeedsClearing) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      gpuTypeIds: selectedPool,
      ...(dataCenterPinNeedsClearing ? { dataCenterIds: [] } : {}),
      workersMin: 0,
      workersMax: 0,
    },
  });
}

const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
const verifiedPool = list(verified?.gpuTypeIds).map(text).filter(Boolean);
const verifiedDataCenters = endpointDataCenters(verified);
if (!sameSet(verifiedPool, selectedPool)) {
  throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_POOL_VERIFY_FAILED:${verifiedPool.join("|")}`);
}
if (dataCenterPinNeedsClearing && verifiedDataCenters.length !== 0) {
  throw new Error(`AVANTIQO_VOICE_STT_SCHEDULER_DATACENTER_CLEAR_VERIFY_FAILED:${verifiedDataCenters.join("|")}`);
}
if (Number(verified?.workersMin) !== 0 || Number(verified?.workersMax) !== 0) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_REST_STATE_VERIFY_FAILED");
}
if (text(verified?.templateId || verified?.template?.id) !== text(endpoint?.templateId || endpoint?.template?.id)) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_TEMPLATE_CHANGED_DURING_APPLY");
}
if (endpointVolumeIds(verified).length) {
  throw new Error("AVANTIQO_VOICE_STT_SCHEDULER_POOL_VOLUME_CHANGED_DURING_APPLY");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_performed: !sameSet(currentPool, selectedPool) || dataCenterPinNeedsClearing,
  verified_gpu_pool: verifiedPool,
  verified_data_center_ids: verifiedDataCenters,
  verified_workers_min: 0,
  verified_workers_max: 0,
  tts_touched: false,
  generation_submitted: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_SCHEDULER_POOL_REPAIR=PASS");
