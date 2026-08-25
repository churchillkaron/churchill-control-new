import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_VOICE_TTS_RECOVERY_COST_GUARD_V1";
const RECOVERY_ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeList(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_RECOVERY_COST_GUARD_REST");
}

async function listEndpoints(key) {
  const body = await rest("/endpoints?includeTemplate=true&includeWorkers=true", key);
  return normalizeList(body, ["endpoints", "serverlessEndpoints"]) || [];
}

async function listTemplates(key) {
  const body = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  return normalizeList(body, ["templates"]) || [];
}

async function resolveRecoveryEndpoint(key) {
  const endpoints = await listEndpoints(key);
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === RECOVERY_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_RECOVERY_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function resolveBoundTemplate(endpoint, key) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) return null;
  const templates = await listTemplates(key);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) return null;
  return matches[0];
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY) || required("RUNPOD_API_KEY");
let endpoint = await resolveRecoveryEndpoint(managementKey);
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_VOICE_TTS_RECOVERY_ENDPOINT_ID_REQUIRED");

const workersMinBefore = Number.isFinite(Number(endpoint?.workersMin)) ? Number(endpoint.workersMin) : null;
let patchPerformed = false;
if (workersMinBefore !== 0) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0 },
  });
  patchPerformed = true;
}

endpoint = await resolveRecoveryEndpoint(managementKey);
const workersMinAfter = Number.isFinite(Number(endpoint?.workersMin)) ? Number(endpoint.workersMin) : null;
if (workersMinAfter !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_RECOVERY_WORKERS_MIN_ZERO_VERIFY_FAILED:workers_min=${workersMinAfter}`);
}

const boundTemplate = await resolveBoundTemplate(endpoint, managementKey);
const boundImage = text(boundTemplate?.imageName || boundTemplate?.image);
const certifiedImageVerified = boundImage === CERTIFIED_IMAGE;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: endpointId,
  endpoint_name: RECOVERY_ENDPOINT_NAME,
  workers_min_before: workersMinBefore,
  workers_min_after: workersMinAfter,
  patch_performed: patchPerformed,
  always_on_billing_enabled: false,
  generation_submitted: false,
  bound_template_resolved: Boolean(boundTemplate),
  certified_image_verified: certifiedImageVerified,
  cuda_runtime: text(endpoint?.minCudaVersion) || null,
  workers_max: Number.isFinite(Number(endpoint?.workersMax)) ? Number(endpoint.workersMax) : null,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));

console.log("AVANTIQO_VOICE_TTS_RECOVERY_COST_GUARD=PASS");
console.log("AVANTIQO_VOICE_TTS_RECOVERY_WORKERS_MIN=0");
console.log("AVANTIQO_VOICE_TTS_RECOVERY_ALWAYS_ON_BILLING=false");
console.log("AVANTIQO_VOICE_TTS_RECOVERY_GENERATION_SUBMITTED=false");
console.log(`AVANTIQO_VOICE_TTS_RECOVERY_CERTIFIED_IMAGE_VERIFIED=${certifiedImageVerified ? "YES" : "NO"}`);
console.log("AVANTIQO_VOICE_TTS_RECOVERY_SECRET_VALUES_PRINTED=false");

if (!certifiedImageVerified) {
  throw new Error("AVANTIQO_VOICE_TTS_RECOVERY_CERTIFIED_IMAGE_MISMATCH_AFTER_COST_GUARD");
}
