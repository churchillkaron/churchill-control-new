#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_RUNPOD_PROVISION_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-separator-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_WORKER_IMAGE_RESULT_V1";
const ENDPOINT_NAME = "avantiqo-music-separator-v1";
const TEMPLATE_PREFIX = "avantiqo-music-separator-";
const MIN_GPU_MEMORY_GB = 24;
const ALLOWED_GPU_PATTERNS = Object.freeze([
  /\bL4\b/i,
  /RTX\s*A5000/i,
  /RTX.*3090/i,
  /RTX.*4090/i,
  /\bA40\b/i,
  /RTX\s*A6000/i,
  /\bL40S\b/i,
  /\bL40\b/i,
]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const approved = (value) => text(value).toUpperCase() === "YES";

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function commaList(value) {
  return unique(text(value).split(",").map((item) => item.trim()).filter(Boolean));
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    network_volume_ids: endpointVolumeIds(endpoint),
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    container_disk_gb: finite(template.containerDiskInGb),
    local_volume_gb: finite(template.volumeInGb),
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
  };
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function imageEvidence() {
  const report = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    report?.success !== true ||
    text(report.contract) !== IMAGE_CONTRACT ||
    report?.source_sha_matches_trigger !== true ||
    text(report.source_sha) !== text(report.trigger_sha) ||
    text(report.engine_contract) !== "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1" ||
    text(report.model) !== "demucs-htdemucs-ft" ||
    text(report.demucs_model) !== "htdemucs_ft" ||
    text(report.quality_profile) !== "DEMUCS_HTDEMUCS_FT_4STEM_V1" ||
    report.model_baked_into_image !== true ||
    report.network_volume_required !== false ||
    report.runpod_endpoint_mutation_performed !== false ||
    report.shared_volume_mutation_performed !== false ||
    report.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(report.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_IMMUTABLE_IMAGE_REQUIRED");
  }
  return {
    image,
    source_sha: text(report.source_sha),
    digest: text(report.image_digest),
  };
}

async function liveGpuCapacity(managementKey) {
  const query = `
    query AvantiqoMusicSeparatorProvisionCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { input: { gpuCount: 1, minDisk: 10, minMemoryInGb: MIN_GPU_MEMORY_GB, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${text(body?.errors?.[0]?.message || raw).slice(0, 800)}`);
  }
  const byGpu = new Map();
  for (const dc of body.data.dataCenters) {
    for (const gpu of list(dc.gpuAvailability)) {
      const id = text(gpu.gpuTypeId);
      const label = [id, gpu.gpuTypeDisplayName, gpu.displayName].map(text).join(" ");
      if (!id || !ALLOWED_GPU_PATTERNS.some((pattern) => pattern.test(label))) continue;
      if (gpu.available !== true || ["NONE", "UNAVAILABLE", ""].includes(text(gpu.stockStatus).toUpperCase())) continue;
      const regions = byGpu.get(id) || [];
      regions.push(text(dc.id));
      byGpu.set(id, unique(regions));
    }
  }
  return byGpu;
}

function resolveRegistryAuth(registryAuths) {
  const explicitId = text(process.env.AVANTIQO_MUSIC_SEPARATOR_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_MUSIC_SEPARATOR_REGISTRY_AUTH_NOT_FOUND:matches=${matches.length}`);
    }
    return matches[0];
  }
  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  return null;
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_MUSIC_SEPARATOR_PROVISION_APPROVED)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_PROVISION_APPROVED=YES_REQUIRED");
}

const certificationQuotaMode = approved(process.env.AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_QUOTA_MODE);
const requestedWorkersMax = Number(
  process.env.AVANTIQO_MUSIC_SEPARATOR_RUNPOD_WORKERS_MAX ?? (certificationQuotaMode ? 0 : 1),
);
if (!Number.isInteger(requestedWorkersMax)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_RUNPOD_WORKERS_MAX_INTEGER_REQUIRED");
}
if (certificationQuotaMode && requestedWorkersMax !== 0) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_QUOTA_MODE_REQUIRES_WORKERS_MAX_0");
}
if (!certificationQuotaMode && (requestedWorkersMax < 1 || requestedWorkersMax > 2)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_RUNPOD_WORKERS_MAX_MUST_BE_1_OR_2");
}
const workersMax = certificationQuotaMode ? 0 : requestedWorkersMax;

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const image = await imageEvidence();
const [endpoints, templates, registryAuths, capacity] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
  liveGpuCapacity(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
if (!Array.isArray(registryAuths)) throw new Error("RUNPOD_REGISTRY_AUTH_LIST_INVALID");

const generationMatches = endpoints.filter((endpoint) => text(endpoint.name) === "avantiqo-audio-v1");
if (generationMatches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_GENERATION_ENDPOINT_RESOLUTION_FAILED:${generationMatches.length}`);
}
const generationEndpoint = generationMatches[0];
const separatorMatches = endpoints.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (separatorMatches.length > 1) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_AMBIGUOUS:${separatorMatches.length}`);
}
if (separatorMatches.length === 1) {
  const existing = separatorMatches[0];
  const volumeIds = endpointVolumeIds(existing);
  if (volumeIds.length) {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_NETWORK_VOLUME_FORBIDDEN:${volumeIds.join(",")}`);
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    certification_quota_mode: certificationQuotaMode,
    separator_endpoint: safeEndpoint(existing),
    generation_endpoint: safeEndpoint(generationEndpoint),
    mutation_performed: false,
    generation_endpoint_mutation_performed: false,
    network_volume_mutation_performed: false,
    provider_job_submitted: false,
    pricing_activation_performed: false,
    production_deploy_performed: false,
    next_action: finite(existing.workersMax, 0) === 0
      ? "HANDOFF_ONE_MUSIC_WORKER_SLOT_FOR_CONTROLLED_BENCHMARK"
      : "VERIFY_EXISTING_SEPARATOR_BINDING_WITH_READ_ONLY_PREFLIGHT",
  }, null, 2));
  process.exit(0);
}

const requestedGpuTypes = commaList(process.env.AVANTIQO_MUSIC_SEPARATOR_RUNPOD_GPU_TYPE_IDS);
const liveGpuTypes = [...capacity.keys()].sort();
const gpuTypeIds = requestedGpuTypes.length
  ? requestedGpuTypes
  : ["NVIDIA L4", "NVIDIA RTX A5000", "NVIDIA GeForce RTX 3090", "NVIDIA GeForce RTX 4090"]
      .filter((gpu) => capacity.has(gpu));
if (!gpuTypeIds.length) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_NO_LIVE_APPROVED_GPU_CAPACITY");
}
for (const gpu of gpuTypeIds) {
  if (!capacity.has(gpu)) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_REQUESTED_GPU_NOT_LIVE:${gpu}`);
}

const registryAuth = resolveRegistryAuth(registryAuths);
if (!registryAuth) throw new Error("AVANTIQO_MUSIC_SEPARATOR_GHCR_REGISTRY_AUTH_REQUIRED");
const templateName = `${TEMPLATE_PREFIX}${image.digest.replace(/^sha256:/, "").slice(0, 12)}`;
const exactTemplates = templates.filter((template) => text(template.name) === templateName);
if (exactTemplates.length > 1) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_TEMPLATE_AMBIGUOUS:${exactTemplates.length}`);
}
if (exactTemplates[0] && text(exactTemplates[0].imageName) !== image.image) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_TEMPLATE_IMAGE_MISMATCH");
}

const idleTimeout = Math.max(1, Math.min(300, Number(process.env.AVANTIQO_MUSIC_SEPARATOR_RUNPOD_IDLE_TIMEOUT_SECONDS || 5)));
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  certification_quota_mode: certificationQuotaMode,
  immutable_image: image.image,
  image_source_sha: image.source_sha,
  template_name: templateName,
  existing_template: exactTemplates[0] ? safeTemplate(exactTemplates[0]) : null,
  gpu_type_ids: gpuTypeIds,
  live_gpu_capacity: Object.fromEntries(gpuTypeIds.map((gpu) => [gpu, capacity.get(gpu)])),
  workers_min: 0,
  workers_max: workersMax,
  endpoint_created_paused: workersMax === 0,
  idle_timeout_seconds: idleTimeout,
  execution_timeout_ms: 45 * 60 * 1000,
  network_volume_required: false,
  shared_audio_voice_volume_attached: false,
  generation_endpoint: safeEndpoint(generationEndpoint),
  mutation_performed: false,
  generation_endpoint_mutation_performed: false,
  network_volume_mutation_performed: false,
  provider_job_submitted: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
  next_action: apply
    ? workersMax === 0
      ? "CREATE_PARKED_SEPARATOR_THEN_HANDOFF_ONE_MUSIC_SLOT_FOR_BENCHMARK"
      : "CREATE_DEDICATED_SEPARATOR_TEMPLATE_AND_ENDPOINT"
    : "APPROVE_DEDICATED_SEPARATOR_PROVISION",
};
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let template = exactTemplates[0] || null;
if (!template) {
  template = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: image.image,
      name: templateName,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: text(registryAuth.id),
      dockerEntrypoint: [],
      dockerStartCmd: [],
      env: {
        AVANTIQO_MUSIC_SEPARATOR_MAX_SOURCE_DURATION_SECONDS: "900",
        AVANTIQO_MUSIC_SEPARATOR_MAX_SOURCE_BYTES: "629145600",
        TORCH_HOME: "/opt/avantiqo-demucs-cache",
      },
      isPublic: false,
      isServerless: true,
      ports: [],
      readme: "Avantiqo Music backing-track separator. Immutable Demucs htdemucs_ft four-stem worker; model baked into image; no network volume.",
      volumeInGb: 0,
      volumeMountPath: "/workspace",
    },
  });
}
const templateId = text(template?.id);
if (!templateId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_TEMPLATE_ID_REQUIRED");

const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
const freshMatches = list(freshEndpoints).filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (freshMatches.length) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_APPEARED_REPLAN_REQUIRED:${freshMatches.length}`);
}

const endpoint = await rest("/endpoints", managementKey, {
  method: "POST",
  body: {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: 45 * 60 * 1000,
    flashboot: true,
    gpuCount: 1,
    gpuTypeIds,
    idleTimeout,
    name: ENDPOINT_NAME,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
    workersMax,
    workersMin: 0,
  },
});
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_ID_REQUIRED");
const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (text(verified.name) !== ENDPOINT_NAME || text(verified.templateId) !== templateId) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_VERIFY_FAILED");
}
if (endpointVolumeIds(verified).length) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_UNEXPECTED_NETWORK_VOLUME");
}
if (finite(verified.workersMin, -1) !== 0 || finite(verified.workersMax, -1) !== workersMax) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_SCALING_VERIFY_FAILED");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  separator_endpoint: safeEndpoint(verified),
  separator_template: safeTemplate(verified.template || template),
  template_created: exactTemplates.length === 0,
  endpoint_created: true,
  mutation_performed: true,
  generation_endpoint_mutation_performed: false,
  network_volume_mutation_performed: false,
  provider_job_submitted: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
  next_action: workersMax === 0
    ? "HANDOFF_ONE_MUSIC_WORKER_SLOT_FOR_CONTROLLED_BENCHMARK"
    : "RUN_ZERO_GENERATION_SEPARATOR_PREFLIGHT_AND_CAPTURE_ENDPOINT_ID",
}, null, 2));