import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V7_REALISM_COMPILER_V1";
const ENDPOINT_NAME = "avantiqo-image-v1";
const RUNTIME_OPERATION = "runtime_probe";
const CAPACITY_OPERATION = "inspect_foundation_capacity";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const EXPECTED_ENTRYPOINT = "handler_v7.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V7_Z_IMAGE_REALISM_COMPILER_V1";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V2";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V2";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V2";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V1";
const EXPECTED_PHYSICAL_USAGE = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_QUOTA_GUARD = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";
const POLL_MS = 5_000;
const MAX_WAIT_MS = Math.max(60_000, Number(process.env.AVANTIQO_IMAGE_V7_PROBE_TIMEOUT_MS || 12 * 60 * 1000));

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V7_PROBE_REST");
}
async function queue(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_V7_PROBE_QUEUE");
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
  throw new Error("AVANTIQO_IMAGE_V7_PROBE_QUEUE_CREDENTIAL_NOT_FOUND");
}
async function endpointBoundTemplates(managementKey) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_IMAGE_V7_PROBE_TEMPLATE_LIST_INVALID");
  return templates;
}
function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: { running: finite(workers.running, 0), unhealthy: finite(workers.unhealthy, 0), throttled: finite(workers.throttled, 0) },
  };
}
async function readEvidence() {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  if (
    evidence?.success !== true || text(evidence?.contract) !== EVIDENCE_CONTRACT || text(evidence?.evidence_revision) !== EVIDENCE_REVISION ||
    evidence?.source_sha_matches_trigger !== true || text(evidence?.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence?.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION || text(evidence?.runtime_revision) !== EXPECTED_RUNTIME ||
    text(evidence?.runtime_probe_contract) !== EXPECTED_PROBE_CONTRACT || text(evidence?.photoreal_candidate_foundation) !== TARGET_MODEL ||
    text(evidence?.photoreal_candidate_profile) !== EXPECTED_PROFILE || text(evidence?.photoreal_candidate_policy) !== EXPECTED_POLICY ||
    text(evidence?.photoreal_quality_compiler_contract) !== EXPECTED_COMPILER || Number(evidence?.photoreal_default_inference_steps) !== 28 ||
    Number(evidence?.photoreal_default_guidance_scale) !== 4 || evidence?.photoreal_negative_policy_applied !== true ||
    evidence?.photoreal_prompt_rewrite_applied !== false || evidence?.photoreal_compiled_prompt_persisted !== false ||
    text(evidence?.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE || text(evidence?.volume_quota_guard_contract) !== EXPECTED_QUOTA_GUARD ||
    text(evidence?.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS || evidence?.backing_filesystem_capacity_used_for_decision !== false ||
    evidence?.provider_job_submitted !== false || evidence?.image_generation_submitted !== false || evidence?.model_download_submitted !== false ||
    evidence?.production_web_deploy !== false
  ) throw new Error("AVANTIQO_IMAGE_V7_PROBE_EVIDENCE_NOT_READY");
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_IMAGE_V7_PROBE_IMMUTABLE_IMAGE_INVALID");
  }
  return { evidence, immutableImage };
}
function resolveEndpoint(endpoints, configuredId) {
  const matches = endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V7_PROBE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function resolveTemplate(templates, templateId) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V7_PROBE_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function assertFalse(value, code) {
  if (value !== false) throw new Error(code);
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}
async function cancelJob(endpointId, jobId, apiKey) {
  if (!jobId) return;
  try {
    await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" });
    console.log(`AVANTIQO_IMAGE_V7_PROBE_CANCELLED_JOB=${jobId}`);
  } catch (error) {
    console.log(`AVANTIQO_IMAGE_V7_PROBE_CANCEL_FAILED=${text(error?.message).slice(0, 300)}`);
  }
}
async function runOperation(endpointId, apiKey, input, label) {
  const started = Date.now();
  let submitted;
  try {
    submitted = await queue(endpointId, "/run", apiKey, { method: "POST", body: { input } });
  } catch (error) {
    throw new Error(`AVANTIQO_IMAGE_V7_${label}_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 500)}`);
  }
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error(`AVANTIQO_IMAGE_V7_${label}_JOB_ID_MISSING_DO_NOT_RETRY`);
  console.log(`AVANTIQO_IMAGE_V7_${label}_JOB_ID=${jobId}`);
  let body = submitted;
  while (Date.now() - started < MAX_WAIT_MS) {
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return { body, jobId };
    if (terminalFailure(status)) throw new Error(`AVANTIQO_IMAGE_V7_${label}_FAILED:${status}:${text(body?.error).slice(0, 500)}`);
    await sleep(POLL_MS);
    body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    console.log(JSON.stringify({ event: "AVANTIQO_IMAGE_V7_PROBE_PROGRESS", label, job_id: jobId, status: text(body?.status).toUpperCase(), elapsed_seconds: Math.round((Date.now() - started) / 1000) }));
  }
  await cancelJob(endpointId, jobId, apiKey);
  throw new Error(`AVANTIQO_IMAGE_V7_${label}_TIMEOUT_CANCELLED:${MAX_WAIT_MS}`);
}
function validateRuntime(body) {
  const output = object(body?.output);
  if (text(output.status) !== "completed" || text(output.engine_contract) !== ENGINE_CONTRACT || text(output.probe_contract) !== EXPECTED_PROBE_CONTRACT || text(output.operation) !== RUNTIME_OPERATION) throw new Error("AVANTIQO_IMAGE_V7_RUNTIME_BASE_CONTRACT_INVALID");
  if (text(output.entrypoint) !== EXPECTED_ENTRYPOINT || text(output.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION || text(output.runtime_revision) !== EXPECTED_RUNTIME) throw new Error("AVANTIQO_IMAGE_V7_RUNTIME_REVISION_INVALID");
  assertFalse(output.generation_requested, "AVANTIQO_IMAGE_V7_RUNTIME_GENERATION_FORBIDDEN");
  assertFalse(output.inference_performed, "AVANTIQO_IMAGE_V7_RUNTIME_INFERENCE_FORBIDDEN");
  assertFalse(output.model_download_performed, "AVANTIQO_IMAGE_V7_RUNTIME_DOWNLOAD_FORBIDDEN");
  assertFalse(output.storage_mutation_performed, "AVANTIQO_IMAGE_V7_RUNTIME_STORAGE_MUTATION_FORBIDDEN");
  const guard = object(output.volume_quota_guard);
  if (text(guard.contract) !== EXPECTED_QUOTA_GUARD || text(guard.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE || text(guard.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS || guard.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_V7_RUNTIME_PHYSICAL_GUARD_INVALID");
  const candidate = object(output.photoreal_candidate);
  if (
    text(candidate.foundation_model) !== TARGET_MODEL || text(candidate.quality_profile) !== EXPECTED_PROFILE || text(candidate.quality_policy) !== EXPECTED_POLICY ||
    text(candidate.quality_compiler_contract) !== EXPECTED_COMPILER || candidate.negative_policy_applied !== true ||
    Number(candidate.default_inference_steps) !== 28 || Number(candidate.default_guidance_scale) !== 4 ||
    candidate.prompt_rewrite_applied !== false || candidate.positive_constraint_suffix_applied !== false || candidate.automatic_production_routing_enabled !== false
  ) throw new Error("AVANTIQO_IMAGE_V7_RUNTIME_QUALITY_COMPILER_INVALID");
  if (candidate.cache_ready !== true) throw new Error("AVANTIQO_IMAGE_V7_RUNTIME_Z_IMAGE_CACHE_NOT_READY");
  return output;
}
function validateCapacity(body) {
  const output = object(body?.output);
  if (text(output.status) !== "completed" || text(output.engine_contract) !== ENGINE_CONTRACT || text(output.operation) !== CAPACITY_OPERATION || text(output.runtime_revision) !== EXPECTED_RUNTIME || text(output.target_model) !== TARGET_MODEL) throw new Error("AVANTIQO_IMAGE_V7_CAPACITY_BASE_CONTRACT_INVALID");
  assertFalse(output.download_requested, "AVANTIQO_IMAGE_V7_CAPACITY_DOWNLOAD_REQUEST_FORBIDDEN");
  assertFalse(output.model_download_performed, "AVANTIQO_IMAGE_V7_CAPACITY_DOWNLOAD_FORBIDDEN");
  assertFalse(output.generation_requested, "AVANTIQO_IMAGE_V7_CAPACITY_GENERATION_FORBIDDEN");
  assertFalse(output.inference_performed, "AVANTIQO_IMAGE_V7_CAPACITY_INFERENCE_FORBIDDEN");
  assertFalse(output.storage_mutation_performed, "AVANTIQO_IMAGE_V7_CAPACITY_STORAGE_MUTATION_FORBIDDEN");
  if (output.candidate_cache_ready !== true) throw new Error("AVANTIQO_IMAGE_V7_CAPACITY_CACHE_NOT_READY");
  const storage = object(output.candidate_storage);
  if (text(storage.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE || text(storage.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS || storage.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_V7_CAPACITY_PHYSICAL_GUARD_INVALID");
  return output;
}

const { evidence, immutableImage } = await readEvidence();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const configuredEndpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const endpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_IMAGE_V7_PROBE_ENDPOINT_LIST_INVALID");
const endpoint = resolveEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint.id);
const queueCredential = await selectQueueCredential(endpointId, managementKey);
const [templates, initialHealthRaw] = await Promise.all([endpointBoundTemplates(managementKey), queue(endpointId, "/health", queueCredential.key)]);
const templateId = text(endpoint.templateId || endpoint.template?.id);
const template = resolveTemplate(templates, templateId);
if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-v7-")) throw new Error("AVANTIQO_IMAGE_V7_PROBE_TEMPLATE_NOT_REBOUND");
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) throw new Error("AVANTIQO_IMAGE_V7_PROBE_SCALING_INVALID");
const initialHealth = healthSummary(initialHealthRaw);
if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0 || initialHealth.workers.running !== 0 || initialHealth.workers.unhealthy !== 0) throw new Error("AVANTIQO_IMAGE_V7_PROBE_EXISTING_ACTIVITY_BLOCK");

console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_PROVIDER_JOBS_MAX=2");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_GENERATION_REQUESTED=false");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_MODEL_DOWNLOAD_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V7_RUNTIME_PROBE_SECRETS_PRINTED=false");
console.log(`AVANTIQO_IMAGE_V7_RUNTIME_PROBE_QUEUE_CREDENTIAL_SOURCE=${queueCredential.source}`);

const runtimeResult = await runOperation(endpointId, queueCredential.key, { contract: ENGINE_CONTRACT, operation: RUNTIME_OPERATION }, "RUNTIME");
const runtime = validateRuntime(runtimeResult.body);
const healthAfterRuntime = healthSummary(await queue(endpointId, "/health", queueCredential.key));
if (healthAfterRuntime.jobs.in_queue !== 0 || healthAfterRuntime.jobs.in_progress !== 0) throw new Error("AVANTIQO_IMAGE_V7_PROBE_RUNTIME_DID_NOT_DRAIN");
const capacityResult = await runOperation(endpointId, queueCredential.key, { contract: ENGINE_CONTRACT, operation: CAPACITY_OPERATION, target_model: TARGET_MODEL }, "CAPACITY");
const capacity = validateCapacity(capacityResult.body);

const report = {
  success: true,
  contract: "AVANTIQO_IMAGE_V7_RUNTIME_CERTIFICATION_PROBE_V1",
  endpoint: { id: endpointId, name: ENDPOINT_NAME, workers_min: finite(endpoint.workersMin), workers_max: finite(endpoint.workersMax), template_id: templateId, template_name: text(template.name), immutable_image: immutableImage },
  source_evidence: { source_sha: text(evidence.source_sha), evidence_revision: EVIDENCE_REVISION, entrypoint_revision: EXPECTED_ENTRYPOINT_REVISION, runtime_revision: EXPECTED_RUNTIME },
  runtime_probe: runtime,
  foundation_capacity: capacity,
  provider_jobs_submitted: 2,
  image_generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  storage_mutation_performed: false,
  endpoint_mutation_performed: false,
  production_web_deploy: false,
  secrets_in_output: false,
  next_action: "RUN_ONE_CONTROLLED_V7_DEFAULT_QUALITY_GENERATION",
};
console.log(JSON.stringify(report, null, 2));
console.log("AVANTIQO_IMAGE_V7_RUNTIME_CERTIFICATION_PROBE=PASS");
