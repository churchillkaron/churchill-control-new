import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";
const STORAGE_BUCKET = "creative-assets";
const POLL_INTERVAL_MS = Math.max(
  2_000,
  Math.min(30_000, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_POLL_INTERVAL_MS || 5_000)),
);
const QUEUE_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(30 * 60 * 1000, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_QUEUE_TIMEOUT_MS || 15 * 60 * 1000)),
);
const EXECUTION_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(45 * 60 * 1000, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_EXECUTION_TIMEOUT_MS || 25 * 60 * 1000)),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}_YES_REQUIRED`);
  }
}

function safe(value, fallback = "benchmark") {
  return text(value || fallback)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function runpodRequest(url, apiKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 800)}`,
    );
  }
  return body;
}

async function cancelJob(endpointId, jobId, apiKey) {
  try {
    await runpodRequest(
      `${API_BASE}/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(jobId)}`,
      apiKey,
      { method: "POST" },
    );
    console.log(`AVANTIQO_MUSIC_BENCHMARK_JOB_CANCELLED=${jobId}`);
  } catch (error) {
    console.error(
      `AVANTIQO_MUSIC_BENCHMARK_JOB_CANCEL_FAILED=${jobId}:${text(error?.message || error)}`,
    );
  }
}

async function runJob(endpointId, payload, apiKey, runNumber) {
  const started = performance.now();
  const submitted = await runpodRequest(
    `${API_BASE}/${encodeURIComponent(endpointId)}/run`,
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({ input: payload }),
    },
  );
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");

  console.log(`AVANTIQO_MUSIC_BENCHMARK_RUN=${runNumber}`);
  console.log(`AVANTIQO_MUSIC_BENCHMARK_JOB_ID=${jobId}`);
  console.log("AVANTIQO_MUSIC_BENCHMARK_TRANSPORT=QUEUED_RUN");

  const submittedAt = Date.now();
  let executionStartedAt = null;
  let lastStatus = "";
  let lastHeartbeatAt = 0;

  while (true) {
    const body = await runpodRequest(
      `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      apiKey,
    );
    const status = text(body?.status).toUpperCase();
    const now = Date.now();

    if (status && status !== lastStatus) {
      console.log(`AVANTIQO_MUSIC_BENCHMARK_STATUS=${status}`);
      lastStatus = status;
    } else if (now - lastHeartbeatAt >= 60_000) {
      console.log(`AVANTIQO_MUSIC_BENCHMARK_HEARTBEAT=${status || "UNKNOWN"}`);
      lastHeartbeatAt = now;
    }

    if (status === "IN_PROGRESS" && executionStartedAt === null) {
      executionStartedAt = now;
    }

    if (status === "COMPLETED") {
      return {
        body,
        wallMs: Math.round(performance.now() - started),
        runpodExecutionMs: finite(body.executionTime ?? body.execution_time, null),
        runpodDelayMs: finite(body.delayTime ?? body.delay_time, null),
        jobId,
      };
    }

    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      const detail = text(body?.error || body?.output?.error || body?.message).slice(0, 1000);
      throw new Error(`RUNPOD_JOB_${status}:${detail || "NO_DETAIL"}`);
    }

    if (executionStartedAt === null && now - submittedAt > QUEUE_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error(`RUNPOD_QUEUE_TIMEOUT:${QUEUE_TIMEOUT_MS}`);
    }

    if (executionStartedAt !== null && now - executionStartedAt > EXECUTION_TIMEOUT_MS) {
      await cancelJob(endpointId, jobId, apiKey);
      throw new Error(`RUNPOD_EXECUTION_TIMEOUT:${EXECUTION_TIMEOUT_MS}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const foundationModel = text(process.env.AVANTIQO_AUDIO_FOUNDATION_MODEL) || "ACE-Step/Ace-Step1.5";
const runs = Math.max(1, Math.min(5, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_RUNS || 1)));
const duration = Math.max(10, Math.min(30, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_DURATION_SECONDS || 12)));
const benchmarkId = safe(`music-${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`);
const organizationId = text(process.env.AVANTIQO_MUSIC_BENCHMARK_ORGANIZATION_ID) || `benchmark-${crypto.randomUUID()}`;
if (!organizationId.startsWith("benchmark-")) {
  throw new Error("AVANTIQO_MUSIC_BENCHMARK_ORGANIZATION_ID_MUST_BE_SYNTHETIC");
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const observations = [];

for (let index = 0; index < runs; index += 1) {
  const run = index + 1;
  const usageId = `${benchmarkId}-${run}`;
  const storagePath = `${organizationId}/benchmark/avantiqo-audio/${usageId}.wav`;
  const { data: upload, error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (uploadError) throw uploadError;
  if (!upload?.signedUrl) throw new Error("AVANTIQO_MUSIC_BENCHMARK_SIGNED_UPLOAD_REQUIRED");

  const storageReference = `storage://${STORAGE_BUCKET}/${storagePath}`;
  const {
    body,
    wallMs,
    runpodExecutionMs,
    runpodDelayMs,
    jobId,
  } = await runJob(endpointId, {
    contract: CONTRACT,
    capability: "ai.music.generate",
    foundation_model: foundationModel,
    organization_id: organizationId,
    organization_service_id: "benchmark-owned-music",
    usage_id: usageId,
    instruction: "Cinematic premium instrumental underscore, restrained percussion, warm strings, modern electronic texture, no vocals.",
    structured_specification: {
      music: {
        caption: "Cinematic premium instrumental underscore with restrained percussion, warm strings and modern electronic texture",
        instrumental: true,
        duration_seconds: duration,
        bpm: 92,
      },
      provider_parameters: {
        seed: 41000 + index,
        inference_steps: 8,
        shift: 3.0,
      },
    },
    storage_upload: {
      signed_url: upload.signedUrl,
      storage_reference: storageReference,
    },
  }, apiKey, run);

  const output = body.output || {};
  const { data: review } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  observations.push({
    run,
    runpod_job_id: jobId,
    usage_id: usageId,
    storage_reference: storageReference,
    review_url: review?.signedUrl || null,
    review_url_expires_seconds: review?.signedUrl ? 3600 : null,
    wall_ms: wallMs,
    runpod_execution_ms: runpodExecutionMs,
    runpod_delay_ms: runpodDelayMs,
    worker_generation_seconds: Number(output.generation_seconds) || null,
    duration_seconds: Number(output.duration_seconds) || null,
    sample_rate: Number(output.sample_rate) || null,
    size_bytes: Number(output.size_bytes) || null,
    seed: Number(output.seed) || null,
    model_family: text(output.model_family),
    model_variant: text(output.model_variant),
    foundation_model: text(output.foundation_model),
    passed:
      text(output.capability) === "ai.music.generate" &&
      text(output.foundation_model) === "ACE-Step/Ace-Step1.5" &&
      text(output.model_family) === "ACE_STEP_1_5" &&
      text(output.model_variant) === "acestep-v15-turbo" &&
      text(output.storage_reference) === storageReference &&
      Number(output.sample_rate) >= 44100 &&
      Number(output.size_bytes) > 10000 &&
      Number(output.duration_seconds) >= Math.max(9, duration - 2) &&
      Number.isFinite(runpodExecutionMs) &&
      runpodExecutionMs > 0 &&
      output.ace_step_lm_used === false &&
      output.raw_reasoning_persisted === false &&
      output.generation_input_persisted === false,
  });
}

const wall = observations.map((item) => item.wall_ms);
const worker = observations.map((item) => item.worker_generation_seconds).filter(Number.isFinite);
const runpodExecution = observations.map((item) => item.runpod_execution_ms).filter(Number.isFinite);
const runpodDelay = observations.map((item) => item.runpod_delay_ms).filter(Number.isFinite);
const report = {
  contract: "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3",
  benchmark_id: benchmarkId,
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  benchmark_scope: {
    organization_id: organizationId,
    organization_record_created: false,
    storage_bucket: STORAGE_BUCKET,
    controlled_spend_approved: true,
    runs,
    requested_duration_seconds: duration,
    runpod_transport: "queued_run_status_polling",
    poll_interval_ms: POLL_INTERVAL_MS,
    queue_timeout_ms: QUEUE_TIMEOUT_MS,
    execution_timeout_ms: EXECUTION_TIMEOUT_MS,
  },
  model: {
    provider: "avantiqo-audio",
    family: "ACE_STEP_1_5",
    foundation_model: "ACE-Step/Ace-Step1.5",
    variant: "acestep-v15-turbo",
    capability: "ai.music.generate",
  },
  summary: {
    runs: observations.length,
    passed: observations.length > 0 && observations.every((item) => item.passed),
    p50_wall_ms: percentile(wall, 0.5),
    p95_wall_ms: percentile(wall, 0.95),
    p50_runpod_execution_ms: percentile(runpodExecution, 0.5),
    p95_runpod_execution_ms: percentile(runpodExecution, 0.95),
    p50_runpod_delay_ms: percentile(runpodDelay, 0.5),
    p95_runpod_delay_ms: percentile(runpodDelay, 0.95),
    p50_worker_seconds: percentile(worker, 0.5),
    p95_worker_seconds: percentile(worker, 0.95),
  },
  observations,
  certification_requirements: {
    human_audio_quality_review_required: true,
    measured_gpu_economics_required: true,
    commercial_pricing_status_current: "MARKET_PARITY_READY",
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
    remix_certified: false,
    audio_edit_certified: false,
    extend_certified: false,
    stems_certified: false,
    ace_step_internal_lm_allowed: false,
  },
};

const outputPath = resolve(
  process.env.AVANTIQO_AUDIO_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-certification-benchmark.json",
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: report.summary.passed,
  output_path: outputPath,
  benchmark_id: benchmarkId,
  summary: report.summary,
  review_urls: observations.map((item) => item.review_url).filter(Boolean),
  activation_allowed: false,
}, null, 2));
