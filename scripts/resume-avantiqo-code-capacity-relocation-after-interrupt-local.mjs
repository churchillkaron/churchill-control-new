import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import {
  classifyManagedVolumeName,
  sharedVolumeGroup,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_RELOCATION_INTERRUPTED_RESUME_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const GROUP = sharedVolumeGroup("INTELLIGENCE_CODE");
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const POLL_MS = 5000;
const PRINT_MS = 20000;
const NO_WORKER_TIMEOUT_MS = 8 * 60 * 1000;
const COLD_START_TIMEOUT_MS = 12 * 60 * 1000;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const QUIESCENCE_TIMEOUT_MS = 5 * 60 * 1000;
const PROTECTED_PATHS = Object.freeze([
  "scripts/relocate-avantiqo-code-runpod-capacity-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v2-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v3-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v4-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v5-local.mjs",
  "scripts/resume-avantiqo-code-capacity-relocation-after-interrupt-local.mjs",
  "scripts/lib/avantiqo-code-runpod-endpoint-ready-fetch-guard.mjs",
  "scripts/lib/avantiqo-runpod-shared-volumes.mjs",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/Dockerfile.runpod",
]);

function text(value) { return String(value ?? "").trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function upper(value) { return text(value).toUpperCase(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value)); }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value) ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}
function required(value, code) {
  const resolved = text(value);
  if (!resolved) throw new Error(code);
  return resolved;
}
function validId(value, code) {
  const resolved = required(value, code);
  if (!/^[A-Za-z0-9-]+$/.test(resolved)) throw new Error(`${code}_INVALID`);
  return resolved;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function endpointGpuTypes(endpoint = {}) { return list(endpoint.gpuTypeIds); }
function endpointUsers(endpoints, volumeId) {
  return array(endpoints)
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
}
function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}
function workerActivity(health) {
  return health.workers.initializing + health.workers.ready + health.workers.running + health.workers.throttled > 0;
}
function blockingActivity(health) {
  return health.jobs.in_queue + health.jobs.in_progress + health.workers.initializing + health.workers.running + health.workers.unhealthy;
}
function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: number(volume?.size ?? volume?.sizeGb, null),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}
function stableEndpoint(endpoint = {}) {
  return {
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: number(endpoint?.scalerValue, null),
    idle_timeout_seconds: number(endpoint?.idleTimeout, null),
    execution_timeout_ms: number(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout, null),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
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
function requireCompatibleMain(expectedHead = null) {
  command("git", ["fetch", "origin", "main"], "CODE_CAPACITY_RESUME_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "CODE_CAPACITY_RESUME_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`CODE_CAPACITY_RESUME_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "CODE_CAPACITY_RESUME_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "CODE_CAPACITY_RESUME_ORIGIN_READ_FAILED");
  if (expectedHead && head !== expectedHead) {
    throw new Error(`CODE_CAPACITY_RESUME_LOCAL_HEAD_CHANGED:expected=${expectedHead}:actual=${head}`);
  }
  if (head !== origin) {
    const mergeBase = command("git", ["merge-base", head, origin], "CODE_CAPACITY_RESUME_MERGE_BASE_FAILED");
    if (mergeBase !== head) {
      throw new Error(`CODE_CAPACITY_RESUME_LOCAL_MAIN_DIVERGED:head=${head}:origin=${origin}:merge_base=${mergeBase}`);
    }
    const changed = command(
      "git",
      ["diff", "--name-only", `${head}..${origin}`, "--", ...PROTECTED_PATHS],
      "CODE_CAPACITY_RESUME_PROTECTED_DIFF_FAILED",
    ).split(String.fromCharCode(10)).map((entry) => entry.trim()).filter(Boolean);
    if (changed.length) {
      throw new Error(`CODE_CAPACITY_RESUME_PROTECTED_MAIN_ADVANCE_REPLAN_REQUIRED:head=${head}:origin=${origin}:changed=${changed.join("|")}`);
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_CAPACITY_RESUME_UNRELATED_MAIN_ADVANCE_ACCEPTED",
      local_head: head,
      origin_main: origin,
      protected_paths_changed: [],
    }));
  }
  return head;
}

async function readResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
  return body;
}
async function rest(path, key, options = {}) {
  return readResponse(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_REST");
}
async function queue(endpointId, path, key, options = {}) {
  return readResponse(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_QUEUE");
}
function resolveEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`CODE_CAPACITY_RESUME_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}
async function cancelJob(endpointId, key, jobId) {
  if (!jobId) return false;
  try {
    const statusBody = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
    const status = upper(statusBody?.status);
    if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) return false;
    await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" });
    console.error(`AVANTIQO_CODE_CAPACITY_RESUME_JOB_CANCELLED=${jobId}`);
    return true;
  } catch {
    return false;
  }
}
async function waitForJob(endpointId, key, jobId, label) {
  const started = Date.now();
  let startupObservedAt = null;
  let lastPrinted = 0;
  while (true) {
    const body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, key);
    const status = upper(body?.status) || "UNKNOWN";
    if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      if (status !== "COMPLETED") {
        throw new Error(`${label}_${status}:${text(body?.error || body?.output?.error || body?.message)}`);
      }
      return body;
    }

    const elapsed = Date.now() - started;
    const healthRaw = await queue(endpointId, "/health", key).catch(() => null);
    const health = healthRaw ? healthCounters(healthRaw) : null;
    const activeWorker = Boolean(health && workerActivity(health));
    if (activeWorker && startupObservedAt === null) startupObservedAt = Date.now();

    if (status === "IN_QUEUE") {
      if (startupObservedAt === null && elapsed >= NO_WORKER_TIMEOUT_MS) {
        await cancelJob(endpointId, key, jobId);
        throw new Error(`${label}_NO_WORKER_TIMEOUT:${jobId}:${Math.round(elapsed / 1000)}s`);
      }
      if (startupObservedAt !== null && Date.now() - startupObservedAt >= COLD_START_TIMEOUT_MS) {
        await cancelJob(endpointId, key, jobId);
        throw new Error(`${label}_COLD_START_TIMEOUT:${jobId}:${Math.round((Date.now() - startupObservedAt) / 1000)}s_since_worker_activity_observed`);
      }
    }
    if (elapsed >= JOB_TIMEOUT_MS) {
      await cancelJob(endpointId, key, jobId);
      throw new Error(`${label}_JOB_TIMEOUT:${jobId}:${Math.round(elapsed / 1000)}s`);
    }

    if (Date.now() - lastPrinted >= PRINT_MS) {
      console.log(JSON.stringify({
        event: `${label}_PROGRESS`,
        job_id: jobId,
        status,
        elapsed_seconds_since_resume: Math.round(elapsed / 1000),
        cold_start_policy: "HEALTH_AWARE_INTERRUPTED_RESUME",
        startup_observed: startupObservedAt !== null,
        seconds_since_startup_observed: startupObservedAt === null ? null : Math.round((Date.now() - startupObservedAt) / 1000),
        health,
      }));
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
}
function validateCache(job, jobId) {
  const output = job?.output || {};
  const checks = {
    completed: upper(job?.status) === "COMPLETED",
    runtime_model: text(output.runtime_model) === RUNTIME_MODEL,
    cache_ready: output.cache_ready === true,
    inference_not_performed: output.inference_performed === false,
    engine_not_loaded: output.engine_loaded === false,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`CODE_CAPACITY_RESUME_CACHE_VERIFY_FAILED:${jobId}:${JSON.stringify(checks)}`);
  }
  return { job_id: jobId, checks, verified: true };
}
function validateProbe(job, jobId) {
  const output = job?.output || {};
  const checks = {
    completed: upper(job?.status) === "COMPLETED",
    provider: text(output.provider) === "avantiqo-code",
    engine_contract: text(output.engine_contract) === ENGINE_CONTRACT,
    foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
    runtime_model: text(output.runtime_model) === RUNTIME_MODEL,
    serving_runtime: text(output.serving_runtime).toLowerCase() === "vllm",
    quantization: text(output.quantization).toLowerCase() === "fp8",
    cached_model_found: output.cached_model_found === true,
    raw_reasoning_boundary: output.raw_reasoning_persisted === false,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`CODE_CAPACITY_RESUME_PROBE_VERIFY_FAILED:${jobId}:${JSON.stringify(checks)}`);
  }
  return { job_id: jobId, checks, verified: true };
}
function validateInference(job, jobId) {
  const output = job?.output || {};
  const result = text(output.result);
  const checks = {
    completed: upper(job?.status) === "COMPLETED",
    provider: text(output.provider) === "avantiqo-code",
    engine_contract: text(output.engine_contract) === ENGINE_CONTRACT,
    capability: text(output.capability) === "ai.code.debug",
    foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
    runtime_model: text(output.runtime_model) === RUNTIME_MODEL,
    serving_runtime: text(output.serving_runtime).toLowerCase() === "vllm",
    quantization: text(output.quantization).toLowerCase() === "fp8",
    raw_reasoning_boundary: output.raw_reasoning_persisted === false,
    semantic_result: result.includes("Number(row.total)") && result.includes("reduce"),
    nonempty_result: result.length > 10,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`CODE_CAPACITY_RESUME_INFERENCE_VERIFY_FAILED:${jobId}:${JSON.stringify(checks)}`);
  }
  return { job_id: jobId, checks, verified: true, result_preview: result.slice(0, 300) };
}
async function submitProbe(endpointId, key) {
  const submit = await queue(endpointId, "/run", key, {
    method: "POST",
    body: { input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.code.debug",
      foundation_model: FOUNDATION_MODEL,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `code-capacity-resume-probe-${Date.now()}`,
      instruction: "Report the deployed Avantiqo Code runtime metadata only.",
      structured_specification: { runtime_probe: true, purpose: "CODE_CAPACITY_RELOCATION_INTERRUPTED_RESUME_RUNTIME_PROBE" },
    } },
  });
  const jobId = text(submit?.id);
  if (!jobId) throw new Error("CODE_CAPACITY_RESUME_PROBE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_CAPACITY_RESUME_PROBE_JOB=${jobId}`);
  return jobId;
}
async function submitInference(endpointId, key) {
  const submit = await queue(endpointId, "/run", key, {
    method: "POST",
    body: { input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.code.debug",
      foundation_model: FOUNDATION_MODEL,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `code-capacity-resume-inference-${Date.now()}`,
      instruction: "Return only the corrected one-line JavaScript expression. Fix this so numeric string totals add numerically instead of concatenating: const total = rows.reduce((sum, row) => sum + row.total, 0); The corrected expression must use Number(row.total).",
      structured_specification: { benchmark_contract: CONTRACT, benchmark_case: "first_real_inference_after_interrupted_capacity_relocation", response_style: "bounded" },
    } },
  });
  const jobId = text(submit?.id);
  if (!jobId) throw new Error("CODE_CAPACITY_RESUME_INFERENCE_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_CODE_CAPACITY_RESUME_INFERENCE_JOB=${jobId}`);
  return jobId;
}
async function waitForQuiescence(endpointId, key, label) {
  const deadline = Date.now() + QUIESCENCE_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const healthRaw = await queue(endpointId, "/health", key);
    last = healthCounters(healthRaw);
    if (last.workers.unhealthy > 0) throw new Error(`${label}_UNHEALTHY:${last.workers.unhealthy}`);
    if (blockingActivity(last) === 0) return last;
    console.log(JSON.stringify({ event: `${label}_WAIT`, health: last }));
    await sleep(POLL_MS);
  }
  throw new Error(`${label}_TIMEOUT:${JSON.stringify(last)}`);
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const resumeApproved = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_RESUME_APPROVED);
const providerApproved = yes(process.env.AVANTIQO_CODE_PROVIDER_SPEND_APPROVED);
const deleteApproved = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_DELETE_APPROVED);
if (!resumeApproved) throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_RESUME_APPROVED=YES_REQUIRED");
if (!providerApproved) throw new Error("AVANTIQO_CODE_PROVIDER_SPEND_APPROVED=YES_REQUIRED");
if (!deleteApproved) throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_DELETE_APPROVED=YES_REQUIRED");

const managementKey = required(process.env.RUNPOD_MANAGEMENT_API_KEY, "RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
const inferenceKey = required(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY,
  "RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED",
);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const sourceVolumeId = validId(
  arg("source-volume-id") || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_SOURCE_VOLUME_ID,
  "AVANTIQO_CODE_CAPACITY_RELOCATION_SOURCE_VOLUME_ID_REQUIRED",
);
const targetVolumeId = validId(
  arg("target-volume-id") || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_ID,
  "AVANTIQO_CODE_CAPACITY_RELOCATION_TARGET_VOLUME_ID_REQUIRED",
);
const cacheJobId = validId(
  arg("cache-job-id") || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_CACHE_JOB_ID,
  "AVANTIQO_CODE_CAPACITY_RELOCATION_CACHE_JOB_ID_REQUIRED",
);
let probeJobId = text(arg("probe-job-id") || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_PROBE_JOB_ID);
let inferenceJobId = text(arg("inference-job-id") || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_INFERENCE_JOB_ID);
if (probeJobId && !/^[A-Za-z0-9-]+$/.test(probeJobId)) throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_PROBE_JOB_ID_INVALID");
if (inferenceJobId && !/^[A-Za-z0-9-]+$/.test(inferenceJobId)) throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_INFERENCE_JOB_ID_INVALID");
if (sourceVolumeId === targetVolumeId) throw new Error("CODE_CAPACITY_RESUME_SOURCE_TARGET_MUST_DIFFER");

const mainSha = requireCompatibleMain();
const [initialEndpoints, initialVolumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(initialEndpoints) || !Array.isArray(initialVolumes)) {
  throw new Error("CODE_CAPACITY_RESUME_RUNPOD_LIST_INVALID");
}
const endpoint = resolveEndpoint(initialEndpoints, configuredEndpointId);
const endpointId = text(endpoint?.id);
const endpointStable = stableEndpoint(endpoint);
const endpointGpuPool = endpointGpuTypes(endpoint);
const sourceVolume = initialVolumes.find((volume) => text(volume?.id) === sourceVolumeId) || null;
const targetVolume = initialVolumes.find((volume) => text(volume?.id) === targetVolumeId) || null;
if (!sourceVolume) throw new Error("CODE_CAPACITY_RESUME_SOURCE_VOLUME_NOT_FOUND");
if (!targetVolume) throw new Error("CODE_CAPACITY_RESUME_TARGET_VOLUME_NOT_FOUND");
if (classifyManagedVolumeName(sourceVolume?.name)?.id !== GROUP.id) throw new Error("CODE_CAPACITY_RESUME_SOURCE_VOLUME_GROUP_INVALID");
if (classifyManagedVolumeName(targetVolume?.name)?.id !== GROUP.id) throw new Error("CODE_CAPACITY_RESUME_TARGET_VOLUME_GROUP_INVALID");
if (text(targetVolume?.name) !== GROUP.canonical_name) throw new Error("CODE_CAPACITY_RESUME_TARGET_VOLUME_NOT_CANONICAL");
if (number(sourceVolume?.size ?? sourceVolume?.sizeGb, 0) < 80) throw new Error("CODE_CAPACITY_RESUME_SOURCE_VOLUME_TOO_SMALL");
if (number(targetVolume?.size ?? targetVolume?.sizeGb, 0) < 80) throw new Error("CODE_CAPACITY_RESUME_TARGET_VOLUME_TOO_SMALL");
if (!sameSet(endpointVolumeIds(endpoint), [targetVolumeId])) {
  throw new Error(`CODE_CAPACITY_RESUME_TARGET_BINDING_REQUIRED:attached=${endpointVolumeIds(endpoint).join("|") || "NONE"}`);
}
if (number(endpoint?.workersMin) !== 0 || number(endpoint?.workersMax) !== 1) {
  throw new Error(`CODE_CAPACITY_RESUME_ENDPOINT_SCALING_INVALID:min=${number(endpoint?.workersMin)}:max=${number(endpoint?.workersMax)}`);
}
const sourceUsers = endpointUsers(initialEndpoints, sourceVolumeId);
if (sourceUsers.length) throw new Error(`CODE_CAPACITY_RESUME_SOURCE_STILL_ATTACHED:${JSON.stringify(sourceUsers)}`);
const targetUsers = endpointUsers(initialEndpoints, targetVolumeId);
if (targetUsers.length !== 1 || targetUsers[0].id !== endpointId) {
  throw new Error(`CODE_CAPACITY_RESUME_TARGET_USER_SET_INVALID:${JSON.stringify(targetUsers)}`);
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_RELOCATION_INTERRUPTED_RESUME_START",
  contract: CONTRACT,
  main_sha: mainSha,
  local_env_loaded: localEnvLoaded,
  endpoint_id: endpointId,
  source_volume: safeVolume(sourceVolume),
  target_volume: safeVolume(targetVolume),
  adopted_cache_job_id: cacheJobId,
  existing_probe_job_id: probeJobId || null,
  existing_inference_job_id: inferenceJobId || null,
  new_network_volume_create_allowed: false,
  new_cache_job_submit_allowed: false,
  provider_probe_or_inference_submission_approved: providerApproved,
  rollback_to_source_on_failure: true,
  delete_source_only_after_real_inference_passes: true,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

let activeJobId = cacheJobId;
let inferenceVerified = false;
try {
  const cacheCompleted = await waitForJob(endpointId, inferenceKey, cacheJobId, "AVANTIQO_CODE_CAPACITY_RESUME_CACHE");
  const cacheEvidence = validateCache(cacheCompleted, cacheJobId);

  if (!probeJobId) probeJobId = await submitProbe(endpointId, inferenceKey);
  activeJobId = probeJobId;
  const probeCompleted = await waitForJob(endpointId, inferenceKey, probeJobId, "AVANTIQO_CODE_CAPACITY_RESUME_PROBE");
  const probeEvidence = validateProbe(probeCompleted, probeJobId);

  if (!inferenceJobId) inferenceJobId = await submitInference(endpointId, inferenceKey);
  activeJobId = inferenceJobId;
  const inferenceCompleted = await waitForJob(endpointId, inferenceKey, inferenceJobId, "AVANTIQO_CODE_CAPACITY_RESUME_INFERENCE");
  const inferenceEvidence = validateInference(inferenceCompleted, inferenceJobId);
  inferenceVerified = true;
  activeJobId = null;

  requireCompatibleMain(mainSha);
  await waitForQuiescence(endpointId, inferenceKey, "AVANTIQO_CODE_CAPACITY_RESUME_FINAL_QUIESCENCE");

  const [finalEndpointsBeforeDelete, finalVolumesBeforeDelete] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/networkvolumes", managementKey),
  ]);
  const finalEndpoint = resolveEndpoint(finalEndpointsBeforeDelete, endpointId);
  if (!sameSet(endpointVolumeIds(finalEndpoint), [targetVolumeId])) throw new Error("CODE_CAPACITY_RESUME_FINAL_TARGET_BINDING_LOST");
  if (JSON.stringify(stableEndpoint(finalEndpoint)) !== JSON.stringify(endpointStable)) throw new Error("CODE_CAPACITY_RESUME_ENDPOINT_STABLE_FIELDS_CHANGED");
  const sourceStillPresent = finalVolumesBeforeDelete.some((volume) => text(volume?.id) === sourceVolumeId);
  if (!sourceStillPresent) throw new Error("CODE_CAPACITY_RESUME_SOURCE_VOLUME_DISAPPEARED_BEFORE_GOVERNED_DELETE");
  const finalSourceUsers = endpointUsers(finalEndpointsBeforeDelete, sourceVolumeId);
  if (finalSourceUsers.length) throw new Error(`CODE_CAPACITY_RESUME_SOURCE_VOLUME_GAINED_USER:${JSON.stringify(finalSourceUsers)}`);

  requireCompatibleMain(mainSha);
  await rest(`/networkvolumes/${encodeURIComponent(sourceVolumeId)}`, managementKey, { method: "DELETE" });
  const volumesAfterDelete = await rest("/networkvolumes", managementKey);
  if (volumesAfterDelete.some((volume) => text(volume?.id) === sourceVolumeId)) {
    throw new Error("CODE_CAPACITY_RESUME_SOURCE_DELETE_VERIFY_FAILED");
  }

  console.log("AVANTIQO_CODE_CAPACITY_RELOCATION_INTERRUPTED_RESUME=COMPLETE");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: endpointId,
    source_volume_id: sourceVolumeId,
    source_volume_deleted: true,
    target_volume: safeVolume(targetVolume),
    cache: cacheEvidence,
    runtime_probe: probeEvidence,
    first_real_inference: inferenceEvidence,
    inference_performed: true,
    adopted_existing_cache_job: true,
    new_cache_job_submitted: false,
    new_network_volume_created: false,
    production_deploy_performed: false,
    secrets_printed: false,
    next_action: "RUN_FINAL_AUTONOMOUS_REPAIR_CERTIFICATION",
  }, null, 2));
} catch (error) {
  await cancelJob(endpointId, inferenceKey, activeJobId);
  let rollback = { attempted: false, verified: false, target_deleted: false, error: null };
  if (!inferenceVerified) {
    rollback.attempted = true;
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 0 },
      });
      await waitForQuiescence(endpointId, inferenceKey, "AVANTIQO_CODE_CAPACITY_RESUME_ROLLBACK_QUIESCENCE");
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: {
          networkVolumeId: sourceVolumeId,
          networkVolumeIds: [sourceVolumeId],
          dataCenterIds: [],
          gpuTypeIds: endpointGpuPool,
          workersMin: 0,
          workersMax: 1,
        },
      });
      const rollbackEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
      const rolledBack = resolveEndpoint(rollbackEndpoints, endpointId);
      if (!sameSet(endpointVolumeIds(rolledBack), [sourceVolumeId])) throw new Error("CODE_CAPACITY_RESUME_ROLLBACK_SOURCE_BINDING_VERIFY_FAILED");
      if (!sameSet(endpointGpuTypes(rolledBack), endpointGpuPool)) throw new Error("CODE_CAPACITY_RESUME_ROLLBACK_GPU_POOL_VERIFY_FAILED");
      if (JSON.stringify(stableEndpoint(rolledBack)) !== JSON.stringify(endpointStable)) throw new Error("CODE_CAPACITY_RESUME_ROLLBACK_STABLE_FIELDS_VERIFY_FAILED");
      rollback.verified = true;

      const targetUsersAfterRollback = endpointUsers(rollbackEndpoints, targetVolumeId);
      if (!targetUsersAfterRollback.length) {
        await rest(`/networkvolumes/${encodeURIComponent(targetVolumeId)}`, managementKey, { method: "DELETE" });
        rollback.target_deleted = true;
      }
    } catch (rollbackError) {
      rollback.error = text(rollbackError?.message || rollbackError);
    }
  }
  console.error(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_RELOCATION_INTERRUPTED_RESUME_FAILED",
    contract: CONTRACT,
    error: text(error?.message || error),
    active_job_id: activeJobId,
    inference_verified_before_failure: inferenceVerified,
    rollback,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  throw error;
}
