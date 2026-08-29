import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_PRODUCTION_PROOF_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const REQUIRED_NETWORK_VOLUME_ID = "7obluigbr0";
const IMMUTABLE_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-worker@sha256:4cbbea028c8bcfae7c955a1b42e90e089e1f0fc1169fd98bbace2670dae4d425";
const IMAGE_SOURCE_SHA = "e1a688d73f506778c4d52a91e71030d74cdd3208";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const SERVERLESS_IMAGE_INPUTS = [
  "services/avantiqo-code-engine/Dockerfile.runpod",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/serverless_boot.py",
  "services/avantiqo-code-engine/requirements.txt",
];
const REPORT_PATH = process.env.AVANTIQO_CODE_PRODUCTION_PROOF_REPORT || "/tmp/avantiqo-code-production-proof.json";

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout, 1200)}`);
  return text(result.stdout, 100000);
}

function sourceGate() {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`).toLowerCase();
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain], {
    cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_MAIN`);
  const changed = command(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", ...SERVERLESS_IMAGE_INPUTS],
    `${CONTRACT}_IMAGE_SOURCE_DIFF_FAILED`,
  ).split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (changed.length) throw new Error(`${CONTRACT}_SERVERLESS_IMAGE_INPUT_MOVED:${changed.join(",")}`);
  return originMain;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200)}`);
  }
  return body;
}

async function rest(pathname, key, options = {}) {
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

async function queue(pathname, key, options = {}) {
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

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
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

function activeWorkers(summary) {
  return Object.values(summary.workers).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function assertIdle(summary, label) {
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0 || activeWorkers(summary) !== 0) {
    throw new Error(`${label}_NOT_ZERO_IDLE:${JSON.stringify(summary)}`);
  }
}

function endpointSummary(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    scaler_type: text(endpoint.scalerType).toUpperCase(),
    scaler_value: finite(endpoint.scalerValue),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map((entry) => text(entry)).filter(Boolean),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map((entry) => text(entry)).filter(Boolean),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
  };
}

async function liveSnapshot(managementKey, runtimeKey) {
  const [endpoint, templatesRaw, healthRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
    queue("/health", runtimeKey),
  ]);
  const summary = endpointSummary(endpoint);
  if (summary.id !== ENDPOINT_ID || summary.name !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_MISMATCH`);
  if (summary.network_volume_id !== REQUIRED_NETWORK_VOLUME_ID) throw new Error(`${CONTRACT}_NETWORK_VOLUME_MISMATCH:${summary.network_volume_id || "NONE"}`);
  if (!summary.flashboot) throw new Error(`${CONTRACT}_FLASHBOOT_REQUIRED`);
  if (summary.scaler_type !== "QUEUE_DELAY" || summary.scaler_value !== 1) throw new Error(`${CONTRACT}_QUEUE_DELAY_1_REQUIRED`);
  if (!summary.template_id) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);
  const templates = normalizeRows(templatesRaw, ["templates"]);
  const matches = templates.filter((entry) => text(entry?.id) === summary.template_id);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  if (text(matches[0]?.imageName) !== IMMUTABLE_IMAGE) throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_MISMATCH:${text(matches[0]?.imageName)}`);
  return { endpoint, endpoint_summary: summary, template: matches[0], health: healthSummary(healthRaw) };
}

async function waitForStatus(jobId, runtimeKey) {
  const deadline = Date.now() + 20 * 60_000;
  const timeline = [];
  let last = null;
  while (Date.now() < deadline) {
    last = await queue(`/status/${encodeURIComponent(jobId)}`, runtimeKey);
    timeline.push({ at_ms: Date.now(), status: text(last?.status), delayTime: finite(last?.delayTime), executionTime: finite(last?.executionTime) });
    const status = text(last?.status).toUpperCase();
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) return { response: last, timeline };
    await sleep(5000);
  }
  return { response: last, timeline, timed_out: true };
}

async function waitForScaleDown(runtimeKey) {
  const deadline = Date.now() + 4 * 60_000;
  let last = null;
  const samples = [];
  while (Date.now() < deadline) {
    last = healthSummary(await queue("/health", runtimeKey));
    samples.push({ at_ms: Date.now(), ...last });
    if (last.jobs.in_queue === 0 && last.jobs.in_progress === 0 && activeWorkers(last) === 0) {
      return { scaled_down: true, health: last, samples };
    }
    await sleep(5000);
  }
  return { scaled_down: false, health: last, samples };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!runtimeKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");
if (text(process.env.AVANTIQO_CODE_PRODUCTION_PROOF_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_PRODUCTION_PROOF_APPROVED=YES_REQUIRED");
}

let submittedJobId = null;
let report = null;
try {
  const validatedOriginMain = sourceGate();
  let before = await liveSnapshot(managementKey, runtimeKey);
  assertIdle(before.health, `${CONTRACT}_BEFORE`);
  if (before.endpoint_summary.workers_min !== 0 || ![0, 1].includes(before.endpoint_summary.workers_max)) {
    throw new Error(`${CONTRACT}_UNEXPECTED_CAPACITY:${before.endpoint_summary.workers_min}/${before.endpoint_summary.workers_max}`);
  }

  const capacityRepairRequired = before.endpoint_summary.workers_max === 0;
  if (capacityRepairRequired) {
    await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0, workersMax: 1 },
    });
    await sleep(1000);
    before = await liveSnapshot(managementKey, runtimeKey);
    assertIdle(before.health, `${CONTRACT}_AFTER_CAPACITY_REPAIR`);
  }
  if (before.endpoint_summary.workers_min !== 0 || before.endpoint_summary.workers_max !== 1) {
    throw new Error(`${CONTRACT}_ZERO_IDLE_CAPACITY_NOT_READY:${before.endpoint_summary.workers_min}/${before.endpoint_summary.workers_max}`);
  }

  const submittedAt = Date.now();
  const submission = await queue("/run", runtimeKey, {
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
  submittedJobId = text(submission?.id);
  if (!submittedJobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
  await writeFile("/tmp/avantiqo-code-production-proof-job-id", `${submittedJobId}\n`, "utf8");

  const completed = await waitForStatus(submittedJobId, runtimeKey);
  if (completed.timed_out) throw new Error(`${CONTRACT}_JOB_TIMEOUT:${submittedJobId}`);
  const runpodStatus = text(completed.response?.status).toUpperCase();
  if (runpodStatus !== "COMPLETED") throw new Error(`${CONTRACT}_JOB_NOT_COMPLETED:${runpodStatus}`);
  const output = object(completed.response?.output);
  if (text(output.status) !== "completed") throw new Error(`${CONTRACT}_OUTPUT_STATUS:${text(output.status)}`);
  if (text(output.provider) !== "avantiqo-code") throw new Error(`${CONTRACT}_PROVIDER:${text(output.provider)}`);
  if (text(output.model) !== "avantiqo-code-v1") throw new Error(`${CONTRACT}_MODEL:${text(output.model)}`);
  if (text(output.runtime_model) !== EXPECTED_RUNTIME_MODEL) throw new Error(`${CONTRACT}_RUNTIME_MODEL:${text(output.runtime_model)}`);
  if (text(output.serving_runtime) !== "vllm") throw new Error(`${CONTRACT}_SERVING_RUNTIME:${text(output.serving_runtime)}`);
  if (text(output.quantization).toLowerCase() !== "fp8") throw new Error(`${CONTRACT}_QUANTIZATION:${text(output.quantization)}`);
  if (text(output.runtime_model_source) !== "runpod-cache") throw new Error(`${CONTRACT}_RUNTIME_MODEL_SOURCE:${text(output.runtime_model_source)}`);
  if (output.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_POLICY_FAILED`);
  if (text(output.result).length < 20) throw new Error(`${CONTRACT}_RESULT_TOO_SHORT`);

  const scaleDown = await waitForScaleDown(runtimeKey);
  if (!scaleDown.scaled_down) throw new Error(`${CONTRACT}_SCALE_DOWN_NOT_VERIFIED:${JSON.stringify(scaleDown.health || {})}`);
  const after = await liveSnapshot(managementKey, runtimeKey);
  assertIdle(after.health, `${CONTRACT}_AFTER`);
  if (after.endpoint_summary.workers_min !== 0 || after.endpoint_summary.workers_max !== 1) {
    throw new Error(`${CONTRACT}_REST_CAPACITY_NOT_0_1_AFTER`);
  }

  report = {
    success: true,
    contract: CONTRACT,
    trigger_sha: process.env.GITHUB_SHA || null,
    validated_origin_main: validatedOriginMain,
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    capacity_repair_required: capacityRepairRequired,
    zero_idle_capacity: { workers_min: 0, workers_max: 1 },
    immutable_image: IMMUTABLE_IMAGE,
    network_volume_id: REQUIRED_NETWORK_VOLUME_ID,
    job_id: submittedJobId,
    submitted_at_ms: submittedAt,
    completed_at_ms: Date.now(),
    runpod_status: runpodStatus,
    delay_time_ms: finite(completed.response?.delayTime),
    execution_time_ms: finite(completed.response?.executionTime),
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
      result: text(output.result, 8000),
      raw_reasoning_persisted: output.raw_reasoning_persisted,
    },
    status_timeline: completed.timeline,
    scale_down_verified: true,
    health_after: after.health,
    workers_running_after: 0,
    queue_after: 0,
    production_inference_performed: true,
    repository_write_performed_by_code_worker: false,
    production_deploy_performed_by_this_script: false,
    secrets_printed: false,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  const failure = {
    success: false,
    contract: CONTRACT,
    trigger_sha: process.env.GITHUB_SHA || null,
    job_id: submittedJobId,
    error: text(error?.message || error, 1800),
    production_inference_may_have_been_submitted: Boolean(submittedJobId),
    secrets_printed: false,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(failure, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(failure, null, 2));
  throw error;
}
