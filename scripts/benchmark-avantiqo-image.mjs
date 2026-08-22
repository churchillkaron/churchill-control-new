import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";

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
async function runSync(endpointId, input, apiKey) {
  const started = performance.now();
  const response = await fetch(`${API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ input }),
  });
  const body = await response.json().catch(() => ({}));
  const wallMs = Math.round(performance.now() - started);
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  if (text(body?.status).toUpperCase() !== "COMPLETED") throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  return { body, wallMs };
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const foundationModel = text(process.env.AVANTIQO_IMAGE_FOUNDATION_MODEL) || "Qwen/Qwen-Image";
const uploadTemplate = required("AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL");
const referenceTemplate = required("AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE");
const runs = Math.max(1, Math.min(10, Number(process.env.AVANTIQO_IMAGE_BENCHMARK_RUNS || 1)));
const observations = [];

for (let index = 0; index < runs; index += 1) {
  const run = index + 1;
  const { body, wallMs } = await runSync(endpointId, {
    contract: CONTRACT,
    capability: "ai.image.generate",
    foundation_model: foundationModel,
    organization_id: "benchmark-only",
    organization_service_id: "benchmark-only",
    usage_id: `benchmark-image-${run}`,
    instruction: "Premium cinematic product photograph of a sculptural black glass object on a dark reflective surface, precise studio lighting, realistic material detail, no text, no logo.",
    structured_specification: {
      output_spec: { aspect_ratio: "1:1" },
      provider_parameters: { seed: 51000 + index, inference_steps: 28, guidance_scale: 4.0 },
    },
    storage_upload: {
      signed_url: scoped(uploadTemplate, run, runs, "AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL"),
      storage_reference: scoped(referenceTemplate, run, runs, "AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE"),
    },
  }, apiKey);
  const output = body.output || {};
  observations.push({
    run,
    wall_ms: wallMs,
    worker_generation_seconds: Number(output.generation_seconds) || null,
    width: Number(output.width) || null,
    height: Number(output.height) || null,
    size_bytes: Number(output.size_bytes) || null,
    seed: Number(output.seed) || null,
    foundation_model: text(output.foundation_model),
    passed:
      text(output.capability) === "ai.image.generate" &&
      text(output.foundation_model) === "Qwen/Qwen-Image" &&
      Number(output.width) === 1024 && Number(output.height) === 1024 &&
      Number(output.size_bytes) > 10000 &&
      output.raw_reasoning_persisted === false,
  });
}

const wall = observations.map((item) => item.wall_ms);
const report = {
  contract: "AVANTIQO_IMAGE_CERTIFICATION_BENCHMARK_V1",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  model: { provider: "avantiqo-image", foundation_model: "Qwen/Qwen-Image", capability: "ai.image.generate" },
  summary: {
    runs: observations.length,
    passed: observations.length > 0 && observations.every((item) => item.passed),
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
console.log(JSON.stringify({ success: true, output_path: outputPath, summary: report.summary, activation_allowed: false }, null, 2));
