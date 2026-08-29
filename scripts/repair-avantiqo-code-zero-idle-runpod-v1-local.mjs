import { spawnSync } from "node:child_process";
import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_ZERO_IDLE_RUNPOD_DEEP_REPAIR_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const IMAGE_SOURCE_SHA = "e1a688d73f506778c4d52a91e71030d74cdd3208";
const IMAGE_DIGEST = "sha256:4cbbea028c8bcfae7c955a1b42e90e089e1f0fc1169fd98bbace2670dae4d425";
const IMAGE_REPOSITORY = "ghcr.io/churchillkaron/avantiqo-code-worker";
const IMMUTABLE_IMAGE = `${IMAGE_REPOSITORY}@${IMAGE_DIGEST}`;
const APPROVAL_ENV = "AVANTIQO_CODE_ZERO_IDLE_RUNPOD_REPAIR_V1_APPROVED";
const ORPHAN_JOB_ENV = "AVANTIQO_CODE_ZERO_IDLE_ORPHAN_JOB_ID";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const REQUIRED_NETWORK_VOLUME_ID = "7obluigbr0";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const TARGET_ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);
const SERVERLESS_IMAGE_INPUTS = Object.freeze([
  "services/avantiqo-code-engine/Dockerfile.runpod",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/serverless_boot.py",
  "services/avantiqo-code-engine/requirements.txt",
]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const upper = (value) => text(value).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1000) || `exit=${result.status}`}`);
  }
  return text(result.stdout, 100000);
}

function sourceGate() {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`).toLowerCase();
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_ORIGIN_MAIN`);
  const changedInputs = command(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", ...SERVERLESS_IMAGE_INPUTS],
    `${CONTRACT}_SOURCE_DIFF_FAILED`,
  ).split("\n").map((value) => value.trim()).filter(Boolean);
  if (changedInputs.length) {
    throw new Error(`${CONTRACT}_SERVERLESS_IMAGE_INPUT_MOVED:${changedInputs.join(",")}`);
  }
  return originMain;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    const error = new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error || body?.message || raw, 1000) || "UNKNOWN"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

async function rest(pathname, credential, { method = "GET", body = null } = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queue(pathname, credential, { method = "GET" } = {}) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_QUEUE`);
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const rows = normalizeRows(value[key], keys, depth + 1);
    if (rows.length || Array.isArray(value[key])) return rows;
  }
  return [];
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function healthSummary(body = {}) {
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

function activeWorkerCount(summary) {
  return Object.values(summary.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
}

function endpointSnapshot(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    idle_timeout_seconds: finite(endpoint.idleTimeout, -1),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || upper(endpoint.flashBootType) === "FLASHBOOT",
    scaler_type: upper(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue, null),
    network_volume_id: text(endpoint.networkVolumeId || endpoint.network_volume_id) || null,
    network_volume_ids: list(endpoint.networkVolumeIds),
    data_center_ids: Array.isArray(endpoint.dataCenterIds)
      ? endpoint.dataCenterIds
      : text(endpoint.dataCenterIds).split(",").map((item) => item.trim()).filter(Boolean),
    gpu_type_ids: list(endpoint.gpuTypeIds),
    gpu_count: finite(endpoint.gpuCount, 1),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs, null),
  };
}

function templateUpdateBody(template) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 5)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName: IMMUTABLE_IMAGE,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme, 50000),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const authId = text(template.containerRegistryAuthId);
  if (authId) body.containerRegistryAuthId = authId;
  if (!body.name) throw new Error(`${CONTRACT}_TEMPLATE_NAME_REQUIRED`);
  return body;
}

function endpointPatchBody(endpoint) {
  const before = endpointSnapshot(endpoint);
  const body = {
    allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS],
    flashboot: true,
    gpuCount: Math.max(1, before.gpu_count || 1),
    gpuTypeIds: [...TARGET_GPU_TYPE_IDS],
    idleTimeout: before.idle_timeout_seconds > 0 ? before.idle_timeout_seconds : 60,
    minCudaVersion: "12.8",
    name: before.name || ENDPOINT_NAME,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    templateId: before.template_id,
    workersMax: 1,
    workersMin: 0,
  };
  if (before.execution_timeout_ms) body.executionTimeoutMs = before.execution_timeout_ms;
  if (before.network_volume_id) body.networkVolumeId = before.network_volume_id;
  if (before.network_volume_ids.length) body.networkVolumeIds = before.network_volume_ids;
  if (before.data_center_ids.length) body.dataCenterIds = before.data_center_ids;
  return body;
}

async function snapshot(managementKey, queueKey) {
  const [endpoint, healthRaw, templatesRaw, endpointsRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queue("/health", queueKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  ]);
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_MISMATCH`);
  }
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const templates = normalizeRows(templatesRaw, ["templates"]);
  const templateMatches = templates.filter((row) => text(row?.id) === templateId);
  if (templateMatches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${templateId}:${templateMatches.length}`);
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const consumers = endpoints.filter((row) => text(row?.templateId || row?.template?.id) === templateId);
  return {
    endpoint,
    endpoint_summary: endpointSnapshot(endpoint),
    health: healthSummary(healthRaw),
    template: templateMatches[0],
    consumers,
  };
}

async function cancelExactOrphan(jobId, queueKey) {
  if (!jobId) return { attempted: false, canceled: false, drained: false };
  await queue(`/cancel/${encodeURIComponent(jobId)}`, queueKey, { method: "POST" });
  const deadline = Date.now() + 60_000;
  let lastHealth = null;
  while (Date.now() < deadline) {
    await sleep(1500);
    lastHealth = healthSummary(await queue("/health", queueKey));
    if (lastHealth.jobs.in_queue === 0 && lastHealth.jobs.in_progress === 0) {
      return { attempted: true, canceled: true, drained: true, health: lastHealth };
    }
  }
  return { attempted: true, canceled: true, drained: false, health: lastHealth };
}

function assertIdle(snapshotValue, label) {
  if (snapshotValue.health.jobs.in_queue !== 0 || snapshotValue.health.jobs.in_progress !== 0) {
    throw new Error(`${label}_QUEUE_NOT_EMPTY:${JSON.stringify(snapshotValue.health.jobs)}`);
  }
  if (activeWorkerCount(snapshotValue.health) !== 0) {
    throw new Error(`${label}_WORKERS_NOT_ZERO:${JSON.stringify(snapshotValue.health.workers)}`);
  }
}

function assertBaseline(endpointSummary) {
  if (endpointSummary.workers_min !== 0 || endpointSummary.workers_max !== 1) {
    throw new Error(`${CONTRACT}_ZERO_IDLE_0_1_REQUIRED:${endpointSummary.workers_min}/${endpointSummary.workers_max}`);
  }
  if (!endpointSummary.flashboot) throw new Error(`${CONTRACT}_FLASHBOOT_REQUIRED`);
  if (endpointSummary.network_volume_id !== REQUIRED_NETWORK_VOLUME_ID) {
    throw new Error(`${CONTRACT}_EXPECTED_NETWORK_VOLUME_REQUIRED:${endpointSummary.network_volume_id || "NONE"}`);
  }
  if (!endpointSummary.template_id) throw new Error(`${CONTRACT}_TEMPLATE_REQUIRED`);
}

function targetAssessment(snapshotValue) {
  const endpoint = snapshotValue.endpoint_summary;
  const missingGpuTypes = TARGET_GPU_TYPE_IDS.filter((gpu) => !endpoint.gpu_type_ids.includes(gpu));
  return {
    image_current: text(snapshotValue.template.imageName) === IMMUTABLE_IMAGE,
    image_target: IMMUTABLE_IMAGE,
    scaler_current: { type: endpoint.scaler_type || null, value: endpoint.scaler_value },
    scaler_target: { type: "QUEUE_DELAY", value: 1 },
    gpu_pool_current: endpoint.gpu_type_ids,
    gpu_pool_target: [...TARGET_GPU_TYPE_IDS],
    missing_certified_gpu_types: missingGpuTypes,
    cuda_current: {
      minimum: endpoint.min_cuda_version,
      allowed: endpoint.allowed_cuda_versions,
    },
    cuda_target: {
      minimum: "12.8",
      allowed: [...TARGET_ALLOWED_CUDA_VERSIONS],
    },
    network_volume_preserved_for_this_repair: true,
    cached_model_migration_required_next: true,
    datacenter_availability_still_limited_by_network_volume: Boolean(endpoint.network_volume_id),
  };
}

const apply = process.argv.includes("--apply");
if (apply && upper(process.env[APPROVAL_ENV]) !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
if (!queueKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");
const orphanJobId = text(process.env[ORPHAN_JOB_ENV]);

const originMain = sourceGate();
let before = await snapshot(managementKey, queueKey);
assertBaseline(before.endpoint_summary);
const assessmentBefore = targetAssessment(before);

const resultBase = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  validated_origin_main: originMain,
  endpoint_id: ENDPOINT_ID,
  endpoint_before: before.endpoint_summary,
  health_before: before.health,
  template_before: {
    id: text(before.template.id),
    image_name: text(before.template.imageName),
    exclusive_to_code: before.consumers.length === 1 && text(before.consumers[0]?.id) === ENDPOINT_ID,
  },
  target_assessment_before: assessmentBefore,
  orphan_job_id_supplied: Boolean(orphanJobId),
  exact_orphan_cancel_only: true,
  generic_queue_purge_allowed: false,
  workers_min_target: 0,
  workers_max_target: 1,
  idle_gpu_cost_target: "ZERO_WHEN_NO_WORKER_RUNNING",
  flashboot_target: true,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify({
    ...resultBase,
    mutation_performed: false,
    next_action: `${APPROVAL_ENV}=YES ${ORPHAN_JOB_ENV}=<exact-job-id> --apply`,
  }, null, 2));
  process.exit(0);
}

if (before.consumers.length !== 1 || text(before.consumers[0]?.id) !== ENDPOINT_ID) {
  throw new Error(`${CONTRACT}_SHARED_TEMPLATE_BLOCKED:${before.consumers.length}`);
}

let orphanCleanup = { attempted: false, canceled: false, drained: false };
if (before.health.jobs.in_queue > 0 || before.health.jobs.in_progress > 0) {
  if (!orphanJobId) throw new Error(`${ORPHAN_JOB_ENV}_REQUIRED_FOR_NONEMPTY_QUEUE`);
  orphanCleanup = await cancelExactOrphan(orphanJobId, queueKey);
  if (!orphanCleanup.drained) {
    throw new Error(`${CONTRACT}_ORPHAN_QUEUE_DID_NOT_DRAIN:${JSON.stringify(orphanCleanup.health || {})}`);
  }
  before = await snapshot(managementKey, queueKey);
}
assertIdle(before, `${CONTRACT}_POST_ORPHAN_CLEANUP`);
assertBaseline(before.endpoint_summary);
sourceGate();

const templateImageChanged = text(before.template.imageName) !== IMMUTABLE_IMAGE;
if (templateImageChanged) {
  await rest(`/templates/${encodeURIComponent(text(before.template.id))}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(before.template),
  });
}

const patch = endpointPatchBody(before.endpoint);
await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
  method: "PATCH",
  body: patch,
});

await sleep(1000);
const after = await snapshot(managementKey, queueKey);
assertIdle(after, `${CONTRACT}_POST_REPAIR`);
const afterSummary = after.endpoint_summary;
if (afterSummary.workers_min !== 0 || afterSummary.workers_max !== 1) throw new Error(`${CONTRACT}_POST_REPAIR_0_1_FAILED`);
if (!afterSummary.flashboot) throw new Error(`${CONTRACT}_POST_REPAIR_FLASHBOOT_FAILED`);
if (afterSummary.scaler_type !== "QUEUE_DELAY" || afterSummary.scaler_value !== 1) {
  throw new Error(`${CONTRACT}_POST_REPAIR_SCALER_FAILED:${afterSummary.scaler_type}:${afterSummary.scaler_value}`);
}
for (const gpu of TARGET_GPU_TYPE_IDS) {
  if (!afterSummary.gpu_type_ids.includes(gpu)) throw new Error(`${CONTRACT}_POST_REPAIR_GPU_MISSING:${gpu}`);
}
if (afterSummary.network_volume_id !== REQUIRED_NETWORK_VOLUME_ID) throw new Error(`${CONTRACT}_NETWORK_VOLUME_CHANGED_UNEXPECTEDLY`);
if (text(after.template.imageName) !== IMMUTABLE_IMAGE) throw new Error(`${CONTRACT}_PRELOAD_IMAGE_BIND_FAILED:${text(after.template.imageName)}`);

console.log(JSON.stringify({
  ...resultBase,
  mode: "APPLY",
  orphan_cleanup: orphanCleanup,
  mutation_performed: true,
  template_image_changed: templateImageChanged,
  endpoint_patch: {
    workersMin: 0,
    workersMax: 1,
    flashboot: true,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    gpuTypeIds: [...TARGET_GPU_TYPE_IDS],
    minCudaVersion: "12.8",
    allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS],
    networkVolumeId: REQUIRED_NETWORK_VOLUME_ID,
  },
  endpoint_after: afterSummary,
  health_after: after.health,
  template_after: {
    id: text(after.template.id),
    image_name: text(after.template.imageName),
  },
  target_assessment_after: targetAssessment(after),
  zero_idle_serverless_active: true,
  preload_image_active: true,
  one_second_queue_delay_scaler_active: true,
  certified_gpu_fallback_pool_active: true,
  network_volume_preserved: true,
  cached_model_migration_required_next: true,
  datacenter_availability_still_limited_until_cached_model_migration: true,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
