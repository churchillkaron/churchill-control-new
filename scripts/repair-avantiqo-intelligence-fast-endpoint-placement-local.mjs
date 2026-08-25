import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_PLACEMENT_REPAIR_V1";
const APPROVAL = "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_PLACEMENT_REPAIR_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const sortedText = (value) => list(value).map(text).filter(Boolean).sort();

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 500)}`);
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_PLACEMENT_GIT_FETCH_FAILED");
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_FAST_PLACEMENT_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(`AVANTIQO_FAST_PLACEMENT_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_FAST_PLACEMENT_GIT_HEAD_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_FAST_PLACEMENT_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_FAST_PLACEMENT_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return head;
}

function managementCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function queueCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function requestJson(
  url,
  apiKey,
  { method = "GET", body = undefined } = {},
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_FAST_PLACEMENT_HTTP_${response.status}`);
  }
  return parsed ?? {};
}

async function rest(path, apiKey, options = {}) {
  return requestJson(`${REST_BASE}${path}`, apiKey, options);
}

async function queueHealth(endpointId, apiKey) {
  return requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    apiKey,
  );
}

function resolveOne(items, name, code) {
  const matches = list(items).filter((item) => text(item?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function activeWorkerCount(endpoint) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
    return desired !== "EXITED";
  }).length;
}

function healthSummary(value) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs_in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    jobs_in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    workers_initializing: finite(workers.initializing, 0),
    workers_running: finite(workers.running, 0),
    workers_unhealthy: finite(workers.unhealthy, 0),
  };
}

function assertSafeParkedState(deep, fast, fastHealth) {
  if (finite(deep?.workersMin, -1) !== 0 || finite(deep?.workersMax, -1) !== 1) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_RESTORED_SCALING_REQUIRED");
  }
  if (finite(fast?.workersMin, -1) !== 0 || finite(fast?.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_PARKED_SCALING_REQUIRED");
  }
  if (activeWorkerCount(fast) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_ACTIVE_MANAGEMENT_WORKER_PRESENT");
  }
  const health = healthSummary(fastHealth);
  if (Object.values(health).some((value) => value !== 0)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_RUNTIME_NOT_IDLE:${JSON.stringify(health)}`,
    );
  }
}

function targetPlacement(endpoint) {
  return {
    allowed_cuda_versions: sortedText(endpoint?.allowedCudaVersions),
    minimum_cuda_version: text(endpoint?.minCudaVersion) || null,
  };
}

function stableEndpoint(endpoint) {
  return {
    id: text(endpoint?.id),
    name: text(endpoint?.name),
    template_id: text(endpoint?.templateId || endpoint?.template?.id),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: sortedText(endpoint?.gpuTypeIds),
    data_center_ids: sortedText(endpoint?.dataCenterIds),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    network_volume_ids: sortedText(endpoint?.networkVolumeIds),
    flashboot: endpoint?.flashboot === true,
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
  };
}

async function load(managementKey, runtimeKey) {
  const endpoints = await rest(
    "/endpoints?includeTemplate=true&includeWorkers=true",
    managementKey,
  );
  const deep = resolveOne(
    endpoints,
    DEEP_NAME,
    "AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED",
  );
  const fast = resolveOne(
    endpoints,
    FAST_NAME,
    "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED",
  );
  const fastHealth = await queueHealth(text(fast?.id), runtimeKey);
  assertSafeParkedState(deep, fast, fastHealth);
  return { deep, fast, fastHealth };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function output(payload) {
  console.log(
    JSON.stringify(
      {
        success: true,
        contract: CONTRACT,
        ...payload,
        generation_submitted: false,
        production_deploy_performed: false,
        secrets_in_output: false,
      },
      null,
      2,
    ),
  );
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}

const mainCommit = validateCurrentMain();
const managementKey = managementCredential();
const runtimeKey = queueCredential(managementKey);
let state = await load(managementKey, runtimeKey);
let desired = targetPlacement(state.deep);
let before = targetPlacement(state.fast);

if (!desired.allowed_cuda_versions.length || !desired.minimum_cuda_version) {
  throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CUDA_PLACEMENT_CONTRACT_REQUIRED");
}

const mutationRequired = !same(before, desired);
if (!apply) {
  output({
    mode: "PLAN",
    main_commit: mainCommit,
    fast_parked_safe: true,
    current_fast_placement: before,
    desired_fast_placement: desired,
    mutation_required: mutationRequired,
    mutation_performed: false,
    next_action: mutationRequired
      ? "APPROVE_FAST_ENDPOINT_PLACEMENT_REPAIR"
      : "RUN_FAST_FIRST_RESPONSE_ONCE",
  });
  process.exit(0);
}

validateCurrentMain();
state = await load(managementKey, runtimeKey);
desired = targetPlacement(state.deep);
before = targetPlacement(state.fast);
const deepStableBefore = stableEndpoint(state.deep);
const fastStableBefore = stableEndpoint(state.fast);

if (same(before, desired)) {
  output({
    mode: "APPLY",
    main_commit: mainCommit,
    fast_parked_safe: true,
    placement_before: before,
    placement_after: before,
    mutation_required: false,
    mutation_performed: false,
    verification_passed: true,
    next_action: "RUN_FAST_FIRST_RESPONSE_ONCE",
  });
  process.exit(0);
}

let rollbackPassed = null;
try {
  await rest(`/endpoints/${encodeURIComponent(text(state.fast?.id))}`, managementKey, {
    method: "PATCH",
    body: {
      allowedCudaVersions: desired.allowed_cuda_versions,
      minCudaVersion: desired.minimum_cuda_version,
    },
  });

  const verified = await load(managementKey, runtimeKey);
  const after = targetPlacement(verified.fast);
  if (!same(after, desired)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_VERIFY_FAILED");
  }
  if (!same(stableEndpoint(verified.deep), deepStableBefore)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_DEEP_ENDPOINT_CHANGED");
  }
  if (!same(stableEndpoint(verified.fast), fastStableBefore)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_OTHER_FAST_FIELDS_CHANGED");
  }

  output({
    mode: "APPLY",
    main_commit: mainCommit,
    fast_parked_safe: true,
    placement_before: before,
    placement_after: after,
    mutation_required: true,
    mutation_performed: true,
    verification_passed: true,
    rollback_performed: false,
    next_action: "RUN_FAST_FIRST_RESPONSE_ONCE",
  });
} catch (error) {
  try {
    await rest(`/endpoints/${encodeURIComponent(text(state.fast?.id))}`, managementKey, {
      method: "PATCH",
      body: {
        allowedCudaVersions: before.allowed_cuda_versions,
        minCudaVersion: before.minimum_cuda_version,
      },
    });
    const rolledBack = await load(managementKey, runtimeKey);
    rollbackPassed = same(targetPlacement(rolledBack.fast), before);
  } catch {
    rollbackPassed = false;
  }
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_REPAIR_FAILED:rollback=${rollbackPassed ? "PASS" : "FAIL"}:${text(error?.message).slice(0, 500)}`,
  );
}
