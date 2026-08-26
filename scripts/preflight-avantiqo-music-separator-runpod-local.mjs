#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_RUNPOD_PREFLIGHT_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-separator-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_WORKER_IMAGE_RESULT_V1";
const SEPARATOR_ENDPOINT_NAME = "avantiqo-music-separator-v1";
const GENERATION_ENDPOINT_NAME = "avantiqo-audio-v1";
const MIN_GPU_MEMORY_GB = 24;
const GPU_PREFERENCES = Object.freeze([
  { pattern: /\bL4\b/i, score: 1000 },
  { pattern: /RTX\s*A5000/i, score: 980 },
  { pattern: /RTX.*3090/i, score: 960 },
  { pattern: /RTX.*4090/i, score: 950 },
  { pattern: /\bA40\b/i, score: 940 },
  { pattern: /RTX\s*A6000/i, score: 930 },
  { pattern: /\bL40S\b/i, score: 920 },
  { pattern: /\bL40\b/i, score: 910 },
]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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

function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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

function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function gpuPreference(gpu = {}) {
  const label = [gpu.gpuTypeId, gpu.gpuTypeDisplayName, gpu.displayName].map(text).filter(Boolean).join(" ");
  if (!label || /\bMIG\b/i.test(label)) return 0;
  return GPU_PREFERENCES.find(({ pattern }) => pattern.test(label))?.score || 0;
}

async function rest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`RUNPOD_REST_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  }
  return body;
}

async function queueHealth(endpointId, apiKey) {
  if (!endpointId || !apiKey) return null;
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return { unavailable: true, status: response.status };
  return healthCounters(await response.json());
}

async function discoverDatacenters(credential) {
  const query = `
    query AvantiqoMusicSeparatorCapacity($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(credential)}`, {
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
  return body.data.dataCenters;
}

function capacity(datacenter = {}) {
  return list(datacenter.gpuAvailability)
    .map((gpu) => ({
      gpu_type_id: text(gpu.gpuTypeId) || null,
      gpu_name: text(gpu.gpuTypeDisplayName || gpu.displayName) || null,
      available: gpu.available === true,
      stock_status: text(gpu.stockStatus) || null,
      stock_rank: stockRank(gpu.stockStatus),
      preference: gpuPreference(gpu),
    }))
    .filter((gpu) => gpu.gpu_type_id && gpu.preference > 0 && gpu.available && gpu.stock_rank > 0)
    .sort((a, b) => b.stock_rank - a.stock_rank || b.preference - a.preference || a.gpu_type_id.localeCompare(b.gpu_type_id));
}

async function imageEvidence() {
  const report = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    report?.success !== true ||
    text(report.contract) !== IMAGE_CONTRACT ||
    text(report.engine_contract) !== "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1" ||
    text(report.model) !== "demucs-htdemucs-ft" ||
    text(report.demucs_model) !== "htdemucs_ft" ||
    text(report.quality_profile) !== "DEMUCS_HTDEMUCS_FT_4STEM_V1" ||
    report.network_volume_required !== false ||
    report.model_baked_into_image !== true ||
    report.runpod_endpoint_mutation_performed !== false ||
    report.shared_volume_mutation_performed !== false ||
    report.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_IMAGE_EVIDENCE_INVALID");
  }
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(report.immutable_image_reference))) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_IMMUTABLE_IMAGE_REQUIRED");
  }
  return {
    immutable_image_reference: text(report.immutable_image_reference),
    source_sha: text(report.source_sha),
    image_digest: text(report.image_digest),
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const apiKey = text(process.env.RUNPOD_API_KEY);
const configuredSeparatorId = text(process.env.RUNPOD_AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_ID);
const configuredAudioId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const [image, endpoints, volumes, datacenters] = await Promise.all([
  imageEvidence(),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const separatorMatches = endpoints.filter((endpoint) => configuredSeparatorId
  ? text(endpoint.id) === configuredSeparatorId
  : text(endpoint.name) === SEPARATOR_ENDPOINT_NAME);
if (separatorMatches.length > 1) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_AMBIGUOUS:${separatorMatches.length}`);
}
const separator = separatorMatches[0] || null;
const generationMatches = endpoints.filter((endpoint) => configuredAudioId
  ? text(endpoint.id) === configuredAudioId
  : text(endpoint.name) === GENERATION_ENDPOINT_NAME);
if (generationMatches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_GENERATION_ENDPOINT_RESOLUTION_FAILED:${generationMatches.length}`);
}
const generation = generationMatches[0];
const separatorVolumes = separator ? endpointVolumeIds(separator) : [];
if (separatorVolumes.length) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_NETWORK_VOLUME_FORBIDDEN:${separatorVolumes.join(",")}`);
}

const [separatorHealth, generationHealth] = await Promise.all([
  separator ? queueHealth(text(separator.id), apiKey) : null,
  queueHealth(text(generation.id), apiKey),
]);
const separatorBusy = Boolean(
  separatorHealth && !separatorHealth.unavailable &&
  (separatorHealth.jobs.in_queue > 0 || separatorHealth.jobs.in_progress > 0),
);

const regions = datacenters
  .map((entry) => ({
    data_center_id: text(entry.id) || null,
    name: text(entry.name) || null,
    location: text(entry.location) || null,
    capacity: capacity(entry),
  }))
  .filter((entry) => entry.data_center_id && entry.capacity.length)
  .sort((a, b) =>
    b.capacity[0].stock_rank - a.capacity[0].stock_rank ||
    b.capacity[0].preference - a.capacity[0].preference ||
    a.data_center_id.localeCompare(b.data_center_id));
const recommended = regions[0] || null;
if (!recommended) throw new Error("AVANTIQO_MUSIC_SEPARATOR_NO_APPROVED_GPU_CAPACITY");

const safeToProvisionNew = !separator;
const safeToReconcileExisting = Boolean(separator && !separatorBusy);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  image,
  generation_endpoint: {
    ...safeEndpoint(generation),
    health: generationHealth,
    mutation_allowed_by_this_preflight: false,
  },
  separator_endpoint: separator ? {
    ...safeEndpoint(separator),
    health: separatorHealth,
    busy: separatorBusy,
    network_volume_invariant_passed: separatorVolumes.length === 0,
  } : null,
  network_volumes_observed: volumes.map((volume) => ({
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size),
    data_center_id: text(volume.dataCenterId) || null,
  })),
  capacity: {
    minimum_gpu_memory_gb: MIN_GPU_MEMORY_GB,
    approved_regions: regions,
    recommended_region: recommended,
  },
  decision: {
    separator_endpoint_exists: Boolean(separator),
    safe_to_provision_new: safeToProvisionNew,
    safe_to_reconcile_existing: safeToReconcileExisting,
    next_action: safeToProvisionNew
      ? "CREATE_DEDICATED_SEPARATOR_ENDPOINT_ONLY_AFTER_EXPLICIT_APPROVAL"
      : safeToReconcileExisting
        ? "VERIFY_EXISTING_SEPARATOR_BINDING_BEFORE_ANY_MUTATION"
        : "DO_NOT_MUTATE_SEPARATOR_ENDPOINT_WHILE_BUSY",
  },
  safety: {
    read_only: true,
    generation_endpoint_mutation_performed: false,
    separator_endpoint_mutation_performed: false,
    network_volume_mutation_performed: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));
