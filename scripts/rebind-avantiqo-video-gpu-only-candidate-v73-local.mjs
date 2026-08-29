#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_GPU_ONLY_CANDIDATE_REBIND_V73";
const APPROVAL_ENV = "AVANTIQO_VIDEO_GPU_ONLY_CANDIDATE_REBIND_V73_APPROVED";
const REST = "https://rest.runpod.io/v1";
const CANDIDATE_NAME = "avantiqo-video-32gb-candidate-v1";
const PRODUCTION_NAME = "avantiqo-cinema-production-v1";
const IMAGE_NAME = "avantiqo-image-production-v1";
const EVIDENCE = "audits/results/avantiqo-video-worker-gpu-only.json";
const EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_GPU_ONLY_IMAGE_RESULT_V1";
const CACHE_NAME = "avantiqo-video-cache-eu-ro-1";
const CACHE_DC = "EU-RO-1";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => text(value).toUpperCase() === "YES";

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).replace(/\s+/g, " ").slice(0, 600);
    const error = new Error(`AVANTIQO_VIDEO_V73_RUNPOD_HTTP_${response.status}:${detail || "UNKNOWN"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

function rows(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function templateId(endpoint = {}) {
  return text(endpoint.templateId ?? endpoint.template_id ?? (typeof endpoint.template === "string" ? endpoint.template : endpoint.template?.id));
}
function volumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map((value) => text(typeof value === "string" ? value : value?.id ?? value?.networkVolumeId)),
  ].filter(Boolean))];
}
function workerBounds(endpoint = {}) {
  return {
    min: finite(endpoint.workersMin ?? endpoint.workers_min, -1),
    max: finite(endpoint.workersMax ?? endpoint.workers_max, -1),
  };
}
function endpointFingerprint(endpoint = {}) {
  return JSON.stringify({
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: templateId(endpoint),
    workers: workerBounds(endpoint),
    volumes: volumeIds(endpoint).sort(),
    gpu_types: list(endpoint.gpuTypeIds ?? endpoint.gpu_type_ids).map(text).filter(Boolean).sort(),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.execution_timeout_ms, null),
    idle_timeout: finite(endpoint.idleTimeout ?? endpoint.idle_timeout, null),
  });
}
function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [key, String(child ?? "")]));
}
function registryAuthId(template = {}) {
  return text(template.containerRegistryAuthId ?? template.container_registry_auth_id) || null;
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const key = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);

const evidence = JSON.parse(await readFile(EVIDENCE, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence?.contract) !== EVIDENCE_CONTRACT ||
  text(evidence?.entrypoint) !== "handler_v6.py" ||
  text(evidence?.runtime_revision) !== "AVANTIQO_VIDEO_WAN22_A14B_GPU_ONLY_FRAME_EGRESS_V1" ||
  text(evidence?.compute_boundary_contract) !== "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1" ||
  evidence?.ffmpeg_in_image_source !== false ||
  evidence?.final_video_encoding_on_paid_worker !== false ||
  evidence?.final_artifact_storage_on_paid_worker !== false ||
  evidence?.fal_dependency !== false ||
  evidence?.runpod_mutation_performed !== false ||
  evidence?.video_generation_submitted !== false
) throw new Error("AVANTIQO_VIDEO_V73_GPU_ONLY_IMAGE_EVIDENCE_INVALID");
const immutableImage = text(evidence.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker-gpu-only@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
  throw new Error("AVANTIQO_VIDEO_V73_IMMUTABLE_IMAGE_INVALID");
}

const [rawEndpoints, rawTemplates, rawVolumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key),
  rest("/networkvolumes", key),
]);
const endpoints = rows(rawEndpoints, "endpoints");
const templates = rows(rawTemplates, "templates");
const volumes = rows(rawVolumes, "networkVolumes");
const candidates = endpoints.filter((row) => text(row.name) === CANDIDATE_NAME);
const productions = endpoints.filter((row) => text(row.name) === PRODUCTION_NAME);
const images = endpoints.filter((row) => text(row.name) === IMAGE_NAME);
if (candidates.length !== 1) throw new Error(`AVANTIQO_VIDEO_V73_CANDIDATE_AMBIGUOUS:${candidates.length}`);
if (productions.length !== 1) throw new Error(`AVANTIQO_VIDEO_V73_PRODUCTION_AMBIGUOUS:${productions.length}`);
if (images.length > 1) throw new Error(`AVANTIQO_VIDEO_V73_IMAGE_ENDPOINT_AMBIGUOUS:${images.length}`);
const candidate = candidates[0];
const production = productions[0];
const imageEndpoint = images[0] || null;
const bounds = workerBounds(candidate);
if (bounds.min !== 0 || bounds.max !== 0) throw new Error(`AVANTIQO_VIDEO_V73_CANDIDATE_NOT_PARKED:${bounds.min}:${bounds.max}`);

const cacheMatches = volumes.filter((volume) => text(volume.name) === CACHE_NAME);
if (cacheMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V73_CACHE_AMBIGUOUS:${cacheMatches.length}`);
const cache = cacheMatches[0];
if (text(cache.dataCenterId ?? cache.data_center_id) !== CACHE_DC || finite(cache.size ?? cache.sizeGb, 0) < 400) {
  throw new Error("AVANTIQO_VIDEO_V73_CACHE_INVALID");
}
if (!volumeIds(candidate).includes(text(cache.id))) throw new Error("AVANTIQO_VIDEO_V73_CANDIDATE_CACHE_MISMATCH");

const currentTemplate = templates.find((row) => text(row.id) === templateId(candidate));
if (!currentTemplate) throw new Error("AVANTIQO_VIDEO_V73_CURRENT_TEMPLATE_REQUIRED");
const currentEnv = normalizeEnv(currentTemplate.env);
for (const [name, expected] of Object.entries({
  AVANTIQO_VIDEO_DEVICE: "cuda",
  AVANTIQO_VIDEO_DTYPE: "bfloat16",
  AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL: "1",
  AVANTIQO_VIDEO_HF_CACHE_ROOT: "/runpod-volume/huggingface-cache/hub",
  AVANTIQO_VIDEO_T2V_MODEL: "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
  AVANTIQO_VIDEO_I2V_MODEL: "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
})) {
  if (currentEnv[name] !== expected) throw new Error(`AVANTIQO_VIDEO_V73_TEMPLATE_ENV_DRIFT:${name}`);
}

const productionBefore = endpointFingerprint(production);
const imageBefore = imageEndpoint ? endpointFingerprint(imageEndpoint) : null;
const alreadyBound = text(currentTemplate.imageName ?? currentTemplate.image_name) === immutableImage;
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  candidate_endpoint_id: text(candidate.id),
  candidate_workers_min: 0,
  candidate_workers_max: 0,
  current_template_id: text(currentTemplate.id),
  current_image: text(currentTemplate.imageName ?? currentTemplate.image_name),
  target_immutable_image: immutableImage,
  already_bound: alreadyBound,
  cache_volume_id: text(cache.id),
  cache_volume_name: text(cache.name),
  cache_data_center: CACHE_DC,
  production_mutation_allowed: false,
  image_endpoint_mutation_allowed: false,
  workers_opened: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
};
if (!apply || alreadyBound) {
  console.log(JSON.stringify({ ...plan, mutation_performed: false }, null, 2));
  if (alreadyBound) console.log(`${CONTRACT}=PASS_ALREADY_BOUND`);
  process.exit(0);
}

const digestSuffix = immutableImage.split("@sha256:")[1].slice(0, 12);
const newTemplateName = `avantiqo-video-gpu-only-${digestSuffix}`;
let targetTemplate = templates.find((row) => text(row.name) === newTemplateName) || null;
let templateCreated = false;
if (!targetTemplate) {
  const body = {
    imageName: immutableImage,
    name: newTemplateName,
    category: text(currentTemplate.category) || "NVIDIA",
    containerDiskInGb: Math.max(30, finite(currentTemplate.containerDiskInGb ?? currentTemplate.container_disk_gb, 30)),
    ...(registryAuthId(currentTemplate) ? { containerRegistryAuthId: registryAuthId(currentTemplate) } : {}),
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env: currentEnv,
    isPublic: false,
    isServerless: true,
    ports: [],
    readme: "Avantiqo Video GPU-only Wan2.2 worker. No FFmpeg. Intermediate frame egress only. Studio owns CPU processing.",
    volumeInGb: 0,
    volumeMountPath: "/runpod-volume",
  };
  targetTemplate = await rest("/templates", key, { method: "POST", body });
  templateCreated = true;
}
const targetTemplateId = text(targetTemplate.id);
if (!targetTemplateId) throw new Error("AVANTIQO_VIDEO_V73_TARGET_TEMPLATE_ID_REQUIRED");
if (text(targetTemplate.imageName ?? targetTemplate.image_name) !== immutableImage) throw new Error("AVANTIQO_VIDEO_V73_TARGET_TEMPLATE_IMAGE_MISMATCH");

await rest(`/endpoints/${encodeURIComponent(text(candidate.id))}`, key, {
  method: "PATCH",
  body: { templateId: targetTemplateId, workersMin: 0, workersMax: 0 },
});
const refreshed = await rest(`/endpoints/${encodeURIComponent(text(candidate.id))}?includeTemplate=true&includeWorkers=true`, key);
const refreshedBounds = workerBounds(refreshed);
if (templateId(refreshed) !== targetTemplateId) throw new Error("AVANTIQO_VIDEO_V73_REBIND_VERIFY_TEMPLATE_FAILED");
if (refreshedBounds.min !== 0 || refreshedBounds.max !== 0) throw new Error("AVANTIQO_VIDEO_V73_REBIND_OPENED_WORKERS");
if (!volumeIds(refreshed).includes(text(cache.id))) throw new Error("AVANTIQO_VIDEO_V73_REBIND_CACHE_CHANGED");

const [productionAfter, imageAfter] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(text(production.id))}?includeTemplate=true&includeWorkers=true`, key),
  imageEndpoint ? rest(`/endpoints/${encodeURIComponent(text(imageEndpoint.id))}?includeTemplate=true&includeWorkers=true`, key) : Promise.resolve(null),
]);
if (endpointFingerprint(productionAfter) !== productionBefore) throw new Error("AVANTIQO_VIDEO_V73_PRODUCTION_CHANGED");
if (imageEndpoint && endpointFingerprint(imageAfter) !== imageBefore) throw new Error("AVANTIQO_VIDEO_V73_IMAGE_ENDPOINT_CHANGED");

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  new_template_id: targetTemplateId,
  new_template_name: newTemplateName,
  template_created: templateCreated,
  candidate_template_rebound: true,
  mutation_performed: true,
  candidate_workers_after: refreshedBounds,
  production_unchanged: true,
  image_endpoint_unchanged: true,
  workers_opened: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
