import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2/serverless";
const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_COST_SLOT_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-fast-replacement-candidate-v1";
const BENCHMARK_NAME = "avantiqo-intelligence-trainer-v1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_BENCHMARK_COST_SLOT_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_BENCHMARK_COST_SLOT_APPROVED";
const DRAIN_TIMEOUT_MS = Number(
  process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_COST_SLOT_DRAIN_TIMEOUT_MS || 180_000,
);
const POLL_MS = 5_000;
const BILLING_RISK = new Set(["INITIALIZING", "RUNNING", "OUTDATED"]);
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1000)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
    if (head !== expected) {
      throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    }
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  if (head !== remote) {
    throw new Error(`${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return { head, pinned: false };
}

function managementCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (options.allowEmpty && !raw) return null;
  if (body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, {
    timeoutMs: 20_000,
  });
}

async function controlWorkers(endpointId, key) {
  return requestJson(`${CONTROL_BASE}/${encodeURIComponent(endpointId)}/workers`, key, {
    timeoutMs: 20_000,
  });
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name, code) {
  const matches = rows.filter((row) => text(row?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
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

function classifyWorkers(raw = {}) {
  let nonterminal = 0;
  let billingRisk = 0;
  const statuses = [];
  for (const worker of list(raw?.workers)) {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if ((status && !TERMINAL.has(status)) || (desired && !TERMINAL.has(desired))) nonterminal += 1;
    if (BILLING_RISK.has(status)) billingRisk += 1;
    if (status) statuses.push(status);
  }
  return { nonterminal, billing_risk: billingRisk, statuses };
}

async function endpointState(endpoint, managementKey, runtimeKey) {
  const id = text(endpoint?.id);
  if (!id) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED:${text(endpoint?.name)}`);
  const [healthRaw, controlRaw] = await Promise.all([
    queueHealth(id, runtimeKey),
    controlWorkers(id, managementKey),
  ]);
  return {
    id,
    name: text(endpoint?.name),
    workers_min: finite(endpoint?.workersMin, null),
    workers_max: finite(endpoint?.workersMax, null),
    health: healthSummary(healthRaw),
    control: classifyWorkers(controlRaw),
  };
}

async function loadState(managementKey, runtimeKey) {
  const raw = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const rows = normalizeRows(raw, ["endpoints", "serverlessEndpoints"]);
  const deep = resolveOne(rows, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
  const fast = resolveOne(rows, FAST_NAME, `${CONTRACT}_FAST_RESOLUTION_FAILED`);
  const candidate = resolveOne(rows, CANDIDATE_NAME, `${CONTRACT}_CANDIDATE_RESOLUTION_FAILED`);
  const benchmark = resolveOne(rows, BENCHMARK_NAME, `${CONTRACT}_BENCHMARK_RESOLUTION_FAILED`);
  const [deepState, fastState, candidateState, benchmarkState] = await Promise.all([
    endpointState(deep, managementKey, runtimeKey),
    endpointState(fast, managementKey, runtimeKey),
    endpointState(candidate, managementKey, runtimeKey),
    endpointState(benchmark, managementKey, runtimeKey),
  ]);
  return { deep: deepState, fast: fastState, candidate: candidateState, benchmark: benchmarkState };
}

function assertFastParked(state) {
  for (const lane of [state.fast, state.candidate]) {
    if (lane.workers_min !== 0 || lane.workers_max !== 0) {
      throw new Error(`${CONTRACT}_${lane.name}_NOT_PARKED_0_0`);
    }
    if (lane.health.jobs.in_queue !== 0 || lane.health.jobs.in_progress !== 0) {
      throw new Error(`${CONTRACT}_${lane.name}_HAS_ACTIVE_JOBS`);
    }
  }
}

function reportState(label, state) {
  console.log(`${CONTRACT}_${label}=${JSON.stringify({
    deep: state.deep,
    fast: state.fast,
    candidate: state.candidate,
    benchmark: state.benchmark,
  })}`);
}

async function patchWorkers(endpointId, workersMax, managementKey, code) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
  if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== workersMax) {
    throw new Error(`${code}_VERIFY_FAILED:min=${finite(verified?.workersMin)}:max=${finite(verified?.workersMax)}`);
  }
}

async function waitBillingRiskZero(name, endpointId, managementKey, runtimeKey) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt <= DRAIN_TIMEOUT_MS) {
    const endpoint = await rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
      managementKey,
    );
    last = await endpointState(endpoint, managementKey, runtimeKey);
    const queueBusy = last.health.jobs.in_queue !== 0 || last.health.jobs.in_progress !== 0;
    const healthBillingRisk = last.health.workers.initializing + last.health.workers.running;
    const safe = !queueBusy && last.control.billing_risk === 0 && healthBillingRisk === 0;
    console.log(`${CONTRACT}_DRAIN_PROGRESS=${JSON.stringify({
      lane: name,
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      jobs: last.health.jobs,
      workers: last.health.workers,
      control: last.control,
      billing_risk_cleared: safe,
    })}`);
    if (safe) return last;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_${name}_BILLING_RISK_DRAIN_TIMEOUT:${JSON.stringify(last)}`);
}

if (!Number.isInteger(DRAIN_TIMEOUT_MS) || DRAIN_TIMEOUT_MS < 60_000 || DRAIN_TIMEOUT_MS > 600_000) {
  throw new Error(`${CONTRACT}_DRAIN_TIMEOUT_INVALID:${DRAIN_TIMEOUT_MS}`);
}

const favorBenchmark = process.argv.includes("--favor-active-benchmark");
const restoreDeep = process.argv.includes("--restore-deep-after-benchmark");
const apply = process.argv.includes("--apply");
if (favorBenchmark === restoreDeep) {
  throw new Error(`${CONTRACT}_EXACTLY_ONE_MODE_REQUIRED:--favor-active-benchmark|--restore-deep-after-benchmark`);
}
if (apply && text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const runtimeKey = runtimeCredential(managementKey);
const before = await loadState(managementKey, runtimeKey);
assertFastParked(before);
reportState("BEFORE", before);

const mode = favorBenchmark ? "FAVOR_ACTIVE_BENCHMARK" : "RESTORE_DEEP_AFTER_BENCHMARK";

if (favorBenchmark) {
  if (before.benchmark.health.jobs.in_progress !== 1 || before.benchmark.health.jobs.in_queue !== 0) {
    throw new Error(`${CONTRACT}_BENCHMARK_EXACTLY_ONE_IN_PROGRESS_REQUIRED`);
  }
  if (before.benchmark.workers_min !== 0 || before.benchmark.workers_max !== 1) {
    throw new Error(`${CONTRACT}_BENCHMARK_MUST_BE_0_1_WHILE_RUNNING`);
  }
  if (before.deep.health.jobs.in_queue !== 0 || before.deep.health.jobs.in_progress !== 0) {
    throw new Error(`${CONTRACT}_DEEP_ACTIVE_JOB_REFUSED`);
  }
  if (before.deep.workers_min !== 0 || ![0, 1].includes(before.deep.workers_max)) {
    throw new Error(`${CONTRACT}_DEEP_WORKER_LIMIT_UNEXPECTED`);
  }
} else {
  if (before.benchmark.health.jobs.in_queue !== 0 || before.benchmark.health.jobs.in_progress !== 0) {
    throw new Error(`${CONTRACT}_BENCHMARK_STILL_ACTIVE_REFUSED`);
  }
  if (before.deep.health.jobs.in_queue !== 0 || before.deep.health.jobs.in_progress !== 0) {
    throw new Error(`${CONTRACT}_DEEP_ACTIVE_JOB_REFUSED`);
  }
  if (before.benchmark.workers_min !== 0 || ![0, 1].includes(before.benchmark.workers_max)) {
    throw new Error(`${CONTRACT}_BENCHMARK_WORKER_LIMIT_UNEXPECTED`);
  }
  if (before.deep.workers_min !== 0 || ![0, 1].includes(before.deep.workers_max)) {
    throw new Error(`${CONTRACT}_DEEP_WORKER_LIMIT_UNEXPECTED`);
  }
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  action: mode,
  main_commit: main.head,
  target: favorBenchmark
    ? { deep_workers: [0, 0], benchmark_workers: [0, 1], max_billable_intelligence_workers: 1 }
    : { deep_workers: [0, 1], benchmark_workers: [0, 0], max_billable_intelligence_workers: 1 },
  generation_submitted: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log(`${CONTRACT}=PLAN_READY`);
  process.exit(0);
}

if (favorBenchmark) {
  if (before.deep.workers_max === 1) {
    await patchWorkers(before.deep.id, 0, managementKey, `${CONTRACT}_DEEP_PARK`);
  }
  await waitBillingRiskZero("DEEP", before.deep.id, managementKey, runtimeKey);
  const after = await loadState(managementKey, runtimeKey);
  assertFastParked(after);
  if (after.deep.workers_min !== 0 || after.deep.workers_max !== 0) {
    throw new Error(`${CONTRACT}_DEEP_NOT_PARKED_AFTER_APPLY`);
  }
  if (after.benchmark.workers_min !== 0 || after.benchmark.workers_max !== 1) {
    throw new Error(`${CONTRACT}_BENCHMARK_WORKER_LIMIT_CHANGED`);
  }
  if (after.benchmark.health.jobs.in_progress > 1 || after.benchmark.health.jobs.in_queue > 0) {
    throw new Error(`${CONTRACT}_BENCHMARK_JOB_STATE_UNEXPECTED_AFTER_APPLY`);
  }
  reportState("AFTER", after);
  console.log(`${CONTRACT}_POLICY=ONE_PAID_INTELLIGENCE_WORKER_BENCHMARK_PRIORITY`);
  console.log(`${CONTRACT}_NEXT_ACTION=AFTER_BENCHMARK_FINISHES_RUN_RESTORE_MODE`);
} else {
  if (before.benchmark.workers_max === 1) {
    await patchWorkers(before.benchmark.id, 0, managementKey, `${CONTRACT}_BENCHMARK_PARK`);
  }
  await waitBillingRiskZero("BENCHMARK", before.benchmark.id, managementKey, runtimeKey);
  const middle = await loadState(managementKey, runtimeKey);
  assertFastParked(middle);
  if (middle.benchmark.workers_min !== 0 || middle.benchmark.workers_max !== 0) {
    throw new Error(`${CONTRACT}_BENCHMARK_NOT_PARKED_AFTER_DRAIN`);
  }
  if (middle.deep.workers_max === 0) {
    await patchWorkers(middle.deep.id, 1, managementKey, `${CONTRACT}_DEEP_RESTORE`);
  }
  const after = await loadState(managementKey, runtimeKey);
  assertFastParked(after);
  if (after.deep.workers_min !== 0 || after.deep.workers_max !== 1) {
    throw new Error(`${CONTRACT}_DEEP_NOT_RESTORED_0_1`);
  }
  if (after.benchmark.workers_min !== 0 || after.benchmark.workers_max !== 0) {
    throw new Error(`${CONTRACT}_BENCHMARK_NOT_PARKED_0_0`);
  }
  reportState("AFTER", after);
  console.log(`${CONTRACT}_POLICY=ONE_PAID_INTELLIGENCE_WORKER_CANONICAL_DEEP_PRIORITY`);
  console.log(`${CONTRACT}_NEXT_ACTION=RUN_COST_GUARD_BEFORE_ANY_PAID_FAST_OR_DEEP_PROBE`);
}

console.log(`${CONTRACT}=PASS`);
