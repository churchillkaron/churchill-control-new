#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_RUNPOD_PROVISION_V1";
const ENDPOINT_NAME = "avantiqo-music-transform-candidate-v1";
const PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const TEMPLATE_PREFIX = "avantiqo-music-transform-candidate-";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const IMAGE_REQUEST_PATH = "audits/avantiqo-audio-worker-image-request.json";
const IMAGE_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3";
const REQUEST_CONTRACT = "AVANTIQO_AUDIO_WORKER_IMAGE_REQUEST_V11";
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-transform-candidate";
const CANONICAL_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const CHECKPOINT_ROOT = "/runpod-volume/ace-step-checkpoints";
const APPROVAL_ENV = "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVISION_APPROVED";
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
  const primary = text(endpoint.networkVolumeId ?? endpoint.network_volume_id);
  const additional = list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids)
    .map((entry) => text(
      typeof entry === "string"
        ? entry
        : entry?.networkVolumeId ?? entry?.network_volume_id ?? entry?.id,
    ))
    .filter(Boolean);
  return unique([primary, ...additional]);
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
    ACESTEP_INIT_LLM: "true",
    AVANTIQO_AUDIO_DEVICE: "cuda",
    AVANTIQO_AUDIO_FOUNDATION_MODEL: "ACE-Step/Ace-Step1.5",
    AVANTIQO_AUDIO_MODEL_FAMILY: "ACE_STEP_1_5",
    AVANTIQO_AUDIO_MODEL_VARIANT: "acestep-v15-xl-turbo",
    AVANTIQO_AUDIO_LM_MODEL: "acestep-5Hz-lm-1.7B",
    AVANTIQO_AUDIO_LM_BACKEND: "vllm",
    AVANTIQO_AUDIO_MODEL_SOURCE: "huggingface",
    AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate",
    AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE: SAFE_LEASE_LANE,
    AVANTIQO_AUDIO_FITNESS_LOAD_MODEL: "false",
  };
}

async function jsonFile(path, code) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${code}:${error?.code || "READ_FAILED"}`);
  }
}

async function imageEvidence() {
  const [report, request] = await Promise.all([
    jsonFile(IMAGE_EVIDENCE_PATH, "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_IMAGE_EVIDENCE_REQUIRED"),
    jsonFile(IMAGE_REQUEST_PATH, "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_IMAGE_REQUEST_REQUIRED"),
  ]);

  if (
    request?.contract !== REQUEST_CONTRACT ||
    text(request?.worker_entrypoint) !== "handler_v2.py" ||
    text(request?.temporal_extend_strategy) !== "XL_TURBO_REPAINT_RIGHT_OUTPAINT" ||
    text(request?.certification_safe_lease_lane_env) !== "AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE" ||
    text(request?.transform_candidate_lane) !== SAFE_LEASE_LANE ||
    text(request?.transform_candidate_endpoint) !== ENDPOINT_NAME ||
    request?.production_audio_endpoint_mutation_allowed !== false ||
    request?.provider_job_submitted !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_IMAGE_REQUEST_INVALID");
  }

  const valid =
    report?.success === true &&
    text(report?.contract) === IMAGE_CONTRACT &&
    report?.source_sha_matches_trigger === true &&
    text(report?.source_sha) === text(report?.trigger_sha) &&
    text(report?.runtime_variant) === "acestep-v15-xl-turbo" &&
    text(report?.quality_profile) === QUALITY_PROFILE &&
    text(report?.lm_model) === "acestep-5Hz-lm-1.7B" &&
    text(report?.lm_backend) === "vllm" &&
    report?.ace_step_lm_required === true &&
    report?.xl_model_contract_passed_by_docker_build === true &&
    report?.lm_contract_passed_by_docker_build === true &&
    report?.cuda_import_smoke_passed_by_docker_build === true &&
    report?.native_audio_import_smoke_passed_by_docker_build === true &&
    report?.provider_job_submitted === false &&
    report?.production_web_deploy === false &&
    report?.pricing_activation_performed === false;
  if (!valid) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_IMAGE_EVIDENCE_INVALID");

  const image = text(report?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_IMMUTABLE_IMAGE_REQUIRED");
  }
  return {
    image,
    digest: text(report?.image_digest),
    source_sha: text(report?.source_sha),
    request_worker_source_sha: text(request?.worker_source_sha),
  };
}

function resolveVolume(volumes) {
  const matches = list(volumes).filter((volume) => text(volume?.name) === CANONICAL_VOLUME_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_CACHE_VOLUME_REQUIRED:matches=${matches.length}`);
  }
  const volume = matches[0];
  const id = text(volume?.id);
  if (!id) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_CACHE_VOLUME_ID_REQUIRED");
  return { id, name: CANONICAL_VOLUME_NAME, size_gb: finite(volume?.size, null) };
}

function resolveRegistryAuth(registryAuths) {
  const explicit = text(process.env.AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_RUNPOD_REGISTRY_AUTH_ID);
  if (explicit) {
    const matches = list(registryAuths).filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_REGISTRY_AUTH_NOT_FOUND:${matches.length}`);
    return matches[0];
  }
  const matches = list(registryAuths).filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (matches.length !== 1) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_GHCR_AUTH_REQUIRED:matches=${matches.length}`);
  return matches[0];
}

function assertTemplate(template, image) {
  if (!template) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_TEMPLATE_REQUIRED");
  if (text(template.imageName ?? template.image_name) !== image.image) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_TEMPLATE_IMAGE_MISMATCH");
  }
  const env = normalizeEnv(template.env);
  const mismatches = Object.entries(desiredEnv()).filter(([key, value]) => env[key] !== value).map(([key]) => key);
  if (mismatches.length) {
    throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_TEMPLATE_ENV_MISMATCH:${mismatches.join(",")}`);
  }
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId ?? endpoint?.template_id ?? endpoint?.template?.id) || null,
    workers_min: workersMin(endpoint),
    workers_max: workersMax(endpoint),
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: unique(list(endpoint?.gpuTypeIds ?? endpoint?.gpu_type_ids)),
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
if (![endpoints, templates, registryAuths, volumes].every(Array.isArray)) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_RUNPOD_LIST_INVALID");
}

const productionAudioMatches = endpoints.filter((endpoint) => text(endpoint?.name) === PRODUCTION_AUDIO_ENDPOINT_NAME);
const candidateMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (candidateMatches.length > 1) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_AMBIGUOUS:${candidateMatches.length}`);
const volume = resolveVolume(volumes);

if (candidateMatches.length === 1) {
  const endpoint = candidateMatches[0];
  if (productionAudioMatches.some((item) => text(item?.id) === text(endpoint?.id))) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_COLLIDES_WITH_PRODUCTION_AUDIO");
  }
  assertTemplate(endpointTemplate(endpoint, templates), image);
  const attached = endpointVolumeIds(endpoint);
  if (attached.length !== 1 || attached[0] !== volume.id) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_CACHE_BINDING_MISMATCH");
  }
  if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_NOT_PARKED_0_0");
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(endpoint),
    exact_immutable_image_verified: true,
    canonical_cache_volume: volume,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: SAFE_LEASE_LANE,
    production_audio_endpoint_count: productionAudioMatches.length,
    production_audio_endpoint_mutation_performed: false,
    mutation_performed: false,
    workers_opened: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    next_action: "PREFLIGHT_THEN_CERTIFY_ONLY_THROUGH_MUSIC_TRANSFORM_CANDIDATE_SAFE_LEASE",
  }, null, 2));
  process.exit(0);
}

const auth = resolveRegistryAuth(registryAuths);
const digestSuffix = image.digest.replace(/^sha256:/, "").slice(0, 12);
const templateName = `${TEMPLATE_PREFIX}${digestSuffix}`;
const matchingTemplates = templates.filter((template) => text(template?.name) === templateName);
if (matchingTemplates.length > 1) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_TEMPLATE_AMBIGUOUS:${matchingTemplates.length}`);
if (matchingTemplates[0]) assertTemplate(matchingTemplates[0], image);

const gpuTypes = unique(text(process.env.AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_GPU_TYPE_IDS || DEFAULT_GPU_TYPES.join(",")).split(","));
if (!gpuTypes.length) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_GPU_TYPE_IDS_REQUIRED");

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  endpoint_name: ENDPOINT_NAME,
  immutable_image: image.image,
  image_source_sha: image.source_sha,
  request_worker_source_sha: image.request_worker_source_sha,
  template_name: templateName,
  canonical_cache_volume: volume,
  quality_profile: QUALITY_PROFILE,
  model_variant: "acestep-v15-xl-turbo",
  lm_model: "acestep-5Hz-lm-1.7B",
  lm_backend: "vllm",
  certification_safe_lease_lane: SAFE_LEASE_LANE,
  workers_min: 0,
  workers_max: 0,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  gpu_type_ids: gpuTypes,
  production_audio_endpoint_count: productionAudioMatches.length,
  production_audio_endpoint_mutation_allowed: false,
  production_audio_endpoint_mutation_performed: false,
  mutation_performed: false,
  workers_opened: false,
  provider_job_submitted: false,
  volume_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  next_action: apply ? "CREATE_PARKED_MUSIC_TRANSFORM_CANDIDATE" : "APPROVE_PARKED_CANDIDATE_PROVISION",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let template = matchingTemplates[0] || null;
if (!template) {
  template = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: image.image,
      name: templateName,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: text(auth?.id),
      dockerEntrypoint: [],
      dockerStartCmd: [],
      env: desiredEnv(),
      isPublic: false,
      isServerless: true,
      ports: [],
      readme: "Avantiqo Music transform certification candidate. Parked 0/0; never production Compose routing.",
      volumeInGb: 0,
      volumeMountPath: "/runpod-volume",
    },
  });
}

const templateId = text(template?.id);
if (!templateId) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_TEMPLATE_ID_REQUIRED");

const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
const freshCandidate = list(freshEndpoints).filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (freshCandidate.length) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_APPEARED_REPLAN_REQUIRED:${freshCandidate.length}`);

const endpoint = await rest("/endpoints", managementKey, {
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
    workersMax: 0,
    workersMin: 0,
  },
});

const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID_REQUIRED");
if (productionAudioMatches.some((item) => text(item?.id) === endpointId)) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_CREATED_AS_PRODUCTION_AUDIO");
}

const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (
  text(verified?.name) !== ENDPOINT_NAME ||
  text(verified?.templateId ?? verified?.template?.id) !== templateId ||
  workersMin(verified) !== 0 ||
  workersMax(verified) !== 0
) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVISION_VERIFY_FAILED");
}
const attached = endpointVolumeIds(verified);
if (attached.length !== 1 || attached[0] !== volume.id) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PROVISION_CACHE_VERIFY_FAILED");
}
assertTemplate(endpointTemplate(verified, templates) || template, image);

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template_created: matchingTemplates.length === 0,
  endpoint_created: true,
  mutation_performed: true,
  workers_opened: false,
  provider_job_submitted: false,
  production_audio_endpoint_mutation_performed: false,
  next_action: "PREFLIGHT_THEN_CERTIFY_ONLY_THROUGH_MUSIC_TRANSFORM_CANDIDATE_SAFE_LEASE",
}, null, 2));