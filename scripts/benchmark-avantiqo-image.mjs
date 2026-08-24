import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const BUCKET = "creative-assets";
const STORAGE_REFERENCE_PREFIX = `storage://${BUCKET}/`;
const SUBMIT_TIMEOUT_MS = 30000;
const STATUS_TIMEOUT_MS = 30000;
const CANCEL_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_QUEUE_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_RUNPOD_BENCHMARK_TIMEOUT_MS || 15 * 60 * 1000),
);
const MAX_EXECUTION_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_RUNPOD_BENCHMARK_EXECUTION_TIMEOUT_MS || 25 * 60 * 1000),
);
const QUALITY_MODEL = "Qwen/Qwen-Image-2512";
const QUALITY_RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V1";
const DEFAULT_QUALITY_INSTRUCTION = [
  "Create a photorealistic luxury product photograph of a real, recognizable perfume bottle.",
  "The bottle is rectangular black smoked glass with precise beveled edges, realistic transparent glass thickness visible around the perimeter, and a heavy brushed-gold metal cap with clean manufactured geometry.",
  "Place the bottle upright on polished black marble with a restrained natural reflection directly beneath it.",
  "Use a professional dark studio lighting setup: warm soft key light from the upper left, narrow controlled rim light from behind, realistic shadows, natural falloff, and physically plausible reflections on the glass, metal, and marble.",
  "Camera is at product level using an 85mm commercial product-photography lens, shallow depth of field, with sharp focus on the front beveled edge and cap.",
  "Background is deep charcoal with a smooth subtle gradient and no visible set edges.",
  "The result must look like a real high-end advertising photograph captured with a physical camera, not CGI and not an abstract sculpture.",
  "No text, no logo, no label, no extra objects, no duplicate bottle, no warped geometry, no melted glass, no impossible reflections.",
].join(" ");

function text(value) { return String(value ?? "").trim(); }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function scoped(value, run, runs, name) {
  if (runs === 1) return value.replaceAll("{run}", String(run));
  if (!value.includes("{run}")) throw new Error(`${name}_RUN_PLACEHOLDER_REQUIRED_FOR_MULTIPLE_RUNS`);
  return value.replaceAll("{run}", String(run));
}
function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}
function errorDetail(body = {}) {
  const value = body?.error ?? body?.message ?? body?.output?.error;
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 1000);
  return text(value).slice(0, 1000);
}
function safeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}
function logProgress(jobId, status, started, body = {}, reason = "STATUS") {
  const elapsedSeconds = Math.max(0, Math.round((performance.now() - started) / 1000));
  const delayMs = safeMetric(body?.delayTime);
  const executionMs = safeMetric(body?.executionTime);
  console.log(
    [
      "AVANTIQO_IMAGE_RUNPOD_PROGRESS",
      `reason=${reason}`,
      `job_id=${jobId}`,
      `status=${status || "UNKNOWN"}`,
      `elapsed_seconds=${elapsedSeconds}`,
      `delay_ms=${delayMs ?? "unknown"}`,
      `execution_ms=${executionMs ?? "unknown"}`,
    ].join(" "),
  );
}
async function parseJsonResponse(response) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${errorDetail(body) || text(raw).slice(0, 1000)}`);
  }
  return body;
}
async function fetchJobStatus(endpointId, jobId, apiKey) {
  const response = await fetch(
    `${API_BASE}/${endpointId}/status/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    },
  );
  return parseJsonResponse(response);
}
async function cancelJob(endpointId, jobId, apiKey, reason) {
  const response = await fetch(
    `${API_BASE}/${endpointId}/cancel/${encodeURIComponent(jobId)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    },
  );
  const body = await parseJsonResponse(response);
  const status = text(body?.status).toUpperCase();
  console.log(
    `AVANTIQO_IMAGE_RUNPOD_JOB_CANCELLED reason=${reason} job_id=${jobId} status=${status || "UNKNOWN"}`,
  );
  if (!["CANCELLED", "CANCELED"].includes(status)) {
    throw new Error(`RUNPOD_JOB_CANCEL_VERIFY_FAILED:${jobId}:${status || "UNKNOWN"}`);
  }
  return body;
}
async function runQueued(endpointId, input, apiKey) {
  const started = performance.now();
  console.log("AVANTIQO_IMAGE_RUNPOD_SUBMITTING=true");
  const submitResponse = await fetch(`${API_BASE}/${endpointId}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  let body = await parseJsonResponse(submitResponse);
  let status = text(body?.status).toUpperCase();
  const jobId = text(body?.id);

  if (status === "COMPLETED") {
    console.log(`AVANTIQO_IMAGE_RUNPOD_JOB_COMPLETED_IMMEDIATELY=${jobId || "unknown"}`);
    return { body, wallMs: Math.round(performance.now() - started), jobId: jobId || null };
  }
  if (!jobId) throw new Error(`RUNPOD_ASYNC_SUBMIT_JOB_ID_MISSING:${status || "UNKNOWN"}`);
  console.log(`AVANTIQO_IMAGE_RUNPOD_JOB_SUBMITTED=${jobId}`);
  logProgress(jobId, status, started, body, "SUBMITTED");
  if (terminalFailure(status)) {
    throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);
  }

  const queueDeadline = Date.now() + MAX_QUEUE_WAIT_MS;
  let executionDeadline = status === "IN_PROGRESS" ? Date.now() + MAX_EXECUTION_WAIT_MS : null;
  let lastStatus = status;
  let lastHeartbeatAt = Date.now();

  while (true) {
    const nowBeforePoll = Date.now();
    const queueExpired = status === "IN_QUEUE" && nowBeforePoll >= queueDeadline;
    const executionExpired = status === "IN_PROGRESS" && executionDeadline && nowBeforePoll >= executionDeadline;
    if (queueExpired || executionExpired) {
      body = await fetchJobStatus(endpointId, jobId, apiKey);
      status = text(body?.status).toUpperCase();
      if (status === "COMPLETED") {
        console.log(`AVANTIQO_IMAGE_RUNPOD_JOB_COMPLETED=${jobId}`);
        return { body, wallMs: Math.round(performance.now() - started), jobId };
      }
      if (terminalFailure(status)) {
        throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);
      }
      if (queueExpired && status === "IN_PROGRESS") {
        executionDeadline = Date.now() + MAX_EXECUTION_WAIT_MS;
        logProgress(jobId, status, started, body, "STARTED_AT_QUEUE_DEADLINE");
        lastStatus = status;
        lastHeartbeatAt = Date.now();
      } else {
        const reason = status === "IN_QUEUE" ? "QUEUE_TIMEOUT" : "EXECUTION_MONITOR_TIMEOUT";
        await cancelJob(endpointId, jobId, apiKey, reason);
        throw new Error(
          `RUNPOD_JOB_${reason}_CANCELLED:${jobId}:${status === "IN_QUEUE" ? MAX_QUEUE_WAIT_MS : MAX_EXECUTION_WAIT_MS}`,
        );
      }
    }

    await sleep(POLL_INTERVAL_MS);
    body = await fetchJobStatus(endpointId, jobId, apiKey);
    status = text(body?.status).toUpperCase();
    const now = Date.now();
    if (status !== lastStatus) {
      logProgress(jobId, status, started, body, "STATUS_CHANGE");
      if (status === "IN_PROGRESS" && !executionDeadline) {
        executionDeadline = now + MAX_EXECUTION_WAIT_MS;
      }
      lastStatus = status;
      lastHeartbeatAt = now;
    } else if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      logProgress(jobId, status, started, body, "HEARTBEAT");
      lastHeartbeatAt = now;
    }
    if (status === "COMPLETED") {
      console.log(`AVANTIQO_IMAGE_RUNPOD_JOB_COMPLETED=${jobId}`);
      return { body, wallMs: Math.round(performance.now() - started), jobId };
    }
    if (terminalFailure(status)) {
      throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);
    }
  }
}

const apiKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const foundationModel = text(process.env.AVANTIQO_IMAGE_BENCHMARK_FOUNDATION_MODEL) || text(process.env.AVANTIQO_IMAGE_FOUNDATION_MODEL) || "Qwen/Qwen-Image";
const qualityMode = foundationModel === QUALITY_MODEL;
const requireTrueCfg = /(^|\/)Qwen-Image(?:-2512)?$/i.test(foundationModel);
const expectedWidth = qualityMode ? 1328 : 1024;
const expectedHeight = qualityMode ? 1328 : 1024;
const inferenceSteps = qualityMode ? 50 : 28;
const uploadTemplate = required("AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL");
const referenceTemplate = required("AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE");
const instruction = text(process.env.AVANTIQO_IMAGE_BENCHMARK_INSTRUCTION) || DEFAULT_QUALITY_INSTRUCTION;
const runs = Math.max(1, Math.min(10, Number(process.env.AVANTIQO_IMAGE_BENCHMARK_RUNS || 1)));
const observations = [];
const supabaseUrl = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

async function createPreviewUrl(storageReference) {
  if (!supabase) return null;
  if (!storageReference.startsWith(STORAGE_REFERENCE_PREFIX)) return null;
  const path = storageReference.slice(STORAGE_REFERENCE_PREFIX.length);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`AVANTIQO_IMAGE_PREVIEW_SIGN_FAILED:${error?.message || "NO_SIGNED_URL"}`);
  }
  return data.signedUrl;
}

for (let index = 0; index < runs; index += 1) {
  const run = index + 1;
  const uploadUrl = scoped(uploadTemplate, run, runs, "AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL");
  const storageReference = scoped(referenceTemplate, run, runs, "AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE");
  console.log(`AVANTIQO_IMAGE_BENCHMARK_RUN=${run}/${runs}`);
  console.log(`AVANTIQO_IMAGE_BENCHMARK_FOUNDATION=${foundationModel}`);
  console.log(`AVANTIQO_IMAGE_BENCHMARK_DIMENSIONS=${expectedWidth}x${expectedHeight}`);
  console.log(`AVANTIQO_IMAGE_BENCHMARK_STEPS=${inferenceSteps}`);
  console.log(`AVANTIQO_IMAGE_BENCHMARK_INSTRUCTION=${instruction}`);
  const { body, wallMs, jobId } = await runQueued(endpointId, {
    contract: CONTRACT,
    capability: "ai.image.generate",
    foundation_model: foundationModel,
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: `benchmark-image-${run}`,
    instruction,
    structured_specification: {
      output_spec: qualityMode
        ? { width: expectedWidth, height: expectedHeight, aspect_ratio: "1:1" }
        : { aspect_ratio: "1:1" },
      provider_parameters: { seed: 51000 + index, inference_steps: inferenceSteps, true_cfg_scale: 4.0 },
    },
    storage_upload: {
      signed_url: uploadUrl,
      storage_reference: storageReference,
    },
  }, apiKey);
  const output = body.output || {};
  const guidance = output.generation_guidance || {};
  const trueCfgVerified =
    text(guidance.mode).toUpperCase() === "TRUE_CFG" &&
    Number(guidance.scale) === 4 &&
    guidance.negative_prompt_supplied === true;
  const qualityRuntimeVerified = !qualityMode ||
    (text(output.runtime_revision) === QUALITY_RUNTIME_REVISION &&
      text(output.foundation_model_source) === "runpod-cache" &&
      guidance.negative_prompt_has_content === true &&
      text(guidance.quality_policy) === "QWEN_IMAGE_2512_REALISM_V1" &&
      Number(output.inference_steps) === 50);
  console.log(
    `AVANTIQO_IMAGE_GENERATION_GUIDANCE=${JSON.stringify({
      required: requireTrueCfg,
      verified: requireTrueCfg ? trueCfgVerified : null,
      quality_runtime_verified: qualityMode ? qualityRuntimeVerified : null,
      ...guidance,
    })}`,
  );
  const previewUrl = await createPreviewUrl(storageReference);
  if (previewUrl) console.log(`AVANTIQO_IMAGE_PREVIEW_URL=${previewUrl}`);
  observations.push({
    run,
    runpod_job_id: jobId,
    wall_ms: wallMs,
    worker_generation_seconds: Number(output.generation_seconds) || null,
    width: Number(output.width) || null,
    height: Number(output.height) || null,
    size_bytes: Number(output.size_bytes) || null,
    seed: Number(output.seed) || null,
    foundation_model: text(output.foundation_model),
    foundation_model_source: text(output.foundation_model_source),
    runtime_revision: text(output.runtime_revision),
    inference_steps: Number(output.inference_steps) || null,
    storage_reference: storageReference,
    preview_url: previewUrl,
    generation_guidance: guidance,
    true_cfg_verified: requireTrueCfg ? trueCfgVerified : null,
    quality_runtime_verified: qualityMode ? qualityRuntimeVerified : null,
    passed:
      text(output.capability) === "ai.image.generate" &&
      text(output.foundation_model) === foundationModel &&
      Number(output.width) === expectedWidth && Number(output.height) === expectedHeight &&
      Number(output.size_bytes) > 10000 &&
      output.raw_reasoning_persisted === false &&
      (!requireTrueCfg || trueCfgVerified) &&
      qualityRuntimeVerified,
  });
}

const wall = observations.map((item) => item.wall_ms);
const report = {
  contract: "AVANTIQO_IMAGE_CERTIFICATION_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  instruction,
  model: { provider: "avantiqo-image", foundation_model: foundationModel, capability: "ai.image.generate" },
  quality_recipe: {
    qwen_2512_mode: qualityMode,
    expected_width: expectedWidth,
    expected_height: expectedHeight,
    inference_steps: inferenceSteps,
    true_cfg_scale: 4.0,
  },
  runpod_wait_policy: {
    submission_mode: "ASYNC_RUN_STATUS_POLLING",
    submit_timeout_ms: SUBMIT_TIMEOUT_MS,
    status_timeout_ms: STATUS_TIMEOUT_MS,
    cancel_timeout_ms: CANCEL_TIMEOUT_MS,
    poll_interval_ms: POLL_INTERVAL_MS,
    heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
    max_queue_wait_ms: MAX_QUEUE_WAIT_MS,
    max_execution_wait_ms: MAX_EXECUTION_WAIT_MS,
    cancel_on_monitor_timeout: true,
  },
  summary: {
    runs: observations.length,
    passed: observations.length > 0 && observations.every((item) => item.passed),
    true_cfg_required: requireTrueCfg,
    true_cfg_verified: requireTrueCfg
      ? observations.length > 0 && observations.every((item) => item.true_cfg_verified === true)
      : null,
    qwen_2512_quality_runtime_verified: qualityMode
      ? observations.length > 0 && observations.every((item) => item.quality_runtime_verified === true)
      : null,
    p50_wall_ms: percentile(wall, 0.5),
    p95_wall_ms: percentile(wall, 0.95),
  },
  observations,
  certification_requirements: {
    human_visual_quality_review_required: true,
    measured_gpu_economics_required: true,
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
  },
};
const outputPath = resolve(process.env.AVANTIQO_IMAGE_BENCHMARK_OUTPUT || "/tmp/avantiqo-image-certification-benchmark.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: report.summary.passed, output_path: outputPath, summary: report.summary, activation_allowed: false }, null, 2));
if (!report.summary.passed) process.exitCode = 2;
