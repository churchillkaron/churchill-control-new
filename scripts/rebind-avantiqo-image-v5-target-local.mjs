import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_V5_TARGET_SCOPED_REBIND_V1";
const ENDPOINT_NAME = "avantiqo-image-v1";
const SOURCE_PATH = "services/avantiqo-image-engine";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V3";
const ENTRYPOINT = "handler_v5.py";
const ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V5_VOLUME_QUOTA_GUARD_V1";
const RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_VOLUME_QUOTA_GUARD_V1";
const VOLUME_QUOTA_GUARD_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1";
const BUILD_DEFAULT_VOLUME_QUOTA_GB = 80;
const COST_GUARDED_GPU_POOL = ["NVIDIA RTX PRO 6000 Blackwell Server Edition"];
const REQUIRED_IDLE_TIMEOUT_SECONDS = 10;
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const POLL_MS = 3000;
const DRAIN_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(
    10 * 60 * 1000,
    Number(process.env.AVANTIQO_IMAGE_V5_REBIND_DRAIN_TIMEOUT_MS || 3 * 60 * 1000),
  ),
);

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
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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
      `${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`,
    );
  }
  return body ?? {};
}
async function rest(path, key, options = {}) {
  return readJson(
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
async function queueHealth(endpointId, key) {
  return readJson(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_QUEUE",
  );
}
async function endpointBoundTemplates(key) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_IMAGE_V5_REBIND_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint.template);
  const templateId = text(endpoint.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_V5_REBIND_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length && text(inline.imageName)) return inline;
  const matches = templates.filter((template) => text(template.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_V5_REBIND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
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
function templateBody(template, imageName) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 30),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
  };
  if (!body.name) throw new Error("AVANTIQO_IMAGE_V5_REBIND_TEMPLATE_NAME_REQUIRED");
  if (text(template.containerRegistryAuthId)) {
    body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  }
  return body;
}
function comparableTemplate(body) {
  return {
    containerDiskInGb: finite(body.containerDiskInGb, 30),
    dockerEntrypoint: list(body.dockerEntrypoint),
    dockerStartCmd: list(body.dockerStartCmd),
    env: normalizeEnv(body.env),
    isPublic: body.isPublic === true,
    name: text(body.name),
    ports: list(body.ports),
    readme: text(body.readme),
    volumeInGb: finite(body.volumeInGb, 0),
    volumeMountPath: text(body.volumeMountPath),
    containerRegistryAuthId: text(body.containerRegistryAuthId),
  };
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
function assertNoJobsOrExecution(health) {
  if (health.jobs.in_queue || health.jobs.in_progress) {
    throw new Error(
      `AVANTIQO_IMAGE_V5_REBIND_BLOCKED_JOBS:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
  if (health.workers.running || health.workers.throttled || health.workers.unhealthy) {
    throw new Error(
      `AVANTIQO_IMAGE_V5_REBIND_BLOCKED_WORKERS:running=${health.workers.running}:throttled=${health.workers.throttled}:unhealthy=${health.workers.unhealthy}`,
    );
  }
}
function managementWorkers(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id: text(worker.id) || null,
    desired_status: text(worker.desiredStatus ?? worker.desired_status).toUpperCase() || null,
    status: text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase() || null,
  }));
  return {
    workers,
    all_desired_exited:
      workers.length === 0 || workers.every((worker) => worker.desired_status === "EXITED"),
  };
}
function stableEndpoint(endpoint = {}, template = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    template_image: text(template.imageName),
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    min_cuda_version: text(endpoint.minCudaVersion),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout: finite(endpoint.idleTimeout),
    execution_timeout: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
  };
}
function assertPlacementPreserved(before, after, allowImageChange = false, allowWorkerMaxChange = false) {
  for (const key of [
    "id",
    "name",
    "template_id",
    "min_cuda_version",
    "workers_min",
    "idle_timeout",
    "execution_timeout",
    "scaler_type",
    "scaler_value",
    "flashboot",
  ]) {
    if (before[key] !== after[key]) {
      throw new Error(`AVANTIQO_IMAGE_V5_REBIND_UNRELATED_FIELD_CHANGED:${key}`);
    }
  }
  if (!allowWorkerMaxChange && before.workers_max !== after.workers_max) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_WORKERS_MAX_CHANGED");
  }
  if (!sameSet(before.network_volume_ids, after.network_volume_ids)) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_NETWORK_VOLUME_CHANGED");
  }
  if (!sameSet(before.gpu_type_ids, after.gpu_type_ids)) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_GPU_POOL_CHANGED");
  }
  if (!sameSet(before.data_center_ids, after.data_center_ids)) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_DATACENTER_CHANGED");
  }
  if (!allowImageChange && before.template_image !== after.template_image) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_IMAGE_CHANGED_UNEXPECTEDLY");
  }
}
function validateCostGuard(endpoint) {
  const gpuPool = unique(list(endpoint.gpuTypeIds));
  if (!sameSet(gpuPool, COST_GUARDED_GPU_POOL)) {
    throw new Error(`AVANTIQO_IMAGE_V5_REBIND_GPU_COST_GUARD_INVALID:${gpuPool.join("|")}`);
  }
  if (finite(endpoint.idleTimeout) !== REQUIRED_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`AVANTIQO_IMAGE_V5_REBIND_IDLE_TIMEOUT_INVALID:${finite(endpoint.idleTimeout)}`);
  }
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_V5_REBIND_SCALING_INVALID:min=${finite(endpoint.workersMin)}:max=${finite(endpoint.workersMax)}`,
    );
  }
}
function validateEvidence() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V5_REBIND_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_V5_REBIND_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error("AVANTIQO_IMAGE_V5_REBIND_MAIN_REQUIRED");
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_V5_REBIND_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_V5_REBIND_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`AVANTIQO_IMAGE_V5_REBIND_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }

  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  const sourceSha = text(evidence.source_sha);
  if (
    evidence.success !== true ||
    text(evidence.contract) !== EVIDENCE_CONTRACT ||
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== text(evidence.trigger_sha) ||
    text(evidence.entrypoint) !== ENTRYPOINT ||
    text(evidence.entrypoint_revision) !== ENTRYPOINT_REVISION ||
    text(evidence.runtime_revision) !== RUNTIME_REVISION ||
    text(evidence.volume_quota_guard_contract) !== VOLUME_QUOTA_GUARD_CONTRACT ||
    finite(evidence.network_volume_quota_gb) !== BUILD_DEFAULT_VOLUME_QUOTA_GB ||
    evidence.backing_filesystem_capacity_used_for_decision !== false ||
    evidence.automatic_production_routing_enabled !== false ||
    evidence.qwen_replaced !== false ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.model_download_submitted !== false ||
    evidence.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_EVIDENCE_INVALID");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_IMAGE_REFERENCE_INVALID");
  }
  const diff = commandStatus("git", ["diff", "--quiet", sourceSha, head, "--", SOURCE_PATH]);
  if (diff.status === 1) {
    throw new Error(`AVANTIQO_IMAGE_V5_REBIND_SOURCE_CHANGED_AFTER_BUILD:source=${sourceSha}:head=${head}`);
  }
  if (diff.status !== 0) throw new Error("AVANTIQO_IMAGE_V5_REBIND_SOURCE_EQUIVALENCE_CHECK_FAILED");
  return { head, sourceSha, image };
}
async function waitForDrain(endpointId, managementKey, inferenceKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  let latest = null;
  while (Date.now() < deadline) {
    const [state, rawHealth] = await Promise.all([
      readEndpointState(endpointId, managementKey),
      queueHealth(endpointId, inferenceKey),
    ]);
    const health = healthCounters(rawHealth);
    const management = managementWorkers(state.endpoint);
    const drained =
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      health.workers.running === 0 &&
      health.workers.unhealthy === 0 &&
      management.all_desired_exited;
    latest = { health, management, drained };
    stable = drained ? stable + 1 : 0;
    if (stable >= 2) return { stable_observations: stable, snapshot: latest };
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_IMAGE_V5_REBIND_DRAIN_TIMEOUT:${JSON.stringify(latest)}`);
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_IMAGE_V5_BIND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_IMAGE_V5_BIND_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const local = validateEvidence();

console.log(`AVANTIQO_IMAGE_V5_REBIND_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_V5_REBIND_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_V5_REBIND_TARGET_SCOPED_VOLUME_GUARD=true");
console.log("AVANTIQO_IMAGE_V5_REBIND_GENERATION=false");
console.log("AVANTIQO_IMAGE_V5_REBIND_INFERENCE=false");
console.log("AVANTIQO_IMAGE_V5_REBIND_MODEL_DOWNLOAD=false");
console.log("AVANTIQO_IMAGE_V5_REBIND_GPU_JOB=false");
console.log("AVANTIQO_IMAGE_V5_REBIND_PRODUCTION_DEPLOY=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_V5_REBIND_INVENTORY_INVALID");
}

const matches = configuredEndpointId
  ? endpoints.filter(
      (endpoint) => text(endpoint.id) === configuredEndpointId && text(endpoint.name) === ENDPOINT_NAME,
    )
  : endpoints.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_V5_REBIND_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0].id);
const state = await readEndpointState(endpointId, managementKey);
validateCostGuard(state.endpoint);

const policy = sharedVolumePolicySummary(volumes);
console.log(`AVANTIQO_IMAGE_V5_REBIND_GLOBAL_SHARED_POLICY_COMPLIANT=${policy.policy_compliant ? "true" : "false"}`);
if (!policy.policy_compliant) {
  console.log(`AVANTIQO_IMAGE_V5_REBIND_GLOBAL_SHARED_POLICY_WARNING=${JSON.stringify({
    managed_cache_volume_count: policy.managed_cache_volume_count,
    maximum_managed_cache_volumes: policy.maximum_managed_cache_volumes,
    unknown_avantiqo_cache_volumes: policy.unknown_avantiqo_cache_volumes,
    duplicate_groups: policy.duplicate_groups,
  })}`);
}

const groupVolumes = groupCacheVolumes(volumes, GROUP);
if (groupVolumes.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_V5_REBIND_CANONICAL_VOLUME_COUNT_INVALID:${groupVolumes.length}`);
}
const canonical = groupVolumes[0];
const canonicalSizeGb = finite(canonical.size, 0);
if (
  text(canonical.name) !== GROUP.canonical_name ||
  !text(canonical.id) ||
  !text(canonical.dataCenterId) ||
  canonicalSizeGb < BUILD_DEFAULT_VOLUME_QUOTA_GB
) {
  throw new Error(
    `AVANTIQO_IMAGE_V5_REBIND_CANONICAL_VOLUME_INVALID:size=${canonicalSizeGb}:minimum=${BUILD_DEFAULT_VOLUME_QUOTA_GB}`,
  );
}
const attached = endpointVolumeIds(state.endpoint);
if (attached.length !== 1 || attached[0] !== text(canonical.id)) {
  throw new Error(`AVANTIQO_IMAGE_V5_REBIND_CANONICAL_ATTACHMENT_INVALID:${attached.join("|") || "NONE"}`);
}
if (unique(list(state.endpoint.dataCenterIds)).length !== 0) {
  throw new Error("AVANTIQO_IMAGE_V5_REBIND_DATACENTER_PINNING_FORBIDDEN");
}
const liveQuotaGb = finite(
  normalizeEnv(state.template.env).AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB,
  BUILD_DEFAULT_VOLUME_QUOTA_GB,
);
if (liveQuotaGb < BUILD_DEFAULT_VOLUME_QUOTA_GB || liveQuotaGb > canonicalSizeGb) {
  throw new Error(
    `AVANTIQO_IMAGE_V5_REBIND_TEMPLATE_QUOTA_INVALID:quota=${liveQuotaGb}:volume=${canonicalSizeGb}`,
  );
}

const health = healthCounters(await queueHealth(endpointId, inferenceKey));
assertNoJobsOrExecution(health);
const baseline = stableEndpoint(state.endpoint, state.template);
const templateCurrent = text(state.template.imageName) === local.image;
const management = managementWorkers(state.endpoint);
const recycleRequired = management.workers.some((worker) => worker.desired_status !== "EXITED");
const mutationRequired = !templateCurrent || recycleRequired;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_main: local.head,
  immutable_image_source_sha: local.sourceSha,
  expected_image: local.image,
  live_image: text(state.template.imageName) || null,
  template_current: templateCurrent,
  worker_recycle_required: recycleRequired,
  target_scope_policy_compliant: true,
  global_shared_policy_compliant: policy.policy_compliant,
  canonical_shared_volume: {
    id: text(canonical.id),
    name: text(canonical.name),
    size_gb: canonicalSizeGb,
    data_center_id: text(canonical.dataCenterId),
  },
  volume_quota_guard: {
    build_default_quota_gb: BUILD_DEFAULT_VOLUME_QUOTA_GB,
    live_template_quota_gb: liveQuotaGb,
    canonical_volume_size_gb: canonicalSizeGb,
    backing_filesystem_capacity_used_for_decision: false,
  },
  cost_guard: {
    gpu_pool: unique(list(state.endpoint.gpuTypeIds)),
    idle_timeout_seconds: finite(state.endpoint.idleTimeout),
    workers_min: finite(state.endpoint.workersMin),
    workers_max: finite(state.endpoint.workersMax),
  },
  health,
  management_workers: management,
  mutation_required: mutationRequired,
  mutation_performed: false,
  generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  gpu_job_submitted: false,
  production_deploy_performed: false,
  next_action: mutationRequired ? (apply ? "REBIND_V5" : "RUN_WITH_APPLY") : "V5_ALREADY_BOUND",
};

if (!mutationRequired || !apply) {
  console.log(JSON.stringify(plan, null, 2));
  if (!mutationRequired) console.log("AVANTIQO_IMAGE_V5_REBIND_ALREADY_CURRENT=YES");
  process.exit(0);
}

command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_V5_REBIND_FETCH_BEFORE_WRITE_FAILED");
const headBeforeWrite = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_V5_REBIND_HEAD_BEFORE_WRITE_FAILED");
const originBeforeWrite = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_V5_REBIND_ORIGIN_BEFORE_WRITE_FAILED");
if (headBeforeWrite !== local.head || originBeforeWrite !== local.head) {
  throw new Error(
    `AVANTIQO_IMAGE_V5_REBIND_MAIN_MOVED_REPLAN_REQUIRED:planned=${local.head}:head=${headBeforeWrite}:origin=${originBeforeWrite}`,
  );
}

const fresh = await readEndpointState(endpointId, managementKey);
validateCostGuard(fresh.endpoint);
assertPlacementPreserved(baseline, stableEndpoint(fresh.endpoint, fresh.template));
assertNoJobsOrExecution(healthCounters(await queueHealth(endpointId, inferenceKey)));
const freshAttached = endpointVolumeIds(fresh.endpoint);
if (freshAttached.length !== 1 || freshAttached[0] !== text(canonical.id)) {
  throw new Error("AVANTIQO_IMAGE_V5_REBIND_ATTACHMENT_CHANGED_BEFORE_WRITE");
}

const templateId = text(fresh.template.id || fresh.endpoint.templateId);
const oldTemplateBody = templateBody(fresh.template, text(fresh.template.imageName));
const desiredTemplateBody = templateBody(fresh.template, local.image);
let paused = false;
let templateUpdated = false;
let restored = false;
let drain = null;
let rollbackTemplateAttempted = false;
let rollbackTemplateSucceeded = false;
let rollbackScalingAttempted = false;
let rollbackScalingSucceeded = false;

try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  paused = true;
  drain = await waitForDrain(endpointId, managementKey, inferenceKey);

  const pausedState = await readEndpointState(endpointId, managementKey);
  assertPlacementPreserved(baseline, stableEndpoint(pausedState.endpoint, pausedState.template), false, true);
  if (finite(pausedState.endpoint.workersMin) !== 0 || finite(pausedState.endpoint.workersMax) !== 0) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_PAUSE_VERIFY_FAILED");
  }
  if (text(pausedState.template.imageName) !== local.image) {
    await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
      method: "POST",
      body: desiredTemplateBody,
    });
    templateUpdated = true;
  }

  const bound = await readEndpointState(endpointId, managementKey);
  assertPlacementPreserved(baseline, stableEndpoint(bound.endpoint, bound.template), true, true);
  if (text(bound.template.imageName) !== local.image) {
    throw new Error("AVANTIQO_IMAGE_V5_REBIND_IMAGE_VERIFY_FAILED");
  }
  assert.deepStrictEqual(
    comparableTemplate(templateBody(bound.template, text(bound.template.imageName))),
    comparableTemplate(desiredTemplateBody),
    "AVANTIQO_IMAGE_V5_REBIND_NON_IMAGE_TEMPLATE_CHANGE_DETECTED",
  );

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  });
  restored = true;
} catch (error) {
  if (templateUpdated) {
    rollbackTemplateAttempted = true;
    try {
      await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
        method: "POST",
        body: oldTemplateBody,
      });
      rollbackTemplateSucceeded = true;
    } catch {}
  }
  if (paused && !restored) {
    rollbackScalingAttempted = true;
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 1 },
      });
      rollbackScalingSucceeded = true;
    } catch {}
  }
  throw new Error(
    `${text(error?.message || error)}:rollback_template_attempted=${rollbackTemplateAttempted}:rollback_template_succeeded=${rollbackTemplateSucceeded}:rollback_scaling_attempted=${rollbackScalingAttempted}:rollback_scaling_succeeded=${rollbackScalingSucceeded}`,
  );
}

const verified = await readEndpointState(endpointId, managementKey);
const verifiedHealth = healthCounters(await queueHealth(endpointId, inferenceKey));
assertNoJobsOrExecution(verifiedHealth);
assertPlacementPreserved(baseline, stableEndpoint(verified.endpoint, verified.template), true);
validateCostGuard(verified.endpoint);
if (text(verified.template.imageName) !== local.image) {
  throw new Error("AVANTIQO_IMAGE_V5_REBIND_FINAL_IMAGE_VERIFY_FAILED");
}

console.log("AVANTIQO_IMAGE_V5_REBIND_COMPLETE=YES");
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  live_image_after: text(verified.template.imageName),
  template_current: true,
  mutation_performed: true,
  endpoint_paused: paused,
  management_drain_confirmed: Boolean(drain),
  stable_drain_observations: drain?.stable_observations || 0,
  template_updated: templateUpdated,
  endpoint_restored: restored,
  health_after: verifiedHealth,
  cost_guard_preserved: true,
  network_volume_preserved: true,
  data_center_ids_preserved: true,
  generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  gpu_job_submitted: false,
  production_deploy_performed: false,
  rollback_template_attempted: rollbackTemplateAttempted,
  rollback_template_succeeded: rollbackTemplateSucceeded,
  rollback_scaling_attempted: rollbackScalingAttempted,
  rollback_scaling_succeeded: rollbackScalingSucceeded,
  next_action: "RUN_IMAGE_VIDEO_VOLUME_EXPANSION",
}, null, 2));