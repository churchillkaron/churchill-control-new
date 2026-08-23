import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const STATE_CONTRACT = "AVANTIQO_CINEMA_BENCHMARK_STATE_V1";
const SUBMIT_TIMEOUT_MS = 30000;
const STATUS_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_JOB_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_RUNPOD_BENCHMARK_TIMEOUT_MS || 60 * 60 * 1000),
);
const BENCHMARK_FPS = Math.max(
  8,
  Math.min(16, Number(process.env.AVANTIQO_CINEMA_BENCHMARK_FPS || 8)),
);
const STATE_PATH = resolve(
  process.env.AVANTIQO_CINEMA_BENCHMARK_STATE ||
    "/tmp/avantiqo-cinema-benchmark-state.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

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

function effectiveWallMs(body, fallbackMs) {
  const delayMs = safeMetric(body?.delayTime);
  const executionMs = safeMetric(body?.executionTime);
  if (delayMs !== null && executionMs !== null) return delayMs + executionMs;
  return fallbackMs;
}

function logProgress(mode, jobId, status, started, body = {}, reason = "STATUS") {
  const elapsedSeconds = Math.max(0, Math.round((performance.now() - started) / 1000));
  const delayMs = safeMetric(body?.delayTime);
  const executionMs = safeMetric(body?.executionTime);
  console.log(
    [
      "AVANTIQO_CINEMA_RUNPOD_PROGRESS",
      `mode=${mode}`,
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
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${errorDetail(body) || text(raw).slice(0, 1000)}`,
    );
  }
  return body;
}

async function readState() {
  try {
    const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
    if (state?.contract !== STATE_CONTRACT) return null;
    return state;
  } catch {
    return null;
  }
}

async function writeState(state) {
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function reusableStateJob(state, sample, endpointId) {
  const saved = state?.samples?.[sample.mode];
  if (!saved) return null;
  if (text(saved.endpoint_id) !== endpointId) return null;
  if (text(saved.capability) !== sample.capability) return null;
  if (text(saved.foundation_model) !== sample.foundationModel) return null;
  if (text(saved.storage_reference) !== sample.storageReference) return null;
  if (!text(saved.job_id)) return null;
  if (terminalFailure(text(saved.status).toUpperCase())) return null;
  return text(saved.job_id);
}

async function updateState(state, sample, endpointId, patch = {}) {
  const next = {
    contract: STATE_CONTRACT,
    updated_at: new Date().toISOString(),
    endpoint_id: endpointId,
    samples: {
      ...(state?.samples || {}),
      [sample.mode]: {
        ...(state?.samples?.[sample.mode] || {}),
        mode: sample.mode,
        endpoint_id: endpointId,
        capability: sample.capability,
        foundation_model: sample.foundationModel,
        storage_reference: sample.storageReference,
        ...patch,
      },
    },
  };
  await writeState(next);
  return next;
}

async function fetchJobStatus(endpointId, jobId, apiKey) {
  const statusResponse = await fetch(
    `${API_BASE}/${endpointId}/status/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    },
  );
  return parseJsonResponse(statusResponse);
}

async function pollJob({ endpointId, apiKey, sample, jobId, state, resumed }) {
  const started = performance.now();
  const deadline = Date.now() + MAX_JOB_WAIT_MS;
  let body = await fetchJobStatus(endpointId, jobId, apiKey);
  let status = text(body?.status).toUpperCase();
  let lastStatus = status;
  let lastHeartbeatAt = Date.now();

  logProgress(sample.mode, jobId, status, started, body, resumed ? "RESUMED" : "SUBMITTED");
  state = await updateState(state, sample, endpointId, {
    job_id: jobId,
    status,
    resumed,
    last_polled_at: new Date().toISOString(),
  });

  while (true) {
    if (status === "COMPLETED") {
      const pollWallMs = Math.round(performance.now() - started);
      state = await updateState(state, sample, endpointId, {
        job_id: jobId,
        status,
        resumed,
        completed_at: new Date().toISOString(),
        delay_ms: safeMetric(body?.delayTime),
        execution_ms: safeMetric(body?.executionTime),
      });
      console.log(`AVANTIQO_CINEMA_RUNPOD_JOB_COMPLETED mode=${sample.mode} job_id=${jobId}`);
      return {
        body,
        jobId,
        state,
        resumed,
        pollWallMs,
        wallMs: effectiveWallMs(body, pollWallMs),
        runpodDelayMs: safeMetric(body?.delayTime),
        runpodExecutionMs: safeMetric(body?.executionTime),
      };
    }

    if (terminalFailure(status)) {
      await updateState(state, sample, endpointId, {
        job_id: jobId,
        status,
        resumed,
        failed_at: new Date().toISOString(),
        error: errorDetail(body),
      });
      throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);
    }

    if (Date.now() >= deadline) {
      await updateState(state, sample, endpointId, {
        job_id: jobId,
        status,
        resumed,
        timed_out_waiting_at: new Date().toISOString(),
        last_polled_at: new Date().toISOString(),
      });
      throw new Error(
        `RUNPOD_JOB_WAIT_TIMEOUT_RESUMABLE:${sample.mode}:${jobId}:${MAX_JOB_WAIT_MS}:${STATE_PATH}`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
    body = await fetchJobStatus(endpointId, jobId, apiKey);
    status = text(body?.status).toUpperCase();
    const now = Date.now();
    if (status !== lastStatus) {
      logProgress(sample.mode, jobId, status, started, body, "STATUS_CHANGE");
      lastStatus = status;
      lastHeartbeatAt = now;
      state = await updateState(state, sample, endpointId, {
        job_id: jobId,
        status,
        resumed,
        last_polled_at: new Date().toISOString(),
      });
    } else if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      logProgress(sample.mode, jobId, status, started, body, "HEARTBEAT");
      lastHeartbeatAt = now;
    }
  }
}

async function runQueued({ endpointId, input, apiKey, sample, state, explicitResumeJobId }) {
  const stateJobId = reusableStateJob(state, sample, endpointId);
  const resumeJobId = text(explicitResumeJobId) || stateJobId;
  if (resumeJobId) {
    console.log(
      `AVANTIQO_CINEMA_RUNPOD_JOB_RESUMING mode=${sample.mode} job_id=${resumeJobId} source=${text(explicitResumeJobId) ? "explicit" : "state"}`,
    );
    return pollJob({
      endpointId,
      apiKey,
      sample,
      jobId: resumeJobId,
      state,
      resumed: true,
    });
  }

  console.log(`AVANTIQO_CINEMA_RUNPOD_SUBMITTING mode=${sample.mode}`);
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
  const body = await parseJsonResponse(submitResponse);
  const status = text(body?.status).toUpperCase();
  const jobId = text(body?.id);
  if (!jobId && status !== "COMPLETED") {
    throw new Error(`RUNPOD_ASYNC_SUBMIT_JOB_ID_MISSING:${status || "UNKNOWN"}`);
  }
  if (terminalFailure(status)) {
    throw new Error(`RUNPOD_JOB_${status}:${errorDetail(body)}`);
  }
  if (status === "COMPLETED") {
    const wallMs = effectiveWallMs(body, 0);
    return {
      body,
      jobId: jobId || null,
      state,
      resumed: false,
      pollWallMs: 0,
      wallMs,
      runpodDelayMs: safeMetric(body?.delayTime),
      runpodExecutionMs: safeMetric(body?.executionTime),
    };
  }

  console.log(`AVANTIQO_CINEMA_RUNPOD_JOB_SUBMITTED mode=${sample.mode} job_id=${jobId}`);
  state = await updateState(state, sample, endpointId, {
    job_id: jobId,
    status,
    resumed: false,
    submitted_at: new Date().toISOString(),
  });
  return pollJob({ endpointId, apiKey, sample, jobId, state, resumed: false });
}

const apiKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const t2vModel = text(process.env.AVANTIQO_VIDEO_T2V_MODEL) ||
  "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const i2vModel = text(process.env.AVANTIQO_VIDEO_I2V_MODEL) ||
  "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const t2vUpload = required("AVANTIQO_CINEMA_BENCHMARK_T2V_UPLOAD_URL");
const t2vReference = required("AVANTIQO_CINEMA_BENCHMARK_T2V_STORAGE_REFERENCE");
const i2vUpload = required("AVANTIQO_CINEMA_BENCHMARK_I2V_UPLOAD_URL");
const i2vReference = required("AVANTIQO_CINEMA_BENCHMARK_I2V_STORAGE_REFERENCE");
const sourceImage = required("AVANTIQO_CINEMA_BENCHMARK_I2V_SOURCE_URL");
const observations = [];
let state = await readState();

const samples = [
  {
    mode: "t2v",
    capability: "ai.video.generate",
    foundationModel: t2vModel,
    upload: t2vUpload,
    storageReference: t2vReference,
    references: [],
    seed: 62001,
    resumeJobId: process.env.AVANTIQO_CINEMA_RESUME_T2V_JOB_ID,
    instruction:
      "Cinematic slow dolly through a refined dark architectural space, soft volumetric light, physically realistic materials, subtle motion, no text, no logo.",
  },
  {
    mode: "i2v",
    capability: "ai.video.image_to_video",
    foundationModel: i2vModel,
    upload: i2vUpload,
    storageReference: i2vReference,
    references: [sourceImage],
    seed: 62002,
    resumeJobId: process.env.AVANTIQO_CINEMA_RESUME_I2V_JOB_ID,
    instruction:
      "Preserve the reference composition and identity. Add a subtle cinematic camera push, natural parallax and physically plausible light movement. No redesign, no text.",
  },
];

for (const sample of samples) {
  console.log(`AVANTIQO_CINEMA_BENCHMARK_MODE=${sample.mode}`);
  const result = await runQueued({
    endpointId,
    apiKey,
    sample,
    state,
    explicitResumeJobId: sample.resumeJobId,
    input: {
      contract: CONTRACT,
      capability: sample.capability,
      foundation_model: sample.foundationModel,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `benchmark-cinema-${sample.mode}`,
      instruction: sample.instruction,
      duration_seconds: 2,
      fps: BENCHMARK_FPS,
      aspect_ratio: "16:9",
      resolution: "720p",
      seed: sample.seed,
      quality_profile: "cinema-mechanical-certification",
      reference_images: sample.references,
      storage_upload: {
        signed_url: sample.upload,
        storage_reference: sample.storageReference,
      },
    },
  });
  state = result.state;
  const output = result.body.output || {};
  observations.push({
    mode: sample.mode,
    capability: sample.capability,
    runpod_job_id: result.jobId,
    resumed_existing_job: result.resumed,
    wall_ms: result.wallMs,
    polling_wall_ms: result.pollWallMs,
    runpod_delay_ms: result.runpodDelayMs,
    runpod_execution_ms: result.runpodExecutionMs,
    worker_generation_seconds: Number(output.generation_seconds) || null,
    foundation_model: text(output.foundation_model),
    duration_seconds: Number(output.duration_seconds) || null,
    fps: Number(output.fps) || null,
    frame_count: Number(output.frame_count) || null,
    width: Number(output.width) || null,
    height: Number(output.height) || null,
    size_bytes: Number(output.size_bytes) || null,
    storage_reference: text(output.storage_reference) || null,
    passed:
      text(output.capability) === sample.capability &&
      text(output.foundation_model) === sample.foundationModel &&
      Number(output.width) === 1280 &&
      Number(output.height) === 704 &&
      Number(output.size_bytes) > 10000 &&
      Number(output.frame_count) >= 17 &&
      output.raw_reasoning_persisted === false,
  });
}

const wall = observations.map((item) => item.wall_ms);
const report = {
  contract: "AVANTIQO_CINEMA_CERTIFICATION_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  benchmark_profile: "MECHANICAL_CORE_GENERATION",
  models: { t2v: t2vModel, i2v: i2vModel },
  runpod_wait_policy: {
    submission_mode: "ASYNC_RUN_STATUS_POLLING_RESUMABLE",
    submit_timeout_ms: SUBMIT_TIMEOUT_MS,
    status_timeout_ms: STATUS_TIMEOUT_MS,
    poll_interval_ms: POLL_INTERVAL_MS,
    heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
    max_job_wait_ms: MAX_JOB_WAIT_MS,
    state_path: STATE_PATH,
    benchmark_fps: BENCHMARK_FPS,
  },
  summary: {
    runs: observations.length,
    passed: observations.length === 2 && observations.every((item) => item.passed),
    t2v_passed: Boolean(observations.find((item) => item.mode === "t2v")?.passed),
    i2v_passed: Boolean(observations.find((item) => item.mode === "i2v")?.passed),
    p50_wall_ms: percentile(wall, 0.5),
    p95_wall_ms: percentile(wall, 0.95),
  },
  observations,
  certification_requirements: {
    human_visual_quality_review_required: true,
    identity_preservation_review_required: true,
    representative_production_quality_profile_review_required: true,
    measured_gpu_economics_required: true,
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
    video_to_video_certified: false,
    video_edit_certified: false,
    lipsync_certified: false,
  },
};
const outputPath = resolve(
  process.env.AVANTIQO_CINEMA_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-cinema-certification-benchmark.json",
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      success: true,
      output_path: outputPath,
      state_path: STATE_PATH,
      summary: report.summary,
      activation_allowed: false,
    },
    null,
    2,
  ),
);
