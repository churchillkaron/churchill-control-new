import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_LANE_LIVE_STATE_DIAGNOSTIC_V1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_LANE_LIVE_STATE_EXPECTED_MAIN";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_LIVE_STATE_EXPECTED_MAIN_INVALID:${expectedMain.slice(0, 80)}`,
    );
  }

  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_INTELLIGENCE_LIVE_STATE_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_LIVE_STATE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`,
    );
  }
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_INTELLIGENCE_LIVE_STATE_GIT_HEAD_FAILED",
  );

  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_LIVE_STATE_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`,
      );
    }
    return head;
  }

  shell("git", ["fetch", "origin", "main"], "AVANTIQO_INTELLIGENCE_LIVE_STATE_GIT_FETCH_FAILED");
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_INTELLIGENCE_LIVE_STATE_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_LIVE_STATE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return head;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = redact(
      text(body?.message || body?.error || body?.detail || raw),
    ).slice(0, 700);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_LIVE_STATE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body ?? {};
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name) {
  const matches = list(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_LIVE_STATE_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
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

function activeManagementWorkers(endpoint) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
    return desired !== "EXITED";
  }).length;
}

function endpointSummary(endpoint, health, controlWorkers) {
  return {
    present: Boolean(text(endpoint?.id)),
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    active_management_workers: activeManagementWorkers(endpoint),
    active_control_workers: controlWorkers.length,
    control_worker_statuses: controlWorkers
      .map((worker) => text(worker?.status).toUpperCase())
      .filter(Boolean)
      .sort(),
    health,
  };
}

function classify({ deep, fast }) {
  const deepMax = deep.workers_max;
  const fastMax = fast.workers_max;
  const deepQueue = deep.health.jobs.in_queue;
  const deepProgress = deep.health.jobs.in_progress;
  const fastQueue = fast.health.jobs.in_queue;
  const fastProgress = fast.health.jobs.in_progress;

  if (
    deepMax === 1 &&
    fastMax === 0 &&
    deepQueue === 0 &&
    deepProgress === 0 &&
    fastQueue === 0 &&
    fastProgress === 0
  ) {
    return "CANONICAL_DEEP_ACTIVE_FAST_PARKED";
  }

  if (
    deepMax === 0 &&
    fastMax === 1 &&
    fastQueue > 0 &&
    fastProgress === 0
  ) {
    return "FAST_ACTIVE_UNCLAIMED_QUEUE_PRESENT";
  }

  if (fastProgress > 0) {
    return "FAST_EXECUTING_JOB_PRESENT_DO_NOT_MUTATE";
  }

  if (deepProgress > 0) {
    return "DEEP_EXECUTING_JOB_PRESENT_DO_NOT_MUTATE";
  }

  if (deepMax === 0 && fastMax === 1 && fastQueue === 0) {
    return "FAST_ACTIVE_ZERO_JOB_STATE";
  }

  if (deepMax === 1 && fastMax === 1) {
    return "DUAL_INTELLIGENCE_SLOT_STATE";
  }

  return "INTELLIGENCE_LANE_STATE_NON_CANONICAL";
}

const mainCommit = validateCurrentMain();
const managementKey = text(
  process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) {
  throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
}

const endpointsRaw = await requestJson(
  `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`,
  managementKey,
);
const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const deepEndpoint = resolveOne(endpoints, DEEP_NAME);
const fastEndpoint = resolveOne(endpoints, FAST_NAME);
const deepId = text(deepEndpoint?.id);
const fastId = text(fastEndpoint?.id);
if (!deepId || !fastId) {
  throw new Error("AVANTIQO_INTELLIGENCE_LIVE_STATE_ENDPOINT_IDS_REQUIRED");
}

const [deepHealthRaw, fastHealthRaw, deepControlRaw, fastControlRaw] =
  await Promise.all([
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(deepId)}/health`, runtimeKey),
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, runtimeKey),
    requestJson(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(deepId)}/workers`,
      managementKey,
    ),
    requestJson(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/workers`,
      managementKey,
    ),
  ]);

const deepControl = normalizeRows(deepControlRaw, ["workers"]);
const fastControl = normalizeRows(fastControlRaw, ["workers"]);
const deep = endpointSummary(
  deepEndpoint,
  healthSummary(deepHealthRaw),
  deepControl,
);
const fast = endpointSummary(
  fastEndpoint,
  healthSummary(fastHealthRaw),
  fastControl,
);
const diagnosis = classify({ deep, fast });

console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      mode: "READ_ONLY_LIVE_STATE",
      main_commit: mainCommit,
      pinned_main: Boolean(text(process.env[EXPECTED_MAIN_ENV])),
      deep_endpoint: deep,
      fast_endpoint: fast,
      total_intelligence_workers_max: deep.workers_max + fast.workers_max,
      diagnosis,
      generation_submitted: false,
      inference_performed: false,
      queue_mutation_performed: false,
      endpoint_mutation_performed: false,
      template_mutation_performed: false,
      production_deploy_performed: false,
      secrets_in_output: false,
    },
    null,
    2,
  ),
);
console.log(`AVANTIQO_INTELLIGENCE_LANE_LIVE_STATE=${diagnosis}`);
console.log("AVANTIQO_INTELLIGENCE_LANE_LIVE_STATE_DIAGNOSTIC=PASS");