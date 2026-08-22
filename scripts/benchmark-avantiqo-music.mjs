import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";

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

function scoped(value, run, runs, name) {
  if (runs === 1) return value.replaceAll("{run}", String(run));
  if (!value.includes("{run}")) {
    throw new Error(`${name}_RUN_PLACEHOLDER_REQUIRED_FOR_MULTIPLE_RUNS`);
  }
  return value.replaceAll("{run}", String(run));
}

async function runJob(endpointId, payload, apiKey) {
  const started = performance.now();
  const response = await fetch(`${API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input: payload }),
  });
  const body = await response.json().catch(() => ({}));
  const wallMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  }
  return { body, wallMs };
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const uploadUrlTemplate = required("AVANTIQO_AUDIO_BENCHMARK_UPLOAD_URL");
const storageReferenceTemplate = required("AVANTIQO_AUDIO_BENCHMARK_STORAGE_REFERENCE");
const foundationModel = text(process.env.AVANTIQO_AUDIO_FOUNDATION_MODEL) || "ACE-Step/Ace-Step1.5";
const runs = Math.max(1, Math.min(10, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_RUNS || 1)));
const duration = Math.max(10, Math.min(60, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_DURATION_SECONDS || 12)));
const observations = [];

for (let index = 0; index < runs; index += 1) {
  const run = index + 1;
  const uploadUrl = scoped(uploadUrlTemplate, run, runs, "AVANTIQO_AUDIO_BENCHMARK_UPLOAD_URL");
  const storageReference = scoped(storageReferenceTemplate, run, runs, "AVANTIQO_AUDIO_BENCHMARK_STORAGE_REFERENCE");
  const { body, wallMs } = await runJob(endpointId, {
    contract: CONTRACT,
    capability: "ai.music.generate",
    foundation_model: foundationModel,
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: `benchmark-music-${run}`,
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
      signed_url: uploadUrl,
      storage_reference: storageReference,
    },
  }, apiKey);

  const output = body.output || {};
  observations.push({
    run,
    wall_ms: wallMs,
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
      Number(output.sample_rate) >= 44100 &&
      Number(output.size_bytes) > 10000 &&
      Number(output.duration_seconds) >= 9 &&
      output.ace_step_lm_used === false &&
      output.raw_reasoning_persisted === false &&
      output.generation_input_persisted === false,
  });
}

const wall = observations.map((item) => item.wall_ms);
const worker = observations.map((item) => item.worker_generation_seconds).filter(Number.isFinite);
const report = {
  contract: "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
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
    p50_worker_seconds: percentile(worker, 0.5),
    p95_worker_seconds: percentile(worker, 0.95),
  },
  observations,
  certification_requirements: {
    human_audio_quality_review_required: true,
    measured_gpu_economics_required: true,
    commercial_pricing_status_current: "MARKET_PARITY_READY",
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
    sfx_certified: false,
    audio_edit_certified: false,
    ace_step_internal_lm_allowed: false,
  },
};

const outputPath = resolve(
  process.env.AVANTIQO_AUDIO_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-certification-benchmark.json",
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: outputPath,
  summary: report.summary,
  activation_allowed: false,
}, null, 2));
