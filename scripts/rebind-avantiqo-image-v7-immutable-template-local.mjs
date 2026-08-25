import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-image-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V7_REALISM_COMPILER_V1";
const EXPECTED_ENTRYPOINT = "handler_v7.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V7_Z_IMAGE_REALISM_COMPILER_V1";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V2";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V2";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V2";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V1";
const EXPECTED_PHYSICAL_USAGE = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}
function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}
function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}
async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V7_REBIND_REST");
}
async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V7_REBIND_QUEUE");
}
async function queueCredentialWorks(endpointId, key) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}
async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
    text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error("AVANTIQO_IMAGE_V7_REBIND_QUEUE_CREDENTIAL_NOT_FOUND");
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_IMAGE_V7_REBIND_TEMPLATE_LIST_INVALID");
  return templates;
}
async function readEvidence() {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  if (
    evidence?.success !== true ||
    text(evidence?.contract) !== EVIDENCE_CONTRACT ||
    text(evidence?.evidence_revision) !== EVIDENCE_REVISION ||
    evidence?.source_sha_matches_trigger !== true ||
    text(evidence?.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence?.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION ||
    text(evidence?.runtime_revision) !== EXPECTED_RUNTIME ||
    text(evidence?.photoreal_candidate_foundation) !== TARGET_MODEL ||
    text(evidence?.photoreal_candidate_profile) !== EXPECTED_PROFILE ||
    text(evidence?.photoreal_candidate_policy) !== EXPECTED_POLICY ||
    text(evidence?.photoreal_quality_compiler_contract) !== EXPECTED_COMPILER ||
    Number(evidence?.photoreal_default_inference_steps) !== 28 ||
    Number(evidence?.photoreal_default_guidance_scale) !== 4 ||
    evidence?.photoreal_negative_policy_applied !== true ||
    evidence?.photoreal_prompt_rewrite_applied !== false ||
    evidence?.photoreal_compiled_prompt_persisted !== false ||
    text(evidence?.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE ||
    text(evidence?.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS ||
    evidence?.backing_filesystem_capacity_used_for_decision !== false ||
    evidence?.automatic_production_routing_enabled !== false ||
    evidence?.provider_job_submitted !== false ||
    evidence?.image_generation_submitted !== false ||
    evidence?.model_download_submitted !== false ||
    evidence?.production_web_deploy !== false
  ) throw new Error("AVANTIQO_IMAGE_V7_REBIND_EVIDENCE_NOT_READY");
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_IMAGE_V7_REBIND_IMMUTABLE_IMAGE_INVALID");
  }
  return { evidence, immutableImage };
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length === 1 && text(matches[0]?.name) === ENDPOINT_NAME) return matches[0];
    throw new Error(`AVANTIQO_IMAGE_V7_REBIND_CONFIGURED_ENDPOINT_INVALID:${matches.length}`);
  }
  const matches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V7_REBIND_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function resolveTemplate(templates, templateId) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V7_REBIND_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function managementWorkers(endpoint = {}) {
  const workers = list(endpoint.workers);
  const nonExited = workers.filter((worker) => text(worker?.desiredStatus || worker?.desired_status).toUpperCase() !== "EXITED");
  return { count: workers.length, non_exited: nonExited.length };
}
function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
      throttled: finite(workers.throttled, 0),
    },
  };
}
function templateBody(base, immutableImage, name) {
  const body = {
    containerDiskInGb: Math.max(1, finite(base?.containerDiskInGb, 30)),
    dockerEntrypoint: list(base?.dockerEntrypoint),
    dockerStartCmd: list(base?.dockerStartCmd),
    env: normalizeEnv(base?.env),
    imageName: immutableImage,
    isPublic: false,
    isServerless: true,
    name,
    ports: list(base?.ports),
    readme: "Avantiqo Image V7 immutable Z-Image realism compiler worker. Exact digest evidence is recorded in audits/results/avantiqo-image-worker-image.json.",
    volumeInGb: Math.max(0, finite(base?.volumeInGb, 0)),
    volumeMountPath: text(base?.volumeMountPath) || "/workspace",
    category: "NVIDIA",
  };
  const registryAuthId = text(base?.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  return body;
}
function templateIssues(template, immutableImage) {
  const issues = [];
  if (text(template?.imageName) !== immutableImage) issues.push("image");
  if (template?.isServerless !== true) issues.push("serverless");
  return issues;
}

const apply = process.argv.includes("--apply");
if (apply) approved("AVANTIQO_IMAGE_V7_IMMUTABLE_REBIND_APPROVED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const configuredEndpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const { evidence, immutableImage } = await readEvidence();

const endpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_IMAGE_V7_REBIND_ENDPOINT_LIST_INVALID");
const endpoint = resolveEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint.id);
const queueCredential = await selectQueueCredential(endpointId, managementKey);
const [templates, healthRaw] = await Promise.all([
  endpointBoundTemplates(managementKey),
  queueHealth(endpointId, queueCredential.key),
]);
const currentTemplateId = text(endpoint.templateId || endpoint.template?.id);
const currentTemplate = resolveTemplate(templates, currentTemplateId);
const health = healthSummary(healthRaw);
const management = managementWorkers(endpoint);
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) throw new Error("AVANTIQO_IMAGE_V7_REBIND_LIVE_JOBS_BLOCK");
if (health.workers.running !== 0 || health.workers.unhealthy !== 0 || management.non_exited !== 0) throw new Error("AVANTIQO_IMAGE_V7_REBIND_ACTIVE_WORKERS_BLOCK");
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) throw new Error("AVANTIQO_IMAGE_V7_REBIND_SCALING_CONTRACT_INVALID");
const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) throw new Error(`AVANTIQO_IMAGE_V7_REBIND_VOLUME_COUNT_INVALID:${volumeIds.length}`);

const digestSuffix = immutableImage.split("sha256:")[1].slice(0, 12);
const targetName = `avantiqo-image-immutable-v7-${digestSuffix}`;
const targetMatches = templates.filter((entry) => text(entry?.name) === targetName);
if (targetMatches.length > 1) throw new Error(`AVANTIQO_IMAGE_V7_REBIND_TARGET_TEMPLATE_AMBIGUOUS:${targetMatches.length}`);
let targetTemplate = targetMatches[0] || null;
const mutationRequired = text(currentTemplate?.imageName) !== immutableImage || text(currentTemplate?.name) !== targetName;

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_IMAGE_V7_IMMUTABLE_TEMPLATE_REBIND_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: endpointId,
    name: ENDPOINT_NAME,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: volumeIds,
    current_template_id: currentTemplateId,
    current_template_name: text(currentTemplate?.name),
  },
  target: {
    source_sha: text(evidence.source_sha),
    immutable_image: immutableImage,
    template_name: targetName,
    existing_template_found: Boolean(targetTemplate),
    quality_profile: EXPECTED_PROFILE,
    quality_policy: EXPECTED_POLICY,
    quality_compiler_contract: EXPECTED_COMPILER,
    default_inference_steps: 28,
    default_guidance_scale: 4,
  },
  health,
  management_workers: management,
  queue_credential_source: queueCredential.source,
  mutation_required: mutationRequired,
  safety: {
    provider_jobs_submitted: 0,
    image_generation_submitted: false,
    model_download_submitted: false,
    production_web_deploy: false,
    pricing_activation: false,
    endpoint_deleted: false,
    template_deleted: false,
    secret_values_printed: false,
  },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_IMAGE_V7_IMMUTABLE_REBIND_APPLIED=false");
  process.exit(0);
}
if (!mutationRequired) {
  console.log("AVANTIQO_IMAGE_V7_IMMUTABLE_REBIND_APPLIED=true");
  console.log("AVANTIQO_IMAGE_V7_IMMUTABLE_REBIND_MUTATION_REQUIRED=false");
  process.exit(0);
}

if (!targetTemplate) {
  const created = await rest("/templates", managementKey, {
    method: "POST",
    body: templateBody(currentTemplate, immutableImage, targetName),
  });
  const createdId = text(created?.id);
  if (!createdId) throw new Error("AVANTIQO_IMAGE_V7_REBIND_TEMPLATE_CREATE_ID_REQUIRED");
  const freshTemplates = await endpointBoundTemplates(managementKey);
  targetTemplate = resolveTemplate(freshTemplates, createdId);
}
const issues = templateIssues(targetTemplate, immutableImage);
if (issues.length) throw new Error(`AVANTIQO_IMAGE_V7_REBIND_TARGET_TEMPLATE_INVALID:${issues.join("|")}`);
const targetTemplateId = text(targetTemplate.id);
if (!targetTemplateId) throw new Error("AVANTIQO_IMAGE_V7_REBIND_TARGET_TEMPLATE_ID_REQUIRED");

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: { templateId: targetTemplateId },
});

const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (text(verified?.id) !== endpointId) throw new Error("AVANTIQO_IMAGE_V7_REBIND_VERIFY_ENDPOINT_ID_FAILED");
if (text(verified?.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_V7_REBIND_VERIFY_ENDPOINT_NAME_FAILED");
if (text(verified?.templateId || verified?.template?.id) !== targetTemplateId) throw new Error("AVANTIQO_IMAGE_V7_REBIND_VERIFY_TEMPLATE_ID_FAILED");
if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== 1) throw new Error("AVANTIQO_IMAGE_V7_REBIND_VERIFY_SCALING_FAILED");
if (JSON.stringify(endpointVolumeIds(verified)) !== JSON.stringify(volumeIds)) throw new Error("AVANTIQO_IMAGE_V7_REBIND_VERIFY_VOLUME_FAILED");
const verifiedTemplates = await endpointBoundTemplates(managementKey);
const verifiedTemplate = resolveTemplate(verifiedTemplates, targetTemplateId);
if (templateIssues(verifiedTemplate, immutableImage).length) throw new Error("AVANTIQO_IMAGE_V7_REBIND_VERIFY_TEMPLATE_FAILED");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_IMAGE_V7_IMMUTABLE_TEMPLATE_REBIND_V1",
  applied: true,
  endpoint_id: endpointId,
  endpoint_name: ENDPOINT_NAME,
  template_id: targetTemplateId,
  template_name: targetName,
  immutable_image: immutableImage,
  quality_profile: EXPECTED_PROFILE,
  quality_policy: EXPECTED_POLICY,
  quality_compiler_contract: EXPECTED_COMPILER,
  provider_jobs_submitted: 0,
  image_generation_submitted: false,
  model_download_submitted: false,
  production_web_deploy: false,
  pricing_activation: false,
  endpoint_deleted: false,
  template_deleted: false,
  secrets_in_output: false,
  next_action: "RUN_IMAGE_V7_RUNTIME_PROBE",
}, null, 2));
console.log("AVANTIQO_IMAGE_V7_IMMUTABLE_REBIND_APPLIED=true");
