#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_PROVISION_V2";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-vocal-correction-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKER_IMAGE_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const KEY_PARSER_CONTRACT = "AVANTIQO_MUSIC_VOCAL_KEY_PARSER_V1";
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

function endpointWorkersMin(endpoint = {}) {
  return finite(endpoint.workersMin ?? endpoint.workers_min, -1);
}

function endpointWorkersMax(endpoint = {}) {
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
  if (!templateId) return null;
  return templates.find((template) => text(template?.id) === templateId) || null;
}

function assertExactTemplateImage(template, immutableImage, code) {
  if (!template || text(template.imageName ?? template.image_name) !== immutableImage) {
    throw new Error(code);
  }
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId ?? endpoint.template_id ?? endpoint.template?.id) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds ?? endpoint.gpu_type_ids)),
    workers_min: endpointWorkersMin(endpoint),
    workers_max: endpointWorkersMax(endpoint),
    idle_timeout_seconds: finite(endpoint.idleTimeout ?? endpoint.idle_timeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.execution_timeout_ms),
    network_volume_ids: endpointVolumeIds(endpoint),
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName ?? template.image_name) || null,
    container_disk_gb: finite(template.containerDiskInGb ?? template.container_disk_gb),
    local_volume_gb: finite(template.volumeInGb ?? template.volume_in_gb),
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId ?? template.container_registry_auth_id)),
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

async function fetchEndpoint(endpointId, credential) {
  return rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, credential);
}

async function parkEndpoint(endpoint, credential, expectedTemplateId) {
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_ID_REQUIRED_FOR_PARK");
  if (endpointVolumeIds(endpoint).length) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NETWORK_VOLUME_FORBIDDEN");
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, credential, {
    method: "PATCH",
    body: {
      workersMin: 0,
      workersMax: 0,
    },
  });

  const parked = await fetchEndpoint(endpointId, credential);
  if (text(parked.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_PARK_NAME_MISMATCH");
  }
  if (expectedTemplateId && text(parked.templateId ?? parked.template_id) !== expectedTemplateId) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_PARK_TEMPLATE_MISMATCH");
  }
  if (endpointVolumeIds(parked).length) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_PARK_NETWORK_VOLUME_FORBIDDEN");
  }
  if (endpointWorkersMin(parked) !== 0 || endpointWorkersMax(parked) !== 0) {
    throw new Error(
      `AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_PARK_VERIFY_FAILED:${endpointWorkersMin(parked)}/${endpointWorkersMax(parked)}`,
    );
  }
  return parked;
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
    text(report.key_parser_contract) !== KEY_PARSER_CONTRACT ||
    report.explicit_pitch_readiness !== true ||
    report.torchcrepe_inference_smoke_required !== true ||
    report.explicit_formant_compensation_configured !== false ||
    report.unverified_formant_preservation_claimed !== false ||
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
  let existing = endpointMatches[0];
  if (endpointVolumeIds(existing).length) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NETWORK_VOLUME_FORBIDDEN");
  }
  const existingTemplate = endpointTemplate(existing, templates);
  assertExactTemplateImage(
    existingTemplate,
    image.image,
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_EXISTING_ENDPOINT_IMAGE_DIGEST_MISMATCH",
  );
  const existingTemplateId = text(existing.templateId ?? existing.template_id ?? existingTemplate?.id);
  const parkingRequired = endpointWorkersMin(existing) !== 0 || endpointWorkersMax(existing) !== 0;

  if (parkingRequired && !apply) {
    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      mode: "PLAN",
      endpoint_exists: true,
      endpoint: safeEndpoint(existing),
      template: safeTemplate(existingTemplate),
      immutable_image: image.image,
      exact_image_digest_verified: true,
      parking_required: true,
      target_workers_min: 0,
      target_workers_max: 0,
      mutation_performed: false,
      provider_job_submitted: false,
      production_deploy_performed: false,
      next_action: "PARK_EXISTING_ENDPOINT_0_0",
    }, null, 2));
    process.exit(0);
  }

  let parkingMutationPerformed = false;
  if (parkingRequired) {
    existing = await parkEndpoint(existing, managementKey, existingTemplateId);
    parkingMutationPerformed = true;
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(existing),
    template: safeTemplate(endpointTemplate(existing, [existingTemplate, ...templates]) || existingTemplate),
    immutable_image: image.image,
    exact_image_digest_verified: true,
    parking_required: false,
    parking_mutation_performed: parkingMutationPerformed,
    mutation_performed: parkingMutationPerformed,
    workers_opened: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    next_action: "CERTIFY_ONLY_THROUGH_AVANTIQO_RUNPOD_SAFE_LEASE_V2",
  }, null, 2));
  process.exit(0);
}

const auth = registryAuth(registryAuths);
const templateName = `${TEMPLATE_PREFIX}${image.digest.replace(/^sha256:/, "").slice(0, 12)}`;
const templateMatches = templates.filter((template) => text(template.name) === templateName);
if (templateMatches.length > 1) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_AMBIGUOUS:${templateMatches.length}`);
if (templateMatches[0]) {
  assertExactTemplateImage(
    templateMatches[0],
    image.image,
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_IMAGE_MISMATCH",
  );
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
  exact_image_digest_required: true,
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
assertExactTemplateImage(
  template,
  image.image,
  "AVANTIQO_MUSIC_VOCAL_CORRECTION_CREATED_TEMPLATE_IMAGE_DIGEST_MISMATCH",
);
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
let verified = await fetchEndpoint(endpointId, managementKey);
if (text(verified.name) !== ENDPOINT_NAME || text(verified.templateId ?? verified.template_id) !== templateId) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_VERIFY_FAILED");
}
if (endpointVolumeIds(verified).length) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_UNEXPECTED_NETWORK_VOLUME");

let explicitParkingMutationPerformed = false;
if (endpointWorkersMin(verified) !== 0 || endpointWorkersMax(verified) !== 0) {
  verified = await parkEndpoint(verified, managementKey, templateId);
  explicitParkingMutationPerformed = true;
}
if (endpointWorkersMin(verified) !== 0 || endpointWorkersMax(verified) !== 0) {
  throw new Error(
    `AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_NOT_PARKED_0_0:${endpointWorkersMin(verified)}/${endpointWorkersMax(verified)}`,
  );
}
const verifiedTemplate = endpointTemplate(verified, [template, ...templates]);
assertExactTemplateImage(
  verifiedTemplate,
  image.image,
  "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_VERIFY_IMAGE_DIGEST_MISMATCH",
);

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(verified),
  template: safeTemplate(verifiedTemplate),
  template_created: templateMatches.length === 0,
  endpoint_created: true,
  exact_image_digest_verified: true,
  parking_mutation_performed: explicitParkingMutationPerformed,
  mutation_performed: true,
  workers_opened: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  next_action: "CERTIFY_ONLY_THROUGH_AVANTIQO_RUNPOD_SAFE_LEASE_V2",
}, null, 2));
