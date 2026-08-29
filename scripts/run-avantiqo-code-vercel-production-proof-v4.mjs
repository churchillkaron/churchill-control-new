import process from "node:process";
import {
  ensureCodeAIServerlessAcceptingWork,
  reapIdleCodeAIServerlessWorker,
} from "../lib/code/runtime/CodeAIServerlessZeroIdleLifecycleRuntime.js";

const CONTRACT = "AVANTIQO_CODE_VERCEL_PRODUCTION_PROOF_V4";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const QUEUE_BASE = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const REST_BASE = "https://rest.runpod.io/v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function parse(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    const detail = text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200);
    throw new Error(`${label}_HTTP_${response.status}:${detail}`);
  }
  return body;
}

async function queue(path, key, options = {}) {
  return parse(await fetch(`${QUEUE_BASE}${path}`, {
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

async function endpoint(key) {
  return parse(await fetch(`${REST_BASE}/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
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

function zeroIdle(summary) {
  return summary.jobs.in_queue === 0 &&
    summary.jobs.in_progress === 0 &&
    Object.values(summary.workers).every((value) => Number(value) === 0);
}

async function submit(key) {
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    let response;
    try {
      response = await fetch(`${QUEUE_BASE}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`${CONTRACT}_SUBMISSION_STATE_AMBIGUOUS:${text(error?.message || error, 800)}`);
    }
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
    if (response.ok) return { body, retries: attempt - 1 };
    const detail = text(body?.detail || body?.error || body?.message || raw, 1200);
    const exactPaused = response.status === 409 && detail.includes("Endpoint is paused") && detail.includes("max_workers=0");
    if (!exactPaused) throw new Error(`${CONTRACT}_SUBMISSION_HTTP_${response.status}:${detail}`);
    await ensureCodeAIServerlessAcceptingWork();
    if (attempt === 24) throw new Error(`${CONTRACT}_WAKE_PROPAGATION_EXHAUSTED`);
    await sleep(2000);
  }
  throw new Error(`${CONTRACT}_WAKE_PROPAGATION_EXHAUSTED`);
}

async function waitJob(jobId, key) {
  const deadline = Date.now() + 20 * 60_000;
  const timeline = [];
  while (Date.now() < deadline) {
    const status = await queue(`/status/${encodeURIComponent(jobId)}`, key);
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

if (text(process.env.VERCEL_ENV).toLowerCase() !== "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_REQUIRED`);
}
const key = required("RUNPOD_API_KEY");
const configuredEndpoint = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
if (configuredEndpoint && configuredEndpoint !== ENDPOINT_ID) {
  throw new Error(`${CONTRACT}_ENDPOINT_MISMATCH:${configuredEndpoint}`);
}

const startedAt = Date.now();
const cleanupBefore = await reapIdleCodeAIServerlessWorker();
const accepting = await ensureCodeAIServerlessAcceptingWork();
const healthBefore = healthSummary(await queue("/health", key));
if (!zeroIdle(healthBefore)) {
  throw new Error(`${CONTRACT}_NOT_ZERO_IDLE_BEFORE:${JSON.stringify(healthBefore)}`);
}

const submitted = await submit(key);
const jobId = text(submitted.body?.id);
if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_PRODUCTION_JOB_SUBMITTED",
  contract: CONTRACT,
  job_id: jobId,
  wake_propagation_retries: submitted.retries,
  secrets_printed: false,
}));

const completed = await waitJob(jobId, key);
if (text(completed.status?.status).toUpperCase() !== "COMPLETED") {
  throw new Error(`${CONTRACT}_JOB_NOT_COMPLETED:${text(completed.status?.status)}`);
}
const output = object(completed.status?.output);
if (text(output.status) !== "completed") throw new Error(`${CONTRACT}_OUTPUT_STATUS`);
if (text(output.provider) !== "avantiqo-code") throw new Error(`${CONTRACT}_PROVIDER`);
if (text(output.model) !== "avantiqo-code-v1") throw new Error(`${CONTRACT}_MODEL`);
if (text(output.runtime_model) !== EXPECTED_RUNTIME_MODEL) throw new Error(`${CONTRACT}_RUNTIME_MODEL:${text(output.runtime_model)}`);
if (text(output.serving_runtime) !== "vllm") throw new Error(`${CONTRACT}_SERVING_RUNTIME`);
if (text(output.quantization).toLowerCase() !== "fp8") throw new Error(`${CONTRACT}_QUANTIZATION`);
if (text(output.runtime_model_source) !== "runpod-cache") throw new Error(`${CONTRACT}_CACHE_SOURCE`);
if (output.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_BOUNDARY`);
if (text(output.result).length < 20) throw new Error(`${CONTRACT}_RESULT_REQUIRED`);

const cleanupAfter = await reapIdleCodeAIServerlessWorker();
const healthAfter = healthSummary(await queue("/health", key));
if (!zeroIdle(healthAfter)) {
  throw new Error(`${CONTRACT}_NOT_ZERO_IDLE_AFTER:${JSON.stringify(healthAfter)}`);
}
const endpointAfterRaw = await endpoint(key);
const endpointAfter = {
  workers_min: finite(endpointAfterRaw.workersMin),
  workers_max: finite(endpointAfterRaw.workersMax),
  idle_timeout_seconds: finite(endpointAfterRaw.idleTimeout),
};
if (endpointAfter.workers_min !== 0 || endpointAfter.workers_max !== 1 || endpointAfter.idle_timeout_seconds !== 60) {
  throw new Error(`${CONTRACT}_FINAL_CAPACITY:${JSON.stringify(endpointAfter)}`);
}

const evidence = {
  success: true,
  contract: CONTRACT,
  vercel_environment: "production",
  vercel_git_commit_sha: text(process.env.VERCEL_GIT_COMMIT_SHA) || null,
  endpoint_id: ENDPOINT_ID,
  cleanup_before: cleanupBefore,
  accepting_before_submission: accepting,
  health_before: healthBefore,
  job_id: jobId,
  wake_propagation_retries: submitted.retries,
  runpod_status: "COMPLETED",
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
  cleanup_after: cleanupAfter,
  health_after: healthAfter,
  endpoint_after: endpointAfter,
  zero_idle_verified_after: true,
  production_inference_performed: true,
  repository_write_performed: false,
  secrets_printed: false,
};
console.log(JSON.stringify(evidence, null, 2));
console.log(`${CONTRACT}=PASS`);
