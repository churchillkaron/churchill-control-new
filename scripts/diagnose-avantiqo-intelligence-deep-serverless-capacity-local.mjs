const API_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_SERVERLESS_CAPACITY_V1";
const CONFIGURED_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
]);

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const unique = (values) => [...new Set(values.map((value) => text(value, 500)).filter(Boolean))];

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1000);
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
  return text(row?.id || row?.gpuTypeId || row?.gpu_type_id || row?.name || row?.displayName, 500);
}

function normalizeAvailability(value) {
  if (Array.isArray(value)) return value;
  const obj = object(value);
  for (const key of ["availability", "availabilities", "dataCenters", "datacenters", "regions", "locations"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
}

function availabilitySummary(row = {}) {
  const availability = normalizeAvailability(row?.availability || row?.availabilities || row);
  return availability.map((entry) => ({
    id: text(entry?.id || entry?.dataCenterId || entry?.datacenterId || entry?.location || entry?.region, 300) || null,
    available: entry?.available === true || Number(entry?.available) > 0 || Number(entry?.count) > 0 || Number(entry?.quantity) > 0,
    count: Number.isFinite(Number(entry?.count ?? entry?.quantity ?? entry?.availableCount)) ? Number(entry?.count ?? entry?.quantity ?? entry?.availableCount) : null,
    stock_status: text(entry?.stockStatus || entry?.stock_status || entry?.status, 100) || null,
  }));
}

const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const url = new URL(`${API_BASE}/catalog/gpus`);
url.searchParams.set("include", "AVAILABILITY");
url.searchParams.set("product", "SERVERLESS");

const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  },
  signal: AbortSignal.timeout(30_000),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok) {
  throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
}
if (body === null) throw new Error(`${CONTRACT}_INVALID_JSON`);

const rows = deepRows(body);
if (!rows.length) throw new Error(`${CONTRACT}_CATALOG_ROWS_REQUIRED`);

const configured = CONFIGURED_GPU_TYPE_IDS.map((id) => {
  const matches = rows.filter((row) => gpuId(row) === id || text(row?.displayName, 500) === id);
  return {
    gpu_type_id: id,
    matches: matches.length,
    rows: matches.map((row) => ({
      id: gpuId(row) || null,
      display_name: text(row?.displayName || row?.name, 500) || null,
      availability: availabilitySummary(row),
      raw_availability_keys: Object.keys(object(row)).filter((keyName) => /avail|stock|region|location|data.?center/i.test(keyName)).sort(),
    })),
  };
});

const seen = configured.filter((entry) => entry.matches > 0);
const available = configured.filter((entry) => entry.rows.some((row) => row.availability.some((slot) => slot.available)));

let diagnosis = "SERVERLESS_CONFIGURED_BLACKWELL_CAPACITY_REPORTED";
if (!seen.length) diagnosis = "SERVERLESS_CONFIGURED_BLACKWELL_TYPES_NOT_FOUND";
else if (!available.length) diagnosis = "SERVERLESS_CONFIGURED_BLACKWELL_CAPACITY_NOT_REPORTED";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  product_scope: "SERVERLESS",
  catalog_include: "AVAILABILITY",
  diagnosis,
  configured_gpu_type_ids: CONFIGURED_GPU_TYPE_IDS,
  configured_types_seen_count: seen.length,
  configured_types_with_available_slot_count: available.length,
  configured_results: configured,
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
