#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const PROVISION_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_PROVISION_V2";
const REPAIR_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_PARKED_BINDING_REPAIR_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-vocal-correction-worker-image.json";
const IMAGE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKER_IMAGE_RESULT_V1";
const ENDPOINT_NAME = "avantiqo-music-vocal-correction-v1";
const TEMPLATE_PREFIX = "avantiqo-music-vocal-correction-";
const APPROVAL_ENV = "AVANTIQO_MUSIC_VOCAL_CORRECTION_PROVISION_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const yes = (value) => text(value).toUpperCase() === "YES";

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function rest(pathname, key, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
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
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

function volumeIds(endpoint = {}) {
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

function endpointTemplateId(endpoint = {}) {
  return text(endpoint.templateId ?? endpoint.template_id ?? endpoint.template?.id);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: endpointTemplateId(endpoint) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds ?? endpoint.gpu_type_ids)),
    workers_min: workersMin(endpoint),
    workers_max: workersMax(endpoint),
    network_volume_ids: volumeIds(endpoint),
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName ?? template.image_name) || null,
    container_disk_gb: finite(template.containerDiskInGb ?? template.container_disk_gb),
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId ?? template.container_registry_auth_id)),
  };
}

async function readImageEvidence() {
  const evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    evidence?.success !== true ||
    text(evidence?.contract) !== IMAGE_CONTRACT ||
    evidence?.source_sha_matches_trigger !== true ||
    text(evidence?.source_sha) !== text(evidence?.trigger_sha) ||
    evidence?.production_certified !== false ||
    evidence?.human_listening_review_required !== true ||
    evidence?.provider_job_submitted !== false ||
    evidence?.runpod_endpoint_mutation_performed !== false ||
    evidence?.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  const digest = text(evidence.image_digest);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMMUTABLE_IMAGE_REQUIRED");
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_DIGEST_REQUIRED");
  }
  return { image, digest, source_sha: text(evidence.source_sha) };
}

function resolveRegistryAuth(registryAuths) {
  const explicit = text(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_REGISTRY_AUTH_ID);
  if (explicit) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_REGISTRY_AUTH_NOT_FOUND:${matches.length}`);
    }
    return matches[0];
  }
  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_GHCR_AUTH_REQUIRED:matches=${candidates.length}`);
  }
  return candidates[0];
}

function authoritativeTemplate(endpoint, templates) {
  const templateId = endpointTemplateId(endpoint);
  if (!templateId) return null;
  return templates.find((template) => text(template?.id) === templateId) || null;
}

async function createTargetTemplate(managementKey, registryAuthId, image, templateName) {
  const created = await rest("/templates", managementKey, {
    method: "POST",
    body: {
      imageName: image,
      name: templateName,
      category: "NVIDIA",
      containerDiskInGb: 30,
      containerRegistryAuthId: registryAuthId,
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
  const id = text(created?.id);
  if (!id) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TARGET_TEMPLATE_CREATE_ID_REQUIRED");
  const verified = await rest(`/templates/${encodeURIComponent(id)}`, managementKey);
  if (text(verified?.imageName) !== image || text(verified?.name) !== templateName) {
    throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TARGET_TEMPLATE_VERIFY_FAILED");
  }
  return verified;
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const evidence = await readImageEvidence();
const [endpoints, templates, registryAuths] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths)) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_RUNPOD_LIST_INVALID");
}

const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (endpointMatches.length > 1) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_AMBIGUOUS:${endpointMatches.length}`);
}

const templateName = `${TEMPLATE_PREFIX}${evidence.digest.replace(/^sha256:/, "").slice(0, 12)}`;
const targetMatches = templates.filter((template) => text(template?.name) === templateName);
if (targetMatches.length > 1) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_TARGET_TEMPLATE_AMBIGUOUS:${targetMatches.length}`);
}
let targetTemplate = targetMatches[0] || null;
if (targetTemplate && text(targetTemplate?.imageName) !== evidence.image) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TARGET_TEMPLATE_IMAGE_MISMATCH");
}

if (endpointMatches.length === 0) {
  console.log(JSON.stringify({
    success: true,
    contract: PROVISION_CONTRACT,
    repair_contract: REPAIR_CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_exists: false,
    endpoint_name: ENDPOINT_NAME,
    target_template: targetTemplate ? safeTemplate(targetTemplate) : null,
    immutable_image: evidence.image,
    exact_image_digest_verified: Boolean(targetTemplate),
    mutation_performed: false,
    workers_opened: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    next_action: "CREATE_PARKED_DEDICATED_ENDPOINT",
  }, null, 2));
  process.exit(0);
}

let endpoint = endpointMatches[0];
if (volumeIds(endpoint).length) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_NETWORK_VOLUME_FORBIDDEN");
}
let currentTemplate = authoritativeTemplate(endpoint, templates);
const currentTemplateImage = text(currentTemplate?.imageName);
const currentTemplateMatchesDigest = currentTemplateImage === evidence.image;
const parkingRequired = workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0;
const rebindRequired = !currentTemplateMatchesDigest;

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: PROVISION_CONTRACT,
    repair_contract: REPAIR_CONTRACT,
    mode: "PLAN",
    endpoint_exists: true,
    endpoint: safeEndpoint(endpoint),
    template: currentTemplate ? safeTemplate(currentTemplate) : null,
    target_template: targetTemplate ? safeTemplate(targetTemplate) : null,
    immutable_image: evidence.image,
    exact_image_digest_verified: currentTemplateMatchesDigest,
    authoritative_template_lookup: "ENDPOINT_TEMPLATE_ID_TO_TEMPLATE_LIST",
    embedded_template_view_used_for_digest_decision: false,
    parking_required: parkingRequired,
    rebind_required: rebindRequired,
    target_workers_min: 0,
    target_workers_max: 0,
    mutation_performed: false,
    workers_opened: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    next_action: parkingRequired || rebindRequired ? "CONVERGE_EXISTING_ENDPOINT" : "CERTIFY_ONLY_THROUGH_AVANTIQO_RUNPOD_SAFE_LEASE_V2",
  }, null, 2));
  process.exit(0);
}

let parkingMutationPerformed = false;
let templateCreated = false;
let templateRebindPerformed = false;

if (parkingRequired) {
  await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  endpoint = await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0) {
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_PARK_FAILED:${workersMin(endpoint)}/${workersMax(endpoint)}`);
  }
  parkingMutationPerformed = true;
}

if (rebindRequired) {
  if (!targetTemplate) {
    const registryAuth = resolveRegistryAuth(registryAuths);
    targetTemplate = await createTargetTemplate(
      managementKey,
      text(registryAuth.id),
      evidence.image,
      templateName,
    );
    templateCreated = true;
  }
  const targetTemplateId = text(targetTemplate?.id);
  if (!targetTemplateId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_TARGET_TEMPLATE_ID_REQUIRED");
  await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}`, managementKey, {
    method: "PATCH",
    body: {
      templateId: targetTemplateId,
      workersMin: 0,
      workersMax: 0,
    },
  });
  templateRebindPerformed = true;
}

endpoint = await rest(`/endpoints/${encodeURIComponent(text(endpoint.id))}?includeTemplate=true&includeWorkers=true`, managementKey);
const refreshedTemplates = await rest(
  "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
  managementKey,
);
if (!Array.isArray(refreshedTemplates)) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_TEMPLATE_REFRESH_INVALID");
}
currentTemplate = authoritativeTemplate(endpoint, refreshedTemplates);
if (text(endpoint?.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_ENDPOINT_NAME_MISMATCH");
}
if (volumeIds(endpoint).length) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_NETWORK_VOLUME_FORBIDDEN");
}
if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_NOT_PARKED:${workersMin(endpoint)}/${workersMax(endpoint)}`);
}
if (!currentTemplate || text(currentTemplate?.imageName) !== evidence.image) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_REPAIR_DIGEST_BINDING_VERIFY_FAILED");
}

console.log(JSON.stringify({
  success: true,
  contract: PROVISION_CONTRACT,
  repair_contract: REPAIR_CONTRACT,
  mode: "APPLY",
  endpoint_exists: true,
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(currentTemplate),
  target_template: safeTemplate(currentTemplate),
  immutable_image: evidence.image,
  exact_image_digest_verified: true,
  authoritative_template_lookup: "ENDPOINT_TEMPLATE_ID_TO_TEMPLATE_LIST",
  embedded_template_view_used_for_digest_decision: false,
  parking_required: false,
  rebind_required: false,
  parking_mutation_performed: parkingMutationPerformed,
  template_created: templateCreated,
  template_rebind_performed: templateRebindPerformed,
  mutation_performed: parkingMutationPerformed || templateCreated || templateRebindPerformed,
  workers_opened: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  next_action: "CERTIFY_ONLY_THROUGH_AVANTIQO_RUNPOD_SAFE_LEASE_V2",
}, null, 2));
