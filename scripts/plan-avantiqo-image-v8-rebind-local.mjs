import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-image-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V8_ANTITEXT_COMPILER_V1";
const EXPECTED_ENTRYPOINT = "handler_v8.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V8_Z_IMAGE_ANTITEXT_COMPILER_V1";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V3";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V3";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V3";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V2";
const EXPECTED_ANTITEXT = "AVANTIQO_IMAGE_Z_IMAGE_ANTITEXT_POLICY_V1";
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
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V8_PLAN_REST");
}
async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V8_PLAN_QUEUE");
}
async function queueCredentialWorks(endpointId, key) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch { return false; }
}
async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
    text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  throw new Error("AVANTIQO_IMAGE_V8_PLAN_QUEUE_CREDENTIAL_NOT_FOUND");
}
async function anonymousPullProof(reference) {
  const match = text(reference).match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) return { public_pull: false, invalid_reference: true };
  const repository = match[1];
  const digest = match[2];
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
  const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  const tokenBody = object(await tokenResponse.json().catch(() => ({})));
  const token = text(tokenBody.token || tokenBody.access_token);
  if (!tokenResponse.ok || !token) return { public_pull: false, token_status: tokenResponse.status, manifest_status: null };
  const manifestResponse = await fetch(`https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(digest)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
  await manifestResponse.arrayBuffer();
  const digestMatches = !contentDigest || contentDigest.toLowerCase() === digest.toLowerCase();
  return { public_pull: manifestResponse.ok && digestMatches, token_status: tokenResponse.status, manifest_status: manifestResponse.status, digest_matches: digestMatches };
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: {
      idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0),
      running: finite(workers.running, 0), unhealthy: finite(workers.unhealthy, 0), throttled: finite(workers.throttled, 0),
    },
  };
}
function managementWorkers(endpoint = {}) {
  const workers = list(endpoint.workers);
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => text(worker?.desiredStatus || worker?.desired_status).toUpperCase() !== "EXITED").length,
  };
}

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true || text(evidence?.contract) !== EVIDENCE_CONTRACT || text(evidence?.evidence_revision) !== EVIDENCE_REVISION ||
  evidence?.source_sha_matches_trigger !== true || text(evidence?.entrypoint) !== EXPECTED_ENTRYPOINT ||
  text(evidence?.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION || text(evidence?.runtime_revision) !== EXPECTED_RUNTIME ||
  text(evidence?.photoreal_candidate_foundation) !== TARGET_MODEL || text(evidence?.photoreal_candidate_profile) !== EXPECTED_PROFILE ||
  text(evidence?.photoreal_candidate_policy) !== EXPECTED_POLICY || text(evidence?.photoreal_quality_compiler_contract) !== EXPECTED_COMPILER ||
  text(evidence?.photoreal_antitext_policy_contract) !== EXPECTED_ANTITEXT || Number(evidence?.photoreal_default_inference_steps) !== 28 ||
  Number(evidence?.photoreal_default_guidance_scale) !== 4 || evidence?.photoreal_negative_policy_applied !== true ||
  evidence?.photoreal_antitext_policy_applied !== true || evidence?.photoreal_prompt_rewrite_applied !== false ||
  evidence?.photoreal_compiled_prompt_persisted !== false || text(evidence?.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE ||
  text(evidence?.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS || evidence?.backing_filesystem_capacity_used_for_decision !== false ||
  evidence?.automatic_production_routing_enabled !== false || evidence?.provider_job_submitted !== false ||
  evidence?.image_generation_submitted !== false || evidence?.model_download_submitted !== false || evidence?.production_web_deploy !== false
) throw new Error("AVANTIQO_IMAGE_V8_PLAN_EVIDENCE_NOT_READY");

const immutableImage = text(evidence.immutable_image_reference);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const [endpoint, templatesRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_V8_PLAN_ENDPOINT_IDENTITY_INVALID");
const templates = normalizeListResponse(templatesRaw, ["templates"]);
if (!templates) throw new Error("AVANTIQO_IMAGE_V8_PLAN_TEMPLATE_LIST_INVALID");
const currentTemplateId = text(endpoint.templateId || endpoint.template?.id);
const currentTemplate = templates.find((entry) => text(entry.id) === currentTemplateId);
if (!currentTemplate) throw new Error("AVANTIQO_IMAGE_V8_PLAN_CURRENT_TEMPLATE_NOT_FOUND");
const queueCredential = await selectQueueCredential(endpointId, managementKey);
const [healthRaw, pullProof] = await Promise.all([queueHealth(endpointId, queueCredential.key), anonymousPullProof(immutableImage)]);
if (!pullProof.public_pull) throw new Error("AVANTIQO_IMAGE_V8_PLAN_PUBLIC_PULL_REQUIRED");
const health = healthSummary(healthRaw);
const management = managementWorkers(endpoint);
const digestSuffix = immutableImage.split("sha256:")[1]?.slice(0, 12) || "unknown";
const targetTemplateName = `avantiqo-image-immutable-v8-${digestSuffix}`;
const existingTargetTemplates = templates.filter((entry) => text(entry.name) === targetTemplateName && text(entry.imageName) === immutableImage);
const mutationRequired = text(currentTemplate.imageName) !== immutableImage;

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_IMAGE_V8_IMMUTABLE_REBIND_PLAN_V1",
  mode: "PLAN",
  endpoint: {
    id: endpointId,
    name: text(endpoint.name),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds),
    network_volume_ids: endpointVolumeIds(endpoint),
    idle_timeout: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
  },
  current_template: { id: currentTemplateId, name: text(currentTemplate.name), image: text(currentTemplate.imageName) },
  target: {
    source_sha: text(evidence.source_sha),
    immutable_image: immutableImage,
    template_name: targetTemplateName,
    existing_template_found: existingTargetTemplates.length === 1,
    quality_profile: EXPECTED_PROFILE,
    quality_policy: EXPECTED_POLICY,
    quality_compiler_contract: EXPECTED_COMPILER,
    antitext_policy_contract: EXPECTED_ANTITEXT,
    default_inference_steps: 28,
    default_guidance_scale: 4,
  },
  public_pull_proof: pullProof,
  initial_health: health,
  initial_management_workers: management,
  queue_credential_source: queueCredential.source,
  stable_drain_observations_required: 2,
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
  next_action: mutationRequired ? "RUN_V8_REBIND_APPLY_AFTER_PLAN_REVIEW" : "RUN_IMAGE_V8_RUNTIME_PROBE",
}, null, 2));
console.log("AVANTIQO_IMAGE_V8_IMMUTABLE_REBIND_PLAN=PASS");
