import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const INPUT = resolve(
  process.env.AVANTIQO_CODE_BENCHMARK_INPUT ||
    "/tmp/avantiqo-code-certification-benchmark.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function reasonFor(observation = {}) {
  const reasons = [];
  if (observation.infrastructure_error) {
    reasons.push(`infrastructure:${text(observation.infrastructure_error)}`);
  }
  if (observation.semantic_pass === false) reasons.push("semantic_check_failed");
  if (observation.contract_pass === false) reasons.push("runtime_contract_failed");
  if (observation.reasoning_boundary_pass === false) reasons.push("reasoning_boundary_failed");
  if (observation.result_length != null && Number(observation.result_length) <= 10) {
    reasons.push("output_too_short");
  }
  if (!reasons.length && observation.passed !== true) reasons.push("unknown_quality_failure");
  return reasons;
}

const report = JSON.parse(await readFile(INPUT, "utf8"));
const observations = Array.isArray(report.observations) ? report.observations : [];
const failed = observations.filter((item) => item?.passed !== true);

const output = {
  success: failed.length === 0 && report?.summary?.passed === true,
  contract: "AVANTIQO_CODE_BENCHMARK_INSPECTION_V1",
  input_path: INPUT,
  benchmark_contract: text(report.contract) || null,
  benchmark_generated_at: text(report.generated_at) || null,
  benchmark_summary: report.summary || null,
  failed_case_count: failed.length,
  failed_cases: failed.map((item) => ({
    run: item.run ?? null,
    case_id: text(item.case_id) || null,
    capability: text(item.capability) || null,
    job_id: text(item.job_id) || null,
    reasons: reasonFor(item),
    semantic_pass: item.semantic_pass ?? null,
    contract_pass: item.contract_pass ?? null,
    reasoning_boundary_pass: item.reasoning_boundary_pass ?? null,
    planner_protocol_pass: item.planner_protocol_pass ?? null,
    result_length: item.result_length ?? null,
    quantization: text(item.quantization) || null,
    runtime_model: text(item.runtime_model) || null,
    serving_runtime: text(item.serving_runtime) || null,
    runpod_execution_ms: item.runpod_execution_ms ?? null,
    infrastructure_error: text(item.infrastructure_error) || null,
  })),
  passed_cases: observations
    .filter((item) => item?.passed === true)
    .map((item) => ({
      case_id: text(item.case_id) || null,
      capability: text(item.capability) || null,
      job_id: text(item.job_id) || null,
    })),
  provider_call_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
};

console.log(JSON.stringify(output, null, 2));
if (failed.length) process.exitCode = 2;
