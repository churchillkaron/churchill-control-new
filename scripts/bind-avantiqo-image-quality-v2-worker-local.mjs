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
const CONTRACT = "AVANTIQO_IMAGE_QUALITY_V2_IMMUTABLE_BIND_V1";
const ENDPOINT_NAME = "avantiqo-image-v1";
const SOURCE_PATH = "services/avantiqo-image-engine";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V1";
const ENTRYPOINT = "handler_v3.py";
const ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V3_QUALITY_COMPILER_V2";
const RUNTIME_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V2";
const QUALITY_POLICY = "QWEN_IMAGE_2512_REALISM_IDENTITY_PHYSICS_V2";
const QUALITY_COMPILER_CONTRACT = "AVANTIQO_IMAGE_QUALITY_COMPILER_V2";
const REQUIRED_RULES = [
  "identity_separation",
  "requested_hand_visibility",
  "physical_food_realism",
  "photographic_naturalism",
];
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const POLL_MS = 3000;
const DRAIN_TIMEOUT_MS = Math.max(
  30000,
  Math.min(
    10 * 60 * 1000,
    Number(process.env.AVANTIQO_IMAGE_V2_BIND_DRAIN_TIMEOUT_MS || 3 * 60 * 1000),
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
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
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
      signal: AbortSignal.timeout(options.timeoutMs || 30000),
    }),
    "RUNPOD_REST",
  );
}
async function queueHealth(endpointId, key) {
  return readJson(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    }),
    "RUNPOD_QUEUE",
  );
}
async function endpointBoundTemplates(key) {
  const templates = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  if (!Array.isArray(templates)) throw new Error("AVANTIQO_IMAGE_V2_BIND_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates) {
  const inline = object(endpoint.template);
  const templateId = text(endpoint.templateId || inline.id);
  if (!templateId) throw new Error("AVANTIQO_IMAGE_V2_BIND_TEMPLATE_ID_REQUIRED");
  if (Object.keys(inline).length && text(inline.imageName)) return inline;
  const matches = templates.filter((template) => text(template.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_V2_BIND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
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
      `AVANTIQO_IMAGE_V2_BIND_BLOCKED_JOBS:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
  if (health.workers.running || health.workers.throttled || health.workers.unhealthy) {
    throw new Error(
      `AVANTIQO_IMAGE_V2_BIND_BLOCKED_WORKERS:running=${health.workers.running}:throttled=${health.workers.throttled}:unhealthy=${health.workers.unhealthy}`,
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
    all_desired_exited: workers.length === 0 || workers.every((worker) => worker.desired_status === "EXITED"),
  };
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
  if (!body.name) throw new Error("AVANTIQO_IMAGE_V2_BIND_TEMPLATE_NAME_REQUIRED");
  if (text(template.containerRegistryAuthId)) body.containerRegistryAuthId = text(template.containerRegistryAuthId);
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
    idle_timeout: finite(endpoint.idleTimeout),
    execution_timeout: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
  };
}
function assertPlacementPreserved(before, after, allowImageChange = false) {
  for (const key of ["id", "name", "template_id", "min_cuda_version", "idle_timeout", "execution_timeout", "flashboot"]) {
    if (before[key] !== after[key]) throw new Error(`AVANTIQO_IMAGE_V2_BIND_UNRELATED_FIELD_CHANGED:${key}`);
  }
  if (!sameSet(before.network_volume_ids, after.network_volume_ids)) throw new Error("AVANTIQO_IMAGE_V2_BIND_NETWORK_VOLUME_CHANGED");
  if (!sameSet(before.gpu_type_ids, after.gpu_type_ids)) throw new Error("AVANTIQO_IMAGE_V2_BIND_GPU_POOL_CHANGED");
  if (!sameSet(before.data_center_ids, after.data_center_ids)) throw new Error("AVANTIQO_IMAGE_V2_BIND_DATACENTER_IDS_CHANGED");
  if (!allowImageChange && before.template_image !== after.template_image) throw new Error("AVANTIQO_IMAGE_V2_BIND_IMAGE_CHANGED_UNEXPECTEDLY");
}
function validateEvidence() {
  command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_FAILED");
  if (command("git", ["branch", "--show-current"], "GIT_BRANCH_READ_FAILED") !== "main") {
    throw new Error("AVANTIQO_IMAGE_V2_BIND_MAIN_REQUIRED");
  }
  const head = command("git", ["rev-parse", "HEAD"], "GIT_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "GIT_ORIGIN_READ_FAILED");
  if (head !== origin) throw new Error(`AVANTIQO_IMAGE_V2_BIND_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  const sourceSha = text(evidence.source_sha);
  const rules = unique(list(evidence.quality_compiler_rules));
  if (
    evidence.success !== true ||
    evidence.contract !== EVIDENCE_CONTRACT ||
    evidence.source_sha_matches_trigger !== true ||
    sourceSha !== text(evidence.trigger_sha) ||
    text(evidence.entrypoint) !== ENTRYPOINT ||
    text(evidence.entrypoint_revision) !== ENTRYPOINT_REVISION ||
    text(evidence.runtime_probe_contract) !== RUNTIME_PROBE_CONTRACT ||
    text(evidence.runtime_revision) !== RUNTIME_REVISION ||
    text(evidence.quality_policy) !== QUALITY_POLICY ||
    text(evidence.quality_compiler_contract) !== QUALITY_COMPILER_CONTRACT ||
    !REQUIRED_RULES.every((rule) => rules.includes(rule)) ||
    evidence.provider_job_submitted !== false ||
    evidence.image_generation_submitted !== false ||
    evidence.production_web_deploy !== false
  ) {
    throw new Error("AVANTIQO_IMAGE_V2_BIND_EVIDENCE_INVALID_OR_NOT_READY");
  }
  const image = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_IMAGE_V2_BIND_IMAGE_REFERENCE_INVALID");
  }
  const diff = commandStatus("git", ["diff", "--quiet", sourceSha, head, "--", SOURCE_PATH]);
  if (diff.status === 1) throw new Error(`AVANTIQO_IMAGE_V2_BIND_SOURCE_CHANGED_AFTER_BUILD:source=${sourceSha}:head=${head}`);
  if (diff.status !== 0) throw new Error("AVANTIQO_IMAGE_V2_BIND_SOURCE_EQUIVALENCE_CHECK_FAILED");
  command("python3", ["-m", "py_compile", `${SOURCE_PATH}/handler.py`, `${SOURCE_PATH}/handler_v2.py`, `${SOURCE_PATH}/handler_v3.py`], "AVANTIQO_IMAGE_V2_BIND_PYTHON_SYNTAX_FAILED");
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
  throw new Error(`AVANTIQO_IMAGE_V2_BIND_DRAIN_TIMEOUT:${JSON.stringify(latest)}`);
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_IMAGE_V2_BIND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_IMAGE_V2_BIND_APPROVED=YES_REQUIRED");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const local = validateEvidence();
const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) throw new Error("AVANTIQO_IMAGE_V2_BIND_INVENTORY_INVALID");
const matches = configuredEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredEndpointId && text(endpoint.name) === ENDPOINT_NAME)
  : endpoints.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V2_BIND_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
const endpointId = text(matches[0].id);
const state = await readEndpointState(endpointId, managementKey);
if (finite(state.endpoint.workersMin) !== 0 || finite(state.endpoint.workersMax) !== 1) {
  throw new Error(`AVANTIQO_IMAGE_V2_BIND_SCALING_INVALID:min=${finite(state.endpoint.workersMin)}:max=${finite(state.endpoint.workersMax)}`);
}
const policy = sharedVolumePolicySummary(volumes);
const groupVolumes = groupCacheVolumes(volumes, GROUP);
if (!policy.policy_compliant || groupVolumes.length !== 1) throw new Error("AVANTIQO_IMAGE_V2_BIND_SHARED_VOLUME_POLICY_INVALID");
const canonical = groupVolumes[0];
if (text(canonical.name) !== GROUP.canonical_name || finite(canonical.size, 0) < 80) throw new Error("AVANTIQO_IMAGE_V2_BIND_CANONICAL_VOLUME_INVALID");
const attached = endpointVolumeIds(state.endpoint);
if (attached.length !== 1 || attached[0] !== text(canonical.id)) throw new Error(`AVANTIQO_IMAGE_V2_BIND_CANONICAL_VOLUME_ATTACHMENT_INVALID:${attached.join("|")}`);
if (unique(list(state.endpoint.dataCenterIds)).length !== 0) throw new Error("AVANTIQO_IMAGE_V2_BIND_DATACENTER_PINNING_FORBIDDEN");
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
  immutable_image_reference: local.image,
  runtime_revision: RUNTIME_REVISION,
  quality_policy: QUALITY_POLICY,
  quality_compiler_contract: QUALITY_COMPILER_CONTRACT,
  endpoint_id: endpointId,
  template_id: baseline.template_id,
  template_current: templateCurrent,
  worker_recycle_required: recycleRequired,
  health,
  management_workers: management,
  canonical_shared_volume: {
    id: text(canonical.id),
    name: text(canonical.name),
    size_gb: finite(canonical.size),
    data_center_id: text(canonical.dataCenterId) || null,
  },
  data_center_ids_explicitly_pinned: false,
  mutation_required: mutationRequired,
  mutation_performed: false,
  generation_submitted: false,
  cache_operation_submitted: false,
  production_deploy_performed: false,
  next_action: mutationRequired ? (apply ? "BIND_AND_RECYCLE" : "RUN_WITH_APPLY") : "RUN_RUNTIME_PROBE_V2",
};
console.log("AVANTIQO_IMAGE_V2_BIND_NEW_GENERATION=false");
console.log("AVANTIQO_IMAGE_V2_BIND_CACHE_OPERATION=false");
console.log("AVANTIQO_IMAGE_V2_BIND_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V2_BIND_DATACENTER_PATCH_FIELD_USED=false");
if (!mutationRequired || !apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

command("git", ["fetch", "origin", "main"], "GIT_FETCH_MAIN_BEFORE_BIND_FAILED");
const headBeforeWrite = command("git", ["rev-parse", "HEAD"], "GIT_HEAD_BEFORE_BIND_FAILED");
const originBeforeWrite = command("git", ["rev-parse", "origin/main"], "GIT_ORIGIN_BEFORE_BIND_FAILED");
if (headBeforeWrite !== local.head || originBeforeWrite !== local.head) {
  throw new Error(`AVANTIQO_IMAGE_V2_BIND_MAIN_MOVED_REPLAN_REQUIRED:planned=${local.head}:head=${headBeforeWrite}:origin=${originBeforeWrite}`);
}
const fresh = await readEndpointState(endpointId, managementKey);
assertPlacementPreserved(baseline, stableEndpoint(fresh.endpoint, fresh.template));
assertNoJobsOrExecution(healthCounters(await queueHealth(endpointId, inferenceKey)));

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
  assertPlacementPreserved(baseline, stableEndpoint(pausedState.endpoint, pausedState.template));
  if (finite(pausedState.endpoint.workersMin) !== 0 || finite(pausedState.endpoint.workersMax) !== 0) throw new Error("AVANTIQO_IMAGE_V2_BIND_PAUSE_VERIFY_FAILED");

  if (text(pausedState.template.imageName) !== local.image) {
    await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
      method: "POST",
      body: desiredTemplateBody,
    });
    templateUpdated = true;
  }
  const bound = await readEndpointState(endpointId, managementKey);
  assertPlacementPreserved(baseline, stableEndpoint(bound.endpoint, bound.template), true);
  if (text(bound.template.imageName) !== local.image) throw new Error("AVANTIQO_IMAGE_V2_BIND_IMAGE_VERIFY_FAILED");
  assert.deepStrictEqual(
    comparableTemplate(templateBody(bound.template, text(bound.template.imageName))),
    comparableTemplate(desiredTemplateBody),
    "AVANTIQO_IMAGE_V2_BIND_NON_IMAGE_TEMPLATE_CHANGE_DETECTED",
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
  throw new Error(`${text(error?.message || error)}:rollback_template_attempted=${rollbackTemplateAttempted}:rollback_template_succeeded=${rollbackTemplateSucceeded}:rollback_scaling_attempted=${rollbackScalingAttempted}:rollback_scaling_succeeded=${rollbackScalingSucceeded}`);
}

const verified = await readEndpointState(endpointId, managementKey);
const verifiedHealth = healthCounters(await queueHealth(endpointId, inferenceKey));
assertNoJobsOrExecution(verifiedHealth);
assertPlacementPreserved(baseline, stableEndpoint(verified.endpoint, verified.template), true);
if (text(verified.template.imageName) !== local.image) throw new Error("AVANTIQO_IMAGE_V2_BIND_FINAL_IMAGE_VERIFY_FAILED");
if (finite(verified.endpoint.workersMin) !== 0 || finite(verified.endpoint.workersMax) !== 1) throw new Error("AVANTIQO_IMAGE_V2_BIND_FINAL_SCALING_VERIFY_FAILED");
if (unique(list(verified.endpoint.dataCenterIds)).length !== 0) throw new Error("AVANTIQO_IMAGE_V2_BIND_FINAL_DATACENTER_PINNING_DETECTED");

console.log("AVANTIQO_IMAGE_V2_BIND_COMPLETE=YES");
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  template_current: true,
  health_after: verifiedHealth,
  management_workers_after: managementWorkers(verified.endpoint),
  mutation_performed: true,
  endpoint_paused: paused,
  management_drain_confirmed: Boolean(drain),
  stable_drain_observations: drain?.stable_observations || 0,
  template_updated: templateUpdated,
  endpoint_restored: restored,
  data_center_ids_changed: false,
  gpu_type_ids_changed: false,
  network_volume_ids_changed: false,
  generation_submitted: false,
  cache_operation_submitted: false,
  production_deploy_performed: false,
  rollback_template_attempted: rollbackTemplateAttempted,
  rollback_template_succeeded: rollbackTemplateSucceeded,
  rollback_scaling_attempted: rollbackScalingAttempted,
  rollback_scaling_succeeded: rollbackScalingSucceeded,
  next_action: "RUN_RUNTIME_PROBE_V2",
}, null, 2));