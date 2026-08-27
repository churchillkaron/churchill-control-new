import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_COLDSTART_DIAGNOSTIC_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep";
const ENDPOINT_NAME = "avantiqo-intelligence-v1";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const SCHEDULER_WINDOW_MS = 90_000;
const POLL_MS = 5_000;
const WARM_OPENAI_TIMEOUT_MS = 60_000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function upper(value) {
  return text(value, 120).toUpperCase();
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 800)}`);
  }
  return text(result.stdout, 1000);
}

function validateLocalMain() {
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_DEEP_COLDSTART_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(`AVANTIQO_DEEP_COLDSTART_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  return shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_DEEP_COLDSTART_GIT_HEAD_FAILED",
  );
}

function requireSafeLease() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_DEEP_COLDSTART_DIAGNOSTIC_APPROVED)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_DEEP_COLDSTART_DIAGNOSTIC_APPROVED=YES_REQUIRED",
    );
  }
  if (upper(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE) !== "YES") {
    throw new Error("AVANTIQO_DEEP_COLDSTART_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_DEEP_COLDSTART_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_DEEP_COLDSTART_SAFE_LEASE_LANE_MISMATCH");
  }
  const leaseEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID, 200);
  if (!leaseEndpointId || !configuredEndpointId || leaseEndpointId !== configuredEndpointId) {
    throw new Error("AVANTIQO_DEEP_COLDSTART_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  return leaseEndpointId;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_DEEP_COLDSTART_HTTP_${response.status}:${text(
        body?.error?.message || body?.error || body?.message || raw,
        700,
      )}`,
    );
  }
  if (body === null) {
    throw new Error("AVANTIQO_DEEP_COLDSTART_NON_JSON_RESPONSE");
  }
  return body;
}

function healthSummary(body = {}) {
  return {
    jobs: {
      in_queue: finite(body?.jobs?.inQueue ?? body?.jobs?.in_queue),
      in_progress: finite(body?.jobs?.inProgress ?? body?.jobs?.in_progress),
    },
    workers: {
      initializing: finite(body?.workers?.initializing),
      running: finite(body?.workers?.running),
      idle: finite(body?.workers?.idle),
      ready: finite(body?.workers?.ready),
      unhealthy: finite(body?.workers?.unhealthy),
    },
  };
}

function terminalStatus(value) {
  return ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(
    upper(value),
  );
}

const mainCommit = validateLocalMain();
const endpointId = requireSafeLease();
const managementKey = text(
  process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  500,
);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey, 500);
if (!managementKey || !runtimeKey) {
  throw new Error("AVANTIQO_DEEP_COLDSTART_RUNPOD_CREDENTIAL_REQUIRED");
}

const model = text(process.env.AVANTIQO_INTELLIGENCE_MODEL, 300) || DEFAULT_MODEL;
const restBase = "https://rest.runpod.io/v1";
const controlBase = "https://api.runpod.io/v2";
const queueBase = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`;

const endpointsRaw = await requestJson(
  `${restBase}/endpoints?includeTemplate=false&includeWorkers=true`,
  managementKey,
);
const endpoints = Array.isArray(endpointsRaw)
  ? endpointsRaw
  : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items);
const matches = endpoints.filter((entry) => text(entry?.name, 300) === ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_DEEP_COLDSTART_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
}
const endpoint = matches[0];
if (text(endpoint?.id, 200) !== endpointId) {
  throw new Error("AVANTIQO_DEEP_COLDSTART_ENDPOINT_ID_RESOLUTION_MISMATCH");
}
if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 1) {
  throw new Error(
    `AVANTIQO_DEEP_COLDSTART_SAFE_LEASE_CAPACITY_INVALID:${finite(endpoint?.workersMin, -1)}/${finite(endpoint?.workersMax, -1)}`,
  );
}

const initialHealth = healthSummary(
  await requestJson(`${queueBase}/health`, runtimeKey),
);
if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0) {
  throw new Error("AVANTIQO_DEEP_COLDSTART_QUEUE_NOT_EMPTY");
}

console.log(
  JSON.stringify(
    {
      contract: CONTRACT,
      phase: "NATIVE_WAKEUP_START",
      main_commit: mainCommit,
      endpoint_name: ENDPOINT_NAME,
      safe_lease_verified: true,
      workers_min: 0,
      workers_max: 1,
      scheduler_window_seconds: SCHEDULER_WINDOW_MS / 1000,
      native_wakeup_submitted: false,
      secrets_printed: false,
    },
    null,
    2,
  ),
);

const wakeup = await requestJson(`${queueBase}/run`, runtimeKey, {
  method: "POST",
  timeoutMs: 20_000,
  body: {
    input: {
      route: "/v1/chat/completions",
      method: "POST",
      body: {
        model,
        messages: [{ role: "user", content: "Reply only READY." }],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 8,
      },
    },
  },
});
const jobId = text(wakeup?.id, 300);
if (!jobId) throw new Error("AVANTIQO_DEEP_COLDSTART_WAKEUP_JOB_ID_MISSING");

const startedAt = Date.now();
let firstWorkerMs = null;
let firstProgressMs = null;
let lastStatus = "IN_QUEUE";
let latestHealth = initialHealth;
let latestControlStatuses = [];
let finalStatus = null;

while (Date.now() - startedAt < SCHEDULER_WINDOW_MS) {
  const elapsedMs = Date.now() - startedAt;
  const [healthRaw, controlRaw, statusRaw] = await Promise.all([
    requestJson(`${queueBase}/health`, runtimeKey).catch(() => ({})),
    requestJson(
      `${controlBase}/serverless/${encodeURIComponent(endpointId)}/workers`,
      managementKey,
    ).catch(() => ({})),
    requestJson(`${queueBase}/status/${encodeURIComponent(jobId)}`, runtimeKey).catch(
      () => ({}),
    ),
  ]);

  latestHealth = healthSummary(healthRaw);
  latestControlStatuses = list(controlRaw?.workers)
    .map((worker) => upper(worker?.status))
    .filter(Boolean)
    .sort();
  lastStatus = upper(statusRaw?.status || statusRaw?.state) || lastStatus;

  const visibleWorkers =
    latestHealth.workers.initializing +
    latestHealth.workers.running +
    latestHealth.workers.idle +
    latestHealth.workers.ready +
    latestControlStatuses.filter(
      (status) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status),
    ).length;

  if (firstWorkerMs === null && visibleWorkers > 0) firstWorkerMs = elapsedMs;
  if (firstProgressMs === null && latestHealth.jobs.in_progress > 0) {
    firstProgressMs = elapsedMs;
  }

  console.log(
    `AVANTIQO_DEEP_COLDSTART_PROGRESS=${JSON.stringify({
      elapsed_seconds: Math.floor(elapsedMs / 1000),
      status: lastStatus,
      jobs_in_queue: latestHealth.jobs.in_queue,
      jobs_in_progress: latestHealth.jobs.in_progress,
      workers_initializing: latestHealth.workers.initializing,
      workers_running: latestHealth.workers.running,
      workers_idle: latestHealth.workers.idle,
      control_worker_statuses: latestControlStatuses,
    })}`,
  );

  if (terminalStatus(lastStatus)) {
    finalStatus = statusRaw;
    break;
  }
  await sleep(POLL_MS);
}

if (!finalStatus && firstWorkerMs === null && firstProgressMs === null) {
  console.log(
    JSON.stringify(
      {
        success: false,
        contract: CONTRACT,
        diagnosis: "RUNPOD_DEEP_SCHEDULER_UNSCHEDULED",
        native_wakeup_submitted: true,
        first_worker_ms: null,
        first_progress_ms: null,
        final_status: lastStatus,
        latest_health: latestHealth,
        control_worker_statuses: latestControlStatuses,
        warm_openai_probe_submitted: false,
        production_deploy_performed: false,
        endpoint_mutation_performed_by_child: false,
        template_mutation_performed: false,
        secrets_printed: false,
      },
      null,
      2,
    ),
  );
  console.log("AVANTIQO_INTELLIGENCE_DEEP_COLDSTART_DIAGNOSTIC=UNSCHEDULED");
  process.exit(2);
}

if (!finalStatus || upper(finalStatus?.status || finalStatus?.state) !== "COMPLETED") {
  console.log(
    JSON.stringify(
      {
        success: false,
        contract: CONTRACT,
        diagnosis: "RUNPOD_DEEP_WORKER_STARTED_BUT_NATIVE_JOB_NOT_COMPLETED",
        native_wakeup_submitted: true,
        first_worker_ms: firstWorkerMs,
        first_progress_ms: firstProgressMs,
        final_status: finalStatus
          ? upper(finalStatus?.status || finalStatus?.state)
          : lastStatus,
        latest_health: latestHealth,
        control_worker_statuses: latestControlStatuses,
        warm_openai_probe_submitted: false,
        production_deploy_performed: false,
        endpoint_mutation_performed_by_child: false,
        template_mutation_performed: false,
        secrets_printed: false,
      },
      null,
      2,
    ),
  );
  console.log("AVANTIQO_INTELLIGENCE_DEEP_COLDSTART_DIAGNOSTIC=WORKER_OR_NATIVE_RUNTIME_BLOCKED");
  process.exit(3);
}

let warmOpenAiPassed = false;
let warmOpenAiError = null;
const warmStartedAt = Date.now();
try {
  const warm = await requestJson(`${queueBase}/openai/v1/chat/completions`, runtimeKey, {
    method: "POST",
    timeoutMs: WARM_OPENAI_TIMEOUT_MS,
    body: {
      model,
      messages: [{ role: "user", content: "Reply only READY." }],
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 8,
    },
  });
  warmOpenAiPassed = Boolean(warm?.choices?.[0]?.message);
} catch (error) {
  warmOpenAiError = text(error?.message || error, 700);
}

const diagnosis = warmOpenAiPassed
  ? "NATIVE_WAKEUP_AND_WARM_OPENAI_ROUTE_HEALTHY"
  : "NATIVE_WAKEUP_HEALTHY_WARM_OPENAI_ROUTE_FAILED";

console.log(
  JSON.stringify(
    {
      success: warmOpenAiPassed,
      contract: CONTRACT,
      diagnosis,
      native_wakeup_submitted: true,
      native_wakeup_completed: true,
      first_worker_ms: firstWorkerMs,
      first_progress_ms: firstProgressMs,
      native_delay_ms: finite(finalStatus?.delayTime),
      native_execution_ms: finite(finalStatus?.executionTime),
      warm_openai_probe_submitted: true,
      warm_openai_probe_passed: warmOpenAiPassed,
      warm_openai_latency_ms: Date.now() - warmStartedAt,
      warm_openai_error: warmOpenAiError,
      production_deploy_performed: false,
      endpoint_mutation_performed_by_child: false,
      template_mutation_performed: false,
      secrets_printed: false,
    },
    null,
    2,
  ),
);
console.log(
  `AVANTIQO_INTELLIGENCE_DEEP_COLDSTART_DIAGNOSTIC=${warmOpenAiPassed ? "PASS" : "WARM_OPENAI_FAILED"}`,
);
if (!warmOpenAiPassed) process.exit(4);
