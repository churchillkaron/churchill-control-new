import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_VERCEL_PRODUCTION_INFERENCE_PROOF_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const BASE = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.error || body?.message || raw, 1200)}`);
  return body;
}

async function request(pathname, key, options = {}) {
  return readJson(await fetch(`${BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), CONTRACT);
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

async function waitForJob(jobId, key) {
  const deadline = Date.now() + 20 * 60_000;
  const timeline = [];
  while (Date.now() < deadline) {
    const status = await request(`/status/${encodeURIComponent(jobId)}`, key);
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

async function waitForZeroIdle(key, phase) {
  const deadline = Date.now() + 4 * 60_000;
  const samples = [];
  while (Date.now() < deadline) {
    const summary = healthSummary(await request("/health", key));
    samples.push({ elapsed_ms: Date.now() - startedAt, ...summary });
    if (isZeroIdle(summary)) return { health: summary, samples };
    if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
      throw new Error(`${CONTRACT}_${phase}_UNEXPECTED_LIVE_JOB:${JSON.stringify(summary.jobs)}`);
    }
    await sleep(5000);
  }
  const summary = healthSummary(await request("/health", key));
  throw new Error(`${CONTRACT}_${phase}_SCALE_DOWN_NOT_VERIFIED:${JSON.stringify(summary)}`);
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
const initiallyObserved = healthSummary(await request("/health", apiKey));
if (initiallyObserved.jobs.in_queue !== 0 || initiallyObserved.jobs.in_progress !== 0) {
  throw new Error(`${CONTRACT}_UNEXPECTED_LIVE_JOB_BEFORE:${JSON.stringify(initiallyObserved.jobs)}`);
}
const settledBefore = isZeroIdle(initiallyObserved)
  ? { health: initiallyObserved, samples: [{ elapsed_ms: 0, ...initiallyObserved }] }
  : await waitForZeroIdle(apiKey, "BEFORE");

const submission = await request("/run", apiKey, {
  method: "POST",
  body: {
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
  },
});
const jobId = text(submission?.id);
if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
console.log(JSON.stringify({ event: "AVANTIQO_CODE_PRODUCTION_JOB_SUBMITTED", contract: CONTRACT, job_id: jobId, secrets_printed: false }));

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

const settledAfter = await waitForZeroIdle(apiKey, "AFTER");
const evidence = {
  success: true,
  contract: CONTRACT,
  vercel_environment: "production",
  vercel_git_commit_sha: text(process.env.VERCEL_GIT_COMMIT_SHA) || null,
  endpoint_id: ENDPOINT_ID,
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
  health_initially_observed: initiallyObserved,
  pre_proof_scale_down_samples: settledBefore.samples,
  health_before_submission: settledBefore.health,
  post_proof_scale_down_samples: settledAfter.samples,
  health_after: settledAfter.health,
  zero_running_workers_after: isZeroIdle(settledAfter.health),
  production_inference_performed: true,
  endpoint_mutation_performed: false,
  repository_write_performed: false,
  secrets_printed: false,
};
console.log(JSON.stringify(evidence, null, 2));
console.log(`${CONTRACT}=PASS`);
