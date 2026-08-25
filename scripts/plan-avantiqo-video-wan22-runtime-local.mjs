import { readFile } from "node:fs/promises";
import {
  resolveReusableGroupVolume,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_PLAN_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const TARGET_SIZE_GB = Math.max(400, Number(process.env.AVANTIQO_VIDEO_WAN22_TARGET_VOLUME_GB || 400));
const STORAGE_RATE_USD_PER_GB_MONTH = 0.07;
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function normalizeListResponse(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeListResponse(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 800)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), "AVANTIQO_VIDEO_WAN22_PLAN_REST");
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(endpoint),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
  };
}
function resolveEndpoint(endpoints, configuredId, names, label) {
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)));
    if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_WAN22_${label}_ENDPOINT_INVALID:${matches.length}`);
    return matches[0];
  }
  const matches = endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_WAN22_${label}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_WAN22_PLAN_NODE24_REQUIRED:${process.version}`);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
if (imageLock?.success !== true || imageLock?.production_certified !== true || text(imageLock?.generation_default?.foundation_model) !== "Tongyi-MAI/Z-Image") {
  throw new Error("AVANTIQO_VIDEO_WAN22_PLAN_IMAGE_V9_LOCK_REQUIRED");
}

const [endpointsRaw, volumesRaw, templatesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
const templates = normalizeListResponse(templatesRaw, ["templates"]);
if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_WAN22_PLAN_INVENTORY_INVALID");

const image = resolveEndpoint(endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_ENDPOINT_NAME]), "IMAGE");
const video = resolveEndpoint(endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), VIDEO_ENDPOINT_NAMES, "VIDEO");
const reusable = resolveReusableGroupVolume(volumes, SHARED_GROUP);
if (!reusable.volume) throw new Error("AVANTIQO_VIDEO_WAN22_PLAN_SHARED_IMAGE_VIDEO_VOLUME_MISSING");
const volume = reusable.volume;
const volumeId = text(volume.id);
const currentSizeGb = finite(volume.size, 0);
const targetSizeGb = Math.max(currentSizeGb, TARGET_SIZE_GB);
const expansionGb = Math.max(0, targetSizeGb - currentSizeGb);
const imageVolumeIds = endpointVolumeIds(image);
const videoVolumeIds = endpointVolumeIds(video);
const imageUsesSharedVolume = imageVolumeIds.includes(volumeId);
const videoUsesSharedVolume = videoVolumeIds.includes(volumeId);
const videoTemplateId = text(video.templateId || video.template?.id);
const videoTemplate = templates.find((entry) => text(entry.id) === videoTemplateId) || object(video.template);
const videoEnv = Array.isArray(videoTemplate?.env)
  ? Object.fromEntries(videoTemplate.env.map((entry) => [text(entry?.key || entry?.name), text(entry?.value)]).filter(([key]) => key))
  : Object.fromEntries(Object.entries(object(videoTemplate?.env)).map(([key, value]) => [key, text(value)]));

const plan = {
  success: true,
  contract: CONTRACT,
  mode: "PLAN",
  image_v9_certification_lock_verified: true,
  shared_volume_policy: sharedVolumePolicySummary(volumes),
  shared_image_video_volume: {
    resolution: reusable.resolution,
    id: volumeId,
    name: text(volume.name) || null,
    data_center_id: text(volume.dataCenterId) || null,
    current_size_gb: currentSizeGb,
    target_size_gb: targetSizeGb,
    expansion_gb: expansionGb,
    estimated_incremental_monthly_usd_at_reference_rate: Number((expansionGb * STORAGE_RATE_USD_PER_GB_MONTH).toFixed(2)),
    reference_storage_rate_usd_per_gb_month: STORAGE_RATE_USD_PER_GB_MONTH,
  },
  image_endpoint: {
    ...safeEndpoint(image),
    certified_v9_preserved: true,
    uses_target_shared_volume: imageUsesSharedVolume,
  },
  video_endpoint: {
    ...safeEndpoint(video),
    uses_target_shared_volume: videoUsesSharedVolume,
    target_workers_min: 0,
    target_workers_max: 1,
  },
  video_template_current: {
    id: videoTemplateId || null,
    name: text(videoTemplate?.name) || null,
    image_name: text(videoTemplate?.imageName) || null,
    volume_mount_path: text(videoTemplate?.volumeMountPath) || null,
    t2v_model: text(videoEnv.AVANTIQO_VIDEO_T2V_MODEL) || null,
    i2v_model: text(videoEnv.AVANTIQO_VIDEO_I2V_MODEL) || null,
    cache_root: text(videoEnv.AVANTIQO_VIDEO_HF_CACHE_ROOT) || "/runpod-volume/huggingface-cache/hub",
  },
  target_cinema_runtime: {
    entrypoint: "handler_v3.py",
    text_to_video_model: T2V_MODEL,
    image_to_video_model: I2V_MODEL,
    certified_capabilities: ["ai.video.generate", "ai.video.image_to_video"],
    require_cached_model: true,
    shared_volume_id: volumeId,
    volume_mount_path: "/runpod-volume",
    hf_cache_root: "/runpod-volume/huggingface-cache/hub",
  },
  required_actions_in_order: [
    ...(expansionGb > 0 ? ["EXPAND_EXISTING_IMAGE_VIDEO_SHARED_VOLUME"] : []),
    ...(videoUsesSharedVolume ? [] : ["ATTACH_EXISTING_SHARED_VOLUME_TO_CINEMA"]),
    "CACHE_WAN22_A14B_T2V_AND_I2V_ON_SHARED_VOLUME",
    "BUILD_AND_BIND_IMMUTABLE_CINEMA_V3",
    "SET_CINEMA_WORKERS_MAX_1_AFTER_CACHE_READY",
    "RUN_NON_INFERENCE_V3_RUNTIME_PROBE",
    "RUN_ONE_NORMAL_TEXT_TO_VIDEO_CERTIFICATION",
    "RUN_ONE_NORMAL_IMAGE_TO_VIDEO_CERTIFICATION",
  ],
  blockers: {
    shared_volume_not_attached_to_image: !imageUsesSharedVolume,
    shared_volume_not_attached_to_video: !videoUsesSharedVolume,
    volume_expansion_required: expansionGb > 0,
    video_workers_max_zero: finite(video.workersMax, 0) === 0,
    live_t2v_model_missing: !text(videoEnv.AVANTIQO_VIDEO_T2V_MODEL),
    live_i2v_model_missing: !text(videoEnv.AVANTIQO_VIDEO_I2V_MODEL),
  },
  safety: {
    provider_jobs_submitted: 0,
    video_generation_submitted: false,
    inference_performed: false,
    model_download_submitted: false,
    volume_mutation_performed: false,
    endpoint_mutation_performed: false,
    template_mutation_performed: false,
    image_v9_mutation_performed: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_in_output: false,
  },
};
console.log(JSON.stringify(plan, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_PLAN=READY");
