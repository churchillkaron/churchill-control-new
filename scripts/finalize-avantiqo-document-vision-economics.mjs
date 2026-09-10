import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_DOCUMENT_VISION_ECONOMICS_V1";
const MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";
const PROVIDER = "avantiqo-image";

function text(value) { return String(value ?? "").trim(); }
function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

const benchmarkPath = resolve(process.env.AVANTIQO_DOCUMENT_VISION_BENCHMARK_INPUT || "/tmp/document-vision-certification.json");
const ratesPath = resolve(process.env.AVANTIQO_MODAL_BILLING_RATES_INPUT || "/tmp/modal-billing-rates.json");
const outputPath = resolve(process.env.AVANTIQO_DOCUMENT_VISION_ECONOMICS_OUTPUT || "/tmp/avantiqo-document-vision-economics.json");
const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
const rates = JSON.parse(await readFile(ratesPath, "utf8"));
if (benchmark?.summary?.passed !== true) throw new Error("DOCUMENT_VISION_BENCHMARK_PASS_REQUIRED");
if (text(benchmark.provider) !== PROVIDER || text(benchmark.model) !== MODEL) throw new Error("DOCUMENT_VISION_MODEL_BINDING_INVALID");
const gpuHourlyUsd = positive(rates.gpu_hour_cost_a100_80gb, "A100_80GB_MODAL_RATE_REQUIRED");
const observations = Array.isArray(benchmark.observations) ? benchmark.observations : [];
if (!observations.length) throw new Error("DOCUMENT_VISION_OBSERVATIONS_REQUIRED");
const measured = observations.map((item) => {
  const capability = text(item.requested_capability);
  const seconds = positive(item.worker_seconds ?? item.elapsed_seconds ?? (Number(item.wall_ms) > 0 ? Number(item.wall_ms) / 1000 : null), `DOCUMENT_VISION_WORKER_SECONDS_REQUIRED:${capability}`);
  return {
    capability,
    worker_seconds: seconds,
    supplier_compute_cost_usd: Number(((seconds / 3600) * gpuHourlyUsd).toFixed(8)),
    benchmark_passed: item.passed === true,
  };
});
if (measured.some((item) => !item.benchmark_passed)) throw new Error("DOCUMENT_VISION_CASE_PASS_REQUIRED");
const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  provider: PROVIDER,
  model: MODEL,
  infrastructure_provider: "MODAL",
  gpu: "A100-80GB",
  gpu_hour_cost_usd: gpuHourlyUsd,
  cost_method: "MODAL_WORKSPACE_RATE_X_MEASURED_WORKER_SECONDS",
  measured,
  summary: {
    passed: measured.length === 3 && measured.every((item) => item.benchmark_passed),
    capabilities: measured.map((item) => item.capability),
  },
  production_pricing_status: "PENDING_EXPLICIT_ACTIVATION",
  pricing_activation_performed: false,
  provider_selection_changed: false,
  production_deploy_performed: false,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ success: report.summary.passed, output_path: outputPath, measured }, null, 2));
if (!report.summary.passed) process.exitCode = 2;
