#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_POST_CREATE_RECOVERY_PROBE_V1";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WORKER_IMAGE_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const PROBE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "music-elastic-audio";
const ENDPOINT_NAME = "avantiqo-music-elastic-audio-v1";
const TEMPLATE_PREFIX = "avantiqo-music-elastic-audio-";
const CANONICAL_REGISTRY_AUTH_NAME = "avantiqo-ghcr";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-elastic-worker-image.json";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function rest(path, key) {
  return requestJson(`${REST_BASE}${path}`, key);
}

function queue(endpointId, path, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, key);
}

async function imageEvidence() {
  const report = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    report?.success !== true ||
    text(report.contract) !== IMAGE_CONTRACT ||
    report?.source_sha_matches_trigger !== true ||
    text(report.source_sha) !== text(report.trigger_sha) ||
    text(report.engine_contract) !== ENGINE_CONTRACT ||
    text(report.runtime_probe_contract) !== PROBE_CONTRACT ||
    text(report.model) !== "signalsmith-stretch" ||
    text(report.stretch_engine) !== "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1" ||
    text(report.boundary_smoothing_contract) !== "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2" ||
    report.network_volume_required !== false ||
    report.runtime_probe_no_inference !== true ||
    report.runtime_probe_source_download !== false ||
    report.runtime_probe_render !== false ||
    report.runtime_probe_upload !== false ||
    report.production_certified !== false ||
    report.human_listening_review_required !== true ||
    report.provider_job_submitted !== false ||
    report.production_deploy_performed !== false
  ) {
    throw new Error(`${CONTRACT}_IMAGE_EVIDENCE_INVALID`);
  }
  const image = text(report.immutable_image_reference);
  const digest = text(report.image_digest);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_REQUIRED`);
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest) || !image.endsWith(`@${digest}`)) {
    throw new Error(`${CONTRACT}_IMAGE_DIGEST_INVALID`);
  }
  return { image, digest, sourceSha: text(report.source_sha) };
}

approved("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_SPEND_APPROVED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const image = await imageEvidence();

console.log("============================================================");
console.log("AVANTIQO MUSIC ELASTIC POST-CREATE RECOVERY + RUNTIME PROBE");
console.log("============================================================");
console.log(`AVANTIQO_MUSIC_ELASTIC_RECOVERY_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_CREATE_ALLOWED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_TEMPLATE_MUTATION_ALLOWED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_ALLOWED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_ALLOWED=false");

const audit = spawnSync(process.execPath, ["scripts/music-elastic-audio-runtime-audit.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (audit.status !== 0) throw new Error(`${CONTRACT}_STATIC_AUDIT_FAILED:${audit.status ?? "UNKNOWN"}`);

const [endpoints, templates, registryAuths] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths)) {
  throw new Error(`${CONTRACT}_RUNPOD_LIST_INVALID`);
}

const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) {
  throw new Error(`${CONTRACT}_EXISTING_ENDPOINT_REQUIRED:matches=${endpointMatches.length}`);
}
const endpoint = endpointMatches[0];
const endpointId = text(endpoint?.id);
const templateId = text(endpoint?.templateId ?? endpoint?.template_id ?? endpoint?.template?.id);
if (!endpointId || !templateId) throw new Error(`${CONTRACT}_ENDPOINT_ID_OR_TEMPLATE_ID_MISSING`);
if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0) {
  throw new Error(`${CONTRACT}_ENDPOINT_MUST_START_PARKED_0_0:${workersMin(endpoint)}/${workersMax(endpoint)}`);
}
if (endpointVolumeIds(endpoint).length !== 0) {
  throw new Error(`${CONTRACT}_NETWORK_VOLUME_FORBIDDEN`);
}

const templateMatches = templates.filter((template) => text(template?.id) === templateId);
if (templateMatches.length !== 1) {
  throw new Error(`${CONTRACT}_AUTHORITATIVE_TEMPLATE_REQUIRED:id=${templateId}:matches=${templateMatches.length}`);
}
const template = templateMatches[0];
const expectedTemplateName = `${TEMPLATE_PREFIX}${image.digest.replace(/^sha256:/, "").slice(0, 12)}`;
if (text(template?.name) !== expectedTemplateName) {
  throw new Error(`${CONTRACT}_TEMPLATE_NAME_MISMATCH`);
}
if (text(template?.imageName ?? template?.image_name) !== image.image) {
  throw new Error(`${CONTRACT}_AUTHORITATIVE_TEMPLATE_IMAGE_DIGEST_MISMATCH`);
}
if (finite(template?.volumeInGb ?? template?.volume_in_gb, 0) !== 0) {
  throw new Error(`${CONTRACT}_LOCAL_VOLUME_FORBIDDEN`);
}
if (template?.isServerless !== true && template?.is_serverless !== true) {
  throw new Error(`${CONTRACT}_SERVERLESS_TEMPLATE_REQUIRED`);
}

const canonicalAuth = registryAuths.filter((item) => text(item?.name) === CANONICAL_REGISTRY_AUTH_NAME);
if (canonicalAuth.length !== 1) {
  throw new Error(`${CONTRACT}_CANONICAL_GHCR_AUTH_REQUIRED:matches=${canonicalAuth.length}`);
}
const templateAuthId = text(template?.containerRegistryAuthId ?? template?.container_registry_auth_id);
if (!templateAuthId || templateAuthId !== text(canonicalAuth[0]?.id)) {
  throw new Error(`${CONTRACT}_CANONICAL_GHCR_AUTH_BINDING_MISMATCH`);
}

const beforeHealth = await queue(endpointId, "/health", queueKey);
const beforeQueue = finite(beforeHealth?.jobs?.inQueue ?? beforeHealth?.jobs?.in_queue, 0);
const beforeProgress = finite(beforeHealth?.jobs?.inProgress ?? beforeHealth?.jobs?.in_progress, 0);
if (beforeQueue !== 0 || beforeProgress !== 0) {
  throw new Error(`${CONTRACT}_ENDPOINT_QUEUE_NOT_IDLE:${beforeQueue}/${beforeProgress}`);
}

console.log("AVANTIQO_MUSIC_ELASTIC_POST_CREATE_BINDING=PASS");
console.log(`AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_TEMPLATE_ID=${templateId}`);
console.log("AVANTIQO_MUSIC_ELASTIC_TEMPLATE_SOURCE=AUTHORITATIVE_TEMPLATE_LIST_BY_ENDPOINT_TEMPLATE_ID");
console.log("AVANTIQO_MUSIC_ELASTIC_EXACT_IMAGE_DIGEST_VERIFIED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_CANONICAL_GHCR_AUTH_VERIFIED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_NETWORK_VOLUME_ATTACHED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_LOCAL_VOLUME_ATTACHED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_WORKERS_BEFORE_PROBE=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_QUEUE_BEFORE_PROBE=0/0");

const lease = spawnSync(
  process.execPath,
  [
    "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
    `--lane=${LANE}`,
    "--ttl-ms=600000",
    "--",
    process.execPath,
    "scripts/probe-avantiqo-music-elastic-safe-lease-local.mjs",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: queueKey,
      AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
      AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_SPEND_APPROVED: "YES",
    },
    stdio: "inherit",
  },
);

const finalEndpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
  managementKey,
);
const finalHealth = await queue(endpointId, "/health", queueKey);
const finalQueue = finite(finalHealth?.jobs?.inQueue ?? finalHealth?.jobs?.in_queue, 0);
const finalProgress = finite(finalHealth?.jobs?.inProgress ?? finalHealth?.jobs?.in_progress, 0);
if (
  text(finalEndpoint?.name) !== ENDPOINT_NAME ||
  workersMin(finalEndpoint) !== 0 ||
  workersMax(finalEndpoint) !== 0 ||
  finalQueue !== 0 ||
  finalProgress !== 0
) {
  throw new Error(
    `${CONTRACT}_FINAL_REST_STATE_INVALID:${workersMin(finalEndpoint)}/${workersMax(finalEndpoint)}:${finalQueue}/${finalProgress}`,
  );
}

console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_WORKERS=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_QUEUE=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_CREATE_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_TEMPLATE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_OUTPUT_UPLOAD_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFIED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_REQUIRED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_SECRETS_PRINTED=false");

if (lease.status !== 0) {
  throw new Error(`${CONTRACT}_SAFE_LEASE_PROBE_FAILED:${lease.status ?? "UNKNOWN"}`);
}

console.log("AVANTIQO_MUSIC_ELASTIC_POST_CREATE_RECOVERY_PROBE=PASS");
console.log(`${SAFE_LEASE_CONTRACT}=PASS`);
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=CONTROLLED_AUDIO_RENDER_CERTIFICATION_WITH_HUMAN_LISTENING_REVIEW");
