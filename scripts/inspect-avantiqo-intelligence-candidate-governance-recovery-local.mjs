import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_CANDIDATE_GOVERNANCE_RECOVERY_INSPECT_V1";
const CANDIDATE_ENDPOINT_NAME = "avantiqo-intelligence-candidate-v1";
const EXPECTED_CANDIDATE_IMAGE =
  "ghcr.io/churchillkaron/avantiqo-intelligence-candidate@sha256:3e19d865a23567ae24bbef9ec562261cbceaa79bacaee71a36475cd911848ee7";
const ENV_PATH = ".env.local";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalizeList(value, candidateKey, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [candidateKey, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKey, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
function adapterFingerprint(adapterPath) {
  return adapterPath
    ? createHash("sha256").update(adapterPath).digest("hex").slice(0, 16)
    : null;
}

async function parseEnv() {
  const source = await readFile(ENV_PATH, "utf8");
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

async function requestJson(pathname, credential) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`RUNPOD_READ_ONLY_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw, 600)}`);
  }
  return body ?? {};
}

function resolveEndpoint(endpoints, configuredId) {
  const id = text(configuredId, 200);
  if (id) {
    const matches = endpoints.filter((entry) => text(entry?.id, 200) === id);
    if (matches.length !== 1) {
      throw new Error(`CANDIDATE_ENDPOINT_CONFIGURED_ID_RESOLUTION_FAILED:matches=${matches.length}`);
    }
    if (text(matches[0]?.name, 300) !== CANDIDATE_ENDPOINT_NAME) {
      throw new Error("CANDIDATE_ENDPOINT_CONFIGURED_ID_NAME_MISMATCH");
    }
    return matches[0];
  }
  const matches = endpoints.filter((entry) => text(entry?.name, 300) === CANDIDATE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`CANDIDATE_ENDPOINT_NAME_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function resolveTemplate(endpoint, templates) {
  const embedded = object(endpoint?.template);
  if (text(embedded?.imageName || embedded?.image, 1400) && Object.keys(object(embedded?.env)).length) {
    return embedded;
  }
  const templateId = text(endpoint?.templateId || embedded?.id, 300);
  if (!templateId) throw new Error("CANDIDATE_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((entry) => text(entry?.id, 300) === templateId);
  if (matches.length !== 1) {
    throw new Error(`CANDIDATE_TEMPLATE_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function supabaseTarget(urlValue) {
  const raw = text(urlValue, 1200);
  if (!raw) return { configured: false, kind: "MISSING", host: null, project_ref: null };
  let url;
  try { url = new URL(raw); } catch { return { configured: true, kind: "INVALID_URL", host: null, project_ref: null }; }
  const host = text(url.hostname, 400);
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const projectRef = local
    ? null
    : host.endsWith(".supabase.co")
      ? host.slice(0, -".supabase.co".length)
      : null;
  return {
    configured: true,
    kind: local ? "LOCAL" : "CLOUD_OR_REMOTE",
    host,
    project_ref: projectRef,
  };
}

const env = await parseEnv();
const managementKey = text(env.RUNPOD_MANAGEMENT_API_KEY || env.RUNPOD_API_KEY, 12000);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_READ_ONLY_RECOVERY");

const [endpointBody, templatesBody] = await Promise.all([
  requestJson("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  requestJson(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  ),
]);
const endpoints = normalizeList(endpointBody, "endpoints") || [];
const templates = normalizeList(templatesBody, "templates") || [];
const endpoint = resolveEndpoint(endpoints, env.RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID);
const template = resolveTemplate(endpoint, templates);
const mergedEnv = { ...object(template?.env), ...object(endpoint?.env) };

const localCandidateId = text(env.AVANTIQO_INTELLIGENCE_CANDIDATE_MODEL_CANDIDATE_ID, 200) || null;
const templateCandidateId = text(
  mergedEnv.AVANTIQO_INTELLIGENCE_CANDIDATE_MODEL_CANDIDATE_ID ||
    mergedEnv.AVANTIQO_INTELLIGENCE_PRODUCTION_MODEL_CANDIDATE_ID,
  200,
) || null;
const adapterPath = text(
  mergedEnv.AVANTIQO_INTELLIGENCE_CANDIDATE_ADAPTER_PATH ||
    mergedEnv.AVANTIQO_INTELLIGENCE_PRODUCTION_ADAPTER_PATH,
  1400,
) || null;
const fingerprint = adapterFingerprint(adapterPath);
const imageName = text(template?.imageName || template?.image, 1400) || null;
const endpointId = text(endpoint?.id, 300);
const templateId = text(endpoint?.templateId || template?.id, 300);
const networkVolumeIds = [
  text(endpoint?.networkVolumeId, 300),
  ...list(endpoint?.networkVolumeIds).map((value) =>
    text(typeof value === "string" ? value : value?.id || value?.networkVolumeId, 300),
  ),
].filter(Boolean);

const candidateIdsAgree = Boolean(
  localCandidateId && templateCandidateId && localCandidateId === templateCandidateId,
);
const candidateId = templateCandidateId || localCandidateId;
const recoverable = Boolean(candidateId && adapterPath && fingerprint);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  supabase_target: supabaseTarget(env.NEXT_PUBLIC_SUPABASE_URL),
  learning_organization_env_present: Boolean(text(env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 200)),
  candidate: {
    endpoint_id: endpointId,
    endpoint_name: text(endpoint?.name, 300),
    template_id: templateId,
    template_name: text(template?.name, 500) || null,
    image_name: imageName,
    exact_certified_candidate_image: imageName === EXPECTED_CANDIDATE_IMAGE,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    active_worker_count: list(endpoint?.workers).length,
    network_volume_ids: [...new Set(networkVolumeIds)],
    candidate_enabled: text(mergedEnv.AVANTIQO_INTELLIGENCE_CANDIDATE_ENABLED, 40) || null,
    local_env_candidate_id: localCandidateId,
    template_candidate_id: templateCandidateId,
    candidate_ids_agree: candidateIdsAgree,
    recovered_candidate_id: candidateId,
    adapter_artifact_reference: adapterPath,
    adapter_artifact_fingerprint: fingerprint,
    candidate_model: fingerprint ? `avantiqo-intelligence-candidate-${fingerprint}` : null,
    governance_recovery_source: templateCandidateId && adapterPath
      ? "RUNPOD_BOUND_TEMPLATE"
      : localCandidateId && adapterPath
        ? "LOCAL_CANDIDATE_ID_PLUS_RUNPOD_BOUND_ADAPTER"
        : "INCOMPLETE",
    recoverable,
  },
  safety: {
    provider_job_submitted: false,
    inference_performed: false,
    worker_scaling_mutated: false,
    runpod_endpoint_mutated: false,
    runpod_template_mutated: false,
    supabase_read_performed: false,
    supabase_write_performed: false,
    production_model_promoted: false,
    secrets_printed: false,
  },
}, null, 2));

if (!recoverable) process.exitCode = 2;
