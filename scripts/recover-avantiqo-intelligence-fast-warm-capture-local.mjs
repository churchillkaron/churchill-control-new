import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_WARM_CAPTURE_RECOVERY_V1";
const APPROVAL = "AVANTIQO_INTELLIGENCE_FAST_WARM_CAPTURE_RECOVERY_APPROVED";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_WARM_RECOVERY_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_FAST_WARM_RECOVERY_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_FAST_WARM_RECOVERY_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_FAST_WARM_RECOVERY_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_FAST_WARM_RECOVERY_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_FAST_WARM_RECOVERY_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

async function jsonRequest(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`AVANTIQO_FAST_WARM_RECOVERY_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
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

function resolveOne(rows, name) {
  const matches = list(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_FAST_WARM_RECOVERY_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
}

async function patchWorkers(endpointId, key, workersMin, workersMax) {
  await jsonRequest(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin, workersMax },
  });
  const verified = await jsonRequest(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeWorkers=true`,
    key,
  );
  if (
    finite(verified?.workersMin, -1) !== workersMin ||
    finite(verified?.workersMax, -1) !== workersMax
  ) {
    throw new Error(
      `AVANTIQO_FAST_WARM_RECOVERY_PATCH_VERIFY_FAILED:name=${text(verified?.name)}:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}:expected_min=${workersMin}:expected_max=${workersMax}`,
    );
  }
  return verified;
}

const mainCommit = validateCurrentMain();
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const beforeEndpoints = await jsonRequest(
  `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const deepBefore = resolveOne(beforeEndpoints, DEEP_NAME);
const fastBefore = resolveOne(beforeEndpoints, FAST_NAME);
const deepId = text(deepBefore?.id);
const fastId = text(fastBefore?.id);
if (!deepId || !fastId) throw new Error("AVANTIQO_FAST_WARM_RECOVERY_ENDPOINT_IDS_REQUIRED");

const [deepHealthRaw, fastHealthRaw] = await Promise.all([
  jsonRequest(`${QUEUE_BASE}/${encodeURIComponent(deepId)}/health`, runtimeKey),
  jsonRequest(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, runtimeKey),
]);
const beforeHealth = {
  deep: healthSummary(deepHealthRaw),
  fast: healthSummary(fastHealthRaw),
};
if (
  beforeHealth.deep.jobs.in_queue !== 0 ||
  beforeHealth.deep.jobs.in_progress !== 0 ||
  beforeHealth.fast.jobs.in_queue !== 0 ||
  beforeHealth.fast.jobs.in_progress !== 0
) {
  throw new Error(
    `AVANTIQO_FAST_WARM_RECOVERY_ZERO_JOBS_REQUIRED:deep=${JSON.stringify(beforeHealth.deep.jobs)}:fast=${JSON.stringify(beforeHealth.fast.jobs)}`,
  );
}

const slotBefore = {
  deep_workers_min: finite(deepBefore?.workersMin, -1),
  deep_workers_max: finite(deepBefore?.workersMax, -1),
  fast_workers_min: finite(fastBefore?.workersMin, -1),
  fast_workers_max: finite(fastBefore?.workersMax, -1),
  fast_management_workers: list(fastBefore?.workers).length,
};

if (![0, 1].includes(slotBefore.deep_workers_max) || ![0, 1].includes(slotBefore.fast_workers_max)) {
  throw new Error(
    `AVANTIQO_FAST_WARM_RECOVERY_SLOT_STATE_INVALID:deep_max=${slotBefore.deep_workers_max}:fast_max=${slotBefore.fast_workers_max}`,
  );
}

let fastParked = false;
let deepRestored = false;
if (slotBefore.fast_workers_min !== 0 || slotBefore.fast_workers_max !== 0) {
  await patchWorkers(fastId, managementKey, 0, 0);
}
fastParked = true;

if (slotBefore.deep_workers_min !== 0 || slotBefore.deep_workers_max !== 1) {
  await patchWorkers(deepId, managementKey, 0, 1);
}
deepRestored = true;

const finalEndpoints = await jsonRequest(
  `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const deepAfter = resolveOne(finalEndpoints, DEEP_NAME);
const fastAfter = resolveOne(finalEndpoints, FAST_NAME);
const verified =
  finite(deepAfter?.workersMin, -1) === 0 &&
  finite(deepAfter?.workersMax, -1) === 1 &&
  finite(fastAfter?.workersMin, -1) === 0 &&
  finite(fastAfter?.workersMax, -1) === 0;
if (!verified) throw new Error("AVANTIQO_FAST_WARM_RECOVERY_FINAL_STATE_VERIFY_FAILED");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "RECOVER_ZERO_JOB_WARM_CAPTURE",
  main_commit: mainCommit,
  before_health: beforeHealth,
  slot_state_before: slotBefore,
  fast_warm_worker_stop_requested: slotBefore.fast_workers_min > 0 || slotBefore.fast_workers_max > 0,
  fast_parked: fastParked,
  deep_restored: deepRestored,
  canonical_state_after: {
    deep_workers_min: finite(deepAfter?.workersMin, -1),
    deep_workers_max: finite(deepAfter?.workersMax, -1),
    fast_workers_min: finite(fastAfter?.workersMin, -1),
    fast_workers_max: finite(fastAfter?.workersMax, -1),
  },
  generation_submitted: false,
  inference_performed: false,
  queue_mutation_performed: false,
  endpoint_worker_limits_mutated: true,
  production_deploy_performed: false,
  secrets_in_output: false,
}, null, 2));
