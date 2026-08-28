#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_PROVISION_V69";
const ENDPOINT_NAME = "avantiqo-video-32gb-candidate-v1";
const PRODUCTION_ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const TEMPLATE_PREFIX = "avantiqo-video-32gb-candidate-";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-32gb-candidate.json";
const IMAGE_CONTRACT = "AVANTIQO_VIDEO_32GB_CANDIDATE_IMAGE_RESULT_V1";
const CACHE_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";
const CACHE_DATA_CENTER = "EU-RO-1";
const GPU_TYPE = "NVIDIA RTX PRO 4500 Blackwell";
const APPROVAL_ENV = "AVANTIQO_VIDEO_32GB_CANDIDATE_PROVISION_APPROVED";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const approved = (value) => text(value).toUpperCase() === "YES";

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
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

function endpointTemplateId(endpoint = {}) {
  const embedded = endpoint?.template;
  return text(
    endpoint?.templateId ??
    endpoint?.template_id ??
    (typeof embedded === "string" ? embedded : embedded?.id),
  );
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

function endpointGpuTypes(endpoint = {}) {
  return unique(list(endpoint.gpuTypeIds ?? endpoint.gpu_type_ids));
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: endpointTemplateId(endpoint) || null,
    workers_min: workersMin(endpoint),
    workers_max: workersMax(endpoint),
    gpu_type_ids: endpointGpuTypes(endpoint),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.execution_timeout_ms, null),
    idle_timeout: finite(endpoint.idleTimeout ?? endpoint.idle_timeout, null),
  };
}

function sameEndpointState(left, right) {
  return JSON.stringify(safeEndpoint(left)) === JSON.stringify(safeEndpoint(right));
}

function normalizeEnv(value) {
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [key, String(child ?? "")]));
}

function desiredEnv() {
  return {
    AVANTIQO_VIDEO_DEVICE: "cuda",
    AVANTIQO_VIDEO_DTYPE: "bfloat16",
    AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL: "1",
    AVANTIQO_VIDEO_HF_CACHE_ROOT: "/runpod-volume/huggingface-cache/hub",
    AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB: "400",
    AVANTIQO_VIDEO_T2V_MODEL: T2V_MODEL,
    AVANTIQO_VIDEO_I2V_MODEL: I2V_MODEL,
    AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES: "ai.video.generate,ai.video.image_to_video",
    AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED: "0",
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
  const report = await jsonFile(
    IMAGE_EVIDENCE_PATH,
    "AVANTIQO_VIDEO_32GB_CANDIDATE_IMAGE_EVIDENCE_REQUIRED",
  );
  const valid =
    report?.success === true &&
    text(report?.contract) === IMAGE_CONTRACT &&
    report?.source_sha_matches_trigger === true &&
    text(report?.source_sha) === text(report?.trigger_sha) &&
    text(report?.entrypoint) === "handler_v5.py" &&
    text(report?.runtime_revision) === "AVANTIQO_VIDEO_WAN22_A14B_32GB_GROUP_OFFLOAD_V1" &&
    text(report?.memory_contract) === "AVANTIQO_VIDEO_WAN22_A14B_32GB_MEMORY_PROFILE_V1" &&
    Number(report?.target_minimum_vram_gb) === 32 &&
    text(report?.group_offload_type) === "leaf_level" &&
    report?.group_offload_stream === true &&
    report?.quantization_enabled === false &&
    report?.layerwise_casting_enabled === false &&
    text(report?.diffusion_dtype) === "bfloat16" &&
    text(report?.vae_decode_dtype) === "float32" &&
    text(report?.quality_contract_preserved) === "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1" &&
    text(report?.configured_text_to_video_foundation) === T2V_MODEL &&
    text(report?.configured_image_to_video_foundation) === I2V_MODEL &&
    report?.candidate_only === true &&
    report?.production_rebind_performed === false &&
    report?.runpod_endpoint_mutation_performed === false &&
    report?.runpod_worker_mutation_performed === false &&
    report?.video_generation_submitted === false &&
    report?.external_paid_provider_contacted === false &&
    report?.secrets_in_output === false;
  if (!valid) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_IMAGE_EVIDENCE_INVALID");

  const image = text(report?.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_IMMUTABLE_IMAGE_REQUIRED");
  }
  return {
    image,
    digest: text(report?.image_digest),
    source_sha: text(report?.source_sha),
    github_run_id: text(report?.github_run_id),
  };
}

function resolveVolume(volumes, productionEndpoint) {
  const matches = list(volumes).filter((volume) => text(volume?.name) === CACHE_VOLUME_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_CACHE_VOLUME_REQUIRED:matches=${matches.length}`);
  }
  const volume = matches[0];
  const id = text(volume?.id);
  const dataCenterId = text(volume?.dataCenterId ?? volume?.data_center_id);
  const sizeGb = finite(volume?.size ?? volume?.sizeGb, null);
  if (!id) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_CACHE_VOLUME_ID_REQUIRED");
  if (dataCenterId !== CACHE_DATA_CENTER) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_CACHE_REGION_INVALID:${dataCenterId || "MISSING"}`);
  }
  if (!(sizeGb >= 400)) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_CACHE_VOLUME_TOO_SMALL:${sizeGb}`);
  }
  if (!endpointVolumeIds(productionEndpoint).includes(id)) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_CACHE_NOT_ATTACHED_TO_PRODUCTION_VIDEO");
  }
  return { id, name: CACHE_VOLUME_NAME, data_center_id: dataCenterId, size_gb: sizeGb };
}

function resolveRegistryAuth(registryAuths) {
  const explicit = text(process.env.AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_REGISTRY_AUTH_ID);
  if (explicit) {
    const matches = list(registryAuths).filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_REGISTRY_AUTH_NOT_FOUND:${matches.length}`);
    }
    return matches[0];
  }
  const matches = list(registryAuths).filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_GHCR_AUTH_REQUIRED:matches=${matches.length}`);
  }
  return matches[0];
}

function authoritativeTemplate(endpoint, templates) {
  const templateId = endpointTemplateId(endpoint);
  return list(templates).find((template) => text(template?.id) === templateId) || null;
}

function templateState(template, image) {
  if (!template) return { exact: false, image_match: false, env_mismatches: ["TEMPLATE_MISSING"] };
  const imageMatch = text(template.imageName ?? template.image_name) === image.image;
  const env = normalizeEnv(template.env);
  const envMismatches = Object.entries(desiredEnv())
    .filter(([key, value]) => env[key] !== value)
    .map(([key]) => key);
  return {
    exact: imageMatch && envMismatches.length === 0,
    image_match: imageMatch,
    env_mismatches: envMismatches,
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template?.id) || null,
    name: text(template?.name) || null,
    image_name: text(template?.imageName ?? template?.image_name) || null,
    container_disk_gb: finite(template?.containerDiskInGb ?? template?.container_disk_gb, null),
    registry_auth_configured: Boolean(text(template?.containerRegistryAuthId ?? template?.container_registry_auth_id)),
  };
}

function assertTemplate(template, image) {
  const state = templateState(template, image);
  if (!state.image_match) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_IMAGE_MISMATCH");
  if (state.env_mismatches.length) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_ENV_MISMATCH:${state.env_mismatches.join(",")}`);
  }
}

function assertCandidateEndpoint(endpoint, templateId, volumeId) {
  if (text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_NAME_INVALID");
  }
  if (endpointTemplateId(endpoint) !== templateId) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_TEMPLATE_INVALID");
  }
  if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0) {
    throw new Error(
      `AVANTIQO_VIDEO_32GB_CANDIDATE_NOT_PARKED:workers_min=${workersMin(endpoint)}:workers_max=${workersMax(endpoint)}`,
    );
  }
  const volumes = endpointVolumeIds(endpoint);
  if (volumes.length !== 1 || volumes[0] !== volumeId) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_CACHE_BINDING_INVALID");
  }
  const gpuTypes = endpointGpuTypes(endpoint);
  if (gpuTypes.length !== 1 || gpuTypes[0] !== GPU_TYPE) {
    throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_GPU_POOL_INVALID:${gpuTypes.join(",") || "MISSING"}`);
  }
}

async function createTemplate(managementKey, registryAuthId, image, templateName) {
  const created = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: image.image,
      name: templateName,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: registryAuthId,
      dockerEntrypoint: [],
      dockerStartCmd: [],
      env: desiredEnv(),
      isPublic: false,
      isServerless: true,
      ports: [],
      readme: "Avantiqo Video 32GB Wan2.2 candidate. EU-RO-1 cache. Parked 0/0. Never automatic production routing.",
      volumeInGb: 0,
      volumeMountPath: "/runpod-volume",
    },
  });
  const id = text(created?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_CREATE_ID_REQUIRED");
  const verified = await rest(`/templates/${encodeURIComponent(id)}`, managementKey);
  if (text(verified?.name) !== templateName) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_NAME_VERIFY_FAILED");
  }
  assertTemplate(verified, image);
  return verified;
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const productionEndpointId = required("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID");
const image = await imageEvidence();

const [productionEndpoint, endpoints, templates, registryAuths, volumes] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (![endpoints, templates, registryAuths, volumes].every(Array.isArray)) {
  throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_LIST_INVALID");
}
if (text(productionEndpoint?.id) !== productionEndpointId || text(productionEndpoint?.name) !== PRODUCTION_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_PRODUCTION_ENDPOINT_IDENTITY_INVALID");
}
const productionBefore = safeEndpoint(productionEndpoint);
const volume = resolveVolume(volumes, productionEndpoint);
const candidateMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (candidateMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_AMBIGUOUS:${candidateMatches.length}`);
}
if (candidateMatches.some((endpoint) => text(endpoint?.id) === productionEndpointId)) {
  throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_COLLIDES_WITH_PRODUCTION_ENDPOINT");
}

const digestSuffix = image.digest.replace(/^sha256:/, "").slice(0, 12);
const templateName = `${TEMPLATE_PREFIX}${digestSuffix}`;
const targetTemplateMatches = templates.filter((template) => text(template?.name) === templateName);
if (targetTemplateMatches.length > 1) {
  throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_AMBIGUOUS:${targetTemplateMatches.length}`);
}
let targetTemplate = targetTemplateMatches[0] || null;
if (targetTemplate) assertTemplate(targetTemplate, image);

if (candidateMatches.length === 1) {
  const candidate = candidateMatches[0];
  const currentTemplate = authoritativeTemplate(candidate, templates);
  if (!currentTemplate) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_EXISTING_TEMPLATE_REQUIRED");
  assertTemplate(currentTemplate, image);
  assertCandidateEndpoint(candidate, text(currentTemplate?.id), volume.id);

  const productionAfter = await rest(
    `/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (!sameEndpointState(productionEndpoint, productionAfter)) {
    throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_PRODUCTION_ENDPOINT_CHANGED_UNEXPECTEDLY");
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(candidate),
    template: safeTemplate(currentTemplate),
    immutable_image: image.image,
    image_source_sha: image.source_sha,
    image_github_run_id: image.github_run_id,
    cache_volume: volume,
    target_gpu_type: GPU_TYPE,
    target_workers_min: 0,
    target_workers_max: 0,
    exact_immutable_image_verified: true,
    exact_cache_binding_verified: true,
    exact_gpu_pool_verified: true,
    production_endpoint_before: productionBefore,
    production_endpoint_after: safeEndpoint(productionAfter),
    production_endpoint_unchanged: true,
    candidate_endpoint_mutation_performed: false,
    production_endpoint_mutation_performed: false,
    runpod_worker_mutation_performed: false,
    workers_opened: false,
    video_generation_submitted: false,
    external_paid_provider_contacted: false,
    image_endpoint_mutated: false,
    safe_lease_modified: false,
    secrets_printed: false,
    next_action: "RUNTIME_PROBE_ONLY_THROUGH_ISOLATED_32GB_CANDIDATE",
  }, null, 2));
  process.exit(0);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  endpoint_name: ENDPOINT_NAME,
  immutable_image: image.image,
  image_source_sha: image.source_sha,
  image_github_run_id: image.github_run_id,
  template_name: templateName,
  cache_volume: volume,
  target_gpu_type: GPU_TYPE,
  target_workers_min: 0,
  target_workers_max: 0,
  candidate_only: true,
  production_endpoint_before: productionBefore,
  candidate_endpoint_mutation_performed: false,
  production_endpoint_mutation_allowed: false,
  production_endpoint_mutation_performed: false,
  runpod_worker_mutation_performed: false,
  workers_opened: false,
  video_generation_submitted: false,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  safe_lease_modified: false,
  secrets_printed: false,
  next_action: apply ? "CREATE_PARKED_VIDEO_32GB_CANDIDATE" : "APPROVE_PARKED_VIDEO_32GB_CANDIDATE_PROVISION",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let templateCreated = false;
if (!targetTemplate) {
  const auth = resolveRegistryAuth(registryAuths);
  targetTemplate = await createTemplate(managementKey, text(auth?.id), image, templateName);
  templateCreated = true;
}
const templateId = text(targetTemplate?.id);
if (!templateId) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_ID_REQUIRED");
assertTemplate(targetTemplate, image);

const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
const freshCandidate = list(freshEndpoints).filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (freshCandidate.length) {
  throw new Error(`AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_APPEARED_REPLAN_REQUIRED:${freshCandidate.length}`);
}

const created = await rest("/endpoints", managementKey, {
  method: "POST",
  body: {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: 45 * 60 * 1000,
    flashboot: true,
    gpuCount: 1,
    gpuTypeIds: [GPU_TYPE],
    idleTimeout: 5,
    name: ENDPOINT_NAME,
    networkVolumeId: volume.id,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
    workersMax: 0,
    workersMin: 0,
  },
});
const endpointId = text(created?.id);
if (!endpointId) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_ENDPOINT_ID_REQUIRED");
if (endpointId === productionEndpointId) {
  throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_CREATED_AS_PRODUCTION_ENDPOINT");
}

let verified = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
let parkingRepairPerformed = false;
if (workersMin(verified) !== 0 || workersMax(verified) !== 0) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  parkingRepairPerformed = true;
}

const refreshedTemplates = await rest(
  "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
  managementKey,
);
if (!Array.isArray(refreshedTemplates)) {
  throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_TEMPLATE_REFRESH_INVALID");
}
const verifiedTemplate = authoritativeTemplate(verified, refreshedTemplates);
if (!verifiedTemplate) throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_VERIFIED_TEMPLATE_REQUIRED");
assertTemplate(verifiedTemplate, image);
assertCandidateEndpoint(verified, text(verifiedTemplate?.id), volume.id);

const productionAfter = await rest(
  `/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (!sameEndpointState(productionEndpoint, productionAfter)) {
  throw new Error("AVANTIQO_VIDEO_32GB_CANDIDATE_PRODUCTION_ENDPOINT_CHANGED_DURING_PROVISION");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template: safeTemplate(verifiedTemplate),
  exact_immutable_image_verified: true,
  exact_cache_binding_verified: true,
  exact_gpu_pool_verified: true,
  template_created: templateCreated,
  endpoint_created: true,
  parking_repair_performed: parkingRepairPerformed,
  candidate_endpoint_mutation_performed: true,
  production_endpoint_after: safeEndpoint(productionAfter),
  production_endpoint_unchanged: true,
  production_endpoint_mutation_performed: false,
  runpod_worker_mutation_performed: parkingRepairPerformed,
  workers_opened: false,
  video_generation_submitted: false,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  safe_lease_modified: false,
  secrets_printed: false,
  next_action: "RUNTIME_PROBE_ONLY_THROUGH_ISOLATED_32GB_CANDIDATE",
}, null, 2));
