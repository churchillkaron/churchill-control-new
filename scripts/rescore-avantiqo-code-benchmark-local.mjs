import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCodeBenchmarkSemantic } from "./lib/avantiqo-code-benchmark-semantics.mjs";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function plannerCasePassed(observations) {
  return observations.some(
    (item) => item?.case_id === "autonomous_planner_json_protocol" && item?.passed === true,
  );
}

function completeSuite(observations) {
  const requiredCases = [
    "generate_finite_sum",
    "edit_numeric_normalization",
    "refactor_email_normalization",
    "review_authorization_guard",
    "debug_numeric_reduce",
    "autonomous_planner_json_protocol",
  ];
  return requiredCases.every(
    (caseId) => observations.some((item) => item?.case_id === caseId && item?.passed === true),
  );
}

function expectedRuntime(report) {
  return {
    provider: "avantiqo-code",
    engine_contract: ENGINE_CONTRACT,
    foundation_model: EXPECTED_FOUNDATION_MODEL,
    runtime_model: text(report?.model?.runtime_model),
    serving_runtime: text(report?.model?.serving_runtime).toLowerCase(),
    quantization: text(report?.model?.quantization).toLowerCase(),
  };
}

function runtimeContractPass(output, observation, expected) {
  return Boolean(
    text(output?.provider) === expected.provider &&
    text(output?.engine_contract) === expected.engine_contract &&
    text(output?.capability) === text(observation?.capability) &&
    text(output?.foundation_model) === expected.foundation_model &&
    text(output?.runtime_model || output?.foundation_model) === expected.runtime_model &&
    text(output?.serving_runtime || "transformers").toLowerCase() === expected.serving_runtime &&
    text(output?.quantization || "none").toLowerCase() === expected.quantization &&
    output?.raw_reasoning_persisted === false
  );
}

async function readCompletedJob(endpointId, jobId, apiKey) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `RUNPOD_STATUS_HTTP_${response.status}:${text(body?.error || body?.message || body?.status)}`,
    );
  }
  const status = text(body?.status).toUpperCase();
  if (status !== "COMPLETED") {
    throw new Error(`RUNPOD_JOB_NOT_COMPLETED:${jobId}:${status || "UNKNOWN"}`);
  }
  return body;
}

const inputPath = resolve(
  process.env.AVANTIQO_CODE_BENCHMARK_INPUT ||
    "/tmp/avantiqo-code-certification-benchmark.json",
);
const outputPath = resolve(
  process.env.AVANTIQO_CODE_BENCHMARK_RESCORED_OUTPUT ||
    "/tmp/avantiqo-code-certification-benchmark-rescored.json",
);
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const apiKey = required("RUNPOD_API_KEY");

const report = JSON.parse(await readFile(inputPath, "utf8"));
if (text(report?.contract) !== CONTRACT) {
  throw new Error(`AVANTIQO_CODE_BENCHMARK_CONTRACT_MISMATCH:${text(report?.contract) || "MISSING"}`);
}
if (!Array.isArray(report?.observations) || report.observations.length < 6) {
  throw new Error("AVANTIQO_CODE_BENCHMARK_OBSERVATIONS_INCOMPLETE");
}
if (report?.summary?.infrastructure_failure) {
  throw new Error("AVANTIQO_CODE_BENCHMARK_INFRASTRUCTURE_FAILURE_CANNOT_BE_RESCORED");
}

const failed = report.observations.filter((item) => item?.passed !== true);
if (failed.length !== 1) {
  throw new Error(`AVANTIQO_CODE_BENCHMARK_SINGLE_FAILURE_REQUIRED:${failed.length}`);
}

const failedObservation = failed[0];
if (
  failedObservation.case_id !== "generate_finite_sum" ||
  failedObservation.semantic_pass !== false ||
  failedObservation.contract_pass !== true ||
  failedObservation.reasoning_boundary_pass !== true ||
  failedObservation.infrastructure_error
) {
  throw new Error("AVANTIQO_CODE_BENCHMARK_FAILURE_NOT_ELIGIBLE_FOR_BEHAVIORAL_RESCORE");
}

const jobId = text(failedObservation.job_id);
if (!jobId) throw new Error("AVANTIQO_CODE_BENCHMARK_FAILED_JOB_ID_REQUIRED");
const body = await readCompletedJob(endpointId, jobId, apiKey);
const output = body?.output || {};
const expected = expectedRuntime(report);
const contractPassNow = runtimeContractPass(output, failedObservation, expected);
if (!contractPassNow) {
  throw new Error("AVANTIQO_CODE_BENCHMARK_RESCORE_RUNTIME_CONTRACT_MISMATCH");
}

const result = text(output.result);
const reasoningPassNow = !/<think>|<\/think>|<reasoning>|<\/reasoning>/i.test(result);
if (!reasoningPassNow) {
  throw new Error("AVANTIQO_CODE_BENCHMARK_RESCORE_REASONING_BOUNDARY_FAILURE");
}
const semantic = validateCodeBenchmarkSemantic(failedObservation.case_id, result, {});
if (semantic.passed !== true) {
  throw new Error(
    `AVANTIQO_CODE_BENCHMARK_BEHAVIORAL_RESCORE_FAILED:${semantic.error || "BEHAVIOR_MISMATCH"}`,
  );
}

const observations = report.observations.map((item) => {
  if (item !== failedObservation) return item;
  return {
    ...item,
    semantic_pass: true,
    semantic_validation_mode: semantic.mode,
    semantic_validation_checks: semantic.checks,
    semantic_validation_source_safety: semantic.source_safety,
    semantic_rescore_from_original_false_negative: true,
    semantic_rescored_at: new Date().toISOString(),
    contract_pass: contractPassNow,
    reasoning_boundary_pass: reasoningPassNow,
    passed: true,
  };
});

const suitePassed = completeSuite(observations);
const plannerPassed = plannerCasePassed(observations);
const passed =
  suitePassed &&
  plannerPassed &&
  observations.every((item) => item?.passed === true) &&
  !report?.summary?.infrastructure_failure;

const rescored = {
  ...report,
  generated_at: report.generated_at,
  rescored_at: new Date().toISOString(),
  rescore: {
    contract: "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_RESCORE_V1",
    source_report_path: inputPath,
    exact_job_id: jobId,
    reason: "CORRECT_BENCHMARK_SEMANTIC_FALSE_NEGATIVE",
    semantic_validation_mode: semantic.mode,
    original_job_reused: true,
    new_inference_submitted: false,
    endpoint_mutation_performed: false,
    production_deploy_performed: false,
  },
  summary: {
    ...report.summary,
    passed,
    complete_suite: suitePassed,
    planner_protocol_passed: plannerPassed,
    infrastructure_failure: null,
  },
  observations,
  certification_requirements: {
    ...report.certification_requirements,
    broader_capability_suite_required: !suitePassed,
    autonomous_planner_protocol_required: !plannerPassed,
  },
  activation_allowed: false,
};

await writeFile(outputPath, `${JSON.stringify(rescored, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: passed,
  contract: "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_RESCORE_V1",
  benchmark_contract: rescored.contract,
  input_path: inputPath,
  output_path: outputPath,
  exact_job_id: jobId,
  semantic_validation_mode: semantic.mode,
  semantic_validation_checks: semantic.checks,
  summary: rescored.summary,
  new_inference_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  activation_allowed: false,
}, null, 2));
if (!passed) process.exitCode = 1;
