import { spawnSync } from "node:child_process";
import {
  classifyManagedVolumeName,
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_SHARED_POST_MOVE_CONTINUATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const CACHE_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const CACHE_TOTAL_TIMEOUT_MS = Math.max(
  10 * 60 * 1000,
  Number(process.env.AVANTIQO_IMAGE_POST_MOVE_CACHE_TIMEOUT_MS || 110 * 60 * 1000),
);
const CACHE_QUEUE_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.AVANTIQO_IMAGE_POST_MOVE_CACHE_QUEUE_TIMEOUT_MS || 10 * 60 * 1000),
);
const POLL_MS = 10_000;

const FULL_GPU_PATTERNS = Object.freeze([
  /RTX\s*PRO\s*6000/i,
  /H100.*NVL|NVL.*H100/i,
  /\bH100\b/i,
  /\bH200\b/i,
  /\bB200\b/i,
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function command(commandName, args, errorCode) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${errorCode}:${text(result.stderr || result.stdout).slice(0, 1200) || `exit=${result.status}`}`,
    );
  }
  return text(result.stdout);
}

function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_POST_MOVE_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_POST_MOVE_BRANCH_READ_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_IMAGE_POST_MOVE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_POST_MOVE_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_POST_MOVE_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`AVANTIQO_IMAGE_POST_MOVE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }
  return head;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: list(endpoint?.dataCenterIds),
    gpu_type_ids: list(endpoint?.gpuTypeIds),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}

function validFullGpuType(gpuTypeId) {
  const label = text(gpuTypeId);
  return Boolean(label) && !/\bMIG\b/i.test(label) && FULL_GPU_PATTERNS.some((pattern) => pattern.test(label));
}

function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
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

function activeExecution(counters) {
  // Warm idle/ready workers are available capacity, not active work.
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    counters.workers.initializing +
    counters.workers.running +
    counters.workers.throttled +
    counters.workers.unhealthy
  );
}

function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}

function strictCacheValid(job = {}) {
  const output = object(job.output);
  const integrity = object(output.cache_integrity);
  return (
    text(output.target_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(integrity.contract) === CACHE_COMPLETION_CONTRACT &&
    integrity.completion_marker_valid === true &&
    Array.isArray(integrity.missing_required_files) &&
    integrity.missing_required_files.length === 0
  );
}

function immutableEvidence() {
  const raw = command(
    "git",
    ["show", `origin/main:${IMAGE_EVIDENCE_PATH}`],
    "AVANTIQO_IMAGE_POST_MOVE_EVIDENCE_READ_FAILED",
  );
  let evidence = null;
  try {
    evidence = JSON.parse(raw);
  } catch {
    throw new Error("AVANTIQO_IMAGE_POST_MOVE_EVIDENCE_JSON_INVALID");
  }
  if (
    evidence?.success !== true ||
    text(evidence?.contract) !== IMAGE_EVIDENCE_CONTRACT ||
    text(evidence?.entrypoint) !== "handler_v3.py" ||
    evidence?.image_generation_submitted !== false ||
    evidence?.provider_job_submitted !== false ||
    evidence?.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_POST_MOVE_EVIDENCE_INVALID");
  }
  const image = text(evidence?.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_POST_MOVE_IMMUTABLE_IMAGE_INVALID");
  }
  return { image, source_sha: text(evidence?.source_sha) || null };
}

async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`,
    );
  }
  return body;
}

async function rest(path, key, options = {}) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "RUNPOD_REST",
  );
}

async function queueRequest(endpointId, path, key, options = {}) {
  return parseResponse(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "RUNPOD_QUEUE",
  );
}

async function endpointBoundTemplates(key) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_IMAGE_POST_MOVE_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_IMAGE_POST_MOVE_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    }
    return matches[0];
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_POST_MOVE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_POST_MOVE_TEMPLATE_ID_REQUIRED");
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length) return inline;
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_POST_MOVE_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}

function endpointUsers(endpoints, volumeId) {
  return array(endpoints)
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
}

function runProbe() {
  console.log("AVANTIQO_IMAGE_POST_MOVE_PROBE_START=true");
  const result = spawnSync(
    process.execPath,
    ["scripts/probe-avantiqo-image-runtime-local.mjs"],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_POST_MOVE_PROBE_FAILED:exit=${result.status ?? "UNKNOWN"}`);
  }
  console.log("AVANTIQO_IMAGE_POST_MOVE_PROBE_COMPLETE=true");
}

async function cancelJob(endpointId, jobId, inferenceKey, reason) {
  try {
    await queueRequest(endpointId, `/cancel/${encodeURIComponent(jobId)}`, inferenceKey, { method: "POST" });
    console.log(`AVANTIQO_IMAGE_POST_MOVE_CACHE_CANCEL_REQUESTED=${jobId} reason=${reason}`);
  } catch (error) {
    console.error(`AVANTIQO_IMAGE_POST_MOVE_CACHE_CANCEL_FAILED=${jobId} error=${text(error?.message || error)}`);
  }
}

async function waitForCacheJob(endpointId, jobId, inferenceKey) {
  const startedAt = Date.now();
  let firstQueuedAt = null;
  let lastPrinted = 0;
  while (Date.now() - startedAt <= CACHE_TOTAL_TIMEOUT_MS) {
    const body = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return body;
    if (terminalFailure(status)) {
      throw new Error(`AVANTIQO_IMAGE_POST_MOVE_CACHE_${status}:${text(body?.error || body?.output?.error)}`);
    }
    if (status === "IN_QUEUE") {
      firstQueuedAt ||= Date.now();
      if (Date.now() - firstQueuedAt >= CACHE_QUEUE_TIMEOUT_MS) {
        await cancelJob(endpointId, jobId, inferenceKey, "QUEUE_TIMEOUT");
        throw new Error(`AVANTIQO_IMAGE_POST_MOVE_CACHE_QUEUE_TIMEOUT:${jobId}`);
      }
    } else {
      firstQueuedAt = null;
    }
    if (Date.now() - lastPrinted >= 30_000) {
      console.log(`AVANTIQO_IMAGE_POST_MOVE_CACHE_PROGRESS job=${jobId} status=${status || "UNKNOWN"}`);
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
  await cancelJob(endpointId, jobId, inferenceKey, "TOTAL_TIMEOUT");
  throw new Error(`AVANTIQO_IMAGE_POST_MOVE_CACHE_TOTAL_TIMEOUT:${jobId}`);
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED=YES_REQUIRED");
}

const mainSha = requireCurrentMain();
const evidence = immutableEvidence();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log(`AVANTIQO_IMAGE_POST_MOVE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_POST_MOVE_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_IMAGE_POST_MOVE_DATACENTER_PATCH_FIELD_USED=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_VOLUME_REBIND=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_GPU_REBIND=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_CODE_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_POST_MOVE_SECRETS_PRINTED=false");

const [endpoints, templates, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointBoundTemplates(managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_RUNPOD_LIST_INVALID");
}

const endpoint = resolveEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint.id);
const template = resolveTemplate(endpoint, templates);
if (text(template?.imageName) !== evidence.image) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_IMMUTABLE_BINDING_REQUIRED");
}

const attachedIds = endpointVolumeIds(endpoint);
if (attachedIds.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_POST_MOVE_EXACTLY_ONE_VOLUME_REQUIRED:count=${attachedIds.length}`);
}
const attachedVolume = volumes.find((volume) => text(volume?.id) === attachedIds[0]);
if (!attachedVolume) throw new Error("AVANTIQO_IMAGE_POST_MOVE_ATTACHED_VOLUME_NOT_FOUND");
if (
  text(attachedVolume?.name) !== SHARED_GROUP.canonical_name ||
  classifyManagedVolumeName(attachedVolume?.name)?.id !== SHARED_GROUP.id
) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_CANONICAL_IMAGE_VIDEO_VOLUME_REQUIRED");
}

const gpuTypeIds = list(endpoint?.gpuTypeIds);
if (!gpuTypeIds.length || gpuTypeIds.some((gpu) => !validFullGpuType(gpu))) {
  throw new Error(`AVANTIQO_IMAGE_POST_MOVE_FULL_80GB_PLUS_GPU_POOL_REQUIRED:${gpuTypeIds.join("|")}`);
}
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_POST_MOVE_SCALING_0_1_REQUIRED:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`,
  );
}
const originalTimeout = finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout);
if (!Number.isFinite(originalTimeout) || originalTimeout <= 0) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_EXECUTION_TIMEOUT_REQUIRED");
}

const health = healthCounters(await queueRequest(endpointId, "/health", inferenceKey));
if (activeExecution(health) !== 0) {
  throw new Error(`AVANTIQO_IMAGE_POST_MOVE_ENDPOINT_BUSY:${JSON.stringify(health)}`);
}

const legacyImageVolumes = groupCacheVolumes(volumes, SHARED_GROUP).filter(
  (volume) => text(volume?.id) !== text(attachedVolume?.id),
);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  immutable_image_source_sha: evidence.source_sha,
  endpoint: safeEndpoint(endpoint),
  canonical_attached_volume: safeVolume(attachedVolume),
  legacy_image_video_volumes_preserved_until_probe: legacyImageVolumes.map(safeVolume),
  current_health: health,
  cache_execution_timeout_ms: CACHE_EXECUTION_TIMEOUT_MS,
  original_execution_timeout_ms: originalTimeout,
  cache_queue_timeout_ms: CACHE_QUEUE_TIMEOUT_MS,
  cache_total_timeout_ms: CACHE_TOTAL_TIMEOUT_MS,
  datacenter_patch_field_used: false,
  volume_rebind: false,
  gpu_rebind: false,
  image_generation: false,
  inference_performed: false,
  code_volume_mutation: false,
  production_deploy: false,
  mutation_performed: false,
  next_action: apply ? "CACHE_CURRENT_CANONICAL_VOLUME_PROBE_RETIRE_LEGACY_SOURCE" : "RUN_WITH_RELOCATION_APPROVAL",
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_POST_MOVE_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

requireCurrentMain();
const freshEndpoint = resolveEndpoint(
  await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  endpointId,
);
if (!sameSet(endpointVolumeIds(freshEndpoint), [text(attachedVolume?.id)])) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_BINDING_CHANGED_REPLAN_REQUIRED");
}
if (!sameSet(list(freshEndpoint?.gpuTypeIds), gpuTypeIds)) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_GPU_POOL_CHANGED_REPLAN_REQUIRED");
}
const freshHealth = healthCounters(await queueRequest(endpointId, "/health", inferenceKey));
if (activeExecution(freshHealth) !== 0) {
  throw new Error(`AVANTIQO_IMAGE_POST_MOVE_ENDPOINT_BECAME_BUSY:${JSON.stringify(freshHealth)}`);
}

let timeoutRaised = false;
let cacheJobId = null;
let cacheResult = null;
try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { executionTimeoutMs: CACHE_EXECUTION_TIMEOUT_MS },
  });
  timeoutRaised = true;
  const raised = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (
    !sameSet(endpointVolumeIds(raised), [text(attachedVolume?.id)]) ||
    !sameSet(list(raised?.gpuTypeIds), gpuTypeIds) ||
    finite(raised?.executionTimeoutMs ?? raised?.executionTimeout) !== CACHE_EXECUTION_TIMEOUT_MS
  ) {
    throw new Error("AVANTIQO_IMAGE_POST_MOVE_TIMEOUT_ONLY_PATCH_VERIFY_FAILED");
  }

  const submit = await queueRequest(endpointId, "/run", inferenceKey, {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        operation: "cache_foundation_model",
        target_model: TARGET_MODEL,
      },
    },
  });
  cacheJobId = text(submit?.id);
  const submitStatus = text(submit?.status).toUpperCase();
  if (submitStatus === "COMPLETED") {
    cacheResult = submit;
  } else {
    if (!cacheJobId) {
      throw new Error(`AVANTIQO_IMAGE_POST_MOVE_CACHE_JOB_ID_MISSING:status=${submitStatus || "UNKNOWN"}`);
    }
    console.log(`AVANTIQO_IMAGE_POST_MOVE_CACHE_JOB_SUBMITTED=${cacheJobId}`);
    cacheResult = await waitForCacheJob(endpointId, cacheJobId, inferenceKey);
  }
  if (!strictCacheValid(cacheResult)) {
    console.log(JSON.stringify(cacheResult?.output || {}, null, 2));
    throw new Error("AVANTIQO_IMAGE_POST_MOVE_CACHE_STRICT_VALIDATION_FAILED");
  }
  console.log(`AVANTIQO_IMAGE_POST_MOVE_CACHE_READY=YES already_cached=${cacheResult?.output?.already_cached === true}`);
} finally {
  if (timeoutRaised) {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { executionTimeoutMs: originalTimeout },
    });
    const restored = await rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    if (
      !sameSet(endpointVolumeIds(restored), [text(attachedVolume?.id)]) ||
      !sameSet(list(restored?.gpuTypeIds), gpuTypeIds) ||
      finite(restored?.executionTimeoutMs ?? restored?.executionTimeout) !== originalTimeout
    ) {
      throw new Error("AVANTIQO_IMAGE_POST_MOVE_TIMEOUT_RESTORE_VERIFY_FAILED");
    }
    console.log("AVANTIQO_IMAGE_POST_MOVE_EXECUTION_TIMEOUT_RESTORED=true");
  }
}

runProbe();
requireCurrentMain();
const finalEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const finalImage = resolveEndpoint(finalEndpoints, endpointId);
if (!sameSet(endpointVolumeIds(finalImage), [text(attachedVolume?.id)])) {
  throw new Error("AVANTIQO_IMAGE_POST_MOVE_FINAL_CANONICAL_BINDING_LOST");
}

const retirement = [];
for (const legacyVolume of legacyImageVolumes) {
  const legacyId = text(legacyVolume?.id);
  const users = endpointUsers(finalEndpoints, legacyId);
  if (users.length) {
    retirement.push({ volume: safeVolume(legacyVolume), deleted: false, users });
    continue;
  }
  await rest(`/networkvolumes/${encodeURIComponent(legacyId)}`, managementKey, { method: "DELETE" });
  retirement.push({ volume: safeVolume(legacyVolume), deleted: true, users: [] });
  console.log(`AVANTIQO_IMAGE_POST_MOVE_LEGACY_IMAGE_VOLUME_DELETED=${legacyId}`);
}

const finalVolumes = await rest("/networkvolumes", managementKey);
const allRetired = retirement.every((entry) => entry.deleted === true);
console.log("AVANTIQO_IMAGE_SHARED_POST_MOVE_CONTINUATION=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  success: allRetired,
  mode: "APPLY",
  mutation_performed: true,
  cache_job_id: cacheJobId,
  cache_ready: true,
  cache_already_ready: cacheResult?.output?.already_cached === true,
  runtime_probe_passed: true,
  endpoint_after: safeEndpoint(finalImage),
  legacy_volume_retirement: retirement,
  final_shared_policy: sharedVolumePolicySummary(finalVolumes),
  image_generation: false,
  inference_performed: false,
  code_volume_mutation: false,
  production_deploy: false,
  next_action: allRetired ? "RUN_ONE_IMAGE_QUALITY_CERTIFICATION" : "LEGACY_IMAGE_VOLUME_STILL_IN_USE_REVIEW_BEFORE_DELETE",
}, null, 2));
if (!allRetired) process.exitCode = 2;
