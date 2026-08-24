const API_BASE = "https://api.runpod.ai/v2";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeCode(value) {
  return text(value)
    .replace(/^```(?:javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const jobId = required("AVANTIQO_CODE_BENCHMARK_JOB_ID");

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

const output = body?.output || {};
const result = normalizeCode(output.result);
const compact = result.replace(/\s+/g, " ");
const diagnostics = {
  contains_function_name: /\bsumInvoiceLines\b/.test(result),
  contains_number_is_finite: /\bNumber\.isFinite\s*\(/.test(result),
  contains_exact_number_line_total: compact.includes("Number(line.total)"),
  contains_exact_number_optional_line_total: compact.includes("Number(line?.total)"),
  contains_general_number_conversion: /\bNumber\s*\([^)]*(?:line|total)[^)]*\)/i.test(result),
  contains_array_guard: /\bArray\.isArray\s*\(/.test(result),
  contains_reduce_or_loop: /\.reduce\s*\(|\bfor\s*\(|\bfor\s+\(?(?:const|let|var)\b|\bfor\s+\w+\s+of\b/.test(result),
};
const originalSemanticPass =
  diagnostics.contains_function_name &&
  diagnostics.contains_number_is_finite &&
  (diagnostics.contains_exact_number_line_total || diagnostics.contains_exact_number_optional_line_total);
const likelyMatcherFalseNegative =
  !originalSemanticPass &&
  diagnostics.contains_function_name &&
  diagnostics.contains_number_is_finite &&
  diagnostics.contains_general_number_conversion &&
  diagnostics.contains_array_guard;

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_BENCHMARK_JOB_INSPECTION_V1",
  endpoint_id: endpointId,
  job_id: jobId,
  job_status: status,
  runtime_contract: {
    provider: text(output.provider) || null,
    engine_contract: text(output.engine_contract) || null,
    capability: text(output.capability) || null,
    foundation_model: text(output.foundation_model) || null,
    runtime_model: text(output.runtime_model) || null,
    serving_runtime: text(output.serving_runtime) || null,
    quantization: text(output.quantization) || null,
    raw_reasoning_persisted: output.raw_reasoning_persisted ?? null,
  },
  semantic_diagnostics: {
    ...diagnostics,
    original_semantic_matcher_pass: originalSemanticPass,
    likely_matcher_false_negative: likelyMatcherFalseNegative,
  },
  result,
  result_length: result.length,
  runpod_execution_ms: Number(body.executionTime) || null,
  runpod_delay_ms: Number(body.delayTime) || null,
  inference_submission_performed: false,
  endpoint_mutation_performed: false,
  provider_read_performed: true,
  production_deploy_performed: false,
}, null, 2));
