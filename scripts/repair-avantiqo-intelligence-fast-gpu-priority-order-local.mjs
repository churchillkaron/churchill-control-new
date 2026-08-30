import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_GPU_PRIORITY_ORDER_REPAIR_V1";
const CAPACITY_SCRIPT = "scripts/repair-avantiqo-intelligence-fast-volume-local-capacity-local.mjs";
const CAPACITY_CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_VOLUME_LOCAL_CAPACITY_REPAIR_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
const uniqueOrdered = (values) => [...new Set(list(values).map((value) => text(value, 300)).filter(Boolean))];
const sorted = (values) => [...uniqueOrdered(values)].sort();
const sameSet = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const sameOrder = (left, right) => JSON.stringify(uniqueOrdered(left)) === JSON.stringify(uniqueOrdered(right));

function redact(value) {
  return text(value, 2000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code, env = process.env) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${code}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${code}_RC:${result.status}:${redact(result.stderr || result.stdout)}`);
  return String(result.stdout || "");
}

function expectedMain() {
  const expected = text(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT, 160).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_REQUIRED`);
  const head = text(shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`), 160).toLowerCase();
  if (head !== expected) throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:${head}:${expected}`);
  const dirty = text(shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_GIT_STATUS_FAILED`), 4000);
  if (dirty) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  return head;
}

function parseCapacityPlan(stdout) {
  const start = stdout.indexOf("{");
  const marker = stdout.indexOf(`\n${CAPACITY_CONTRACT}_PAID_CERTIFICATION_READY=`);
  const end = marker >= 0 ? stdout.lastIndexOf("}", marker) : stdout.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`${CONTRACT}_CAPACITY_PLAN_JSON_NOT_FOUND`);
  let plan = null;
  try { plan = JSON.parse(stdout.slice(start, end + 1)); } catch {}
  if (!plan || plan.contract !== CAPACITY_CONTRACT) throw new Error(`${CONTRACT}_CAPACITY_PLAN_INVALID`);
  if (plan.endpoint_name !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_CAPACITY_ENDPOINT_INVALID`);
  if (plan.paid_certification_ready !== true) throw new Error(`${CONTRACT}_CAPACITY_NOT_READY`);
  return plan;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || body === null) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body;
}

async function requestJson(url, key, options = {}) {
  return readJson(await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), `${CONTRACT}_RUNPOD`);
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
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

function activeWorkerCount(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    if (status) return !terminal.has(status);
    if (desired) return !terminal.has(desired);
    return false;
  }).length;
}

function stableNonGpu(endpoint = {}) {
  return {
    id: text(endpoint.id, 300),
    name: text(endpoint.name, 300),
    template_id: text(endpoint.templateId || endpoint?.template?.id, 300),
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    network_volume_id: text(endpoint.networkVolumeId, 300) || null,
    data_center_ids: sorted(endpoint.dataCenterIds),
    compute_type: text(endpoint.computeType, 120) || null,
    gpu_count: finite(endpoint.gpuCount, null),
    scaler_type: text(endpoint.scalerType, 120) || null,
    scaler_value: finite(endpoint.scalerValue, null),
    idle_timeout: finite(endpoint.idleTimeout, null),
    execution_timeout: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout, null),
  };
}

function assertParked(endpoint, health, label) {
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${label}_RESTING_0_0_REQUIRED`);
  }
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) throw new Error(`${label}_EMPTY_QUEUE_REQUIRED`);
  if (Object.values(health.workers).some((value) => finite(value, 0) > 0) || activeWorkerCount(endpoint) > 0) {
    throw new Error(`${label}_NO_ACTIVE_WORKER_REQUIRED`);
  }
}

async function endpointSnapshot(managementKey, queueKey, endpointId = null) {
  const rows = await requestJson(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
  if (!Array.isArray(rows)) throw new Error(`${CONTRACT}_ENDPOINT_LIST_INVALID`);
  const matches = rows.filter((row) =>
    text(row?.name, 300) === ENDPOINT_NAME && (!endpointId || text(row?.id, 300) === endpointId)
  );
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const id = text(endpoint?.id, 300);
  if (!id) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);
  const health = healthSummary(await requestJson(`${QUEUE}/${encodeURIComponent(id)}/health`, queueKey, { timeoutMs: 20_000 }));
  return { endpoint, endpointId: id, health };
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_FAST_GPU_PRIORITY_ORDER_REPAIR_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_GPU_PRIORITY_ORDER_REPAIR_APPROVED=YES_REQUIRED");
}
const head = expectedMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 8000);
const queueKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 8000);
if (!managementKey) throw new Error(`${CONTRACT}_MANAGEMENT_CREDENTIAL_REQUIRED`);
if (!queueKey) throw new Error(`${CONTRACT}_QUEUE_CREDENTIAL_REQUIRED`);

const capacityStdout = shell(process.execPath, [CAPACITY_SCRIPT], `${CONTRACT}_CAPACITY_PLAN_FAILED`);
const plan = parseCapacityPlan(capacityStdout);
const targetPool = uniqueOrdered(plan.target_gpu_type_ids);
const plannedCurrentPool = uniqueOrdered(plan.current_gpu_type_ids);
if (!targetPool.length) throw new Error(`${CONTRACT}_TARGET_POOL_REQUIRED`);
if (targetPool.length > 3) {
  throw new Error(`${CONTRACT}_TARGET_POOL_EXCEEDS_RUNPOD_SERVERLESS_LIMIT:${targetPool.length}`);
}

const before = await endpointSnapshot(managementKey, queueKey);
assertParked(before.endpoint, before.health, `${CONTRACT}_PRECHECK`);
const currentPool = uniqueOrdered(before.endpoint.gpuTypeIds);
if (!sameOrder(currentPool, plannedCurrentPool)) {
  throw new Error(`${CONTRACT}_LIVE_POOL_CHANGED_AFTER_PLAN`);
}
if (!sameSet(currentPool, targetPool)) {
  throw new Error(`${CONTRACT}_POOL_MEMBERSHIP_REPAIR_MUST_RUN_FIRST`);
}
const priorityRepairRequired = !sameOrder(currentPool, targetPool);
const beforeStable = stableNonGpu(before.endpoint);

const report = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  repository_head: head,
  endpoint_name: ENDPOINT_NAME,
  capacity_contract_reused: CAPACITY_CONTRACT,
  gpu_pool_membership_already_correct: true,
  current_gpu_type_ids: currentPool,
  target_gpu_type_ids: targetPool,
  priority_order_repair_required: priorityRepairRequired,
  first_choice_before: currentPool[0] || null,
  first_choice_after: targetPool[0] || null,
  inference_performed: false,
  token_generation_performed: false,
  provider_job_submitted: false,
  database_mutation_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply || !priorityRepairRequired) {
  console.log(JSON.stringify({ ...report, mutation_performed: false }, null, 2));
  console.log(`${CONTRACT}=PASS`);
  process.exit(0);
}

await requestJson(`${REST}/endpoints/${encodeURIComponent(before.endpointId)}`, managementKey, {
  method: "PATCH",
  body: { gpuTypeIds: targetPool },
});

let verifyFailure = null;
let after = null;
try {
  after = await endpointSnapshot(managementKey, queueKey, before.endpointId);
  assertParked(after.endpoint, after.health, `${CONTRACT}_POSTPATCH`);
  if (!sameOrder(uniqueOrdered(after.endpoint.gpuTypeIds), targetPool)) {
    throw new Error(`${CONTRACT}_TARGET_PRIORITY_ORDER_NOT_PERSISTED`);
  }
  if (JSON.stringify(stableNonGpu(after.endpoint)) !== JSON.stringify(beforeStable)) {
    throw new Error(`${CONTRACT}_NON_GPU_ENDPOINT_INVARIANT_CHANGED`);
  }
} catch (error) {
  verifyFailure = error;
}

if (verifyFailure) {
  let rollback = "NOT_ATTEMPTED";
  try {
    const rollbackPre = await endpointSnapshot(managementKey, queueKey, before.endpointId);
    assertParked(rollbackPre.endpoint, rollbackPre.health, `${CONTRACT}_ROLLBACK_PRECHECK`);
    if (JSON.stringify(stableNonGpu(rollbackPre.endpoint)) !== JSON.stringify(beforeStable)) {
      throw new Error(`${CONTRACT}_ROLLBACK_BLOCKED_NON_GPU_ENDPOINT_CHANGED`);
    }
    await requestJson(`${REST}/endpoints/${encodeURIComponent(before.endpointId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: currentPool },
    });
    const rolledBack = await endpointSnapshot(managementKey, queueKey, before.endpointId);
    assertParked(rolledBack.endpoint, rolledBack.health, `${CONTRACT}_ROLLBACK_VERIFY`);
    rollback = sameOrder(uniqueOrdered(rolledBack.endpoint.gpuTypeIds), currentPool)
      && JSON.stringify(stableNonGpu(rolledBack.endpoint)) === JSON.stringify(beforeStable)
      ? "PASS"
      : "FAIL_VERIFICATION";
  } catch (error) {
    rollback = `FAIL:${redact(error?.message || error)}`;
  }
  throw new Error(`${CONTRACT}_POSTPATCH_VERIFY_FAILED:${redact(verifyFailure?.message || verifyFailure)}:rollback=${rollback}`);
}

console.log(JSON.stringify({
  ...report,
  mutation_performed: true,
  final_gpu_type_ids: uniqueOrdered(after.endpoint.gpuTypeIds),
  exact_priority_order_verified: true,
  non_gpu_endpoint_invariants_preserved: true,
  rollback_available_if_verification_fails: true,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
