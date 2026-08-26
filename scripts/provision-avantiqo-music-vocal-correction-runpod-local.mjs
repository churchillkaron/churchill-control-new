#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_PROVISION_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-vocal-correction-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKER_IMAGE_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const ENDPOINT_NAME = "avantiqo-music-vocal-correction-v1";
const TEMPLATE_PREFIX = "avantiqo-music-vocal-correction-";
const APPROVAL_ENV = "AVANTIQO_MUSIC_VOCAL_CORRECTION_PROVISION_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const approved = (value) => text(value).toUpperCase() === "YES";

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
  let report;
  try {
    report = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_EVIDENCE_REQUIRED:${error?.code || "READ_FAILED"}`);
  }
  if (
    report?.success !== true ||
    text(report.contract) !== IMAGE_CONTRACT ||
    report?.source_sha_matches_trigger !== true ||
    text(report.source_sha) !== text(report.trigger_sha) ||
    text(report.engine_contract) !== ENGINE_CONTRACT ||
    text(report.quality_profile) !== QUALITY_PROFILE ||
    text(report.timing_contract) !== "AVANTIQO_MUSIC_VOCAL_PHRASE_TIMING_V1" ||
    report.network_volume_required !== false ||
    report.production_certified !== false ||
    report.human_listening_review_required !== true ||
    report.runpod_endpoint_mutation_performed !== false ||
    report.provider_job_submitted !== false ||
    report.shared_volume_mutation_performed !== false ||
    report.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(report.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMMUTABLE_IMAGE_REQUIRED");
  }
  return {
    image,
    source_sha: text(report.source_sha),
    digest: text(report.image_digest),
  };
}

function registryAuth(registryAuths) {
  const explicit = text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_REGISTRY_AUTH_ID);
  if (explicit) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_REGISTRY_AUTH_NOT_FOUND:${matches.length}`);
    return matches[0];
  }
  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_GHCR_AUTH_REQUIRED:matches=${candidates.length}`);
  }
  return candidates[0];
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const image = await imageEvidence();
const [endpoints, templates, registryAuths] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths)) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_LIST_INVALID");
}

const endpointMatches = endpoints.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (endpointMatches.length > 1) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_AMBIGUOUS:${endpointMatches.length}`);
}
if (endpointMatches.length === 1) {
  const existing = endpointMatches[0];
  if (endpointVolumeIds(existing).length) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NETWORK_VOLUME_FORBIDDEN");
  }
  if (finite(existing.workersMin, -1) !== 0 || finite(existing.workersMax, -1) !== 0) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_MUST_REST_0_0:${finite(existing.workersMin)}/${finite(existing.workersMax)}`);
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(existing),
    immutable_image: image.image,
    mutation_performed: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    next_action: "VERIFY_TEMPLATE_DIGEST_THEN_CERTIFY_ONLY_THROUGH_SAFE_LEASE_V2",
  }, null, 2));
  process.exit(0);
}

const auth = registryAuth(registryAuths);
const templateName = `${TEMPLATE_PREFIX}${image.digest.replace(/^sha256:/, "").slice(0, 12)}`;
const templateMatches = templates.filter((template) => text(template.name) === templateName);
if (templateMatches.length > 1) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_AMBIGUOUS:${templateMatches.length}`);
if (templateMatches[0] && text(templateMatches[0].imageName) !== image.image) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_IMAGE_MISMATCH");
}

const gpuTypeIds = unique(
  text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_GPU_TYPE_IDS || "NVIDIA L4,NVIDIA RTX A5000,NVIDIA GeForce RTX 4090")
    .split(","),
);
if (!gpuTypeIds.length) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_GPU_TYPE_IDS_REQUIRED");

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_exists: false,
  endpoint_name: ENDPOINT_NAME,
  immutable_image: image.image,
  image_source_sha: image.source_sha,
  template_name: templateName,
  existing_template: templateMatches[0] ? safeTemplate(templateMatches[0]) : null,
  gpu_type_ids: gpuTypeIds,
  workers_min: 0,
  workers_max: 0,
  endpoint_created_parked: true,
  idle_timeout_seconds: 5,
  execution_timeout_ms: 30 * 60 * 1000,
  network_volume_required: false,
  shared_audio_endpoint_mutation: false,
  provider_job_submitted: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
  certification_required: true,
  human_listening_review_required: true,
  safe_lease_lane: "music-vocal-correction",
  next_action: apply ? "CREATE_PARKED_DEDICATED_ENDPOINT" : "APPROVE_PARKED_ENDPOINT_PROVISION",
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
      env: {
        AVANTIQO_MUSIC_VOCAL_CORRECTION_MAX_SOURCE_DURATION_SECONDS: "900",
        AVANTIQO_MUSIC_VOCAL_CORRECTION_MAX_SOURCE_BYTES: "629145600",
        TORCH_HOME: "/opt/avantiqo-vocal-correction-cache",
      },
      isPublic: false,
      isServerless: true,
      ports: [],
      readme: "Avantiqo Music isolated-vocal correction V2. Torchcrepe pitch analysis plus conservative whole-phrase timing; immutable image; no network volume; certification gated.",
      volumeInGb: 0,
      volumeMountPath: "/workspace",
    },
  });
}
const templateId = text(template?.id);
if (!templateId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_ID_REQUIRED");

const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
const freshMatches = list(freshEndpoints).filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (freshMatches.length) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_APPEARED_REPLAN_REQUIRED:${freshMatches.length}`);
}

const endpoint = await rest("/endpoints", managementKey, {
  method: "POST",
  body: {
    templateId,
    computeType: "GPU",
    executionTimeoutMs: 30 * 60 * 1000,
    flashboot: true,
    gpuCount: 1,
    gpuTypeIds,
    idleTimeout: 5,
    name: ENDPOINT_NAME,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
    workersMax: 0,
    workersMin: 0,
  },
});
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_ID_REQUIRED");
const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (text(verified.name) !== ENDPOINT_NAME || text(verified.templateId) !== templateId) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_VERIFY_FAILED");
}
if (endpointVolumeIds(verified).length) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_UNEXPECTED_NETWORK_VOLUME");
if (finite(verified.workersMin, -1) !== 0 || finite(verified.workersMax, -1) !== 0) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_NOT_PARKED_0_0");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template: safeTemplate(verified.template || template),
  template_created: templateMatches.length === 0,
  endpoint_created: true,
  mutation_performed: true,
  workers_opened: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  next_action: "CERTIFY_ONLY_THROUGH_AVANTIQO_RUNPOD_SAFE_LEASE_V2",
}, null, 2));
