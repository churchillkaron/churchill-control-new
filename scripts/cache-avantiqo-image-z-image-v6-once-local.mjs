import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_V6_CACHE_ONCE_V1";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const CACHE_OPERATION = "cache_foundation_model";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";
const ENDPOINT_NAME = "avantiqo-image-v1";
const CONTROLLER_PATH = "scripts/cache-avantiqo-image-z-image-v6-once-local.mjs";
const SOURCE_PATH = "services/avantiqo-image-engine";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const EXPECTED_ENTRYPOINT = "handler_v6.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V6_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_QUOTA_GUARD = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const EXPECTED_PHYSICAL_USAGE = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1";
const EXPECTED_ALLOCATION_BASIS = "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK";
const EXPECTED_CACHE_CONTRACT = "AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1";
const EXPECTED_VOLUME_GB = 160;
const EXPECTED_VOLUME_NAME = "avantiqo-shared-image-video-cache";
const EXPECTED_GPU_POOL = ["NVIDIA RTX PRO 6000 Blackwell Server Edition"];
const EXPECTED_IDLE_TIMEOUT_SECONDS = 10;
const POLL_MS = 5_000;
const MAX_WAIT_MS = Math.max(
  60_000,
  Math.min(
    30 * 60 * 1000,
    Number(process.env.AVANTIQO_IMAGE_Z_IMAGE_CACHE_TIMEOUT_MS || 25 * 60 * 1000),
  ),
);
const OUTPUT_PATH = "/tmp/avantiqo-image-z-image-v6-cache-once.json";
const RELEVANT_PATHS = [SOURCE_PATH, EVIDENCE_PATH, CONTROLLER_PATH];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return text(found ? found.slice(prefix.length) : "");
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertRelevantMainStable(baseSha, label) {
  command("git", ["fetch", "origin", "main"], `${label}_FETCH_MAIN_FAILED`);
  const branch = command("git", ["branch", "--show-current"], `${label}_BRANCH_READ_FAILED`);
  if (branch !== "main") throw new Error(`${label}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], `${label}_HEAD_READ_FAILED`);
  const origin = command("git", ["rev-parse", "origin/main"], `${label}_ORIGIN_READ_FAILED`);
  if (baseSha && head !== baseSha) {
    throw new Error(`${label}_LOCAL_HEAD_MOVED:planned=${baseSha}:head=${head}`);
  }
  const ancestor = commandStatus("git", ["merge-base", "--is-ancestor", head, origin]);
  if (ancestor.status !== 0) {
    throw new Error(`${label}_LOCAL_MAIN_NOT_ANCESTOR_OF_ORIGIN:head=${head}:origin=${origin}`);
  }
  let unrelatedMainDriftTolerated = false;
  if (head !== origin) {
    const relevant = commandStatus("git", ["diff", "--quiet", head, origin, "--", ...RELEVANT_PATHS]);
    if (relevant.status === 1) {
      throw new Error(`${label}_RELEVANT_MAIN_MOVED_REPLAN_REQUIRED:head=${head}:origin=${origin}`);
    }
    if (relevant.status !== 0) {
      throw new Error(`${label}_RELEVANT_MAIN_DIFF_FAILED`);
    }
    unrelatedMainDriftTolerated = true;
  }
  return { head, origin_main: origin, unrelated_main_drift_tolerated: unrelatedMainDriftTolerated };
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
  const response = await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "AVANTIQO_IMAGE_Z_V6_CACHE_REST");
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, "AVANTIQO_IMAGE_Z_V6_CACHE_QUEUE");
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
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY)
      ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) }
      : null,
    text(process.env.RUNPOD_API_KEY)
      ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) }
      : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_QUEUE_CREDENTIAL_NOT_FOUND");
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function healthCounters(value = {}) {
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

function validateEvidence(head) {
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  const sourceSha = text(evidence.source_sha);
  if (
    evidence.success !== true ||
    text(evidence.contract) !== EVIDENCE_CONTRACT ||
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== text(evidence.trigger_sha) ||
    text(evidence.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION ||
    text(evidence.runtime_revision) !== EXPECTED_RUNTIME ||
    text(evidence.volume_quota_guard_contract) !== EXPECTED_QUOTA_GUARD ||
    text(evidence.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE ||
    text(evidence.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS ||
    evidence.backing_filesystem_capacity_used_for_decision !== false ||
    evidence.logical_file_size_used_for_quota_decision !== false ||
    evidence.hardlink_deduplication_enabled !== true ||
    text(evidence.photoreal_candidate_foundation) !== TARGET_MODEL ||
    text(evidence.photoreal_cache_contract) !== EXPECTED_CACHE_CONTRACT ||
    evidence.automatic_production_routing_enabled !== false ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.model_download_submitted !== false ||
    evidence.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_EVIDENCE_INVALID");
  }
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_SOURCE_SHA_INVALID");
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_IMMUTABLE_IMAGE_INVALID");
  }
  const sourceDiff = commandStatus("git", ["diff", "--quiet", sourceSha, head, "--", SOURCE_PATH]);
  if (sourceDiff.status === 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_SOURCE_CHANGED_AFTER_BUILD:source=${sourceSha}:head=${head}`);
  }
  if (sourceDiff.status !== 0) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_SOURCE_EQUIVALENCE_FAILED");
  return { evidence, sourceSha, immutableImage };
}

function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length === 1 && text(matches[0]?.name) === ENDPOINT_NAME) return matches[0];
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function resolveTemplate(templates, endpoint) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function validateEndpoint(endpoint, template, immutableImage, volume) {
  if (text(endpoint.id) === "" || text(endpoint.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_ENDPOINT_IDENTITY_INVALID");
  }
  const gpuPool = unique(list(endpoint.gpuTypeIds));
  if (!sameSet(gpuPool, EXPECTED_GPU_POOL)) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_GPU_POOL_INVALID:${gpuPool.join("|")}`);
  }
  if (finite(endpoint.idleTimeout) !== EXPECTED_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_IDLE_TIMEOUT_INVALID:${finite(endpoint.idleTimeout)}`);
  }
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_SCALING_INVALID:min=${finite(endpoint.workersMin)}:max=${finite(endpoint.workersMax)}`);
  }
  if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-")) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_IMMUTABLE_BINDING_INVALID");
  }
  const quota = finite(normalizeEnv(template.env).AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB);
  if (quota !== EXPECTED_VOLUME_GB) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_QUOTA_ENV_INVALID:${quota}`);
  }
  const volumeIds = endpointVolumeIds(endpoint);
  if (volumeIds.length !== 1 || volumeIds[0] !== text(volume.id)) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_VOLUME_ATTACHMENT_INVALID:${volumeIds.join("|") || "NONE"}`);
  }
  if (text(volume.name) !== EXPECTED_VOLUME_NAME || finite(volume.size) !== EXPECTED_VOLUME_GB) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_VOLUME_INVALID:name=${text(volume.name)}:size=${finite(volume.size)}`);
  }
}

async function readProviderState(managementKey, configuredEndpointId, immutableImage) {
  const [endpointsRaw, templatesRaw, volumesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
    rest("/networkvolumes", managementKey),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const templates = normalizeListResponse(templatesRaw, ["templates"]);
  const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
  if (!endpoints || !templates || !volumes) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_PROVIDER_INVENTORY_INVALID");
  const endpoint = resolveEndpoint(endpoints, configuredEndpointId);
  const template = resolveTemplate(templates, endpoint);
  const volumeIds = endpointVolumeIds(endpoint);
  const volume = volumes.find((entry) => volumeIds.includes(text(entry?.id)));
  if (!volume) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_ATTACHED_VOLUME_NOT_FOUND");
  validateEndpoint(endpoint, template, immutableImage, volume);
  return { endpoint, template, volume };
}

function assertNoConcurrentExecution(health, label) {
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error(`${label}_EXISTING_JOB_BLOCK:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`);
  }
  if (health.workers.running !== 0 || health.workers.throttled !== 0 || health.workers.unhealthy !== 0) {
    throw new Error(`${label}_ACTIVE_EXECUTION_BLOCK:running=${health.workers.running}:throttled=${health.workers.throttled}:unhealthy=${health.workers.unhealthy}`);
  }
}

function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}

function validateOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_OUTPUT_INVALID");
  }
  if (text(output.status).toLowerCase() !== "completed") throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_OUTPUT_STATUS_INVALID");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_ENGINE_CONTRACT_INVALID");
  if (text(output.runtime_revision) !== EXPECTED_RUNTIME) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_RUNTIME_INVALID:${text(output.runtime_revision)}`);
  }
  if (text(output.operation) !== CACHE_OPERATION || text(output.target_model) !== TARGET_MODEL) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_OPERATION_INVALID");
  }
  if (output.inference_performed !== false || output.generation_requested !== false) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_UNEXPECTED_INFERENCE_OR_GENERATION");
  }
  const storage = object(output.cache_storage);
  if (text(storage.quota_guard_contract) !== EXPECTED_QUOTA_GUARD) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_QUOTA_GUARD_INVALID");
  if (text(storage.physical_usage_contract) !== EXPECTED_PHYSICAL_USAGE) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_PHYSICAL_USAGE_INVALID");
  if (text(storage.allocation_decision_basis) !== EXPECTED_ALLOCATION_BASIS) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_ALLOCATION_BASIS_INVALID");
  if (finite(storage.network_volume_quota_gb) !== EXPECTED_VOLUME_GB) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_RUNTIME_QUOTA_INVALID");
  if (storage.backing_filesystem_capacity_used_for_decision !== false) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_BACKING_FS_DECISION_FORBIDDEN");
  if (output.storage_insufficient === true) {
    if (output.cache_ready !== false || output.deletion_performed !== false || output.automatic_delete_allowed !== false) {
      throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_INSUFFICIENT_STORAGE_SAFETY_INVALID");
    }
    return { result: "STORAGE_INSUFFICIENT", cacheReady: false, storage, snapshotRevision: null };
  }
  if (output.cache_ready !== true || text(output.foundation_model_source) !== "runpod-cache") {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_COMPLETION_NOT_READY");
  }
  const integrity = object(output.cache_integrity);
  if (
    text(integrity.contract) !== EXPECTED_CACHE_CONTRACT ||
    integrity.completion_marker_valid !== true ||
    list(integrity.missing_required_files).length !== 0 ||
    !text(integrity.snapshot_revision)
  ) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_INTEGRITY_INVALID");
  }
  return {
    result: output.already_cached === true ? "ALREADY_CACHED" : "CACHE_COMPLETED",
    cacheReady: true,
    storage,
    snapshotRevision: text(integrity.snapshot_revision),
  };
}

const resumeJobId = arg("job-id") || text(process.env.AVANTIQO_IMAGE_Z_IMAGE_CACHE_JOB_ID);
const apply = process.argv.includes("--apply");
if (!resumeJobId && (!apply || !yes(process.env.AVANTIQO_IMAGE_Z_IMAGE_CACHE_APPROVED))) {
  throw new Error("AVANTIQO_IMAGE_Z_IMAGE_CACHE_APPROVED=YES_AND_--apply_REQUIRED");
}

const initialMainGuard = assertRelevantMainStable("", "AVANTIQO_IMAGE_Z_V6_CACHE_INITIAL");
const plannedMain = initialMainGuard.head;
const local = validateEvidence(plannedMain);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const initialProviderState = await readProviderState(managementKey, configuredEndpointId, local.immutableImage);
const endpointId = text(initialProviderState.endpoint.id);
const queueCredential = await selectQueueCredential(endpointId, managementKey);
const inferenceKey = queueCredential.key;
const initialHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (!resumeJobId) assertNoConcurrentExecution(initialHealth, "AVANTIQO_IMAGE_Z_V6_CACHE_INITIAL");

console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_MODE=${resumeJobId ? "RESUME" : "APPLY"}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_TARGET_MODEL=${TARGET_MODEL}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_IMMUTABLE_IMAGE=${local.immutableImage}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_VOLUME_ID=${text(initialProviderState.volume.id)}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_QUEUE_CREDENTIAL_SOURCE=${queueCredential.source}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_INITIAL_UNRELATED_MAIN_DRIFT_TOLERATED=${initialMainGuard.unrelated_main_drift_tolerated}`);
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_SINGLE_SUBMISSION=true");
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_AUTOMATIC_RETRY=false");
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_AUTOMATIC_DELETE=false");
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_GENERATION=false");
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_INFERENCE=false");
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_MODEL_DOWNLOAD=${resumeJobId ? "UNKNOWN_EXISTING_JOB" : "APPROVED_ONCE"}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_STORAGE_MUTATION=${resumeJobId ? "UNKNOWN_EXISTING_JOB" : "APPROVED_CACHE_ONLY"}`);
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_CREDENTIAL_VALUE_PRINTED=false");
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_INITIAL_HEALTH=${JSON.stringify(initialHealth)}`);

let jobId = resumeJobId;
let submitted = false;
let statusBody = null;
let beforeSubmitMainGuard = null;

if (resumeJobId) {
  statusBody = await queue(endpointId, `/status/${encodeURIComponent(resumeJobId)}`, inferenceKey);
} else {
  const freshProviderState = await readProviderState(managementKey, configuredEndpointId, local.immutableImage);
  if (text(freshProviderState.endpoint.id) !== endpointId) {
    throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_ENDPOINT_MOVED_REPLAN_REQUIRED");
  }
  const freshHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
  assertNoConcurrentExecution(freshHealth, "AVANTIQO_IMAGE_Z_V6_CACHE_BEFORE_SUBMIT");
  beforeSubmitMainGuard = assertRelevantMainStable(plannedMain, "AVANTIQO_IMAGE_Z_V6_CACHE_BEFORE_SUBMIT");

  let submittedBody;
  try {
    submittedBody = await queue(endpointId, "/run", inferenceKey, {
      method: "POST",
      body: {
        input: {
          contract: ENGINE_CONTRACT,
          operation: CACHE_OPERATION,
          target_model: TARGET_MODEL,
        },
      },
      timeoutMs: 30_000,
    });
  } catch (error) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 800)}`);
  }
  jobId = text(submittedBody?.id);
  if (!jobId) throw new Error("AVANTIQO_IMAGE_Z_V6_CACHE_JOB_ID_MISSING_DO_NOT_RETRY_AUTOMATICALLY");
  submitted = true;
  statusBody = submittedBody;
  console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_BEFORE_SUBMIT_ORIGIN=${beforeSubmitMainGuard.origin_main}`);
  console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_UNRELATED_MAIN_DRIFT_TOLERATED=${beforeSubmitMainGuard.unrelated_main_drift_tolerated}`);
  console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_JOB_ID=${jobId}`);
  console.log("AVANTIQO_IMAGE_Z_V6_CACHE_SUBMITTED_ONCE=YES");
}

const startedAt = Date.now();
let lastStatus = "";
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(statusBody?.status).toUpperCase();
  if (status !== lastStatus) {
    console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_STATUS=${status || "UNKNOWN"}`);
    lastStatus = status;
  }
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_CACHE_JOB_FAILED:job_id=${jobId}:status=${status}:error=${text(statusBody?.error).slice(0, 1000)}`);
  }
  await sleep(POLL_MS);
  statusBody = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
}

if (text(statusBody?.status).toUpperCase() !== "COMPLETED") {
  throw new Error(
    `AVANTIQO_IMAGE_Z_V6_CACHE_WAIT_TIMEOUT_RESUME_WITH_JOB_ID:job_id=${jobId}:command=node scripts/run-with-avantiqo-local-env.mjs ${CONTROLLER_PATH} --job-id=${jobId}`,
  );
}

const result = validateOutput(statusBody.output);
const finalHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
const report = {
  success: result.result !== "STORAGE_INSUFFICIENT",
  contract: CONTRACT,
  endpoint_id: endpointId,
  job_id: jobId,
  new_job_submitted: submitted,
  job_status: "COMPLETED",
  result: result.result,
  target_model: TARGET_MODEL,
  cache_ready: result.cacheReady,
  snapshot_revision: result.snapshotRevision,
  execution_time_ms: finite(statusBody.executionTime),
  delay_time_ms: finite(statusBody.delayTime),
  immutable_worker_image: local.immutableImage,
  source_sha: local.sourceSha,
  runtime_revision: EXPECTED_RUNTIME,
  physical_usage_contract: EXPECTED_PHYSICAL_USAGE,
  allocation_decision_basis: EXPECTED_ALLOCATION_BASIS,
  network_volume: {
    id: text(initialProviderState.volume.id),
    name: text(initialProviderState.volume.name),
    size_gb: finite(initialProviderState.volume.size),
  },
  cache_storage: result.storage,
  queue_credential_source: queueCredential.source,
  credential_value_printed: false,
  credential_persisted: false,
  initial_main_guard: initialMainGuard,
  before_submit_main_guard: beforeSubmitMainGuard,
  generation_submitted: false,
  inference_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  model_download_job_submitted: submitted,
  storage_mutation_scope: "Z_IMAGE_HUGGINGFACE_CACHE_ONLY",
  automatic_delete_allowed: false,
  automatic_retry_allowed: false,
  final_health: finalHealth,
  next_action:
    result.result === "STORAGE_INSUFFICIENT"
      ? "STOP_AND_REVIEW_ACTUAL_VOLUME_CONTENT"
      : "RUN_ONE_CONTROLLED_Z_IMAGE_QUALITY_GENERATION",
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_OUTPUT=${OUTPUT_PATH}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_RESULT=${report.result}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_READY=${report.cache_ready ? "YES" : "NO"}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_RUNTIME_QUOTA_GB=${finite(result.storage.network_volume_quota_gb)}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_MEASURED_ALLOCATED_BYTES=${finite(result.storage.measured_network_volume_allocated_bytes)}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_QUOTA_FREE_BYTES=${finite(result.storage.disk_free_bytes)}`);
console.log(`AVANTIQO_IMAGE_Z_V6_CACHE_NEXT_ACTION=${report.next_action}`);
console.log("AVANTIQO_IMAGE_Z_V6_CACHE_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
