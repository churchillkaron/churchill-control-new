import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_V1";
const ENDPOINT_NAME = "avantiqo-code-v1";
const ENV_KEY = "VLLM_USE_FLASHINFER_SAMPLER";
const ENV_VALUE = "0";
const DEFAULT_DRAIN_TIMEOUT_MS = 4 * 60 * 1000;
const DEFAULT_POLL_MS = 3_000;

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name, fallback = null) {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function command(name, args, errorCode) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 800);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function validateLocalMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_CODE_FLASHINFER_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_CODE_FLASHINFER_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_CODE_FLASHINFER_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_CODE_FLASHINFER_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_CODE_FLASHINFER_GIT_ORIGIN_MAIN_FAILED");
  if (head !== originMain) {
    throw new Error(
      `AVANTIQO_CODE_FLASHINFER_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${originMain}:run_git_merge_ff_only_first`,
    );
  }
  return head;
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, "RUNPOD_CODE_FLASHINFER_REST");
}

async function queueRequest(endpointId, credential, pathname) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "RUNPOD_CODE_FLASHINFER_QUEUE");
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

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean);
}

function safeManagementWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker.id)),
    desired_status: upper(worker.desiredStatus ?? worker.desired_status) || null,
    status: upper(worker.status ?? worker.workerStatus ?? worker.runtimeStatus) || null,
  };
}

function summarizeManagement(endpoint = {}) {
  const workers = list(endpoint.workers).map(safeManagementWorker);
  const nonExited = workers.filter((worker) => worker.desired_status !== "EXITED");
  return {
    worker_count: workers.length,
    non_exited_worker_count: nonExited.length,
    all_workers_desired_exited: workers.length === 0 || nonExited.length === 0,
    workers,
  };
}

function summarizeHealth(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
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

function evaluateDrain(health, management) {
  const jobsClear = health.jobs.in_queue === 0 && health.jobs.in_progress === 0;
  const managementExited = management.all_workers_desired_exited === true;
  const noExecutingWorkers =
    health.workers.running === 0 &&
    health.workers.unhealthy === 0 &&
    (managementExited || health.workers.throttled === 0);
  return {
    jobs_clear: jobsClear,
    management_workers_exited: managementExited,
    no_executing_workers: noExecutingWorkers,
    drained: jobsClear && managementExited && noExecutingWorkers,
  };
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version, null),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin, null),
    workers_max: finite(endpoint.workersMax, null),
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
  };
}

function safeTemplate(template = {}) {
  const env = normalizeEnv(template.env);
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    container_disk_gb: finite(template.containerDiskInGb, null),
    volume_mount_path: text(template.volumeMountPath) || null,
    env_key_count: Object.keys(env).length,
    flashinfer_sampler_env_present: Object.prototype.hasOwnProperty.call(env, ENV_KEY),
    flashinfer_sampler_disabled: env[ENV_KEY] === ENV_VALUE,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
  };
}

function templateStateKey(template = {}) {
  return JSON.stringify({
    id: text(template.id),
    name: text(template.name),
    imageName: text(template.imageName),
    containerDiskInGb: finite(template.containerDiskInGb, 0),
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
    isPublic: template.isPublic === true,
  });
}

function templateUpdateBody(template, env) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 5)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env,
    imageName: text(template.imageName),
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const registryAuthId = text(template.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  if (!body.name) throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_NAME_REQUIRED");
  if (!body.imageName) throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_IMAGE_REQUIRED");
  return body;
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_CODE_FLASHINFER_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

function resolveEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1) {
      throw new Error(
        `AVANTIQO_CODE_FLASHINFER_CONFIGURED_ENDPOINT_RESOLUTION_FAILED:id=${configuredId}:matches=${matches.length}`,
      );
    }
    if (text(matches[0]?.name) !== ENDPOINT_NAME) {
      throw new Error(
        `AVANTIQO_CODE_FLASHINFER_CONFIGURED_ENDPOINT_NAME_MISMATCH:${text(matches[0]?.name) || "MISSING"}`,
      );
    }
    return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_CODE_FLASHINFER_EXACT_NAME_ENDPOINT_RESOLUTION_FAILED:name=${ENDPOINT_NAME}:matches=${matches.length}`,
    );
  }
  return { endpoint: matches[0], resolution: "EXACT_NAME" };
}

async function snapshot(managementKey, queueKey, endpointId) {
  const [endpoint, templates, healthRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
    queueRequest(endpointId, queueKey, "/health"),
  ]);
  if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_ENDPOINT_BINDING_CHANGED");
  }
  const health = summarizeHealth(healthRaw);
  const management = summarizeManagement(endpoint);
  return {
    endpoint,
    template: resolveTemplate(endpoint, templates),
    health,
    management,
    drain: evaluateDrain(health, management),
  };
}

async function waitForDrain(managementKey, queueKey, endpointId) {
  const timeoutMs = Math.max(
    30_000,
    Math.min(10 * 60 * 1000, finite(process.env.AVANTIQO_CODE_FLASHINFER_DRAIN_TIMEOUT_MS, DEFAULT_DRAIN_TIMEOUT_MS)),
  );
  const pollMs = Math.max(
    1_000,
    Math.min(15_000, finite(process.env.AVANTIQO_CODE_FLASHINFER_POLL_MS, DEFAULT_POLL_MS)),
  );
  const started = Date.now();
  let latest = await snapshot(managementKey, queueKey, endpointId);
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    if (latest.drain.drained) {
      stable += 1;
      if (stable >= 2) return latest;
    } else {
      stable = 0;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_FLASHINFER_DRAIN_PROGRESS",
      elapsed_seconds: Math.round((Date.now() - started) / 1000),
      stable_drain_observations: stable,
      health: latest.health,
      management: latest.management,
    }));
    await sleep(pollMs);
    latest = await snapshot(managementKey, queueKey, endpointId);
  }
  throw new Error("AVANTIQO_CODE_FLASHINFER_DRAIN_TIMEOUT");
}

const apply = process.argv.includes("--apply");
const approved = upper(process.env.AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_APPROVED) === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_APPROVED=YES_REQUIRED");
}

const mainCommit = validateLocalMain();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey =
  text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) ||
  text(process.env.RUNPOD_API_KEY) ||
  managementKey;

console.log(`AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_SECRETS_PRINTED=false");

const endpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_CODE_FLASHINFER_ENDPOINT_LIST_INVALID");
const resolution = resolveEndpoint(endpoints);
const endpointId = text(resolution.endpoint.id);
const initial = await snapshot(managementKey, queueKey, endpointId);
const templateId = text(initial.template.id);
const consumers = endpoints.filter(
  (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
);
const templateExclusive = consumers.length === 1 && text(consumers[0]?.id) === endpointId;
const currentEnv = normalizeEnv(initial.template.env);
const patchRequired = currentEnv[ENV_KEY] !== ENV_VALUE;

const plan = {
  success: templateExclusive,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  endpoint_resolution: resolution.resolution,
  endpoint: safeEndpoint(initial.endpoint),
  template: safeTemplate(initial.template),
  template_consumer_count: consumers.length,
  template_exclusive_to_code_endpoint: templateExclusive,
  health: initial.health,
  management: initial.management,
  desired_patch: {
    key: ENV_KEY,
    value: ENV_VALUE,
    image_change: false,
    model_change: false,
    runtime_change: false,
    quantization_change: false,
  },
  mutation_required: patchRequired,
  mutation_performed: false,
  endpoint_temporarily_drained: false,
  original_scaling: {
    workers_min: finite(initial.endpoint.workersMin, 0),
    workers_max: finite(initial.endpoint.workersMax, 0),
  },
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_in_output: false,
  next_action: patchRequired
    ? "APPLY_FLASHINFER_TEMPLATE_PATCH_THEN_RUN_ONE_RUNTIME_PROBE"
    : "RUN_ONE_RUNTIME_PROBE",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  if (!templateExclusive) process.exitCode = 2;
  process.exit();
}

if (!templateExclusive) {
  throw new Error(`AVANTIQO_CODE_FLASHINFER_SHARED_TEMPLATE_BLOCKED:consumers=${consumers.length}`);
}
if (initial.health.jobs.in_queue > 0 || initial.health.jobs.in_progress > 0) {
  throw new Error(
    `AVANTIQO_CODE_FLASHINFER_LIVE_JOBS_BLOCK_PATCH:in_queue=${initial.health.jobs.in_queue}:in_progress=${initial.health.jobs.in_progress}`,
  );
}
if (!patchRequired) {
  console.log(JSON.stringify({ ...plan, mode: "APPLY", success: true }, null, 2));
  process.exit();
}

const originalTemplate = initial.template;
const originalTemplateKey = templateStateKey(originalTemplate);
const originalWorkersMin = finite(initial.endpoint.workersMin, 0);
const originalWorkersMax = finite(initial.endpoint.workersMax, 0);
let templateMutated = false;
let scalingMutated = false;

try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  scalingMutated = originalWorkersMin !== 0 || originalWorkersMax !== 0;
  console.log("AVANTIQO_CODE_FLASHINFER_ENDPOINT_DRAIN_REQUESTED=true");
  await waitForDrain(managementKey, queueKey, endpointId);

  validateLocalMain();
  const freshEndpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const freshEndpoints = normalizeListResponse(freshEndpointsRaw, ["endpoints", "serverlessEndpoints"]);
  if (!freshEndpoints) throw new Error("AVANTIQO_CODE_FLASHINFER_FRESH_ENDPOINT_LIST_INVALID");
  const freshResolution = resolveEndpoint(freshEndpoints);
  if (text(freshResolution.endpoint.id) !== endpointId) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_ENDPOINT_CHANGED_REPLAN_REQUIRED");
  }
  const fresh = await snapshot(managementKey, queueKey, endpointId);
  if (text(fresh.template.id) !== templateId) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_CHANGED_REPLAN_REQUIRED");
  }
  if (templateStateKey(fresh.template) !== originalTemplateKey) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_CONTENT_CHANGED_REPLAN_REQUIRED");
  }
  if (!fresh.drain.drained) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_DRAIN_NOT_STABLE");
  }
  const freshConsumers = freshEndpoints.filter(
    (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
  );
  if (freshConsumers.length !== 1 || text(freshConsumers[0]?.id) !== endpointId) {
    throw new Error(`AVANTIQO_CODE_FLASHINFER_TEMPLATE_SHARING_CHANGED:consumers=${freshConsumers.length}`);
  }

  const patchedEnv = { ...normalizeEnv(fresh.template.env), [ENV_KEY]: ENV_VALUE };
  await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(fresh.template, patchedEnv),
  });
  templateMutated = true;

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: originalWorkersMin, workersMax: originalWorkersMax },
  });
  scalingMutated = false;

  const verified = await snapshot(managementKey, queueKey, endpointId);
  const verifiedEnv = normalizeEnv(verified.template.env);
  if (verifiedEnv[ENV_KEY] !== ENV_VALUE) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_VERIFY_ENV_FAILED");
  }
  if (text(verified.template.imageName) !== text(originalTemplate.imageName)) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_VERIFY_IMAGE_CHANGED");
  }
  if (
    finite(verified.endpoint.workersMin, 0) !== originalWorkersMin ||
    finite(verified.endpoint.workersMax, 0) !== originalWorkersMax
  ) {
    throw new Error("AVANTIQO_CODE_FLASHINFER_TEMPLATE_PATCH_VERIFY_SCALING_FAILED");
  }

  console.log(JSON.stringify({
    ...plan,
    success: true,
    mode: "APPLY",
    endpoint: safeEndpoint(verified.endpoint),
    template: safeTemplate(verified.template),
    health_after: verified.health,
    management_after: verified.management,
    mutation_performed: true,
    endpoint_temporarily_drained: true,
    image_changed: false,
    model_changed: false,
    runtime_changed: false,
    quantization_changed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    secrets_in_output: false,
    next_action: "RUN_ONE_CODE_RUNTIME_PROBE_THEN_ONE_BOUNDED_INFERENCE",
  }, null, 2));
} catch (error) {
  const rollbackErrors = [];
  if (templateMutated) {
    try {
      await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
        method: "POST",
        body: templateUpdateBody(originalTemplate, normalizeEnv(originalTemplate.env)),
      });
    } catch (rollbackError) {
      rollbackErrors.push(`template:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  if (scalingMutated || originalWorkersMin !== 0 || originalWorkersMax !== 0) {
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: originalWorkersMin, workersMax: originalWorkersMax },
      });
    } catch (rollbackError) {
      rollbackErrors.push(`scaling:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error),
    rollback_attempted: templateMutated || scalingMutated,
    rollback_errors: rollbackErrors,
    generation_submitted: false,
    production_deploy_performed: false,
    secrets_in_output: false,
  }));
  throw error;
}
