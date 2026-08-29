const CONTRACT = "AVANTIQO_CODE_SERVERLESS_ZERO_IDLE_LIFECYCLE_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const TARGET_IDLE_TIMEOUT_SECONDS = 60;
const WORKER_SETTLE_TIMEOUT_MS = 120_000;
const WORKER_SETTLE_POLL_MS = 1_500;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function codeAIServerlessZeroIdleEnabled() {
  return enabled(process.env.AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED);
}

function endpointId() {
  const value = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID, 240);
  if (!value) throw new Error("CODE_AI_ZERO_IDLE_ENDPOINT_ID_REQUIRED");
  return value;
}

function credential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
    1000,
  );
  if (!value) throw new Error("CODE_AI_ZERO_IDLE_RUNPOD_CREDENTIAL_REQUIRED");
  return value;
}

async function responseBody(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  return { raw, body };
}

function responseDetail(body, raw) {
  return text(
    body?.detail ||
      body?.error?.message ||
      body?.error ||
      body?.message ||
      raw,
    1200,
  );
}

async function safeReadJson(url, key, label) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const { raw, body } = await responseBody(response);
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${responseDetail(body, raw)}`);
  }
  return body;
}

async function endpointSnapshot(key) {
  const id = endpointId();
  const endpoint = await safeReadJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(id)}?includeTemplate=false&includeWorkers=true`,
    key,
    "CODE_AI_ZERO_IDLE_ENDPOINT_READ",
  );
  return {
    id: text(endpoint.id, 240),
    name: text(endpoint.name, 240) || null,
    workers_min: number(endpoint.workersMin),
    workers_max: number(endpoint.workersMax),
    idle_timeout_seconds: number(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType, 80) || null,
    scaler_value: number(endpoint.scalerValue),
    flashboot:
      endpoint.flashboot === true ||
      endpoint.flashBoot === true ||
      text(endpoint.flashBootType, 80).toUpperCase() === "FLASHBOOT",
  };
}

function assertEndpointIdentity(snapshot, phase) {
  const id = endpointId();
  if (snapshot.id !== id) {
    throw new Error(`${phase}_ENDPOINT_IDENTITY_MISMATCH:${snapshot.id || "NONE"}`);
  }
  if (snapshot.workers_min !== 0 || ![0, 1].includes(snapshot.workers_max)) {
    throw new Error(
      `${phase}_UNEXPECTED_WORKER_POLICY:${snapshot.workers_min}/${snapshot.workers_max}`,
    );
  }
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: number(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: number(workers.idle, 0),
      initializing: number(workers.initializing, 0),
      ready: number(workers.ready, 0),
      running: number(workers.running, 0),
      throttled: number(workers.throttled, 0),
      unhealthy: number(workers.unhealthy, 0),
    },
  };
}

function hasWorker(summary) {
  return Object.values(summary.workers)
    .some((value) => Math.max(0, Number(value) || 0) > 0);
}

function hasJobs(summary) {
  return summary.jobs.in_queue > 0 || summary.jobs.in_progress > 0;
}

async function health(key) {
  const id = endpointId();
  return healthSummary(await safeReadJson(
    `${QUEUE_BASE}/${encodeURIComponent(id)}/health`,
    key,
    "CODE_AI_ZERO_IDLE_HEALTH_READ",
  ));
}

async function patchEndpointOnce(key, body, phase) {
  const id = endpointId();
  let response;
  try {
    response = await fetch(`${REST_BASE}/endpoints/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const observed = await endpointSnapshot(key).catch(() => null);
    if (
      observed &&
      observed.workers_min === body.workersMin &&
      observed.workers_max === body.workersMax &&
      (!Object.prototype.hasOwnProperty.call(body, "idleTimeout") ||
        observed.idle_timeout_seconds === body.idleTimeout)
    ) {
      return observed;
    }
    throw new Error(
      `${phase}_MUTATION_STATE_UNKNOWN:${text(error?.message || error, 800)}`,
    );
  }

  const { raw, body: responseJson } = await responseBody(response);
  if (!response.ok) {
    throw new Error(
      `${phase}_HTTP_${response.status}:${responseDetail(responseJson, raw)}`,
    );
  }

  const observed = await endpointSnapshot(key);
  if (
    observed.workers_min !== body.workersMin ||
    observed.workers_max !== body.workersMax ||
    (Object.prototype.hasOwnProperty.call(body, "idleTimeout") &&
      observed.idle_timeout_seconds !== body.idleTimeout)
  ) {
    throw new Error(`${phase}_VERIFY_FAILED:${JSON.stringify(observed)}`);
  }
  return observed;
}

async function restoreAcceptingCapacity(key, phase = "CODE_AI_ZERO_IDLE_RESTORE") {
  const restored = await patchEndpointOnce(
    key,
    {
      workersMin: 0,
      workersMax: 1,
      idleTimeout: TARGET_IDLE_TIMEOUT_SECONDS,
    },
    phase,
  );
  assertEndpointIdentity(restored, phase);
  return restored;
}

export async function ensureCodeAIServerlessAcceptingWork() {
  if (!codeAIServerlessZeroIdleEnabled()) {
    return {
      applicable: false,
      contract: CONTRACT,
      reason: "ZERO_IDLE_DISABLED",
      mutation_performed: false,
    };
  }

  const key = credential();
  const before = await endpointSnapshot(key);
  assertEndpointIdentity(before, "CODE_AI_ZERO_IDLE_ENSURE_BEFORE");
  const needsMutation =
    before.workers_max !== 1 ||
    before.idle_timeout_seconds !== TARGET_IDLE_TIMEOUT_SECONDS;
  const after = needsMutation
    ? await restoreAcceptingCapacity(key, "CODE_AI_ZERO_IDLE_ENSURE_ACCEPTING")
    : before;

  return {
    applicable: true,
    contract: CONTRACT,
    mutation_performed: needsMutation,
    endpoint_before: before,
    endpoint_after: after,
    accepting_work: true,
    workers_min: 0,
    workers_max: 1,
    idle_timeout_seconds: TARGET_IDLE_TIMEOUT_SECONDS,
    worker_started_by_capacity_change: false,
    provider_inference_performed: false,
    secrets_printed: false,
  };
}

export function isExactCodeAIServerlessPausedSubmissionError(error) {
  const message = text(error?.message || error, 1600);
  return (
    message.includes("AVANTIQO_CODE_RUNPOD_REQUEST_FAILED:409:") &&
    message.includes("Endpoint is paused") &&
    message.includes("max_workers=0")
  );
}

export async function reapIdleCodeAIServerlessWorker() {
  if (!codeAIServerlessZeroIdleEnabled()) {
    return {
      applicable: false,
      contract: CONTRACT,
      reason: "ZERO_IDLE_DISABLED",
      mutation_performed: false,
    };
  }

  const key = credential();
  const initialEndpoint = await endpointSnapshot(key);
  assertEndpointIdentity(initialEndpoint, "CODE_AI_ZERO_IDLE_REAP_BEFORE");
  const initialHealth = await health(key);

  if (hasJobs(initialHealth)) {
    return {
      applicable: true,
      contract: CONTRACT,
      mutation_performed: false,
      status: "LIVE_WORK_PRESERVED",
      health_before: initialHealth,
      endpoint_before: initialEndpoint,
      provider_inference_performed: false,
      secrets_printed: false,
    };
  }

  if (!hasWorker(initialHealth)) {
    const accepting = initialEndpoint.workers_max === 1
      ? initialEndpoint
      : await restoreAcceptingCapacity(key, "CODE_AI_ZERO_IDLE_REAP_RESTORE_CAPACITY");
    return {
      applicable: true,
      contract: CONTRACT,
      mutation_performed: accepting !== initialEndpoint,
      status: "ALREADY_ZERO_IDLE",
      health_before: initialHealth,
      health_after: initialHealth,
      endpoint_before: initialEndpoint,
      endpoint_after: accepting,
      zero_running_worker: true,
      accepting_work: true,
      provider_inference_performed: false,
      secrets_printed: false,
    };
  }

  let parked = false;
  let parkedEndpoint = null;
  let settledHealth = null;
  let concurrentWorkObserved = false;
  let restoreError = null;

  try {
    parkedEndpoint = await patchEndpointOnce(
      key,
      {
        workersMin: 0,
        workersMax: 0,
        idleTimeout: TARGET_IDLE_TIMEOUT_SECONDS,
      },
      "CODE_AI_ZERO_IDLE_REAP_PARK",
    );
    parked = true;

    const deadline = Date.now() + WORKER_SETTLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const currentHealth = await health(key);
      if (hasJobs(currentHealth)) {
        concurrentWorkObserved = true;
        settledHealth = currentHealth;
        break;
      }
      if (!hasWorker(currentHealth)) {
        settledHealth = currentHealth;
        break;
      }
      await delay(WORKER_SETTLE_POLL_MS);
    }

    if (!settledHealth) {
      settledHealth = await health(key);
    }
  } finally {
    if (parked) {
      try {
        await restoreAcceptingCapacity(key, "CODE_AI_ZERO_IDLE_REAP_RESTORE");
      } catch (error) {
        restoreError = error;
      }
    }
  }

  if (restoreError) throw restoreError;

  const endpointAfter = await endpointSnapshot(key);
  assertEndpointIdentity(endpointAfter, "CODE_AI_ZERO_IDLE_REAP_AFTER");
  if (endpointAfter.workers_max !== 1) {
    throw new Error(
      `CODE_AI_ZERO_IDLE_REAP_CAPACITY_NOT_RESTORED:${endpointAfter.workers_max}`,
    );
  }

  const finalHealth = await health(key);
  if (concurrentWorkObserved || hasJobs(finalHealth)) {
    return {
      applicable: true,
      contract: CONTRACT,
      mutation_performed: true,
      status: "CONCURRENT_WORK_PRESERVED",
      endpoint_before: initialEndpoint,
      parked_endpoint: parkedEndpoint,
      endpoint_after: endpointAfter,
      health_before: initialHealth,
      health_after: finalHealth,
      zero_running_worker: !hasWorker(finalHealth),
      accepting_work: true,
      provider_inference_performed: false,
      secrets_printed: false,
    };
  }

  if (hasWorker(finalHealth)) {
    throw new Error(
      `CODE_AI_ZERO_IDLE_REAP_WORKER_DID_NOT_STOP:${JSON.stringify(finalHealth.workers)}`,
    );
  }

  return {
    applicable: true,
    contract: CONTRACT,
    mutation_performed: true,
    status: "ZERO_IDLE_RESTORED",
    endpoint_before: initialEndpoint,
    parked_endpoint: parkedEndpoint,
    endpoint_after: endpointAfter,
    health_before: initialHealth,
    health_after: finalHealth,
    zero_running_worker: true,
    accepting_work: true,
    provider_inference_performed: false,
    secrets_printed: false,
  };
}

export const CodeAIServerlessZeroIdleLifecycleRuntime = Object.freeze({
  contract: CONTRACT,
  target_idle_timeout_seconds: TARGET_IDLE_TIMEOUT_SECONDS,
  enabled: codeAIServerlessZeroIdleEnabled,
  ensureAcceptingWork: ensureCodeAIServerlessAcceptingWork,
  reapIdleWorker: reapIdleCodeAIServerlessWorker,
  isExactPausedSubmissionError: isExactCodeAIServerlessPausedSubmissionError,
});

export default CodeAIServerlessZeroIdleLifecycleRuntime;
