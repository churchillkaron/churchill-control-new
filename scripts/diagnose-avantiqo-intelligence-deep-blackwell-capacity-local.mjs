const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_BLACKWELL_CAPACITY_V2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map((value) => text(value, 500)).filter(Boolean))];
const stockRank = (value) => ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value, 80).toUpperCase()] || 0);

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function rows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = rows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  if (body === null) throw new Error(`${CONTRACT}_INVALID_JSON`);
  return body;
}

async function discoverDatacenters(key) {
  const query = `
    query AvantiqoIntelligenceDeepBlackwellCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 20,
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
    throw new Error(`${CONTRACT}_GRAPHQL_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function resolveOne(items, name, code) {
  const matches = items.filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function capacityRow(dc = {}, gpu = {}) {
  return {
    data_center_id: text(dc?.id, 300) || null,
    data_center_name: text(dc?.name, 300) || null,
    location: text(dc?.location, 300) || null,
    storage_support: dc?.storageSupport === true,
    gpu_type_id: text(gpu?.gpuTypeId, 500) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId, 500) || null,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus, 80) || "UNAVAILABLE",
    stock_rank: stockRank(gpu?.stockStatus),
  };
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const [endpointsRaw, datacenters] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  discoverDatacenters(managementKey),
]);
const endpoints = rows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
const candidate = resolveOne(endpoints, CANDIDATE_NAME, `${CONTRACT}_CANDIDATE_RESOLUTION_FAILED`);
const deepGpuTypes = unique(list(deep?.gpuTypeIds));
const candidateGpuTypes = unique(list(candidate?.gpuTypeIds));
if (!deepGpuTypes.length || JSON.stringify([...deepGpuTypes].sort()) !== JSON.stringify([...candidateGpuTypes].sort())) {
  throw new Error(`${CONTRACT}_GPU_TYPE_PARITY_REQUIRED`);
}

const allRows = datacenters.flatMap((dc) => list(dc?.gpuAvailability).map((gpu) => capacityRow(dc, gpu)));
const configuredRows = allRows
  .filter((row) => deepGpuTypes.includes(row.gpu_type_id))
  .sort((a, b) => b.stock_rank - a.stock_rank || Number(b.available) - Number(a.available) || String(a.data_center_id).localeCompare(String(b.data_center_id)));
const availableRows = configuredRows.filter((row) => row.available && row.stock_rank > 0);
const seenGpuTypes = unique(configuredRows.map((row) => row.gpu_type_id));
const missingGpuTypes = deepGpuTypes.filter((id) => !seenGpuTypes.includes(id));

let diagnosis = "GENERAL_GPU_STOCK_REPORTED_SERVERLESS_CAPACITY_UNPROVEN";
if (availableRows.length === 0 && missingGpuTypes.length === deepGpuTypes.length) {
  diagnosis = "CONFIGURED_BLACKWELL_TYPES_NOT_RETURNED_BY_GENERAL_AVAILABILITY_API";
} else if (availableRows.length === 0) {
  diagnosis = "NO_GENERAL_CONFIGURED_BLACKWELL_STOCK_REPORTED";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  diagnosis,
  availability_scope: "GENERAL_GPU_DATACENTER_NOT_PRODUCT_SCOPED",
  serverless_capacity_proven: false,
  gpu_count: finite(deep?.gpuCount),
  configured_gpu_type_ids: deepGpuTypes,
  configured_types_seen_by_availability_api: seenGpuTypes,
  configured_types_missing_from_availability_api: missingGpuTypes,
  configured_capacity_rows: configuredRows.map(({ stock_rank, ...row }) => row),
  available_configured_capacity_count: availableRows.length,
  available_configured_capacity_rows: availableRows.map(({ stock_rank, ...row }) => row),
  candidate_gpu_type_parity_verified: true,
  next_action: "RUN_SERVERLESS_V2_CAPACITY_DIAGNOSTIC",
  inference_performed: false,
  generation_submitted: false,
  gpu_activation_performed: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
