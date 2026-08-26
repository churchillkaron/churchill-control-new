#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_MUSIC_EXTEND_RUNPOD_PREFLIGHT_V1";
const IMAGE_PATH = "audits/results/avantiqo-music-extend-worker-image.json";
const POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";
const ENDPOINT_NAME = "avantiqo-music-extend-v1";
const VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const CHECKPOINT_ROOT = "/runpod-volume/ace-step-checkpoints";
const MIN_VOLUME_GB = 80;

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

async function jsonFile(path, code) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { throw new Error(`${code}:${error?.code || "READ_FAILED"}`); }
}

async function rest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  return body;
}

async function health(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  return body || {};
}

function endpointVolumes(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() !== "EXITED").length;
}

function normalizedEnv(template = {}) {
  return Object.fromEntries(Object.entries(object(template.env)).map(([key, value]) => [key, String(value ?? "")]));
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_MUSIC_EXTEND_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const image = await jsonFile(IMAGE_PATH, "AVANTIQO_MUSIC_EXTEND_IMAGE_EVIDENCE_REQUIRED");
const policy = await jsonFile(POLICY_PATH, "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_REQUIRED");

const immutableImage = text(image.immutable_image_reference);
if (
  image?.success !== true ||
  text(image.contract) !== "AVANTIQO_MUSIC_EXTEND_WORKER_IMAGE_RESULT_V1" ||
  text(image.engine_contract) !== "AVANTIQO_MUSIC_EXTEND_ENGINE_V1" ||
  text(image.model_variant) !== "acestep-v15-base" ||
  text(image.task_type) !== "complete" ||
  text(image.quality_profile) !== "ACE_STEP_1_5_BASE_COMPLETE_V1" ||
  image.ace_step_lm_required !== false ||
  image.direct_source_conditioning_required !== true ||
  image.arrangement_completion_implemented !== true ||
  image.temporal_extension_proven !== false ||
  image.production_certified !== false ||
  image.human_listening_review_required !== true ||
  text(image.safe_lease_lane) !== "music-extend" ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(immutableImage)
) {
  throw new Error("AVANTIQO_MUSIC_EXTEND_IMAGE_EVIDENCE_INVALID");
}
if (
  text(policy.contract) !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2" ||
  policy.resting_workers_min !== 0 ||
  policy.resting_workers_max !== 0 ||
  policy.max_workers_per_lease !== 1 ||
  policy.max_jobs_per_lease !== 1 ||
  policy.workers_min_one_allowed !== false ||
  text(policy?.lanes?.["music-extend"]) !== ENDPOINT_NAME
) {
  throw new Error("AVANTIQO_MUSIC_EXTEND_SAFE_LEASE_POLICY_INVALID");
}

const [endpoints, templates, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(volumes)) throw new Error("AVANTIQO_MUSIC_EXTEND_RUNPOD_LIST_INVALID");

const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_MUSIC_EXTEND_ENDPOINT_REQUIRED:matches=${endpointMatches.length}`);
const endpoint = endpointMatches[0];
const endpointId = text(endpoint.id);
const templateId = text(endpoint.templateId ?? endpoint.template_id ?? endpoint.template?.id);
const template = object(endpoint.template);
const resolvedTemplate = Object.keys(template).length ? template : templates.find((item) => text(item?.id) === templateId);
if (!resolvedTemplate) throw new Error("AVANTIQO_MUSIC_EXTEND_TEMPLATE_RESOLUTION_FAILED");
if (text(resolvedTemplate.imageName ?? resolvedTemplate.image_name) !== immutableImage) throw new Error("AVANTIQO_MUSIC_EXTEND_TEMPLATE_IMAGE_MISMATCH");

const env = normalizedEnv(resolvedTemplate);
const expectedEnv = {
  ACESTEP_CHECKPOINTS_DIR: CHECKPOINT_ROOT,
  HF_HOME: `${CHECKPOINT_ROOT}/.hf-cache`,
  ACESTEP_INIT_LLM: "false",
  AVANTIQO_MUSIC_EXTEND_FOUNDATION_MODEL: "ACE-Step/Ace-Step1.5",
  AVANTIQO_MUSIC_EXTEND_MODEL_FAMILY: "ACE_STEP_1_5",
  AVANTIQO_MUSIC_EXTEND_MODEL_VARIANT: "acestep-v15-base",
  AVANTIQO_MUSIC_EXTEND_PRODUCTION_CERTIFIED: "false",
};
const invalidEnv = Object.entries(expectedEnv).filter(([key, value]) => env[key] !== value).map(([key]) => key);
if (invalidEnv.length) throw new Error(`AVANTIQO_MUSIC_EXTEND_TEMPLATE_ENV_INVALID:${invalidEnv.join(",")}`);

const volumeMatches = volumes.filter((volume) => text(volume?.name) === VOLUME_NAME);
if (volumeMatches.length !== 1) throw new Error(`AVANTIQO_MUSIC_EXTEND_CACHE_VOLUME_REQUIRED:matches=${volumeMatches.length}`);
const volume = volumeMatches[0];
const volumeId = text(volume.id);
const volumeSizeGb = finite(volume.size, 0);
if (!volumeId || volumeSizeGb < MIN_VOLUME_GB) throw new Error(`AVANTIQO_MUSIC_EXTEND_CACHE_VOLUME_INVALID:size_gb=${volumeSizeGb}`);
const attached = endpointVolumes(endpoint);
if (attached.length !== 1 || attached[0] !== volumeId) throw new Error("AVANTIQO_MUSIC_EXTEND_CACHE_ATTACHMENT_INVALID");

const queue = await health(endpointId, runtimeKey);
const jobs = object(queue.jobs);
const workers = object(queue.workers);
const queueIn = finite(jobs.inQueue ?? jobs.in_queue, 0);
const inProgress = finite(jobs.inProgress ?? jobs.in_progress, 0);
const running = finite(workers.running, 0);
const initializing = finite(workers.initializing, 0);
const unhealthy = finite(workers.unhealthy, 0);
const min = finite(endpoint.workersMin ?? endpoint.workers_min, -1);
const max = finite(endpoint.workersMax ?? endpoint.workers_max, -1);
const managementActive = activeManagementWorkers(endpoint);
const quiet = queueIn === 0 && inProgress === 0 && running === 0 && initializing === 0 && managementActive === 0;
const ready = min === 0 && max === 0 && quiet && unhealthy === 0;

console.log(JSON.stringify({
  success: ready,
  contract: CONTRACT,
  ready_for_safe_lease_certification: ready,
  endpoint: {
    id: endpointId,
    name: text(endpoint.name),
    template_id: templateId,
    workers_min: min,
    workers_max: max,
    active_management_workers: managementActive,
    quiet,
  },
  worker_image: {
    immutable_image: immutableImage,
    exact_digest_verified: true,
    source_sha: text(image.source_sha),
    model_variant: text(image.model_variant),
    task_type: text(image.task_type),
    quality_profile: text(image.quality_profile),
    ace_step_lm_required: false,
    arrangement_completion_implemented: true,
    temporal_extension_proven: false,
    production_certified: false,
    human_listening_review_required: true,
  },
  model_cache: {
    volume_id: volumeId,
    volume_name: VOLUME_NAME,
    size_gb: volumeSizeGb,
    minimum_required_size_gb: MIN_VOLUME_GB,
    attached_exactly_once: true,
    checkpoint_root: CHECKPOINT_ROOT,
    volume_mutation_performed: false,
  },
  queue: {
    in_queue: queueIn,
    in_progress: inProgress,
    running_workers: running,
    initializing_workers: initializing,
    unhealthy_workers: unhealthy,
  },
  safe_lease: {
    contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    lane: "music-extend",
    endpoint_name: ENDPOINT_NAME,
    resting_workers_min: 0,
    resting_workers_max: 0,
    max_workers_per_lease: 1,
    max_jobs_per_lease: 1,
  },
  safety: {
    read_only: true,
    provider_job_submitted: false,
    runpod_run_called: false,
    runpod_runsync_called: false,
    endpoint_mutation_performed: false,
    volume_mutation_performed: false,
    compose_endpoint_mutation_performed: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));
