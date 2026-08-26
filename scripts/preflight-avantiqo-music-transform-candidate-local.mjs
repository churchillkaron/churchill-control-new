#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_V1";
const ENDPOINT_NAME = "avantiqo-music-transform-candidate-v1";
const PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const IMAGE_REQUEST_PATH = "audits/avantiqo-audio-worker-image-request.json";
const SAFE_LEASE_LANE = "music-transform-candidate";
const CANONICAL_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";

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

async function rest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
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

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function workersMin(endpoint = {}) {
  return finite(endpoint.workersMin ?? endpoint.workers_min, -1);
}

function workersMax(endpoint = {}) {
  return finite(endpoint.workersMax ?? endpoint.workers_max, -1);
}

function normalizeEnv(value) {
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [key, String(child ?? "")]));
}

async function jsonFile(path, code) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { throw new Error(`${code}:${error?.code || "READ_FAILED"}`); }
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const expectedEndpointId = required("RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID");
const [evidence, request, endpoints, templates, volumes] = await Promise.all([
  jsonFile(IMAGE_EVIDENCE_PATH, "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_IMAGE_EVIDENCE_REQUIRED"),
  jsonFile(IMAGE_REQUEST_PATH, "AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_IMAGE_REQUEST_REQUIRED"),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/networkvolumes", managementKey),
]);

if (![endpoints, templates, volumes].every(Array.isArray)) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_RUNPOD_LIST_INVALID");
}
if (
  request?.contract !== "AVANTIQO_AUDIO_WORKER_IMAGE_REQUEST_V11" ||
  text(request?.transform_candidate_lane) !== SAFE_LEASE_LANE ||
  text(request?.transform_candidate_endpoint) !== ENDPOINT_NAME ||
  text(request?.temporal_extend_strategy) !== "XL_TURBO_REPAINT_RIGHT_OUTPAINT" ||
  request?.production_audio_endpoint_mutation_allowed !== false
) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_REQUEST_INVALID");
}
if (
  evidence?.success !== true ||
  evidence?.contract !== "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V3" ||
  evidence?.source_sha_matches_trigger !== true ||
  text(evidence?.source_sha) !== text(evidence?.trigger_sha) ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(evidence?.immutable_image_reference)) ||
  evidence?.xl_model_contract_passed_by_docker_build !== true ||
  evidence?.lm_contract_passed_by_docker_build !== true ||
  evidence?.cuda_import_smoke_passed_by_docker_build !== true ||
  evidence?.native_audio_import_smoke_passed_by_docker_build !== true
) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_IMAGE_INVALID");
}

const candidateMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (candidateMatches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_ENDPOINT_REQUIRED:matches=${candidateMatches.length}`);
}
const candidate = candidateMatches[0];
if (text(candidate?.id) !== expectedEndpointId) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_ENDPOINT_ID_MISMATCH");
}
const productionMatches = endpoints.filter((endpoint) => text(endpoint?.name) === PRODUCTION_AUDIO_ENDPOINT_NAME);
if (productionMatches.some((endpoint) => text(endpoint?.id) === expectedEndpointId)) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_PRODUCTION_AUDIO_COLLISION");
}
if (workersMin(candidate) !== 0 || workersMax(candidate) !== 0) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_NOT_PARKED_0_0");
}

const volumeMatches = volumes.filter((volume) => text(volume?.name) === CANONICAL_VOLUME_NAME);
if (volumeMatches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_CACHE_REQUIRED:matches=${volumeMatches.length}`);
}
const volumeId = text(volumeMatches[0]?.id);
const attached = endpointVolumeIds(candidate);
if (!volumeId || attached.length !== 1 || attached[0] !== volumeId) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_CACHE_BINDING_INVALID");
}

const templateId = text(candidate?.templateId ?? candidate?.template_id ?? candidate?.template?.id);
const template = candidate?.template && typeof candidate.template === "object"
  ? candidate.template
  : templates.find((item) => text(item?.id) === templateId);
if (!template || text(template?.imageName ?? template?.image_name) !== text(evidence?.immutable_image_reference)) {
  throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_TEMPLATE_IMAGE_MISMATCH");
}
const env = normalizeEnv(template.env);
const expectedEnv = {
  AVANTIQO_AUDIO_MODEL_VARIANT: "acestep-v15-xl-turbo",
  AVANTIQO_AUDIO_LM_MODEL: "acestep-5Hz-lm-1.7B",
  AVANTIQO_AUDIO_LM_BACKEND: "vllm",
  AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES: "ai.music.generate",
  AVANTIQO_AUDIO_CERTIFICATION_SAFE_LEASE_LANE: SAFE_LEASE_LANE,
};
const envMismatch = Object.entries(expectedEnv).filter(([key, value]) => env[key] !== value).map(([key]) => key);
if (envMismatch.length) {
  throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_TEMPLATE_ENV_MISMATCH:${envMismatch.join(",")}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint: {
    id: expectedEndpointId,
    name: ENDPOINT_NAME,
    workers_min: 0,
    workers_max: 0,
    template_id: templateId,
  },
  immutable_image_verified: true,
  shared_audio_voice_cache_verified: true,
  certification_safe_lease_lane: SAFE_LEASE_LANE,
  production_audio_endpoint_collision: false,
  production_audio_endpoint_mutation_performed: false,
  runpod_run_called: false,
  runpod_runsync_called: false,
  provider_job_submitted: false,
  workers_opened: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  ready_for_safe_lease_certification: true,
}, null, 2));
