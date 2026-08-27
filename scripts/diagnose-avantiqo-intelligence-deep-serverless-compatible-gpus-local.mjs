const API_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_SERVERLESS_COMPATIBLE_GPU_V1";
const MODEL_LOADED_GIB_REFERENCE = 56.93;
const MINIMUM_VRAM_GB = 64;

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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

function firstFinite(values) {
  for (const value of values) {
    const parsed = finite(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function memoryGb(row = {}) {
  const direct = firstFinite([
    row?.memoryInGb,
    row?.memoryInGB,
    row?.memoryGb,
    row?.memoryGB,
    row?.vramGb,
    row?.vramGB,
    row?.vramInGb,
    row?.gpuMemoryInGb,
    row?.gpuMemoryGb,
    row?.memory?.gb,
    row?.memory?.sizeGb,
    row?.specs?.memoryInGb,
    row?.specs?.memoryGb,
    row?.specs?.vramGb,
  ]);
  if (direct !== null) return direct;
  const label = `${text(row?.displayName, 500)} ${text(row?.name, 500)} ${gpuId(row)}`;
  const matches = [...label.matchAll(/(?:^|\D)(\d{2,3}(?:\.\d+)?)\s*(?:GB|GIB)\b/gi)]
    .map((match) => finite(match[1]))
    .filter((value) => value !== null && value > 0);
  return matches.length ? Math.max(...matches) : null;
}

function knownLargeNvidiaFamily(row = {}) {
  const label = `${gpuId(row)} ${text(row?.displayName, 500)} ${text(row?.name, 500)}`;
  if (/\bB300\b/i.test(label)) return "B300";
  if (/\bB200\b/i.test(label)) return "B200";
  if (/\bH200\b/i.test(label)) return "H200";
  if (/\bH100\b/i.test(label)) return "H100";
  if (/RTX\s*PRO\s*6000.*BLACKWELL|BLACKWELL.*RTX\s*PRO\s*6000/i.test(label)) return "RTX_PRO_6000_BLACKWELL";
  if (/\bA100\b/i.test(label)) return "A100";
  return null;
}

function compatibility(row = {}) {
  const memory = memoryGb(row);
  const family = knownLargeNvidiaFamily(row);
  const label = `${gpuId(row)} ${text(row?.displayName, 500)} ${text(row?.name, 500)}`;
  const nvidia = /NVIDIA|\b(?:B300|B200|H200|H100|A100)\b|RTX/i.test(label);
  if (!nvidia) return { compatible: false, reason: "NON_NVIDIA", memory_gb: memory, family };
  if (memory !== null) {
    return {
      compatible: memory >= MINIMUM_VRAM_GB,
      reason: memory >= MINIMUM_VRAM_GB ? "VRAM_THRESHOLD_MET" : "VRAM_BELOW_THRESHOLD",
      memory_gb: memory,
      family,
    };
  }
  if (["B300", "B200", "H200", "H100", "RTX_PRO_6000_BLACKWELL"].includes(family)) {
    return { compatible: true, reason: "KNOWN_LARGE_NVIDIA_FAMILY", memory_gb: null, family };
  }
  return { compatible: false, reason: family === "A100" ? "A100_VRAM_VARIANT_UNPROVEN" : "VRAM_UNKNOWN", memory_gb: null, family };
}

function safeRow(row = {}) {
  const availability = availabilitySummary(row);
  const compat = compatibility(row);
  const rawKeys = Object.keys(object(row))
    .filter((key) => /avail|stock|memory|vram|cuda|arch|product|secure|serverless/i.test(key))
    .sort();
  return {
    gpu_type_id: gpuId(row) || null,
    display_name: text(row?.displayName || row?.name, 500) || null,
    family: compat.family,
    memory_gb: compat.memory_gb,
    compatibility_reason: compat.reason,
    compatible_for_deep_candidate: compat.compatible,
    availability,
    available_slot_count: availability.filter((slot) => slot.available).length,
    raw_capability_keys: rawKeys,
  };
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

const catalogRows = deepRows(body);
if (!catalogRows.length) throw new Error(`${CONTRACT}_CATALOG_ROWS_REQUIRED`);

const inspected = catalogRows.map(safeRow);
const compatible = inspected
  .filter((row) => row.compatible_for_deep_candidate)
  .sort((a, b) =>
    b.available_slot_count - a.available_slot_count ||
    finite(b.memory_gb, 0) - finite(a.memory_gb, 0) ||
    String(a.gpu_type_id).localeCompare(String(b.gpu_type_id)),
  );
const availableCompatible = compatible.filter((row) => row.available_slot_count > 0);

let diagnosis = "SERVERLESS_COMPATIBLE_GPU_AVAILABLE";
if (!compatible.length) diagnosis = "NO_SERVERLESS_COMPATIBLE_GPU_TYPES_FOUND";
else if (!availableCompatible.length) diagnosis = "SERVERLESS_COMPATIBLE_GPU_TYPES_FOUND_BUT_NO_CAPACITY";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  product_scope: "SERVERLESS",
  catalog_include: "AVAILABILITY",
  diagnosis,
  model_loaded_gib_reference: MODEL_LOADED_GIB_REFERENCE,
  conservative_minimum_vram_gb: MINIMUM_VRAM_GB,
  compatible_gpu_type_count: compatible.length,
  available_compatible_gpu_type_count: availableCompatible.length,
  available_compatible_gpu_types: availableCompatible,
  compatible_gpu_types_without_capacity: compatible.filter((row) => row.available_slot_count === 0),
  next_action: availableCompatible.length
    ? "CREATE_ISOLATED_EAGER_ALT_GPU_CANDIDATE_ONLY"
    : "WAIT_OR_EXPAND_SERVERLESS_GPU_OPTIONS_WITHOUT_PRODUCTION_CHANGE",
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
