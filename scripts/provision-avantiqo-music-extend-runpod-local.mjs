#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_MUSIC_EXTEND_RUNPOD_PROVISION_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-extend-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_EXTEND_WORKER_IMAGE_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_EXTEND_ENGINE_V1";
const CERTIFICATION_JOB_CONTRACT = "AVANTIQO_MUSIC_EXTEND_CERTIFICATION_JOB_V1";
const QUALITY_PROFILE = "ACE_STEP_1_5_BASE_COMPLETE_V1";
const ENDPOINT_NAME = "avantiqo-music-extend-v1";
const TEMPLATE_PREFIX = "avantiqo-music-extend-";
const CANONICAL_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const CHECKPOINT_ROOT = "/runpod-volume/ace-step-checkpoints";
const MIN_VOLUME_GB = 80;
const APPROVAL_ENV = "AVANTIQO_MUSIC_EXTEND_PROVISION_APPROVED";
const DEFAULT_GPU_TYPES = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
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

function workersMin(endpoint = {}) {
  return finite(endpoint.workersMin ?? endpoint.workers_min, -1);
}

function workersMax(endpoint = {}) {
  return finite(endpoint.workersMax ?? endpoint.workers_max, -1);
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function endpointTemplate(endpoint = {}, templates = []) {
  const embedded = endpoint.template && typeof endpoint.template === "object" ? endpoint.template : null;
  if (embedded) return embedded;
  const templateId = text(endpoint.templateId ?? endpoint.template_id);
  return templates.find((template) => text(template?.id) === templateId) || null;
}

function normalizeEnv(value) {
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [key, String(child ?? "")]));
}

function desiredEnv() {
  return {
    ACESTEP_CHECKPOINTS_DIR: CHECKPOINT_ROOT,
    HF_HOME: `${CHECKPOINT_ROOT}/.hf-cache`,
    ACESTEP_INIT_LLM: "false",
    AVANTIQO_MUSIC_EXTEND_DEVICE: "cuda",
    AVANTIQO_MUSIC_EXTEND_FOUNDATION_MODEL: "ACE-Step/Ace-Step1.5",
    AVANTIQO_MUSIC_EXTEND_MODEL_FAMILY: "ACE_STEP_1_5",
    AVANTIQO_MUSIC_EXTEND_MODEL_VARIANT: "acestep-v15-base",
    AVANTIQO_MUSIC_EXTEND_MODEL_SOURCE: "huggingface",
    AVANTIQO_MUSIC_EXTEND_PRODUCTION_CERTIFIED: "false",
    AVANTIQO_MUSIC_EXTEND_MAX_DURATION_SECONDS: "600",
    AVANTIQO_MUSIC_EXTEND_MAX_SOURCE_BYTES: "629145600",
  };
}

async function imageEvidence() {
  let report;
  try {
    report = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`AVANTIQO_MUSIC_EXTEND_IMAGE_EVIDENCE_REQUIRED:${error?.code || "READ_FAILED"}`);
  }
  const valid =
    report?.success === true &&
    text(report.contract) === IMAGE_CONTRACT &&
    report?.source_sha_matches_trigger === true &&
    text(report.source_sha) === text(report.trigger_sha) &&
    text(report.engine_contract) === ENGINE_CONTRACT &&
    text(report.certification_job_contract) === CERTIFICATION_JOB_CONTRACT &&
    text(report.foundation_model) === "ACE-Step/Ace-Step1.5" &&
    text(report.model_family) === "ACE_STEP_1_5" &&
    text(report.model_variant) === "acestep-v15-base" &&
    text(report.task_type) === "complete" &&
    text(report.capability) === "ai.audio.extend" &&
    text(report.quality_profile) === QUALITY_PROFILE &&
    report.ace_step_lm_required === false &&
    report.direct_source_conditioning_required === true &&
    report.arrangement_completion_implemented === true &&
    report.temporal_extension_proven === false &&
    report.production_certified === false &&
    report.benchmark_required === true &&
    report.human_listening_review_required === true &&
    text(report.safe_lease_contract) === "AVANTIQO_RUNPOD_SAFE_LEASE_V2" &&
    text(report.safe_lease_lane) === "music-extend" &&
    report.resting_workers_min === 0 &&
    report.resting_workers_max === 0 &&
    report.xl_turbo_fallback_allowed === false &&
    report.compose_endpoint_mutation_allowed === false &&
    report.provider_job_submitted === false &&
    report.production_web_deploy === false &&
    report.pricing_activation_performed === false;
  if (!valid) throw new Error("AVANTIQO_MUSIC_EXTEND_IMAGE_EVIDENCE_INVALID");
  const image = text(report.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_MUSIC_EXTEND_IMMUTABLE_IMAGE_DIGEST_REQUIRED");
  }
  const digest = text(report.image_digest);
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest) || !image.endsWith(`@${digest}`)) {
    throw new Error("AVANTIQO_MUSIC_EXTEND_IMAGE_DIGEST_MISMATCH");
  }
  return { image, digest, source_sha: text(report.source_sha) };
}

function resolveVolume(volumes) {
  const matches = list(volumes).filter((volume) => text(volume?.name) === CANONICAL_VOLUME_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_EXTEND_CANONICAL_CACHE_VOLUME_REQUIRED:matches=${matches.length}`);
  }
  const volume = matches[0];
  const id = text(volume?.id);
  const sizeGb = finite(volume?.size, 0);
  if (!id || sizeGb < MIN_VOLUME_GB) {
    throw new Error(`AVANTIQO_MUSIC_EXTEND_CACHE_VOLUME_INVALID:size_gb=${sizeGb}`);
  }
  return { id, name: CANONICAL_VOLUME_NAME, size_gb: sizeGb };
}

function resolveRegistryAuth(registryAuths) {
  const explicit = text(process.env.AVANTIQO_MUSIC_EXTEND_RUNPOD_REGISTRY_AUTH_ID);
  if (explicit) {
    const matches = list(registryAuths).filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) throw new Error(`AVANTIQO_MUSIC_EXTEND_REGISTRY_AUTH_NOT_FOUND:${matches.length}`);
    return matches[0];
  }
  const candidates = list(registryAuths).filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length !== 1) throw new Error(`AVANTIQO_MUSIC_EXTEND_GHCR_AUTH_REQUIRED:matches=${candidates.length}`);
  return candidates[0];
}

function assertTemplate(template, image) {
  if (!template) throw new Error("AVANTIQO_MUSIC_EXTEND_TEMPLATE_REQUIRED");
  if (text(template.imageName ?? template.image_name) !== image.image) {
    throw new Error("AVANTIQO_MUSIC_EXTEND_TEMPLATE_IMMUTABLE_IMAGE_MISMATCH");
  }
  const env = normalizeEnv(template.env);
  const invalidEnv = Object.entries(desiredEnv()).filter(([key, value]) => env[key] !== value).map(([key]) => key);
  if (invalidEnv.length) throw new Error(`AVANTIQO_MUSIC_EXTEND_TEMPLATE_ENV_MISMATCH:${invalidEnv.join(",")}`);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId ?? endpoint.template_id ?? endpoint.template?.id) || null,
    workers_min: workersMin(endpoint),
    workers_max: workersMax(endpoint),
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds ?? endpoint.gpu_type_ids)),
  };
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const image = await imageEvidence();
const [endpoints, templates, registryAuths, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_MUSIC_EXTEND_RUNPOD_LIST_INVALID");
}

const volume = resolveVolume(volumes);
const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (endpointMatches.length > 1) throw new Error(`AVANTIQO_MUSIC_EXTEND_ENDPOINT_AMBIGUOUS:${endpointMatches.length}`);

if (endpointMatches.length === 1) {
  const endpoint = endpointMatches[0];
  const template = endpointTemplate(endpoint, templates);
  assertTemplate(template, image);
  const volumesAttached = endpointVolumeIds(endpoint);
  if (volumesAttached.length !== 1 || volumesAttached[0] !== volume.id) {
    throw new Error("AVANTIQO_MUSIC_EXTEND_ENDPOINT_CACHE_BINDING_MISMATCH");
  }
  const parkingRequired = workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0;
  if (parkingRequired && !apply) {
    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      mode: "PLAN",
      endpoint_exists: true,
      endpoint: safeEndpoint(endpoint),
      immutable_image: image.image,
      canonical_cache_volume: volume,
      parking_required: true,
      target_workers_min: 0,
      target_workers_max: 0,
      mutation_performed: false,
      provider_job_submitted: false,
      volume_mutation_performed: false,
      compose_endpoint_mutation_performed: false,
      production_deploy_performed: false,
      pricing_activation_performed: false,
      next_action: "APPROVE_PARK_EXISTING_MUSIC_EXTEND_ENDPOINT",
    }, null, 2));
    process.exit(0);
  }
  let verified = endpoint;
  let mutationPerformed = false;
  if (parkingRequired) {
    await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0, workersMax: 0 },
    });
    verified = await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}?includeTemplate=true&includeWorkers=true`, managementKey);
    mutationPerformed = true;
  }
  if (workersMin(verified) !== 0 || workersMax(verified) !== 0) {
    throw new Error("AVANTIQO_MUSIC_EXTEND_ENDPOINT_PARK_VERIFY_FAILED");
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(verified),
    immutable_image: image.image,
    canonical_cache_volume: volume,
    exact_image_digest_verified: true,
    parking_required: false,
    mutation_performed: mutationPerformed,
    workers_opened: false,
    provider_job_submitted: false,
    volume_mutation_performed: false,
    compose_endpoint_mutation_performed: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    safe_lease_lane: "music-extend",
    next_action: "PREFLIGHT_THEN_CERTIFY_ONLY_THROUGH_SAFE_LEASE_V2",
  }, null, 2));
  process.exit(0);
}

const auth = resolveRegistryAuth(registryAuths);
const templateName = `${TEMPLATE_PREFIX}${image.digest.replace(/^sha256:/, "").slice(0, 12)}`;
const templateMatches = templates.filter((template) => text(template?.name) === templateName);
if (templateMatches.length > 1) throw new Error(`AVANTIQO_MUSIC_EXTEND_TEMPLATE_AMBIGUOUS:${templateMatches.length}`);
if (templateMatches[0]) assertTemplate(templateMatches[0], image);

const gpuTypes = unique(text(process.env.AVANTIQO_MUSIC_EXTEND_RUNPOD_GPU_TYPE_IDS || DEFAULT_GPU_TYPES.join(",")).split(","));
if (!gpuTypes.length) throw new Error("AVANTIQO_MUSIC_EXTEND_GPU_TYPE_IDS_REQUIRED");

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  endpoint_name: ENDPOINT_NAME,
  immutable_image: image.image,
  image_source_sha: image.source_sha,
  template_name: templateName,
  canonical_cache_volume: volume,
  cache_volume_mutation_allowed: false,
  checkpoint_root: CHECKPOINT_ROOT,
  model_variant: "acestep-v15-base",
  task_type: "complete",
  ace_step_lm_enabled: false,
  production_certified: false,
  workers_min: 0,
  workers_max: 0,
  safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
  safe_lease_lane: "music-extend",
  gpu_type_ids: gpuTypes,
  mutation_performed: false,
  workers_opened: false,
  provider_job_submitted: false,
  volume_mutation_performed: false,
  compose_endpoint_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  next_action: apply ? "CREATE_PARKED_MUSIC_EXTEND_ENDPOINT" : "APPROVE_PARKED_ENDPOINT_PROVISION",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let template = templateMatches[0] || null;
if (!template) {
  template = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: image.image,
      name: templateName,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: text(auth.id),
      dockerEntrypoint: [],
      dockerStartCmd: [],
      env: desiredEnv(),
      isPublic: false,
      isServerless: true,
      ports: [],
      readme: "Avantiqo Music Extend candidate: ACE-Step 1.5 Base Complete, LM-off direct source conditioning. Immutable digest; certification gated; parked 0/0; shared canonical Music audio cache only.",
      volumeInGb: 0,
      volumeMountPath: "/workspace",
    },
  });
}
assertTemplate(template, image);
const templateId = text(template?.id);
if (!templateId) throw new Error("AVANTIQO_MUSIC_EXTEND_TEMPLATE_ID_REQUIRED");

const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (list(freshEndpoints).some((endpoint) => text(endpoint?.name) === ENDPOINT_NAME)) {
  throw new Error("AVANTIQO_MUSIC_EXTEND_ENDPOINT_APPEARED_REPLAN_REQUIRED");
}

const created = await rest("/endpoints", managementKey, {
  method: "POST",
  body: {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: 30 * 60 * 1000,
    flashboot: true,
    gpuCount: 1,
    gpuTypeIds: gpuTypes,
    idleTimeout: 5,
    name: ENDPOINT_NAME,
    networkVolumeId: volume.id,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
    workersMin: 0,
    workersMax: 0,
  },
});
const endpointId = text(created?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_EXTEND_CREATED_ENDPOINT_ID_REQUIRED");
const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (text(verified?.name) !== ENDPOINT_NAME || workersMin(verified) !== 0 || workersMax(verified) !== 0) {
  throw new Error("AVANTIQO_MUSIC_EXTEND_CREATED_ENDPOINT_PARK_VERIFY_FAILED");
}
if (endpointVolumeIds(verified).length !== 1 || endpointVolumeIds(verified)[0] !== volume.id) {
  throw new Error("AVANTIQO_MUSIC_EXTEND_CREATED_ENDPOINT_CACHE_VERIFY_FAILED");
}
assertTemplate(endpointTemplate(verified, [template, ...templates]) || template, image);

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template_created: !templateMatches[0],
  endpoint_created: true,
  mutation_performed: true,
  workers_opened: false,
  provider_job_submitted: false,
  volume_mutation_performed: false,
  compose_endpoint_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  next_action: "PREFLIGHT_THEN_CERTIFY_ONLY_THROUGH_SAFE_LEASE_V2",
}, null, 2));
