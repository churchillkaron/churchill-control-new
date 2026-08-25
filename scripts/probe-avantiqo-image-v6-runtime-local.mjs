import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const ENDPOINT_NAME = "avantiqo-image-v1";
const RUNTIME_OPERATION = "runtime_probe";
const CAPACITY_OPERATION = "inspect_foundation_capacity";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const EXPECTED_ENTRYPOINT = "handler_v6.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V6_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_PHYSICAL_USAGE_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_QUOTA_GUARD_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";
const POLL_MS = 5_000;
const MAX_WAIT_MS = Math.max(60_000, Number(process.env.AVANTIQO_IMAGE_V6_PROBE_TIMEOUT_MS || 12 * 60 * 1000));

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_IMAGE_V6_PROBE_REST");
}

async function queue(endpointId, pathname, key, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_IMAGE_V6_PROBE_QUEUE");
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
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_IMAGE_V6_PROBE_TEMPLATE_LIST_INVALID");
  return templates;
}

async function readEvidence() {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  if (
    evidence?.success !== true ||
    evidence?.contract !== EVIDENCE_CONTRACT ||
    evidence?.source_sha_matches_trigger !== true ||
    text(evidence?.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence?.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION ||
    text(evidence?.runtime_revision) !== EXPECTED_RUNTIME_REVISION ||
    text(evidence?.runtime_probe_contract) !== EXPECTED_PROBE_CONTRACT ||
    text(evidence?.capacity_probe_operation) !== CAPACITY_OPERATION ||
    text(evidence?.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE_CONTRACT ||
    text(evidence?.volume_quota_guard_contract) !== EXPECTED_QUOTA_GUARD_CONTRACT ||
    text(evidence?.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS ||
    evidence?.backing_filesystem_capacity_used_for_decision !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_V6_PROBE_EVIDENCE_INVALID");
  }
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_IMAGE_V6_PROBE_IMMUTABLE_IMAGE_INVALID");
  }
  return { evidence, immutableImage };
}

function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length === 1 && text(matches[0]?.name) === ENDPOINT_NAME) return matches[0];
    throw new Error(`AVANTIQO_IMAGE_V6_PROBE_CONFIGURED_ENDPOINT_INVALID:${matches.length}`);
  }
  const matches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V6_PROBE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function resolveTemplate(templates, templateId) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V6_PROBE_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function assertNoExistingJobs(health) {
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error(`AVANTIQO_IMAGE_V6_PROBE_EXISTING_JOB_BLOCK:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`);
  }
}

function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}

async function cancelJob(endpointId, jobId, apiKey) {
  if (!jobId) return;
  try {
    await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" });
    console.log(`AVANTIQO_IMAGE_V6_PROBE_CANCELLED_JOB=${jobId}`);
  } catch (error) {
    console.log(`AVANTIQO_IMAGE_V6_PROBE_CANCEL_FAILED=${text(error?.message || error).slice(0, 300)}`);
  }
}

async function runOperation(endpointId, apiKey, input, label) {
  const started = Date.now();
  const submitted = await queue(endpointId, "/run", apiKey, {
    method: "POST",
    body: { input },
  });
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error(`AVANTIQO_IMAGE_V6_${label}_JOB_ID_REQUIRED`);
  console.log(`AVANTIQO_IMAGE_V6_${label}_JOB_ID=${jobId}`);

  let statusBody = submitted;
  while (Date.now() - started < MAX_WAIT_MS) {
    const status = text(statusBody?.status).toUpperCase();
    if (status === "COMPLETED") return statusBody;
    if (terminalFailure(status)) {
      throw new Error(`AVANTIQO_IMAGE_V6_${label}_FAILED:status=${status}:error=${text(statusBody?.error).slice(0, 500)}`);
    }
    await sleep(POLL_MS);
    statusBody = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    console.log(JSON.stringify({
      event: "AVANTIQO_IMAGE_V6_PROBE_PROGRESS",
      label,
      job_id: jobId,
      status: text(statusBody?.status).toUpperCase(),
      elapsed_seconds: Math.round((Date.now() - started) / 1000),
    }));
  }

  await cancelJob(endpointId, jobId, apiKey);
  throw new Error(`AVANTIQO_IMAGE_V6_${label}_TIMEOUT:${MAX_WAIT_MS}`);
}

function assertFalse(value, code) {
  if (value !== false) throw new Error(code);
}

function validateRuntimeProbe(body) {
  const output = object(body?.output);
  if (text(output.status) !== "completed") throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_OUTPUT_STATUS_INVALID");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_ENGINE_CONTRACT_INVALID");
  if (text(output.probe_contract) !== EXPECTED_PROBE_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_CONTRACT_INVALID");
  if (text(output.operation) !== RUNTIME_OPERATION) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_OPERATION_INVALID");
  if (text(output.entrypoint) !== EXPECTED_ENTRYPOINT) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_ENTRYPOINT_INVALID");
  if (text(output.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_ENTRYPOINT_REVISION_INVALID");
  if (text(output.runtime_revision) !== EXPECTED_RUNTIME_REVISION) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_REVISION_INVALID");
  assertFalse(output.generation_requested, "AVANTIQO_IMAGE_V6_RUNTIME_GENERATION_FORBIDDEN");
  assertFalse(output.inference_performed, "AVANTIQO_IMAGE_V6_RUNTIME_INFERENCE_FORBIDDEN");
  assertFalse(output.model_download_performed, "AVANTIQO_IMAGE_V6_RUNTIME_DOWNLOAD_FORBIDDEN");
  assertFalse(output.storage_mutation_performed, "AVANTIQO_IMAGE_V6_RUNTIME_STORAGE_MUTATION_FORBIDDEN");

  const guard = object(output.volume_quota_guard);
  if (text(guard.contract) !== EXPECTED_QUOTA_GUARD_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_QUOTA_GUARD_INVALID");
  if (text(guard.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_PHYSICAL_USAGE_INVALID");
  if (text(guard.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_ALLOCATION_BASIS_INVALID");
  if (guard.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_V6_RUNTIME_BACKING_FS_GUARD_INVALID");
  return output;
}

function validateCapacityProbe(body) {
  const output = object(body?.output);
  if (text(output.status) !== "completed") throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_OUTPUT_STATUS_INVALID");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_ENGINE_CONTRACT_INVALID");
  if (text(output.operation) !== CAPACITY_OPERATION) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_OPERATION_INVALID");
  if (text(output.runtime_revision) !== EXPECTED_RUNTIME_REVISION) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_RUNTIME_REVISION_INVALID");
  if (text(output.target_model) !== TARGET_MODEL) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_TARGET_MODEL_INVALID");
  assertFalse(output.download_requested, "AVANTIQO_IMAGE_V6_CAPACITY_DOWNLOAD_REQUEST_FORBIDDEN");
  assertFalse(output.model_download_performed, "AVANTIQO_IMAGE_V6_CAPACITY_DOWNLOAD_FORBIDDEN");
  assertFalse(output.generation_requested, "AVANTIQO_IMAGE_V6_CAPACITY_GENERATION_FORBIDDEN");
  assertFalse(output.inference_performed, "AVANTIQO_IMAGE_V6_CAPACITY_INFERENCE_FORBIDDEN");
  assertFalse(output.storage_mutation_performed, "AVANTIQO_IMAGE_V6_CAPACITY_STORAGE_MUTATION_FORBIDDEN");

  const storage = object(output.candidate_storage);
  if (text(storage.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE_CONTRACT) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_PHYSICAL_USAGE_INVALID");
  if (text(storage.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_ALLOCATION_BASIS_INVALID");
  if (storage.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_V6_CAPACITY_BACKING_FS_GUARD_INVALID");
  return output;
}

const { evidence, immutableImage } = await readEvidence();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_PROVIDER_JOBS_MAX=2");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_GENERATION_REQUESTED=false");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_MODEL_DOWNLOAD_PERFORMED=false");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V6_RUNTIME_PROBE_SECRETS_PRINTED=false");

const [endpointsRaw, templates] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_IMAGE_V6_PROBE_ENDPOINT_LIST_INVALID");
const endpoint = resolveEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint.id);
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) {
  throw new Error(`AVANTIQO_IMAGE_V6_PROBE_SCALING_INVALID:min=${finite(endpoint.workersMin)}:max=${finite(endpoint.workersMax)}`);
}
const templateId = text(endpoint.templateId || endpoint.template?.id);
const template = resolveTemplate(templates, templateId);
if (text(template.imageName) !== immutableImage) throw new Error("AVANTIQO_IMAGE_V6_PROBE_IMMUTABLE_TEMPLATE_MISMATCH");
if (!text(template.name).startsWith("avantiqo-image-immutable-")) throw new Error("AVANTIQO_IMAGE_V6_PROBE_TEMPLATE_NAME_INVALID");
const initialHealth = healthSummary(await queue(endpointId, "/health", apiKey));
assertNoExistingJobs(initialHealth);

const runtimeBody = await runOperation(endpointId, apiKey, {
  contract: ENGINE_CONTRACT,
  operation: RUNTIME_OPERATION,
}, "RUNTIME");
const runtimeOutput = validateRuntimeProbe(runtimeBody);

const midHealth = healthSummary(await queue(endpointId, "/health", apiKey));
assertNoExistingJobs(midHealth);

const capacityBody = await runOperation(endpointId, apiKey, {
  contract: ENGINE_CONTRACT,
  operation: CAPACITY_OPERATION,
  target_model: TARGET_MODEL,
}, "CAPACITY");
const capacityOutput = validateCapacityProbe(capacityBody);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_IMAGE_V6_RUNTIME_CERTIFICATION_PROBE_V1",
  endpoint: {
    id: endpointId,
    name: text(endpoint.name),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    template_id: templateId,
    template_name: text(template.name),
    immutable_image: text(template.imageName),
  },
  source_evidence: {
    source_sha: text(evidence.source_sha),
    runtime_revision: text(evidence.runtime_revision),
    entrypoint_revision: text(evidence.entrypoint_revision),
  },
  runtime_probe: {
    probe_contract: text(runtimeOutput.probe_contract),
    entrypoint: text(runtimeOutput.entrypoint),
    entrypoint_revision: text(runtimeOutput.entrypoint_revision),
    runtime_revision: text(runtimeOutput.runtime_revision),
    generation_requested: runtimeOutput.generation_requested,
    inference_performed: runtimeOutput.inference_performed,
    model_download_performed: runtimeOutput.model_download_performed,
    storage_mutation_performed: runtimeOutput.storage_mutation_performed,
    volume_quota_guard: runtimeOutput.volume_quota_guard,
    photoreal_candidate: runtimeOutput.photoreal_candidate,
  },
  foundation_capacity: {
    operation: text(capacityOutput.operation),
    target_model: text(capacityOutput.target_model),
    candidate_profile: text(capacityOutput.candidate_profile),
    candidate_cache_ready: capacityOutput.candidate_cache_ready === true,
    candidate_missing_required_file_count: finite(capacityOutput.candidate_missing_required_file_count, null),
    safe_to_cache_without_reclaim: capacityOutput.safe_to_cache_without_reclaim === true,
    candidate_storage: capacityOutput.candidate_storage,
    model_download_performed: capacityOutput.model_download_performed,
    generation_requested: capacityOutput.generation_requested,
    inference_performed: capacityOutput.inference_performed,
    storage_mutation_performed: capacityOutput.storage_mutation_performed,
  },
  provider_jobs_submitted: 2,
  image_generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  storage_mutation_performed: false,
  endpoint_mutation_performed: false,
  production_web_deploy: false,
  secrets_in_output: false,
  next_action: capacityOutput.candidate_cache_ready === true
    ? "IMAGE_V6_RUNTIME_AND_CANDIDATE_CACHE_READY"
    : capacityOutput.safe_to_cache_without_reclaim === true
      ? "OPTIONAL_CACHE_PHOTOREAL_CANDIDATE_REQUIRES_EXPLICIT_APPROVAL"
      : "INSPECT_CAPACITY_BEFORE_ANY_MODEL_DOWNLOAD",
}, null, 2));
console.log("AVANTIQO_IMAGE_V6_RUNTIME_CERTIFICATION_PROBE=PASS");
