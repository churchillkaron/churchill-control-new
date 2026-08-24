import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_QUALITY_CERTIFICATION_GUARD_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const QUALITY_SCRIPT = "scripts/run-avantiqo-image-quality-test-local.mjs";
const RETRY_PRELOAD = "scripts/runpod-transient-fetch-retry-preload.mjs";
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 3000;
const APPROVED_GPU_PATTERNS = Object.freeze([
  /RTX\s*PRO\s*6000.*Server/i,
  /H100.*NVL|NVL.*H100/i,
  /\bH100\b/i,
  /\bH200\b/i,
  /\bB200\b/i,
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function requireCurrentMainAtStart() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_CERTIFICATION_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_CERTIFICATION_BRANCH_READ_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_CERTIFICATION_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_CERTIFICATION_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }
  return head;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function liveWork(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    counters.workers.initializing +
    counters.workers.running
  );
}

function approvedGpu(label) {
  const value = text(label);
  return Boolean(value) && !/\bMIG\b/i.test(value) && APPROVED_GPU_PATTERNS.some((pattern) => pattern.test(value));
}

async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`);
  }
  return body;
}

async function rest(path, key) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_REST",
  );
}

async function queue(endpointId, path, key, options = {}) {
  return parseResponse(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_QUEUE",
  );
}

function resolveEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function diagnosticPayload(job = {}) {
  const output = job?.output && typeof job.output === "object" ? job.output : null;
  const error = job?.error ?? job?.message ?? output?.error ?? null;
  return {
    id: text(job?.id) || null,
    status: text(job?.status).toUpperCase() || null,
    error: typeof error === "object" ? error : text(error) || null,
    output: output
      ? {
          status: output.status ?? null,
          capability: output.capability ?? null,
          foundation_model: output.foundation_model ?? null,
          foundation_model_source: output.foundation_model_source ?? null,
          runtime_revision: output.runtime_revision ?? null,
          operation: output.operation ?? null,
          error: output.error ?? null,
          generation_seconds: output.generation_seconds ?? null,
          width: output.width ?? null,
          height: output.height ?? null,
          size_bytes: output.size_bytes ?? null,
          generation_guidance: output.generation_guidance ?? null,
          storage_reference: output.storage_reference ?? null,
        }
      : null,
  };
}

function captureOutput(chunk, state) {
  const combined = state.buffer + chunk.toString("utf8");
  const lines = combined.split(/\r?\n/);
  state.buffer = lines.pop() || "";
  for (const line of lines) {
    const jobMatch = line.match(
      /AVANTIQO_IMAGE_RUNPOD_(?:JOB_SUBMITTED|JOB_COMPLETED_IMMEDIATELY)=([A-Za-z0-9-]+)/,
    );
    if (jobMatch?.[1]) state.jobId = jobMatch[1];
    if (line.includes("AVANTIQO_RUNPOD_RUN_SUBMISSION_ACCEPTANCE_AMBIGUOUS")) {
      state.ambiguousSubmission = true;
    }
  }
}

async function waitQuiescent(endpointId, apiKey, label) {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let last = null;
  while (true) {
    last = healthCounters(await queue(endpointId, "/health", apiKey));
    if (last.workers.unhealthy > 0) {
      throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_UNHEALTHY_WORKER:${label}:${last.workers.unhealthy}`);
    }
    if (liveWork(last) === 0) return last;
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_QUIESCENCE_TIMEOUT:${label}:${JSON.stringify(last)}`);
    }
    await sleep(POLL_MS);
  }
}

async function settleExactJob(endpointId, jobId, apiKey) {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
  let status = text(body?.status).toUpperCase();

  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_CERTIFICATION_FAILED_JOB_EVIDENCE",
    job: diagnosticPayload(body),
  }, null, 2));

  if (!TERMINAL.has(status)) {
    await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" });
  }

  while (!TERMINAL.has(status)) {
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_FAILED_JOB_STILL_LIVE:${jobId}:${status || "UNKNOWN"}`);
    }
    await sleep(POLL_MS);
    body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    status = text(body?.status).toUpperCase();
  }

  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_CERTIFICATION_FAILED_JOB_SETTLED",
    job_id: jobId,
    terminal_status: status,
  }));
}

function childNodeOptions() {
  const preloadUrl = pathToFileURL(resolve(process.cwd(), RETRY_PRELOAD)).href;
  const option = `--import=${preloadUrl}`;
  const existing = text(process.env.NODE_OPTIONS);
  return existing.includes(option) ? existing : `${existing} ${option}`.trim();
}

if (!yes(process.env.AVANTIQO_IMAGE_QUALITY_CERTIFICATION_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_CERTIFICATION_APPROVED=YES_REQUIRED");
}

const mainSha = requireCurrentMainAtStart();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!inferenceKey) throw new Error("RUNPOD_IMAGE_API_KEY_REQUIRED");

console.log(`AVANTIQO_IMAGE_CERTIFICATION_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_MAIN_SHA=${mainSha}`);
console.log("AVANTIQO_IMAGE_CERTIFICATION_GENERATION_LIMIT=1");
console.log("AVANTIQO_IMAGE_CERTIFICATION_FOUNDATION=Qwen/Qwen-Image-2512");
console.log("AVANTIQO_IMAGE_CERTIFICATION_TRANSIENT_FETCH_RETRY=true");
console.log("AVANTIQO_IMAGE_CERTIFICATION_AMBIGUOUS_SUBMIT_GUARD=true");
console.log("AVANTIQO_IMAGE_CERTIFICATION_EXACT_JOB_FAILURE_CAPTURE=true");
console.log("AVANTIQO_IMAGE_CERTIFICATION_NETWORK_VOLUME_DETERMINES_DATACENTER=true");
console.log("AVANTIQO_IMAGE_CERTIFICATION_DATACENTER_PATCH_FIELD_USED=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_MAIN_ADVANCE_DURING_GPU_RUN_IS_FAILURE=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_CERTIFICATION_SECRETS_PRINTED=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) {
  throw new Error("AVANTIQO_IMAGE_CERTIFICATION_RUNPOD_LIST_INVALID");
}

const endpoint = resolveEndpoint(endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID));
const endpointId = text(endpoint?.id);
const imageVolumes = groupCacheVolumes(volumes, GROUP);
const canonicalMatches = imageVolumes.filter((volume) => text(volume?.name) === GROUP.canonical_name);
if (canonicalMatches.length !== 1 || imageVolumes.length !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_CERTIFICATION_IMAGE_VIDEO_VOLUME_NOT_CONVERGED:group_count=${imageVolumes.length}:canonical_count=${canonicalMatches.length}`,
  );
}
const canonical = canonicalMatches[0];
const canonicalId = text(canonical?.id);
if (!canonicalId || finite(canonical?.size, 0) < 80 || !text(canonical?.dataCenterId)) {
  throw new Error("AVANTIQO_IMAGE_CERTIFICATION_CANONICAL_VOLUME_INVALID");
}
const attached = endpointVolumeIds(endpoint);
if (attached.length !== 1 || attached[0] !== canonicalId) {
  throw new Error(
    `AVANTIQO_IMAGE_CERTIFICATION_CANONICAL_BINDING_REQUIRED:attached=${attached.join("|") || "NONE"}:expected=${canonicalId}`,
  );
}
if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_CERTIFICATION_SCALING_INVALID:min=${finite(endpoint?.workersMin, -1)}:max=${finite(endpoint?.workersMax, -1)}`,
  );
}
const gpuTypes = list(endpoint?.gpuTypeIds);
if (!gpuTypes.length || gpuTypes.some((gpu) => !approvedGpu(gpu))) {
  throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_GPU_POOL_INVALID:${gpuTypes.join("|") || "NONE"}`);
}

const initialHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (initialHealth.workers.unhealthy > 0 || liveWork(initialHealth) !== 0) {
  throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_ENDPOINT_NOT_QUIESCENT:${JSON.stringify(initialHealth)}`);
}

console.log(`AVANTIQO_IMAGE_CERTIFICATION_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_EFFECTIVE_DATACENTER=${text(canonical?.dataCenterId)}`);
console.log("AVANTIQO_IMAGE_CERTIFICATION_EFFECTIVE_DATACENTER_SOURCE=NETWORK_VOLUME_DATACENTER");
console.log(`AVANTIQO_IMAGE_CERTIFICATION_GPU_TYPES=${gpuTypes.join("|")}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_SHARED_POLICY=${JSON.stringify(sharedVolumePolicySummary(volumes))}`);
console.log(`AVANTIQO_IMAGE_CERTIFICATION_INITIAL_HEALTH=${JSON.stringify(initialHealth)}`);

const capture = { buffer: "", jobId: null, ambiguousSubmission: false };
const child = spawn(process.execPath, ["--env-file=.env.local", QUALITY_SCRIPT], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    RUNPOD_API_KEY: inferenceKey,
    RUNPOD_AVANTIQO_IMAGE_API_KEY: inferenceKey,
    RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID: endpointId,
    AVANTIQO_IMAGE_BENCHMARK_RUNS: "1",
    NODE_OPTIONS: childNodeOptions(),
  },
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  captureOutput(chunk, capture);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  captureOutput(chunk, capture);
});

const exitCode = await new Promise((resolvePromise, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`AVANTIQO_IMAGE_CERTIFICATION_CHILD_SIGNAL:${signal}`));
      return;
    }
    resolvePromise(code ?? 1);
  });
});

if (exitCode !== 0) {
  console.error(JSON.stringify({
    event: "AVANTIQO_IMAGE_CERTIFICATION_CHILD_FAILED",
    exit_code: exitCode,
    exact_job_id: capture.jobId,
    ambiguous_submission: capture.ambiguousSubmission,
  }));

  if (capture.jobId) {
    await settleExactJob(endpointId, capture.jobId, inferenceKey);
    await waitQuiescent(endpointId, inferenceKey, "AFTER_FAILED_EXACT_JOB");
  } else {
    const failureHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
    console.error(JSON.stringify({
      event: "AVANTIQO_IMAGE_CERTIFICATION_NO_EXACT_JOB_ID",
      ambiguous_submission: capture.ambiguousSubmission,
      health: failureHealth,
      automatic_queue_purge: false,
      blind_retry_allowed: false,
    }));
    if (capture.ambiguousSubmission || liveWork(failureHealth) > 0) {
      throw new Error("AVANTIQO_IMAGE_CERTIFICATION_SUBMISSION_AMBIGUOUS_DO_NOT_RETRY_BLINDLY");
    }
  }
  throw new Error(`AVANTIQO_IMAGE_CERTIFICATION_CHILD_EXIT:${exitCode}`);
}

const finalHealth = await waitQuiescent(endpointId, inferenceKey, "AFTER_CERTIFICATION");
let completedJob = null;
if (capture.jobId) {
  const body = await queue(endpointId, `/status/${encodeURIComponent(capture.jobId)}`, inferenceKey);
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(
      `AVANTIQO_IMAGE_CERTIFICATION_JOB_NOT_COMPLETED:${capture.jobId}:${text(body?.status) || "UNKNOWN"}`,
    );
  }
  completedJob = diagnosticPayload(body);
}

console.log("AVANTIQO_IMAGE_QUALITY_CERTIFICATION_EXECUTION=COMPLETE");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  source_main_sha: mainSha,
  endpoint_id: endpointId,
  canonical_volume_id: canonicalId,
  effective_datacenter: text(canonical?.dataCenterId),
  effective_datacenter_source: "NETWORK_VOLUME_DATACENTER",
  gpu_types: gpuTypes,
  exact_generation_job_id: capture.jobId,
  generation_job: completedJob,
  final_health: finalHealth,
  generation_limit: 1,
  blind_retry_allowed: false,
  production_deploy: false,
  next_action: "HUMAN_VISUAL_REVIEW_AND_GPU_ECONOMICS_CERTIFICATION",
}, null, 2));
