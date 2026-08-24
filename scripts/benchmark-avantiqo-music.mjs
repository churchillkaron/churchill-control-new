import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";
const STORAGE_BUCKET = "creative-assets";

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

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
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

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const organizationId = required("AVANTIQO_MUSIC_BENCHMARK_ORGANIZATION_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const foundationModel = text(process.env.AVANTIQO_AUDIO_FOUNDATION_MODEL) || "ACE-Step/Ace-Step1.5";
const runs = Math.max(1, Math.min(5, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_RUNS || 1)));
const duration = Math.max(10, Math.min(30, Number(process.env.AVANTIQO_AUDIO_BENCHMARK_DURATION_SECONDS || 12)));
const benchmarkId = safe(`music-${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`);
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
  const { body, wallMs } = await runJob(endpointId, {
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
  }, apiKey);

  const output = body.output || {};
  const { data: review } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  observations.push({
    run,
    usage_id: usageId,
    storage_reference: storageReference,
    review_url: review?.signedUrl || null,
    review_url_expires_seconds: review?.signedUrl ? 3600 : null,
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
      text(output.storage_reference) === storageReference &&
      Number(output.sample_rate) >= 44100 &&
      Number(output.size_bytes) > 10000 &&
      Number(output.duration_seconds) >= Math.max(9, duration - 2) &&
      output.ace_step_lm_used === false &&
      output.raw_reasoning_persisted === false &&
      output.generation_input_persisted === false,
  });
}

const wall = observations.map((item) => item.wall_ms);
const worker = observations.map((item) => item.worker_generation_seconds).filter(Number.isFinite);
const report = {
  contract: "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V2",
  benchmark_id: benchmarkId,
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  benchmark_scope: {
    organization_id: organizationId,
    storage_bucket: STORAGE_BUCKET,
    controlled_spend_approved: true,
    runs,
    requested_duration_seconds: duration,
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
