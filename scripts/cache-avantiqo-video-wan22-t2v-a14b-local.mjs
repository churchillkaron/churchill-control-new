import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_CACHE_FILL_V1";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const VIDEO_SOURCE_PATH = "services/avantiqo-video-engine";
const IMAGE_NAME = "avantiqo-image-v1";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DATA_CENTER = "US-NC-2";
const MIN_VOLUME_GB = 400;
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const RUNTIME_PROBE_CONTRACT = "AVANTIQO_VIDEO_RUNTIME_PROBE_V1";
const CACHE_EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_CACHE_CAPACITY_EVIDENCE_V1";
const CACHE_AUTHORIZATION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1";
const RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1";
const ENTRYPOINT = "handler_v3.py";
const CACHE_EXECUTION_TIMEOUT_MS = Math.max(
  2 * 60 * 60 * 1000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_CACHE_EXECUTION_TIMEOUT_MS || 2 * 60 * 60 * 1000),
);
const PROBE_WAIT_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_PROBE_WAIT_MS || 30 * 60 * 1000),
);
const CACHE_WAIT_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_T2V_CACHE_WAIT_MS || 125 * 60 * 1000),
);
const DRAIN_WAIT_MS = Math.max(
  60_000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_CACHE_DRAIN_WAIT_MS || 5 * 60 * 1000),
);
const POLL_MS = Math.max(5_000, Number(process.env.AVANTIQO_VIDEO_WAN22_CACHE_POLL_MS || 15_000));
const UNPAUSE_WAIT_MS = Math.max(
  15_000,
  Number(process.env.AVANTIQO_VIDEO_WAN22_CACHE_UNPAUSE_WAIT_MS || 90_000),
);

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 1200)}`);
  }
  return text(result.stdout);
}

function shellStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", VIDEO_SOURCE_PATH],
    "AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_VIDEO_SOURCE_HAS_LOCAL_CHANGES");
  return head;
}

function assertSourceEquivalent(sourceSha) {
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_SOURCE_SHA_INVALID");
  const exists = shellStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
  if (exists.status !== 0) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_SOURCE_COMMIT_MISSING:${sourceSha}`);
  for (const ref of ["HEAD", "origin/main"]) {
    const diff = shellStatus("git", ["diff", "--quiet", sourceSha, ref, "--", VIDEO_SOURCE_PATH]);
    if (diff.status === 1) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_SOURCE_CHANGED:source=${sourceSha}:ref=${ref}`);
    if (diff.status !== 0) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_SOURCE_EQUIVALENCE_CHECK_FAILED");
  }
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}

function stableCinemaExceptTemporary(endpoint = {}) {
  const value = safeEndpoint(endpoint);
  delete value.workers_max;
  delete value.execution_timeout_ms;
  return value;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 1200)}`);
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_T2V_CACHE_REST");
}

async function queueRequest(endpointId, path, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_T2V_CACHE_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

async function selectQueueCredential(endpointId, candidates) {
  const seen = new Set();
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.key || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_QUEUE_CREDENTIAL_NOT_FOUND:${endpointId}`);
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      retried: finite(jobs.retried, 0),
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

function activeQueueWorkers(health) {
  return Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
}

function assertCinemaFullyQuiescent(health, label) {
  const workers = activeQueueWorkers(health);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || workers !== 0) {
    throw new Error(`${label}_NOT_QUIESCENT:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${workers}`);
  }
}

function assertNoActiveJobs(health, label) {
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.workers.unhealthy !== 0) {
    throw new Error(`${label}_ACTIVE_OR_UNHEALTHY:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:unhealthy=${health.workers.unhealthy}`);
  }
}

async function endpointBoundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_TEMPLATE_LIST_INVALID");
  return templates;
}

async function inventory(key) {
  const [endpointsRaw, volumesRaw, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
    rest("/networkvolumes", key),
    endpointBoundTemplates(key),
  ]);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
  if (!endpoints || !volumes) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
}

function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function resolveTemplate(templates, id, label) {
  const matches = templates.filter((entry) => text(entry.id) === id);
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function validateVolume(volumes) {
  const matches = volumes.filter((volume) => text(volume.id) === VOLUME_ID || text(volume.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  const volume = matches[0];
  const size = finite(volume.size ?? volume.sizeGb, 0);
  if (
    text(volume.id) !== VOLUME_ID ||
    text(volume.name) !== VOLUME_NAME ||
    text(volume.dataCenterId) !== VOLUME_DATA_CENTER ||
    size < MIN_VOLUME_GB
  ) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_VOLUME_INVALID:id=${text(volume.id)}:name=${text(volume.name)}:dc=${text(volume.dataCenterId)}:size=${size}`);
  return volume;
}

function validateEvidence(evidence) {
  if (
    evidence?.success !== true ||
    text(evidence.contract) !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2" ||
    text(evidence.evidence_revision) !== "AVANTIQO_VIDEO_WORKER_IMAGE_V3_WAN22_A14B_DEFAULT_ROUTING_CACHE_V2" ||
    evidence.source_sha_matches_trigger !== true ||
    text(evidence.source_sha) !== text(evidence.trigger_sha) ||
    text(evidence.entrypoint) !== ENTRYPOINT ||
    text(evidence.runtime_revision) !== RUNTIME_REVISION ||
    text(evidence.engine_contract) !== ENGINE_CONTRACT ||
    text(evidence.runtime_probe_contract) !== RUNTIME_PROBE_CONTRACT ||
    text(evidence.cache_capacity_evidence_contract) !== CACHE_EVIDENCE_CONTRACT ||
    text(evidence.cache_operation) !== "cache_foundation_model" ||
    text(evidence.cache_authorization_contract) !== CACHE_AUTHORIZATION_CONTRACT ||
    text(evidence.cache_completion_contract) !== CACHE_COMPLETION_CONTRACT ||
    text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
    Number(evidence.minimum_network_volume_quota_gb_for_cache) !== 400 ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false ||
    evidence.provider_job_submitted !== false ||
    evidence.video_generation_submitted !== false ||
    evidence.inference_performed !== false ||
    evidence.model_download_submitted !== false ||
    evidence.production_web_deploy !== false
  ) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_BUILD_EVIDENCE_INVALID");
  const immutable = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutable)) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_IMMUTABLE_IMAGE_INVALID");
  }
  return { immutable, sourceSha: text(evidence.source_sha) };
}

function validateImageLock(lock) {
  const immutable = text(lock?.build_evidence?.immutable_image_reference);
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    text(lock?.generation_default?.foundation_model) !== "Tongyi-MAI/Z-Image" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    lock?.release_gate?.production_deploy_completed !== false ||
    !immutable
  ) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_IMAGE_V9_LOCK_INVALID");
  return immutable;
}

function validateImageLive(endpoint, template, immutable) {
  const safe = safeEndpoint(endpoint);
  if (
    safe.name !== IMAGE_NAME ||
    safe.workers_min !== 0 ||
    safe.workers_max !== 1 ||
    !sameSet(safe.network_volume_ids, [VOLUME_ID]) ||
    text(template.imageName) !== immutable ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_IMAGE_V9_LIVE_INVALID");
}

function validateCacheTemplate(endpoint, template, immutable, expectedName) {
  const safe = safeEndpoint(endpoint);
  const env = normalizeEnv(template.env);
  const failures = [];
  if (!CINEMA_NAMES.has(safe.name)) failures.push("endpointName");
  if (safe.workers_min !== 0) failures.push("workersMin");
  if (!sameSet(safe.network_volume_ids, [VOLUME_ID])) failures.push("networkVolume");
  if (text(template.name) !== expectedName) failures.push("templateName");
  if (text(template.imageName) !== immutable) failures.push("immutableImage");
  if (template.isServerless !== true) failures.push("isServerless");
  if (text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V_MODEL) failures.push("t2vModel");
  if (text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V_MODEL) failures.push("i2vModel");
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== CACHE_ROOT) failures.push("cacheRoot");
  if (text(env.AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB) !== "400") failures.push("quota");
  if (text(env.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL) !== "0") failures.push("requireCached");
  if (text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) !== "__cache_only__") failures.push("cacheOnlyCapabilities");
  if (text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) !== "0") failures.push("certificationExecution");
  if (failures.length) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_TEMPLATE_INVALID:${failures.join(",")}`);
}

function probeValidation(job) {
  const output = object(job.output);
  const cache = object(output.cache_evidence);
  const usage = object(cache.usage);
  const fs = object(cache.filesystem_observation_only);
  const t2v = object(object(output.foundations).text_to_video);
  const i2v = object(object(output.foundations).image_to_video);
  const certified = list(output.certified_capabilities);
  const reasons = [];
  if (text(job.status).toUpperCase() !== "COMPLETED") reasons.push("jobStatus");
  if (text(output.probe_contract) !== RUNTIME_PROBE_CONTRACT) reasons.push("probeContract");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) reasons.push("engineContract");
  if (text(output.operation) !== "runtime_probe") reasons.push("operation");
  if (text(output.entrypoint) !== ENTRYPOINT) reasons.push("entrypoint");
  if (text(output.runtime_revision) !== RUNTIME_REVISION) reasons.push("runtimeRevision");
  if (text(output.configured_text_to_video_foundation) !== T2V_MODEL) reasons.push("t2vModel");
  if (text(output.configured_image_to_video_foundation) !== I2V_MODEL) reasons.push("i2vModel");
  if (output.require_cached_model !== false) reasons.push("requireCachedModel");
  if (certified.length !== 0) reasons.push("normalCapabilitiesNotFailClosed");
  if (text(cache.contract) !== CACHE_EVIDENCE_CONTRACT) reasons.push("cacheEvidenceContract");
  if (text(cache.hf_cache_root) !== CACHE_ROOT) reasons.push("cacheRoot");
  if (Number(cache.network_volume_quota_gb) !== 400) reasons.push("quotaGb");
  if (Number(cache.configured_quota_bytes) !== 400_000_000_000) reasons.push("quotaBytes");
  if (usage.root_present !== true) reasons.push("cacheRootNotPresent");
  if (!text(fs.probe_path).startsWith("/runpod-volume")) reasons.push("filesystemProbeOutsideNetworkVolume");
  if (text(t2v.model) !== T2V_MODEL) reasons.push("t2vStateModel");
  if (text(i2v.model) !== I2V_MODEL) reasons.push("i2vStateModel");
  if (output.generation_requested !== false) reasons.push("generationRequested");
  if (output.inference_performed !== false) reasons.push("inferencePerformed");
  if (output.model_download_performed !== false) reasons.push("modelDownloadPerformed");
  if (output.storage_mutation_performed !== false) reasons.push("storageMutationPerformed");
  if (output.raw_reasoning_persisted !== false) reasons.push("rawReasoningPersisted");
  const free = finite(cache.physical_free_bytes_under_configured_quota, -1);
  const minimum = finite(cache.minimum_free_bytes_before_model_download, -1);
  if (t2v.cache_ready !== true && (free < 0 || minimum < 0 || free < minimum)) reasons.push("physicalFreeSpace");
  return {
    valid: reasons.length === 0,
    reasons,
    target_already_cached: t2v.cache_ready === true,
    target_snapshot_revision: text(t2v.snapshot_revision) || null,
    cache_physical_bytes_before: finite(usage.physical_bytes, null),
    cache_physical_free_bytes_before: finite(cache.physical_free_bytes_under_configured_quota, null),
    minimum_free_bytes_before_download: finite(cache.minimum_free_bytes_before_model_download, null),
    filesystem_probe_path: text(fs.probe_path) || null,
  };
}

function cacheValidation(job) {
  const output = object(job.output);
  const after = object(output.cache_evidence_after);
  const usage = object(after.usage);
  const reasons = [];
  if (text(job.status).toUpperCase() !== "COMPLETED") reasons.push("jobStatus");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) reasons.push("engineContract");
  if (text(output.operation) !== "cache_foundation_model") reasons.push("operation");
  if (text(output.runtime_revision) !== RUNTIME_REVISION) reasons.push("runtimeRevision");
  if (text(output.target_model) !== T2V_MODEL) reasons.push("targetModel");
  if (output.cache_ready !== true) reasons.push("cacheReady");
  if (text(output.cache_completion_contract) !== CACHE_COMPLETION_CONTRACT) reasons.push("completionContract");
  if (!text(output.snapshot_revision)) reasons.push("snapshotRevision");
  if (output.generation_requested !== false) reasons.push("generationRequested");
  if (output.inference_performed !== false) reasons.push("inferencePerformed");
  if (output.raw_reasoning_persisted !== false) reasons.push("rawReasoningPersisted");
  const already = output.already_cached === true;
  if (already && output.model_download_performed !== false) reasons.push("alreadyCachedDownloadFlag");
  if (already && output.storage_mutation_performed !== false) reasons.push("alreadyCachedStorageFlag");
  if (!already && output.model_download_performed !== true) reasons.push("downloadFlag");
  if (!already && output.storage_mutation_performed !== true) reasons.push("storageMutationFlag");
  if (text(after.contract) !== CACHE_EVIDENCE_CONTRACT) reasons.push("cacheEvidenceContract");
  if (text(after.hf_cache_root) !== CACHE_ROOT) reasons.push("cacheRoot");
  if (Number(after.network_volume_quota_gb) !== 400) reasons.push("quotaGb");
  if (usage.root_present !== true) reasons.push("cacheRootNotPresent");
  return {
    valid: reasons.length === 0,
    reasons,
    already_cached: already,
    model_download_performed: output.model_download_performed === true,
    storage_mutation_performed: output.storage_mutation_performed === true,
    snapshot_revision: text(output.snapshot_revision) || null,
    cache_physical_bytes_after: finite(usage.physical_bytes, null),
    cache_physical_free_bytes_after: finite(after.physical_free_bytes_under_configured_quota, null),
  };
}

function terminalStatus(status) {
  return ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}

async function waitForJob(endpointId, jobId, key, label, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastStatus = "";
  while (Date.now() <= deadline) {
    const job = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
    const status = text(job.status).toUpperCase();
    if (terminalStatus(status)) return job;
    if (status !== lastStatus || Date.now() % 60_000 < POLL_MS) {
      const health = healthSummary(await queueRequest(endpointId, "/health", key));
      console.log(`AVANTIQO_VIDEO_T2V_CACHE_${label}_PROGRESS status=${status || "UNKNOWN"} health=${JSON.stringify(health)}`);
      lastStatus = status;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_WAIT_TIMEOUT:${jobId}`);
}

async function submitRun(endpointId, key, input, label, waitMs) {
  const deadline = Date.now() + UNPAUSE_WAIT_MS;
  let submitted = null;
  let retries = 0;
  while (Date.now() <= deadline) {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) {
      submitted = body || {};
      break;
    }
    const code = text(body?.code).toUpperCase();
    if (response.status === 409 && code === "ENDPOINT_PAUSED") {
      retries += 1;
      if (retries === 1 || retries % 10 === 0) {
        console.log(`AVANTIQO_VIDEO_T2V_CACHE_${label}_UNPAUSE_WAIT=true retries=${retries}`);
      }
      await sleep(1_500);
      continue;
    }
    throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_RUN_HTTP_${response.status}:${redact(text(body?.message || body?.error || raw)).slice(0, 1000)}`);
  }
  if (!submitted) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_UNPAUSE_TIMEOUT`);
  const status = text(submitted.status).toUpperCase();
  if (status === "COMPLETED") return { job: submitted, jobId: text(submitted.id) || null };
  const jobId = text(submitted.id);
  if (!jobId) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_JOB_ID_REQUIRED`);
  console.log(`AVANTIQO_VIDEO_T2V_CACHE_${label}_JOB=${jobId}`);
  const job = await waitForJob(endpointId, jobId, key, label, waitMs);
  return { job, jobId };
}

async function waitForEndpoint(endpointId, key, predicate, label, waitMs = 90_000) {
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() <= deadline) {
    const raw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", key);
    const endpoints = normalizeList(raw, ["endpoints", "serverlessEndpoints"]);
    if (!endpoints) throw new Error(`${label}_ENDPOINT_LIST_INVALID`);
    const endpoint = endpoints.find((entry) => text(entry.id) === endpointId);
    if (!endpoint) throw new Error(`${label}_ENDPOINT_NOT_FOUND`);
    last = endpoint;
    if (predicate(endpoint)) return endpoint;
    await sleep(1_500);
  }
  throw new Error(`${label}_WAIT_TIMEOUT:last=${JSON.stringify(safeEndpoint(last || {}))}`);
}

async function waitForDrain(endpointId, key, label) {
  const deadline = Date.now() + DRAIN_WAIT_MS;
  let last = null;
  while (Date.now() <= deadline) {
    const health = healthSummary(await queueRequest(endpointId, "/health", key));
    last = health;
    if (health.jobs.in_queue === 0 && health.jobs.in_progress === 0 && activeQueueWorkers(health) === 0) return health;
    await sleep(3_000);
  }
  throw new Error(`${label}_DRAIN_TIMEOUT:${JSON.stringify(last)}`);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_VIDEO_WAN22_T2V_CACHE_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_T2V_CACHE_APPROVED=YES_REQUIRED");
}

const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED");
const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
const { immutable: videoImmutable, sourceSha } = validateEvidence(evidence);
assertSourceEquivalent(sourceSha);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);
const expectedCacheTemplateName = `avantiqo-video-cache-v3-${text(evidence.image_digest).replace("sha256:", "").slice(0, 12)}`;

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(
  initial.endpoints,
  text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID),
  new Set([IMAGE_NAME]),
  "AVANTIQO_VIDEO_T2V_CACHE_IMAGE",
);
const cinema = resolveEndpoint(
  initial.endpoints,
  text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID),
  CINEMA_NAMES,
  "AVANTIQO_VIDEO_T2V_CACHE_CINEMA",
);
const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_T2V_CACHE_IMAGE");
const cinemaTemplate = resolveTemplate(initial.templates, text(cinema.templateId || cinema.template?.id), "AVANTIQO_VIDEO_T2V_CACHE_CINEMA");
validateImageLive(image, imageTemplate, imageImmutable);
validateCacheTemplate(cinema, cinemaTemplate, videoImmutable, expectedCacheTemplateName);
if (finite(cinema.workersMin) !== 0 || finite(cinema.workersMax) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_CINEMA_MUST_START_DISABLED:min=${finite(cinema.workersMin)}:max=${finite(cinema.workersMax)}`);
}
const originalCinema = safeEndpoint(cinema);
const stableCinemaBaseline = stableCinemaExceptTemporary(cinema);
const originalTimeoutMs = finite(cinema.executionTimeoutMs ?? cinema.executionTimeout);
if (!Number.isFinite(originalTimeoutMs) || originalTimeoutMs <= 0) {
  throw new Error("AVANTIQO_VIDEO_T2V_CACHE_ORIGINAL_EXECUTION_TIMEOUT_INVALID");
}

const queueCredential = await selectQueueCredential(text(cinema.id), [
  text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)
    ? { source: "RUNPOD_AVANTIQO_VIDEO_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) }
    : null,
  text(process.env.RUNPOD_API_KEY)
    ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) }
    : null,
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
]);
const initialHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));
assertCinemaFullyQuiescent(initialHealth, "AVANTIQO_VIDEO_T2V_CACHE_INITIAL_CINEMA");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  immutable_v3: {
    image: videoImmutable,
    source_sha: sourceSha,
    source_equivalent_to_current_main: true,
    cache_template_id: text(cinemaTemplate.id),
    cache_template_name: text(cinemaTemplate.name),
    normal_generation_fail_closed: true,
  },
  shared_volume: {
    id: text(volume.id),
    name: text(volume.name),
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId),
    runtime_cache_root: CACHE_ROOT,
  },
  image_v9: {
    preserved: true,
    endpoint_mutation_planned: false,
    template_mutation_planned: false,
  },
  cinema: {
    endpoint: originalCinema,
    temporary_workers_max: 1,
    temporary_execution_timeout_ms: CACHE_EXECUTION_TIMEOUT_MS,
    final_workers_max: 0,
    final_execution_timeout_ms: originalTimeoutMs,
  },
  controlled_jobs: {
    runtime_probe: 1,
    t2v_cache_fill_maximum: 1,
    video_generation: 0,
    inference: 0,
    target_model: T2V_MODEL,
  },
  queue_credential_source: queueCredential.source,
  queue_health: initialHealth,
  safety: {
    normal_generation_fail_closed: true,
    i2v_download_requested: false,
    video_generation_submitted: false,
    inference_performed: false,
    image_endpoint_mutation: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
  next_action: apply ? "RUN_RUNTIME_PROBE_THEN_T2V_A14B_CACHE_FILL" : "APPROVE_T2V_A14B_CACHE_FILL",
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_T2V_A14B_CACHE_APPLIED=false");
  process.exit(0);
}

let activeJobId = null;
let timeoutChangedByThisScript = false;
let workerEnabledByThisScript = false;
let timeoutConcurrentChangeDetected = false;
let probeJobId = null;
let cacheJobId = null;
let probeSummary = null;
let cacheSummary = null;

async function revalidateBeforeMutation(label) {
  const fresh = await inventory(managementKey);
  validateVolume(fresh.volumes);
  const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), `${label}_IMAGE`);
  const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), CINEMA_NAMES, `${label}_CINEMA`);
  const freshImageTemplate = resolveTemplate(fresh.templates, text(freshImage.templateId || freshImage.template?.id), `${label}_IMAGE`);
  const freshCinemaTemplate = resolveTemplate(fresh.templates, text(freshCinema.templateId || freshCinema.template?.id), `${label}_CINEMA`);
  validateImageLive(freshImage, freshImageTemplate, imageImmutable);
  validateCacheTemplate(freshCinema, freshCinemaTemplate, videoImmutable, expectedCacheTemplateName);
  if (JSON.stringify(stableCinemaExceptTemporary(freshCinema)) !== JSON.stringify(stableCinemaBaseline)) {
    throw new Error(`${label}_CINEMA_STABLE_FIELDS_CHANGED`);
  }
  const health = healthSummary(await queueRequest(text(freshCinema.id), "/health", queueCredential.key));
  assertNoActiveJobs(health, `${label}_CINEMA_HEALTH`);
  return { freshCinema, health };
}

async function restoreTemporaryState() {
  const endpointId = text(cinema.id);
  try {
    const current = await waitForEndpoint(endpointId, managementKey, () => true, "AVANTIQO_VIDEO_T2V_CACHE_RESTORE_READ", 15_000);
    if (finite(current.workersMax) !== 0) {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMax: 0 },
      });
      workerEnabledByThisScript = false;
    }
  } catch (error) {
    console.error(`AVANTIQO_VIDEO_T2V_CACHE_WORKER_DISABLE_FAILED=${redact(text(error?.message || error))}`);
  }

  try {
    await waitForDrain(endpointId, queueCredential.key, "AVANTIQO_VIDEO_T2V_CACHE_RESTORE");
  } catch (error) {
    console.error(`AVANTIQO_VIDEO_T2V_CACHE_DRAIN_FAILED=${redact(text(error?.message || error))}`);
  }

  if (timeoutChangedByThisScript) {
    try {
      const current = await waitForEndpoint(endpointId, managementKey, () => true, "AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_RESTORE_READ", 15_000);
      const currentTimeout = finite(current.executionTimeoutMs ?? current.executionTimeout);
      if (currentTimeout === CACHE_EXECUTION_TIMEOUT_MS) {
        await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
          method: "PATCH",
          body: { executionTimeoutMs: originalTimeoutMs },
        });
        timeoutChangedByThisScript = false;
      } else if (currentTimeout !== originalTimeoutMs) {
        timeoutConcurrentChangeDetected = true;
        console.error(`AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_RESTORE_SKIPPED_CONCURRENT_CHANGE:actual=${currentTimeout}`);
      } else {
        timeoutChangedByThisScript = false;
      }
    } catch (error) {
      console.error(`AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_RESTORE_FAILED=${redact(text(error?.message || error))}`);
    }
  }
}

try {
  const preTimeout = await revalidateBeforeMutation("AVANTIQO_VIDEO_T2V_CACHE_PRE_TIMEOUT");
  if (finite(preTimeout.freshCinema.workersMin) !== 0 || finite(preTimeout.freshCinema.workersMax) !== 0) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_SCALING_CHANGED_BEFORE_TIMEOUT_WRITE");
  }
  const liveTimeout = finite(preTimeout.freshCinema.executionTimeoutMs ?? preTimeout.freshCinema.executionTimeout);
  if (liveTimeout !== originalTimeoutMs) {
    throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_CHANGED_BEFORE_WRITE:expected=${originalTimeoutMs}:actual=${liveTimeout}`);
  }

  if (originalTimeoutMs < CACHE_EXECUTION_TIMEOUT_MS) {
    await rest(`/endpoints/${encodeURIComponent(text(cinema.id))}`, managementKey, {
      method: "PATCH",
      body: { executionTimeoutMs: CACHE_EXECUTION_TIMEOUT_MS },
    });
    timeoutChangedByThisScript = true;
    await waitForEndpoint(
      text(cinema.id),
      managementKey,
      (endpoint) => finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout) === CACHE_EXECUTION_TIMEOUT_MS,
      "AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_PROPAGATION",
    );
    console.log(`AVANTIQO_VIDEO_T2V_CACHE_TEMPORARY_EXECUTION_TIMEOUT_MS=${CACHE_EXECUTION_TIMEOUT_MS}`);
  }

  const preEnable = await revalidateBeforeMutation("AVANTIQO_VIDEO_T2V_CACHE_PRE_ENABLE");
  if (finite(preEnable.freshCinema.workersMin) !== 0 || finite(preEnable.freshCinema.workersMax) !== 0) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_SCALING_CHANGED_BEFORE_ENABLE");
  }
  const expectedTimeout = originalTimeoutMs < CACHE_EXECUTION_TIMEOUT_MS ? CACHE_EXECUTION_TIMEOUT_MS : originalTimeoutMs;
  if (finite(preEnable.freshCinema.executionTimeoutMs ?? preEnable.freshCinema.executionTimeout) !== expectedTimeout) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_NOT_READY_BEFORE_ENABLE");
  }

  await rest(`/endpoints/${encodeURIComponent(text(cinema.id))}`, managementKey, {
    method: "PATCH",
    body: { workersMax: 1 },
  });
  workerEnabledByThisScript = true;
  await waitForEndpoint(
    text(cinema.id),
    managementKey,
    (endpoint) => finite(endpoint.workersMin) === 0 && finite(endpoint.workersMax) === 1,
    "AVANTIQO_VIDEO_T2V_CACHE_WORKER_ENABLE_PROPAGATION",
  );
  console.log("AVANTIQO_VIDEO_T2V_CACHE_TEMPORARY_WORKERS_MAX=1");

  const probeRun = await submitRun(
    text(cinema.id),
    queueCredential.key,
    { contract: ENGINE_CONTRACT, operation: "runtime_probe" },
    "RUNTIME_PROBE",
    PROBE_WAIT_MS,
  );
  probeJobId = probeRun.jobId;
  activeJobId = probeJobId;
  if (text(probeRun.job.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_RUNTIME_PROBE_${text(probeRun.job.status).toUpperCase()}:${redact(text(probeRun.job.error || probeRun.job.output?.error))}`);
  }
  activeJobId = null;
  probeSummary = probeValidation(probeRun.job);
  if (!probeSummary.valid) {
    throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_RUNTIME_PROBE_VALIDATION_FAILED:${probeSummary.reasons.join(",")}`);
  }
  console.log(JSON.stringify({
    runtime_probe: "PASS",
    probe_job_id: probeJobId,
    target_already_cached: probeSummary.target_already_cached,
    target_snapshot_revision: probeSummary.target_snapshot_revision,
    cache_physical_bytes_before: probeSummary.cache_physical_bytes_before,
    cache_physical_free_bytes_before: probeSummary.cache_physical_free_bytes_before,
    minimum_free_bytes_before_download: probeSummary.minimum_free_bytes_before_download,
    filesystem_probe_path: probeSummary.filesystem_probe_path,
    generation_requested: false,
    inference_performed: false,
    model_download_performed: false,
  }, null, 2));

  const postProbeHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));
  assertNoActiveJobs(postProbeHealth, "AVANTIQO_VIDEO_T2V_CACHE_POST_PROBE");

  if (probeSummary.target_already_cached) {
    cacheSummary = {
      valid: true,
      already_cached: true,
      model_download_performed: false,
      storage_mutation_performed: false,
      snapshot_revision: probeSummary.target_snapshot_revision,
      cache_physical_bytes_after: probeSummary.cache_physical_bytes_before,
      cache_physical_free_bytes_after: probeSummary.cache_physical_free_bytes_before,
      cache_job_skipped_because_probe_verified_ready: true,
    };
    console.log("AVANTIQO_VIDEO_T2V_CACHE_DOWNLOAD_SKIPPED_ALREADY_READY=true");
  } else {
    const cacheRun = await submitRun(
      text(cinema.id),
      queueCredential.key,
      {
        contract: ENGINE_CONTRACT,
        operation: "cache_foundation_model",
        cache_authorization_contract: CACHE_AUTHORIZATION_CONTRACT,
        target_model: T2V_MODEL,
      },
      "T2V_A14B_CACHE",
      CACHE_WAIT_MS,
    );
    cacheJobId = cacheRun.jobId;
    activeJobId = cacheJobId;
    if (text(cacheRun.job.status).toUpperCase() !== "COMPLETED") {
      throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_JOB_${text(cacheRun.job.status).toUpperCase()}:${redact(text(cacheRun.job.error || cacheRun.job.output?.error))}`);
    }
    activeJobId = null;
    cacheSummary = cacheValidation(cacheRun.job);
    if (!cacheSummary.valid) {
      throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_RESULT_VALIDATION_FAILED:${cacheSummary.reasons.join(",")}`);
    }
  }

  await restoreTemporaryState();
  if (timeoutConcurrentChangeDetected) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_TIMEOUT_CONCURRENT_CHANGE_DETECTED");
  }

  const final = await inventory(managementKey);
  const finalVolume = validateVolume(final.volumes);
  const finalImage = resolveEndpoint(final.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_T2V_CACHE_FINAL_IMAGE");
  const finalCinema = resolveEndpoint(final.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_T2V_CACHE_FINAL_CINEMA");
  const finalImageTemplate = resolveTemplate(final.templates, text(finalImage.templateId || finalImage.template?.id), "AVANTIQO_VIDEO_T2V_CACHE_FINAL_IMAGE");
  const finalCinemaTemplate = resolveTemplate(final.templates, text(finalCinema.templateId || finalCinema.template?.id), "AVANTIQO_VIDEO_T2V_CACHE_FINAL_CINEMA");
  validateImageLive(finalImage, finalImageTemplate, imageImmutable);
  validateCacheTemplate(finalCinema, finalCinemaTemplate, videoImmutable, expectedCacheTemplateName);
  if (JSON.stringify(stableCinemaExceptTemporary(finalCinema)) !== JSON.stringify(stableCinemaBaseline)) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_FINAL_CINEMA_STABLE_FIELDS_CHANGED");
  }
  if (finite(finalCinema.workersMin) !== 0 || finite(finalCinema.workersMax) !== 0) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_FINAL_SCALING_NOT_DISABLED");
  }
  if (finite(finalCinema.executionTimeoutMs ?? finalCinema.executionTimeout) !== originalTimeoutMs) {
    throw new Error("AVANTIQO_VIDEO_T2V_CACHE_FINAL_TIMEOUT_NOT_RESTORED");
  }
  const finalHealth = healthSummary(await queueRequest(text(finalCinema.id), "/health", queueCredential.key));
  assertCinemaFullyQuiescent(finalHealth, "AVANTIQO_VIDEO_T2V_CACHE_FINAL_CINEMA");

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    main_sha: mainSha,
    target_model: T2V_MODEL,
    runtime_probe_job_id: probeJobId,
    cache_job_id: cacheJobId,
    t2v_cache_ready: true,
    already_cached_before_fill: probeSummary.target_already_cached,
    cache_job_skipped: cacheJobId === null,
    model_download_performed: cacheSummary.model_download_performed === true,
    storage_mutation_performed: cacheSummary.storage_mutation_performed === true,
    snapshot_revision: cacheSummary.snapshot_revision,
    cache_physical_bytes_before: probeSummary.cache_physical_bytes_before,
    cache_physical_bytes_after: cacheSummary.cache_physical_bytes_after,
    cache_physical_free_bytes_after: cacheSummary.cache_physical_free_bytes_after,
    shared_volume: {
      id: text(finalVolume.id),
      size_gb: finite(finalVolume.size ?? finalVolume.sizeGb),
      data_center_id: text(finalVolume.dataCenterId),
    },
    image_v9_preserved: true,
    cinema_cache_only_template_preserved: true,
    cinema_workers_min: finite(finalCinema.workersMin),
    cinema_workers_max: finite(finalCinema.workersMax),
    cinema_execution_timeout_restored_ms: finite(finalCinema.executionTimeoutMs ?? finalCinema.executionTimeout),
    normal_generation_fail_closed: true,
    video_generation_submitted: false,
    inference_performed: false,
    i2v_download_requested: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_in_output: false,
    next_action: "CACHE_WAN22_I2V_A14B_ON_SHARED_VOLUME",
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_T2V_A14B_CACHE_APPLIED=true");
} catch (error) {
  if (activeJobId) {
    try {
      await queueRequest(text(cinema.id), `/cancel/${encodeURIComponent(activeJobId)}`, queueCredential.key, { method: "POST" });
      console.error("AVANTIQO_VIDEO_T2V_CACHE_ACTIVE_JOB_CANCEL_REQUESTED=true");
    } catch (cancelError) {
      console.error(`AVANTIQO_VIDEO_T2V_CACHE_ACTIVE_JOB_CANCEL_FAILED=${redact(text(cancelError?.message || cancelError))}`);
    }
    activeJobId = null;
  }
  await restoreTemporaryState();
  console.error("AVANTIQO_VIDEO_T2V_CACHE_FAILURE_PARTIAL_SNAPSHOT_CERTIFIED=false");
  console.error("AVANTIQO_VIDEO_T2V_CACHE_FAILURE_RERUN_MAY_RESUME_SNAPSHOT=true");
  throw error;
}
