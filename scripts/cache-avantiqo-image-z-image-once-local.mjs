import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_CACHE_ONCE_V1";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const CACHE_OPERATION = "cache_foundation_model";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";
const ENDPOINT_NAME = "avantiqo-image-v1";
const SOURCE_PATH = "services/avantiqo-image-engine";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V3";
const EXPECTED_ENTRYPOINT = "handler_v5.py";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_VOLUME_QUOTA_GUARD_V1";
const EXPECTED_QUOTA_GUARD = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const EXPECTED_VOLUME_GB = 160;
const EXPECTED_GPU_POOL = ["NVIDIA RTX PRO 6000 Blackwell Server Edition"];
const EXPECTED_IDLE_TIMEOUT_SECONDS = 10;
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const POLL_MS = 5000;
const MAX_WAIT_MS = Math.max(
  60_000,
  Math.min(
    30 * 60 * 1000,
    Number(process.env.AVANTIQO_IMAGE_Z_IMAGE_CACHE_TIMEOUT_MS || 25 * 60 * 1000),
  ),
);
const OUTPUT_PATH = "/tmp/avantiqo-image-z-image-cache-once.json";

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
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
function requireCurrentMain(label) {
  command("git", ["fetch", "origin", "main"], `${label}_FETCH_MAIN_FAILED`);
  const branch = command("git", ["branch", "--show-current"], `${label}_BRANCH_READ_FAILED`);
  if (branch !== "main") throw new Error(`${label}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], `${label}_HEAD_READ_FAILED`);
  const origin = command("git", ["rev-parse", "origin/main"], `${label}_ORIGIN_READ_FAILED`);
  if (head !== origin) throw new Error(`${label}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  return head;
}
async function readJson(response, label) {
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
  return body ?? {};
}
async function rest(path, key) {
  return readJson(
    await fetch(`${REST_BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_REST",
  );
}
async function queue(endpointId, path, key, options = {}) {
  return readJson(
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
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_IMAGE_Z_CACHE_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint.template);
  const templateId = text(endpoint.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_Z_CACHE_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length && text(inline.imageName)) return inline;
  const matches = templates.filter((template) => text(template.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}
async function readEndpointState(endpointId, key) {
  const [endpoint, templates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, key),
    endpointBoundTemplates(key),
  ]);
  return { endpoint, template: resolveTemplate(endpoint, templates) };
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
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
function validateEvidence() {
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  const sourceSha = text(evidence.source_sha);
  if (
    evidence.success !== true ||
    text(evidence.contract) !== EVIDENCE_CONTRACT ||
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== text(evidence.trigger_sha) ||
    text(evidence.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence.runtime_revision) !== EXPECTED_RUNTIME ||
    text(evidence.volume_quota_guard_contract) !== EXPECTED_QUOTA_GUARD ||
    evidence.backing_filesystem_capacity_used_for_decision !== false ||
    text(evidence.photoreal_candidate_foundation) !== TARGET_MODEL ||
    evidence.automatic_production_routing_enabled !== false ||
    evidence.qwen_replaced !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_V5_EVIDENCE_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_IMMUTABLE_IMAGE_INVALID");
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_Z_CACHE_HEAD_READ_FAILED");
  const diff = commandStatus("git", ["diff", "--quiet", sourceSha, head, "--", SOURCE_PATH]);
  if (diff.status === 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_SOURCE_CHANGED_AFTER_BUILD:source=${sourceSha}:head=${head}`);
  }
  if (diff.status !== 0) throw new Error("AVANTIQO_IMAGE_Z_CACHE_SOURCE_EQUIVALENCE_CHECK_FAILED");
  return { evidence, sourceSha, image };
}
function validateEndpoint(endpoint, template, expectedImage, volumeId) {
  const gpuPool = unique(list(endpoint.gpuTypeIds));
  if (!sameSet(gpuPool, EXPECTED_GPU_POOL)) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_GPU_POOL_INVALID:${gpuPool.join("|")}`);
  }
  if (finite(endpoint.idleTimeout) !== EXPECTED_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_IDLE_TIMEOUT_INVALID:${finite(endpoint.idleTimeout)}`);
  }
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 1) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_SCALING_INVALID:min=${finite(endpoint.workersMin)}:max=${finite(endpoint.workersMax)}`);
  }
  if (text(template.imageName) !== expectedImage) {
    throw new Error(
      `AVANTIQO_IMAGE_Z_CACHE_V5_BINDING_INVALID:live=${text(template.imageName) || "NONE"}:expected=${expectedImage}`,
    );
  }
  const quota = finite(normalizeEnv(template.env).AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB);
  if (quota !== EXPECTED_VOLUME_GB) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_QUOTA_ENV_INVALID:${quota}`);
  }
  const attached = endpointVolumeIds(endpoint);
  if (attached.length !== 1 || attached[0] !== volumeId) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_VOLUME_ATTACHMENT_INVALID:${attached.join("|") || "NONE"}`);
  }
  if (unique(list(endpoint.dataCenterIds)).length !== 0) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_DATACENTER_PINNING_FORBIDDEN");
  }
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}
function validateOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_OUTPUT_INVALID");
  }
  if (text(output.status).toLowerCase() !== "completed") {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_OUTPUT_STATUS_INVALID:${text(output.status)}`);
  }
  if (text(output.engine_contract) !== ENGINE_CONTRACT) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_ENGINE_CONTRACT_MISMATCH");
  }
  if (text(output.runtime_revision) !== EXPECTED_RUNTIME) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_RUNTIME_MISMATCH:${text(output.runtime_revision)}`);
  }
  if (text(output.operation) !== CACHE_OPERATION || text(output.target_model) !== TARGET_MODEL) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_OPERATION_MISMATCH");
  }
  if (output.inference_performed !== false || output.generation_requested !== false) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_UNEXPECTED_INFERENCE_OR_GENERATION");
  }
  const storage = object(output.cache_storage);
  if (text(storage.quota_guard_contract) !== EXPECTED_QUOTA_GUARD) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_QUOTA_GUARD_MISSING");
  }
  if (finite(storage.network_volume_quota_gb) !== EXPECTED_VOLUME_GB) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_RUNTIME_QUOTA_INVALID:${finite(storage.network_volume_quota_gb)}`);
  }
  if (storage.backing_filesystem_capacity_used_for_decision !== false) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_BACKING_FS_DECISION_FORBIDDEN");
  }
  if (output.storage_insufficient === true) {
    if (output.cache_ready !== false || output.deletion_performed !== false || output.automatic_delete_allowed !== false) {
      throw new Error("AVANTIQO_IMAGE_Z_CACHE_INSUFFICIENT_STORAGE_SAFETY_INVALID");
    }
    return { result: "STORAGE_INSUFFICIENT", cacheReady: false, storage };
  }
  if (output.cache_ready !== true) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_COMPLETION_NOT_READY");
  }
  const integrity = object(output.cache_integrity);
  if (
    text(integrity.contract) !== "AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1" ||
    integrity.completion_marker_valid !== true ||
    list(integrity.missing_required_files).length !== 0 ||
    !text(integrity.snapshot_revision)
  ) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_INTEGRITY_INVALID");
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

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const plannedMain = requireCurrentMain("AVANTIQO_IMAGE_Z_CACHE");
const local = validateEvidence();

console.log(`AVANTIQO_IMAGE_Z_CACHE_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_MODE=${resumeJobId ? "RESUME" : "APPLY"}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_TARGET_MODEL=${TARGET_MODEL}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_EXPECTED_VOLUME_GB=${EXPECTED_VOLUME_GB}`);
console.log("AVANTIQO_IMAGE_Z_CACHE_SINGLE_SUBMISSION=true");
console.log("AVANTIQO_IMAGE_Z_CACHE_AUTOMATIC_RETRY=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_AUTOMATIC_DELETE=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_GENERATION=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_INFERENCE=false");
console.log(`AVANTIQO_IMAGE_Z_CACHE_MODEL_DOWNLOAD=${resumeJobId ? "UNKNOWN_EXISTING_JOB" : "APPROVED_ONCE"}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_STORAGE_MUTATION=${resumeJobId ? "UNKNOWN_EXISTING_JOB" : "APPROVED_CACHE_ONLY"}`);
console.log("AVANTIQO_IMAGE_Z_CACHE_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_PRODUCTION_DEPLOY=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_Z_CACHE_INVENTORY_INVALID");
}

const endpointMatches = configuredEndpointId
  ? endpoints.filter(
      (endpoint) => text(endpoint.id) === configuredEndpointId && text(endpoint.name) === ENDPOINT_NAME,
    )
  : endpoints.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_Z_CACHE_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
}
const endpointId = text(endpointMatches[0].id);
const state = await readEndpointState(endpointId, managementKey);

const policy = sharedVolumePolicySummary(volumes);
console.log(`AVANTIQO_IMAGE_Z_CACHE_GLOBAL_SHARED_POLICY_COMPLIANT=${policy.policy_compliant ? "true" : "false"}`);
const groupVolumes = groupCacheVolumes(volumes, GROUP);
if (groupVolumes.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_Z_CACHE_IMAGE_VIDEO_VOLUME_COUNT_INVALID:${groupVolumes.length}`);
}
const volume = groupVolumes[0];
if (
  text(volume.name) !== GROUP.canonical_name ||
  finite(volume.size) !== EXPECTED_VOLUME_GB ||
  !text(volume.id) ||
  !text(volume.dataCenterId)
) {
  throw new Error(
    `AVANTIQO_IMAGE_Z_CACHE_VOLUME_INVALID:name=${text(volume.name)}:size=${finite(volume.size)}:dc=${text(volume.dataCenterId)}`,
  );
}
validateEndpoint(state.endpoint, state.template, local.image, text(volume.id));

const initialHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (!resumeJobId && (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0)) {
  throw new Error(
    `AVANTIQO_IMAGE_Z_CACHE_EXISTING_JOB_BLOCKED:in_queue=${initialHealth.jobs.in_queue}:in_progress=${initialHealth.jobs.in_progress}`,
  );
}
if (!resumeJobId && (initialHealth.workers.running || initialHealth.workers.throttled || initialHealth.workers.unhealthy)) {
  throw new Error(
    `AVANTIQO_IMAGE_Z_CACHE_WORKER_STATE_BLOCKED:running=${initialHealth.workers.running}:throttled=${initialHealth.workers.throttled}:unhealthy=${initialHealth.workers.unhealthy}`,
  );
}

console.log(`AVANTIQO_IMAGE_Z_CACHE_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_IMMUTABLE_IMAGE=${local.image}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_VOLUME_ID=${text(volume.id)}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_INITIAL_HEALTH=${JSON.stringify(initialHealth)}`);

let jobId = resumeJobId;
let submitted = false;
let statusBody = null;

if (resumeJobId) {
  statusBody = await queue(endpointId, `/status/${encodeURIComponent(resumeJobId)}`, inferenceKey);
} else {
  const currentMain = requireCurrentMain("AVANTIQO_IMAGE_Z_CACHE_BEFORE_SUBMIT");
  if (currentMain !== plannedMain) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_MAIN_MOVED_REPLAN_REQUIRED:planned=${plannedMain}:current=${currentMain}`);
  }
  const fresh = await readEndpointState(endpointId, managementKey);
  validateEndpoint(fresh.endpoint, fresh.template, local.image, text(volume.id));
  const freshHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
  if (freshHealth.jobs.in_queue !== 0 || freshHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_IMAGE_Z_CACHE_CONCURRENT_JOB_DETECTED_BEFORE_SUBMIT");
  }

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
    throw new Error(
      `AVANTIQO_IMAGE_Z_CACHE_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 800)}`,
    );
  }
  jobId = text(submittedBody.id);
  if (!jobId) throw new Error("AVANTIQO_IMAGE_Z_CACHE_JOB_ID_MISSING_DO_NOT_RETRY_AUTOMATICALLY");
  submitted = true;
  statusBody = submittedBody;
  console.log(`AVANTIQO_IMAGE_Z_CACHE_JOB_ID=${jobId}`);
  console.log("AVANTIQO_IMAGE_Z_CACHE_SUBMITTED_ONCE=YES");
}

const startedAt = Date.now();
let lastStatus = "";
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(statusBody?.status).toUpperCase();
  if (status !== lastStatus) {
    console.log(`AVANTIQO_IMAGE_Z_CACHE_STATUS=${status || "UNKNOWN"}`);
    lastStatus = status;
  }
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) {
    throw new Error(
      `AVANTIQO_IMAGE_Z_CACHE_JOB_FAILED:job_id=${jobId}:status=${status}:error=${text(statusBody?.error).slice(0, 1200)}`,
    );
  }
  await sleep(POLL_MS);
  statusBody = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
}

if (text(statusBody?.status).toUpperCase() !== "COMPLETED") {
  throw new Error(
    `AVANTIQO_IMAGE_Z_CACHE_WAIT_TIMEOUT_RESUME_WITH_JOB_ID:job_id=${jobId}:command=node --env-file=.env.local ${process.argv[1]} --job-id=${jobId}`,
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
  snapshot_revision: result.snapshotRevision || null,
  execution_time_ms: finite(statusBody.executionTime),
  delay_time_ms: finite(statusBody.delayTime),
  worker_id: text(statusBody.workerId) || null,
  immutable_worker_image: local.image,
  network_volume: {
    id: text(volume.id),
    name: text(volume.name),
    size_gb: finite(volume.size),
    data_center_id: text(volume.dataCenterId),
  },
  cache_storage: result.storage,
  cost_guard: {
    gpu_pool: unique(list(state.endpoint.gpuTypeIds)),
    idle_timeout_seconds: finite(state.endpoint.idleTimeout),
    workers_min: finite(state.endpoint.workersMin),
    workers_max: finite(state.endpoint.workersMax),
  },
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
console.log(`AVANTIQO_IMAGE_Z_CACHE_OUTPUT=${OUTPUT_PATH}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_RESULT=${report.result}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_READY=${report.cache_ready ? "YES" : "NO"}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_RUNTIME_QUOTA_GB=${finite(result.storage.network_volume_quota_gb)}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_MEASURED_CONTENT_BYTES=${finite(result.storage.measured_network_volume_content_bytes)}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_QUOTA_FREE_BYTES=${finite(result.storage.disk_free_bytes)}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_NEXT_ACTION=${report.next_action}`);
console.log("AVANTIQO_IMAGE_Z_CACHE_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
