import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const DEFAULT_EXPECTED_QUANTIZATION = "none";
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_POLL_MS = 2000;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function responseBody(response) {
  return response.json().catch(() => ({}));
}

function runpodError(prefix, response, body) {
  return new Error(`${prefix}_${response.status}:${text(body?.error || body?.message || body?.status)}`);
}

async function runAndWait(endpointId, input, apiKey) {
  const started = performance.now();
  const submit = await fetch(`${API_BASE}/${endpointId}/run`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ input }),
  });
  let body = await responseBody(submit);
  if (!submit.ok) throw runpodError("RUNPOD_SUBMIT_HTTP", submit, body);

  const jobId = text(body?.id);
  if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");

  const timeoutMs = Math.max(30000, Math.min(30 * 60 * 1000, number(process.env.AVANTIQO_CODE_BENCHMARK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)));
  const pollMs = Math.max(500, Math.min(10000, number(process.env.AVANTIQO_CODE_BENCHMARK_POLL_MS, DEFAULT_POLL_MS)));
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") {
      return {
        body,
        wallMs: Math.round(performance.now() - started),
        jobId,
      };
    }
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
      throw new Error(`RUNPOD_JOB_${status}:${text(body?.error || body?.message)}`);
    }
    if (Date.now() >= deadline) throw new Error(`RUNPOD_JOB_TIMEOUT:${jobId}`);

    await delay(pollMs);
    const response = await fetch(`${API_BASE}/${endpointId}/status/${jobId}`, {
      method: "GET",
      headers: headers(apiKey),
    });
    body = await responseBody(response);
    if (!response.ok) throw runpodError("RUNPOD_STATUS_HTTP", response, body);
  }
}

function includesAll(result, values = []) {
  const source = result.toLowerCase();
  return values.every((value) => source.includes(String(value).toLowerCase()));
}

function includesAny(result, values = []) {
  if (!values.length) return true;
  const source = result.toLowerCase();
  return values.some((value) => source.includes(String(value).toLowerCase()));
}

function parsePlannerJson(result) {
  const raw = text(result)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function plannerProtocolPass(result) {
  const parsed = parsePlannerJson(result);
  return Boolean(
    parsed &&
    parsed.action === "read" &&
    parsed.input?.file_path === "lib/code/runtime/CodeAIMissionRuntime.js" &&
    text(parsed.description) &&
    text(parsed.reason),
  );
}

const cases = [
  {
    id: "generate_finite_sum",
    capability: "ai.code.generate",
    instruction: "Return code only. Write a JavaScript function named sumInvoiceLines(lines) that sums only finite numeric line.total values. Convert numeric strings with Number(...), ignore invalid totals, and return 0 for non-arrays. The implementation must use Number.isFinite.",
    requiredAll: ["sumInvoiceLines", "Number.isFinite"],
    requiredAny: ["Number(line.total)", "Number(line?.total)"],
  },
  {
    id: "edit_numeric_normalization",
    capability: "ai.code.edit",
    instruction: "Return the complete corrected JavaScript function only. Edit this function so numeric strings become numbers, invalid values return 0, and zero remains zero: function normalizeSubtotal(value) { return value || 0; } Use Number(value) and Number.isFinite.",
    requiredAll: ["normalizeSubtotal", "Number(value)", "Number.isFinite"],
  },
  {
    id: "refactor_email_normalization",
    capability: "ai.code.refactor",
    instruction: "Refactor this JavaScript without changing behavior and return code only: const customerEmail = String(customer.email || '').trim().toLowerCase(); const vendorEmail = String(vendor.email || '').trim().toLowerCase(); Extract a reusable function named normalizeEmail and use it for both values.",
    requiredAll: ["normalizeEmail", "trim()", "toLowerCase()", "customerEmail", "vendorEmail"],
  },
  {
    id: "review_authorization_guard",
    capability: "ai.code.review",
    instruction: "Review this authorization expression and give the highest-risk correctness issue plus a corrected guarded expression: user && user.role === 'admin' || user.owner_id === organizationId. Explain why a falsy user can still reach user.owner_id because of && / || evaluation. Keep the answer concise.",
    requiredAll: ["user.owner_id"],
    requiredAny: ["falsy", "null", "undefined", "TypeError", "guard"],
  },
  {
    id: "debug_numeric_reduce",
    capability: "ai.code.debug",
    instruction: "Return only the corrected one-line JavaScript expression. Fix this so numeric string totals add numerically instead of concatenating: const total = rows.reduce((sum, row) => sum + row.total, 0); The corrected expression must use Number(row.total).",
    requiredAll: ["reduce", "Number(row.total)"],
  },
  {
    id: "autonomous_planner_json_protocol",
    capability: "ai.code.debug",
    instruction: "Return exactly one JSON object and no markdown. You are choosing the next safe Code AI action. Evidence says the relevant file is known but has not been read yet. Choose action read for lib/code/runtime/CodeAIMissionRuntime.js lines 1 through 240. Required shape: {\"action\":\"read\",\"description\":\"...\",\"input\":{\"file_path\":\"lib/code/runtime/CodeAIMissionRuntime.js\",\"start_line\":1,\"end_line\":240},\"reason\":\"...\"}.",
    plannerProtocol: true,
  },
];

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const foundationModel = text(process.env.AVANTIQO_CODE_FOUNDATION_MODEL) || EXPECTED_FOUNDATION_MODEL;
if (foundationModel !== EXPECTED_FOUNDATION_MODEL) {
  throw new Error(`AVANTIQO_CODE_FOUNDATION_MODEL_CERTIFICATION_MISMATCH:${foundationModel}`);
}
const expectedQuantization = text(process.env.AVANTIQO_CODE_EXPECTED_QUANTIZATION).toLowerCase() || DEFAULT_EXPECTED_QUANTIZATION;
if (!["none", "int8"].includes(expectedQuantization)) {
  throw new Error(`AVANTIQO_CODE_EXPECTED_QUANTIZATION_INVALID:${expectedQuantization}`);
}

const requestedRuns = Math.floor(number(process.env.AVANTIQO_CODE_BENCHMARK_RUNS, cases.length));
const runs = Math.max(cases.length, Math.min(12, requestedRuns));
const observations = [];
let infrastructureFailure = null;

for (let index = 0; index < runs; index += 1) {
  const sample = cases[index % cases.length];
  try {
    const { body, wallMs, jobId } = await runAndWait(endpointId, {
      contract: CONTRACT,
      capability: sample.capability,
      foundation_model: foundationModel,
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `benchmark-code-v2-${index + 1}`,
      instruction: sample.instruction,
      structured_specification: {
        benchmark_contract: "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2",
        benchmark_case: sample.id,
        response_style: sample.plannerProtocol ? "strict_json" : "bounded",
      },
    }, apiKey);

    const output = body.output || {};
    const result = text(output.result);
    const semanticPass = sample.plannerProtocol
      ? plannerProtocolPass(result)
      : includesAll(result, sample.requiredAll) && includesAny(result, sample.requiredAny);
    const observedQuantization = text(output.quantization || "none").toLowerCase();
    const contractPass =
      text(output.provider) === "avantiqo-code" &&
      text(output.engine_contract) === CONTRACT &&
      text(output.capability) === sample.capability &&
      text(output.foundation_model) === EXPECTED_FOUNDATION_MODEL &&
      observedQuantization === expectedQuantization &&
      output.raw_reasoning_persisted === false;
    const reasoningPass = !/<think>|<\/think>|<reasoning>|<\/reasoning>/i.test(result);
    const outputPass = result.length > 10;

    observations.push({
      run: index + 1,
      case_id: sample.id,
      capability: sample.capability,
      job_id: jobId,
      wall_ms: wallMs,
      runpod_delay_ms: Number(body.delayTime) || null,
      runpod_execution_ms: Number(body.executionTime) || null,
      worker_generation_seconds: Number(output.generation_seconds) || null,
      quantization: observedQuantization,
      input_tokens: Number(output.usage?.input_tokens) || null,
      output_tokens: Number(output.usage?.output_tokens) || null,
      runtime_prompt_tokens: Number(output.usage?.runtime_prompt_tokens) || null,
      internal_prompt_tokens: Number(output.usage?.internal_prompt_tokens) || null,
      result_length: result.length,
      semantic_pass: semanticPass,
      planner_protocol_pass: sample.plannerProtocol ? semanticPass : null,
      contract_pass: contractPass,
      reasoning_boundary_pass: reasoningPass,
      passed: semanticPass && contractPass && reasoningPass && outputPass,
    });
  } catch (error) {
    infrastructureFailure = text(error?.message || error);
    observations.push({
      run: index + 1,
      case_id: sample.id,
      capability: sample.capability,
      passed: false,
      infrastructure_error: infrastructureFailure,
    });
    break;
  }
}

const wall = observations.map((item) => item.wall_ms);
const executionMs = observations.map((item) => item.runpod_execution_ms);
const generationSeconds = observations.map((item) => item.worker_generation_seconds);
const capabilitiesCovered = [...new Set(observations.filter((item) => !item.infrastructure_error).map((item) => item.capability))];
const plannerProtocolPassed = observations.some((item) => item.case_id === "autonomous_planner_json_protocol" && item.passed);
const completeSuite = cases.every((sample) => observations.some((item) => item.case_id === sample.id && item.passed));
const passed = !infrastructureFailure && completeSuite && plannerProtocolPassed && observations.every((item) => item.passed);

const supplierRatePerSecond = number(process.env.AVANTIQO_CODE_RUNPOD_COST_PER_GPU_SECOND_USD, NaN);
const measuredExecutionSeconds = executionMs.filter(Number.isFinite).reduce((sum, value) => sum + value, 0) / 1000;
const estimatedSupplierCostUsd = Number.isFinite(supplierRatePerSecond)
  ? Number((measuredExecutionSeconds * supplierRatePerSecond).toFixed(6))
  : null;

const report = {
  contract: "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2",
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  purpose: "MEASURE_ONLY_DO_NOT_ACTIVATE_PRICING",
  model: {
    provider: "avantiqo-code",
    product_model: "avantiqo-code-v1",
    foundation_model: EXPECTED_FOUNDATION_MODEL,
    quantization: expectedQuantization,
    capabilities: [
      "ai.code.generate",
      "ai.code.edit",
      "ai.code.refactor",
      "ai.code.review",
      "ai.code.debug",
    ],
  },
  summary: {
    requested_runs: runs,
    completed_runs: observations.filter((item) => !item.infrastructure_error).length,
    passed,
    complete_suite: completeSuite,
    planner_protocol_passed: plannerProtocolPassed,
    capabilities_covered: capabilitiesCovered,
    p50_wall_ms: percentile(wall, 0.5),
    p95_wall_ms: percentile(wall, 0.95),
    p50_runpod_execution_ms: percentile(executionMs, 0.5),
    p95_runpod_execution_ms: percentile(executionMs, 0.95),
    p50_worker_generation_seconds: percentile(generationSeconds, 0.5),
    p95_worker_generation_seconds: percentile(generationSeconds, 0.95),
    infrastructure_failure: infrastructureFailure,
  },
  economics: {
    measured_runpod_execution_seconds: Number(measuredExecutionSeconds.toFixed(3)),
    supplier_cost_rate_per_gpu_second_usd: Number.isFinite(supplierRatePerSecond) ? supplierRatePerSecond : null,
    estimated_supplier_cost_usd: estimatedSupplierCostUsd,
    economics_certified: false,
  },
  observations,
  certification_requirements: {
    broader_capability_suite_required: !completeSuite,
    autonomous_planner_protocol_required: !plannerProtocolPassed,
    measured_gpu_economics_required: true,
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
    sandbox_execution_gate: "SEPARATE_LIVE_GATE",
    live_github_connect_commit_required: true,
  },
};

const outputPath = resolve(
  process.env.AVANTIQO_CODE_BENCHMARK_OUTPUT ||
  "/tmp/avantiqo-code-certification-benchmark.json",
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: passed,
  output_path: outputPath,
  summary: report.summary,
  economics: report.economics,
  activation_allowed: false,
}, null, 2));
if (!passed) process.exitCode = 1;
