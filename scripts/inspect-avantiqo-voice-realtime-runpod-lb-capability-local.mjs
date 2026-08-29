import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RUNPOD_LB_CAPABILITY_INSPECT_V1";
const REST = "https://rest.runpod.io/v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
  }), `${CONTRACT}_REST`);
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
function safeScalar(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  return undefined;
}
function interestingEndpointFields(endpoint = {}) {
  const names = [
    "endpointType", "endpoint_type", "type", "computeType", "compute_type",
    "loadBalancer", "load_balancer", "isLoadBalancer", "is_load_balancer",
    "workersMin", "workersMax", "idleTimeout", "scalerType", "scalerValue",
    "gpuCount", "gpuTypeIds", "dataCenterIds", "allowedCudaVersions", "minCudaVersion",
    "templateId", "networkVolumeId", "networkVolumeIds",
  ];
  const result = {};
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(endpoint, name)) continue;
    const value = endpoint[name];
    result[name] = Array.isArray(value) ? value.map(text).filter(Boolean) : safeScalar(value);
  }
  return result;
}
function possibleLoadBalancerSignal(endpoint = {}) {
  const values = [
    endpoint.endpointType,
    endpoint.endpoint_type,
    endpoint.type,
    endpoint.computeType,
    endpoint.compute_type,
  ].map(text).filter(Boolean);
  const booleanSignal = endpoint.loadBalancer === true || endpoint.load_balancer === true || endpoint.isLoadBalancer === true || endpoint.is_load_balancer === true;
  const textualSignal = values.some((value) => /load.?balanc|\blb\b/i.test(value));
  return booleanSignal || textualSignal;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointsRaw, templatesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=false", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeList(templatesRaw, ["templates"]);
if (!endpoints || !templates) throw new Error(`${CONTRACT}_INVENTORY_INVALID`);

const endpointShapeKeys = [...new Set(endpoints.flatMap((endpoint) => Object.keys(object(endpoint))))].sort();
const templateShapeKeys = [...new Set(templates.flatMap((template) => Object.keys(object(template))))].sort();
const loadBalancerCandidates = endpoints.filter(possibleLoadBalancerSignal).map((endpoint) => ({
  name: text(endpoint.name) || null,
  id_present: Boolean(text(endpoint.id)),
  fields: interestingEndpointFields(endpoint),
}));
const voiceNamedEndpoints = endpoints.filter((endpoint) => /voice/i.test(text(endpoint.name))).map((endpoint) => ({
  name: text(endpoint.name) || null,
  id_present: Boolean(text(endpoint.id)),
  workers_min: finite(endpoint.workersMin),
  workers_max: finite(endpoint.workersMax),
  fields: interestingEndpointFields(endpoint),
}));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  endpoint_count: endpoints.length,
  template_count: templates.length,
  endpoint_shape_keys: endpointShapeKeys,
  template_shape_keys: templateShapeKeys,
  load_balancer_candidate_count: loadBalancerCandidates.length,
  load_balancer_candidates: loadBalancerCandidates,
  voice_named_endpoints: voiceNamedEndpoints,
  realtime_voice_endpoint_present: voiceNamedEndpoints.some((entry) => /realtime/i.test(entry.name || "")),
  mutations_performed: false,
  workers_scaled: false,
  jobs_submitted: 0,
  realtime_sessions_started: 0,
  tts_touched: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
