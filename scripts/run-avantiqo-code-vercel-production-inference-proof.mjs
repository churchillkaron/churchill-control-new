import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_VERCEL_PRODUCTION_INFERENCE_PROOF_V3";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const QUEUE_BASE = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const REST_BASE = "https://rest.runpod.io/v1";
const TARGET_IDLE_TIMEOUT_SECONDS = 60;
const SUBMISSION_PROPAGATION_ATTEMPTS = 24;
const SUBMISSION_PROPAGATION_DELAY_MS = 5000;
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  return { raw, body };
}

function responseDetail(body, raw) {
  return text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200);
}

async function readJson(response, label) {
  const { raw, body } = await parseJsonResponse(response);
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${responseDetail(body, raw)}`);
  return body;
}

async function queueRequest(pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_QUEUE`);
}

async function restRequest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}

function healthSummary(body = {}) {
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

function hasAnyWorker(summary) {
  return Object.values(summary.workers).some((value) => Math.max(0, Number(value) || 0) > 0);
}

function isZeroIdle(summary) {
  return summary.jobs.in_queue === 0 && summary.jobs.in_progress === 0 && !hasAnyWorker(summary);
}

function endpointSummary(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    network_volume_id: text(endpoint.networkVolumeId) || null,
  };
}

function assertEndpointIdentity(summary, phase) {
  if (summary.id !== ENDPOINT_ID || summary.name !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_${phase}_ENDPOINT_IDENTITY:${summary.id}/${summary.name}`);
  }
  if (summary.workers_min !== 0 || ![0, 1].includes(summary.workers_max)) {
    throw new Error(`${CONTRACT}_${phase}_UNEXPECTED_WORKER_POLICY:${summary.workers_min}/${summary.workers_max}`);
  }
}

function assertAcceptingRestPolicy(summary, phase) {
  assertEndpointIdentity(summary, phase);
  if (summary.workers_min !== 0 || summary.workers_max !== 1 || summary.idle_timeout_seconds !== TARGET_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`${CONTRACT}_${phase}_REST_POLICY_NOT_ACCEPTING:${JSON.stringify(summary)}`);
  }
}

async function waitForJob(jobId, key) {
  const deadline = Date.now() + 20 * 60_000;
  const timeline = [];
  while (Date.now() < deadline) {
    const status = await queueRequest(`/status/${encodeURIComponent(jobId)}`, key);
    const normalized = text(status?.status).toUpperCase();
    timeline.push({
      elapsed_ms: Date.now() - startedAt,
      status: normalized,
      delay_time_ms: finite(status?.delayTime),
      execution_time_ms: finite(status?.executionTime),
    });
    if (["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(normalized)) {
      return { status, timeline };
    }
    await sleep(5000);
  }
  throw new Error(`${CONTRACT}_JOB_TIMEOUT:${jobId}`);
}

async function waitForZeroIdle(key, phase, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  const samples = [];
  while (Date.now() < deadline) {
    const summary = healthSummary(await queueRequest("/health", key));
    samples.push({ elapsed_ms: Date.now() - startedAt, ...summary });
    if (isZeroIdle(summary)) return { health: summary, samples };
    if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
      throw new Error(`${CONTRACT}_${phase}_UNEXPECTED_LIVE_JOB:${JSON.stringify(summary.jobs)}`);
    }
    await sleep(5000);
  }
  const summary = healthSummary(await queueRequest("/health", key));
  throw new Error(`${CONTRACT}_${phase}_SCALE_DOWN_NOT_VERIFIED:${JSON.stringify(summary)}`);
}

async function patchEndpoint(key, body, phase) {
  await restRequest(`/endpoints/${ENDPOINT_ID}`, key, { method: "PATCH", body });
  const after = endpointSummary(await restRequest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, key));
  if (after.id !== ENDPOINT_ID || after.name !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_${phase}_PATCH_IDENTITY_VERIFY_FAILED`);
  }
  return after;
}

async function reconcileZeroIdlePolicy(key) {
  const beforeEndpoint = endpointSummary(await restRequest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, key));
  assertEndpointIdentity(beforeEndpoint, "RECONCILE_BEFORE");
  const beforeHealth = healthSummary(await queueRequest("/health", key));
  if (beforeHealth.jobs.in_queue !== 0 || beforeHealth.jobs.in_progress !== 0) {
    throw new Error(`${CONTRACT}_RECONCILE_LIVE_JOB_PRESENT:${JSON.stringify(beforeHealth.jobs)}`);
  }

  const needsRepair =
    beforeEndpoint.workers_max !== 1 ||
    beforeEndpoint.idle_timeout_seconds !== TARGET_IDLE_TIMEOUT_SECONDS ||
    hasAnyWorker(beforeHealth);

  if (!needsRepair) {
    return {
      mutation_performed: false,
      before_endpoint: beforeEndpoint,
      after_endpoint: beforeEndpoint,
      health_before: beforeHealth,
      settled: { health: beforeHealth, samples: [{ elapsed_ms: Date.now() - startedAt, ...beforeHealth }] },
    };
  }

  let parked = false;
  let parkedEndpoint = null;
  let settled = null;
  let restoreError = null;
  try {
    parkedEndpoint = await patchEndpoint(key, {
      workersMin: 0,
      workersMax: 0,
      idleTimeout: TARGET_IDLE_TIMEOUT_SECONDS,
    }, "PARK");
    parked = true;
    if (parkedEndpoint.workers_min !== 0 || parkedEndpoint.workers_max !== 0 || parkedEndpoint.idle_timeout_seconds !== TARGET_IDLE_TIMEOUT_SECONDS) {
      throw new Error(`${CONTRACT}_PARK_VERIFY_FAILED:${JSON.stringify(parkedEndpoint)}`);
    }
    settled = await waitForZeroIdle(key, "PARKED", 180_000);
  } finally {
    if (parked) {
      try {
        const restored = await patchEndpoint(key, {
          workersMin: 0,
          workersMax: 1,
          idleTimeout: TARGET_IDLE_TIMEOUT_SECONDS,
        }, "RESTORE");
        assertAcceptingRestPolicy(restored, "RESTORE");
      } catch (error) {
        restoreError = error;
      }
    }
  }
  if (restoreError) throw restoreError;
  if (!settled) throw new Error(`${CONTRACT}_PARKED_SETTLEMENT_REQUIRED`);

  const afterEndpoint = endpointSummary(await restRequest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, key));
  assertAcceptingRestPolicy(afterEndpoint, "RECONCILE_AFTER");
  const afterHealth = healthSummary(await queueRequest("/health", key));
  if (!isZeroIdle(afterHealth)) throw new Error(`${CONTRACT}_ZERO_IDLE_NOT_CLEAN_AFTER_RESTORE:${JSON.stringify(afterHealth)}`);

  return {
    mutation_performed: true,
    before_endpoint: beforeEndpoint,
    parked_endpoint: parkedEndpoint,
    after_endpoint: afterEndpoint,
    health_before: beforeHealth,
    settled,
    health_after_restore: afterHealth,
  };
}

async function submitProductionJob(key, body) {
  for (let attempt = 1; attempt <= SUBMISSION_PROPAGATION_ATTEMPTS; attempt += 1) {
    const restState = endpointSummary(await restRequest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, key));
    assertAcceptingRestPolicy(restState, `SUBMIT_ATTEMPT_${attempt}`);

    let response;
    try {
      response = await fetch(`${QUEUE_BASE}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`${CONTRACT}_SUBMISSION_TRANSPORT_AMBIGUOUS:${text(error?.message || error, 800)}`);
    }

    const { raw, body: responseBody } = await parseJsonResponse(response);
    if (response.ok) {
      return { submission: responseBody, propagation_retries: attempt - 1 };
    }

    const detail = responseDetail(responseBody, raw);
    const exactPausedPropagation =
      response.status === 409 &&
      detail.includes("Endpoint is paused") &&
      detail.includes("max_workers=0");
    if (!exactPausedPropagation) {
      throw new Error(`${CONTRACT}_SUBMISSION_HTTP_${response.status}:${detail}`);
    }

    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_QUEUE_POLICY_PROPAGATION_WAIT",
      contract: CONTRACT,
      attempt,
      max_attempts: SUBMISSION_PROPAGATION_ATTEMPTS,
      endpoint_rest: restState,
      job_accepted: false,
      provider_inference_performed: false,
      secrets_printed: false,
    }));

    if (attempt === SUBMISSION_PROPAGATION_ATTEMPTS) {
      throw new Error(`${CONTRACT}_QUEUE_POLICY_PROPAGATION_TIMEOUT`);
    }
    await sleep(SUBMISSION_PROPAGATION_DELAY_MS);
  }
  throw new Error(`${CONTRACT}_QUEUE_POLICY_PROPAGATION_TIMEOUT`);
}

if (text(process.env.VERCEL_ENV).toLowerCase() !== "production") {
  throw new Error(`${CONTRACT}_VERCEL_PRODUCTION_REQUIRED`);
}
const apiKey = required("RUNPOD_API_KEY");
const configuredEndpoint = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
if (configuredEndpoint && configuredEndpoint !== ENDPOINT_ID) {
  throw new Error(`${CONTRACT}_ENDPOINT_ENV_MISMATCH:${configuredEndpoint}`);
}
const engineEnabled = text(process.env.AVANTIQO_CODE_ENGINE_ENABLED).toLowerCase();
if (engineEnabled && !["1", "true", "yes", "on"].includes(engineEnabled)) {
  throw new Error(`${CONTRACT}_ENGINE_DISABLED`);
}

const startedAt = Date.now();
const reconciliation = await reconcileZeroIdlePolicy(apiKey);
const beforeSubmission = healthSummary(await queueRequest("/health", apiKey));
if (!isZeroIdle(beforeSubmission)) {
  throw new Error(`${CONTRACT}_ENDPOINT_NOT_ZERO_IDLE_BEFORE_SUBMISSION:${JSON.stringify(beforeSubmission)}`);
}

const submitted = await submitProductionJob(apiKey, {
  input: {
    contract: "AVANTIQO_CODE_ENGINE_V1",
    capability: "ai.code.review",
    organization_id: "production-proof",
    instruction: "Review this JavaScript function for production use and return exactly three concise bullets covering correctness, robustness, and maintainability: function normalizeName(value) { return String(value ?? '').trim(); }",
    structured_specification: {
      production_proof: true,
      repository_write_allowed: false,
      expected_response: "three concise review bullets",
    },
  },
});
const submission = submitted.submission;
const jobId = text(submission?.id);
if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_PRODUCTION_JOB_SUBMITTED",
  contract: CONTRACT,
  job_id: jobId,
  queue_policy_propagation_retries: submitted.propagation_retries,
  secrets_printed: false,
}));

const completed = await waitForJob(jobId, apiKey);
const runpodStatus = text(completed.status?.status).toUpperCase();
if (runpodStatus !== "COMPLETED") {
  throw new Error(`${CONTRACT}_JOB_NOT_COMPLETED:${runpodStatus}:${text(completed.status?.error || completed.status?.output?.error_message, 800)}`);
}
const output = object(completed.status?.output);
if (text(output.status) !== "completed") throw new Error(`${CONTRACT}_OUTPUT_STATUS:${text(output.status)}`);
if (text(output.provider) !== "avantiqo-code") throw new Error(`${CONTRACT}_PROVIDER:${text(output.provider)}`);
if (text(output.model) !== "avantiqo-code-v1") throw new Error(`${CONTRACT}_MODEL:${text(output.model)}`);
if (text(output.runtime_model) !== EXPECTED_RUNTIME_MODEL) throw new Error(`${CONTRACT}_RUNTIME_MODEL:${text(output.runtime_model)}`);
if (text(output.serving_runtime) !== "vllm") throw new Error(`${CONTRACT}_SERVING_RUNTIME:${text(output.serving_runtime)}`);
if (text(output.quantization).toLowerCase() !== "fp8") throw new Error(`${CONTRACT}_QUANTIZATION:${text(output.quantization)}`);
if (text(output.runtime_model_source) !== "runpod-cache") throw new Error(`${CONTRACT}_CACHE_SOURCE:${text(output.runtime_model_source)}`);
if (output.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_BOUNDARY_FAILED`);
if (text(output.result).length < 20) throw new Error(`${CONTRACT}_RESULT_REQUIRED`);

const settledAfter = await waitForZeroIdle(apiKey, "AFTER", 180_000);
const finalEndpoint = endpointSummary(await restRequest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, apiKey));
assertAcceptingRestPolicy(finalEndpoint, "FINAL");

const evidence = {
  success: true,
  contract: CONTRACT,
  vercel_environment: "production",
  vercel_git_commit_sha: text(process.env.VERCEL_GIT_COMMIT_SHA) || null,
  endpoint_id: ENDPOINT_ID,
  zero_idle_reconciliation: reconciliation,
  endpoint_before_submission: finalEndpoint,
  health_before_submission: beforeSubmission,
  queue_policy_propagation_retries: submitted.propagation_retries,
  job_id: jobId,
  runpod_status: runpodStatus,
  delay_time_ms: finite(completed.status?.delayTime),
  execution_time_ms: finite(completed.status?.executionTime),
  output: {
    status: text(output.status),
    provider: text(output.provider),
    model: text(output.model),
    foundation_model: text(output.foundation_model),
    runtime_model: text(output.runtime_model),
    serving_runtime: text(output.serving_runtime),
    serving_runtime_version: text(output.serving_runtime_version),
    runtime_model_source: text(output.runtime_model_source),
    quantization: text(output.quantization),
    generation_seconds: finite(output.generation_seconds),
    usage: object(output.usage),
    result: text(output.result, 4000),
    raw_reasoning_persisted: false,
  },
  status_timeline: completed.timeline,
  post_proof_scale_down_samples: settledAfter.samples,
  health_after: settledAfter.health,
  endpoint_after: finalEndpoint,
  zero_running_workers_after: isZeroIdle(settledAfter.health),
  production_inference_performed: true,
  endpoint_mutation_performed: reconciliation.mutation_performed,
  repository_write_performed: false,
  secrets_printed: false,
};
console.log(JSON.stringify(evidence, null, 2));
console.log(`${CONTRACT}=PASS`);
