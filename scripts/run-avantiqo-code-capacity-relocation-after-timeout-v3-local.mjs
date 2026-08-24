import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3";
const CHILD_SCRIPT = "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v2-local.mjs";
const ENDPOINT_READY_GUARD_SCRIPT = "scripts/lib/avantiqo-code-runpod-endpoint-ready-fetch-guard.mjs";
const CANONICAL_CODE_VOLUME_NAME = "avantiqo-shared-intelligence-code-cache";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["1", "true", "yes", "on", "approved"].includes(text(value).toLowerCase());
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function sameSet(left, right) {
  const a = [...new Set(left.map(text).filter(Boolean))].sort();
  const b = [...new Set(right.map(text).filter(Boolean))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function endpointVolumeIds(endpoint = {}) {
  const ids = [];
  if (text(endpoint.networkVolumeId)) ids.push(text(endpoint.networkVolumeId));
  if (Array.isArray(endpoint.networkVolumeIds)) {
    for (const id of endpoint.networkVolumeIds) {
      if (text(id)) ids.push(text(id));
    }
  }
  return [...new Set(ids)];
}

function endpointGpuIds(endpoint = {}) {
  return stringList(endpoint.gpuTypeIds);
}

function endpointDataCenterIds(endpoint = {}) {
  return stringList(endpoint.dataCenterIds);
}

function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return false;
  loadEnvFile(envPath);
  return true;
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
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 700)}`);
  }
  return body;
}

async function rest(managementKey, path, options = {}) {
  return readJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_MANAGEMENT");
}

async function serverless(apiKey, endpointId, path) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_SERVERLESS");
}

function resolveCodeEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`CODE_TIMEOUT_RECOVERY_V3_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

function stableEndpointSnapshot(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: endpointGpuIds(endpoint),
    data_center_ids: endpointDataCenterIds(endpoint),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: number(endpoint?.scalerValue, null),
    idle_timeout: number(endpoint?.idleTimeout, null),
    execution_timeout_ms: number(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout, null),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
}

function verifyPausedBaselineRepair(before, after) {
  const stableBefore = stableEndpointSnapshot(before);
  const stableAfter = stableEndpointSnapshot(after);
  if (stableAfter.id !== stableBefore.id || stableAfter.name !== stableBefore.name) {
    throw new Error("CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_ENDPOINT_IDENTITY_CHANGED");
  }
  if (stableAfter.template_id !== stableBefore.template_id) {
    throw new Error("CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_TEMPLATE_CHANGED");
  }
  if (!sameSet(stableAfter.network_volume_ids, stableBefore.network_volume_ids)) {
    throw new Error("CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_VOLUME_CHANGED");
  }
  if (!sameSet(stableAfter.gpu_type_ids, stableBefore.gpu_type_ids)) {
    throw new Error("CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_GPU_CHANGED");
  }
  if (!sameSet(stableAfter.data_center_ids, stableBefore.data_center_ids)) {
    throw new Error("CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_DATACENTER_CHANGED");
  }
  for (const key of ["scaler_type", "scaler_value", "idle_timeout", "execution_timeout_ms", "flashboot"]) {
    if (stableAfter[key] !== stableBefore[key]) {
      throw new Error(`CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_UNRELATED_FIELD_CHANGED:${key}`);
    }
  }
  if (number(after?.workersMin) !== 0 || number(after?.workersMax) !== 1) {
    throw new Error(
      `CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_WORKER_VERIFY_FAILED:min=${number(after?.workersMin)}:max=${number(after?.workersMax)}`,
    );
  }
}

const localEnvLoaded = loadLocalEnvironment();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
const failedJobId = text(process.argv[2] || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_JOB_ID);
const apply = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_APPLY);
const relocationApproved = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_APPROVED);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!failedJobId || !/^[A-Za-z0-9-]+$/.test(failedJobId)) {
  throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_JOB_ID_REQUIRED");
}

const endpointReadyGuardPath = resolve(process.cwd(), ENDPOINT_READY_GUARD_SCRIPT);
if (!existsSync(endpointReadyGuardPath)) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V3_ENDPOINT_READY_GUARD_REQUIRED");
}
const inheritedNodeOptions = text(process.env.NODE_OPTIONS);
const guardNodeOption = `--import=${endpointReadyGuardPath}`;
const childNodeOptions = inheritedNodeOptions.includes(endpointReadyGuardPath)
  ? inheritedNodeOptions
  : [inheritedNodeOptions, guardNodeOption].filter(Boolean).join(" ");
const childEnv = {
  ...process.env,
  NODE_OPTIONS: childNodeOptions,
};

let [beforeVolumes, beforeEndpoints] = await Promise.all([
  rest(managementKey, "/networkvolumes"),
  rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true"),
]);
if (!Array.isArray(beforeVolumes) || !Array.isArray(beforeEndpoints)) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V3_RUNPOD_LIST_INVALID");
}
const beforeVolumeIds = new Set(beforeVolumes.map((volume) => text(volume?.id)).filter(Boolean));
let codeEndpoint = resolveCodeEndpoint(beforeEndpoints);
const endpointId = text(codeEndpoint?.id);
let pausedBaselineRecovered = false;
let pausedBaselineHealth = null;

if (apply && number(codeEndpoint?.workersMax) === 0) {
  if (!relocationApproved) {
    throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_APPROVED=YES_REQUIRED_FOR_PAUSED_BASELINE_RECOVERY");
  }
  if (!apiKey) {
    throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED_FOR_PAUSED_BASELINE_RECOVERY");
  }

  pausedBaselineHealth = healthCounters(await serverless(apiKey, endpointId, "/health"));
  if (
    pausedBaselineHealth.jobs.in_queue > 0 ||
    pausedBaselineHealth.jobs.in_progress > 0 ||
    pausedBaselineHealth.workers.initializing > 0 ||
    pausedBaselineHealth.workers.running > 0 ||
    pausedBaselineHealth.workers.unhealthy > 0
  ) {
    throw new Error(`CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_LIVE_WORK_BLOCKS_REPAIR:${JSON.stringify(pausedBaselineHealth)}`);
  }

  const beforeRepair = codeEndpoint;
  await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  });

  const repairedEndpoints = await rest(
    managementKey,
    "/endpoints?includeTemplate=true&includeWorkers=true",
  );
  if (!Array.isArray(repairedEndpoints)) {
    throw new Error("CODE_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_ENDPOINT_LIST_INVALID_AFTER_REPAIR");
  }
  const repaired = resolveCodeEndpoint(repairedEndpoints);
  verifyPausedBaselineRepair(beforeRepair, repaired);
  codeEndpoint = repaired;
  beforeEndpoints = repairedEndpoints;
  pausedBaselineRecovered = true;

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_PAUSED_BASELINE_RECOVERED",
    contract: CONTRACT,
    endpoint_id: endpointId,
    workers_before: {
      min: number(beforeRepair?.workersMin),
      max: number(beforeRepair?.workersMax),
    },
    workers_after: {
      min: number(repaired?.workersMin),
      max: number(repaired?.workersMax),
    },
    health_before_repair: pausedBaselineHealth,
    unrelated_endpoint_state_preserved: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_START",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  failed_job_id: failedJobId,
  canonical_code_volume_name: CANONICAL_CODE_VOLUME_NAME,
  preexisting_volume_count: beforeVolumeIds.size,
  child_script: CHILD_SCRIPT,
  cleanup_scope: "ONLY_NEW_UNATTACHED_CANONICAL_CODE_VOLUME_CREATED_BY_THIS_RUN",
  endpoint_workers_at_child_start: {
    min: number(codeEndpoint?.workersMin),
    max: number(codeEndpoint?.workersMax),
  },
  paused_baseline_recovered: pausedBaselineRecovered,
  canonical_interactive_worker_baseline: { min: 0, max: 1 },
  endpoint_ready_guard_script: ENDPOINT_READY_GUARD_SCRIPT,
  endpoint_ready_guard_propagates_to_descendants: true,
  endpoint_ready_guard_retry_only_on_explicit_409_paused: true,
  endpoint_ready_guard_duplicate_job_retry: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const child = spawnSync(process.execPath, [resolve(process.cwd(), CHILD_SCRIPT), failedJobId], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: "inherit",
});

if (child.error) throw child.error;
if (child.signal) throw new Error(`CODE_TIMEOUT_RECOVERY_V3_CHILD_SIGNAL:${child.signal}`);

if (child.status === 0) {
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_COMPLETE",
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    child_exit_code: 0,
    paused_baseline_recovered: pausedBaselineRecovered,
    endpoint_ready_guard_propagated: true,
    orphan_cleanup_required: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  process.exit(0);
}

let cleanup = {
  attempted: false,
  deleted_volume_ids: [],
  preserved_attached_new_volume_ids: [],
  cleanup_errors: [],
};

if (apply) {
  cleanup.attempted = true;
  try {
    const [afterVolumes, afterEndpoints] = await Promise.all([
      rest(managementKey, "/networkvolumes"),
      rest(managementKey, "/endpoints?includeTemplate=false&includeWorkers=true"),
    ]);
    if (!Array.isArray(afterVolumes) || !Array.isArray(afterEndpoints)) {
      throw new Error("CODE_TIMEOUT_RECOVERY_V3_POST_FAILURE_RUNPOD_LIST_INVALID");
    }

    const newlyCreatedCanonical = afterVolumes.filter((volume) =>
      text(volume?.name) === CANONICAL_CODE_VOLUME_NAME &&
      text(volume?.id) &&
      !beforeVolumeIds.has(text(volume?.id)),
    );

    for (const volume of newlyCreatedCanonical) {
      const volumeId = text(volume?.id);
      const users = afterEndpoints
        .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
        .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
      if (users.length) {
        cleanup.preserved_attached_new_volume_ids.push({ volume_id: volumeId, users });
        continue;
      }
      try {
        await rest(managementKey, `/networkvolumes/${encodeURIComponent(volumeId)}`, { method: "DELETE" });
        cleanup.deleted_volume_ids.push(volumeId);
        console.error(`AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_ORPHAN_VOLUME_DELETED=${volumeId}`);
      } catch (error) {
        cleanup.cleanup_errors.push({ volume_id: volumeId, error: text(error?.message || error) });
      }
    }
  } catch (error) {
    cleanup.cleanup_errors.push({ volume_id: null, error: text(error?.message || error) });
  }
}

console.error(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V3_CHILD_FAILED",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  child_exit_code: child.status,
  paused_baseline_recovered: pausedBaselineRecovered,
  endpoint_ready_guard_propagated: true,
  cleanup,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
process.exit(child.status || 1);
