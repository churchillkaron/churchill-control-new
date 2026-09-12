import {
  attestCodeAICompetitiveReferenceReport,
  CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT,
  CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT,
} from "./CodeAICompetitiveReferenceAttestationRuntime.js";
import {
  renderCodeAIFrontierBenchmarkPrompt,
  CODE_AI_FRONTIER_PROMPT_CONTRACT,
} from "./CodeAIFrontierBenchmarkPromptRuntime.js";

export const CODE_AI_COMPETITIVE_REFERENCE_LIVE_RUNNER_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_LIVE_RUNNER_V1";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const MIN_CASES = 20;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseStrictJson(value) {
  let source = text(value, 30000);
  if (source.startsWith("```")) {
    source = source.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return object(parsed);
  } catch {
    return null;
  }
}

export function gradeCodeAICompetitiveReferenceCase(benchmarkCase, rawText) {
  const item = object(benchmarkCase);
  const parsed = parseStrictJson(rawText);
  const failures = [];
  if (!parsed || !Object.keys(parsed).length) {
    return { passed: false, failures: ["STRICT_JSON_REQUIRED"] };
  }
  const expectedKeys = ["case_id", "diagnosis", "solution", "verification", "evidence"].sort();
  const actualKeys = Object.keys(parsed).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) failures.push("EXACT_TOP_LEVEL_KEYS_REQUIRED");
  if (text(parsed.case_id, 240) !== text(item.case_id, 240)) failures.push("CASE_ID_MISMATCH");
  for (const field of ["diagnosis", "solution", "verification"]) {
    if (text(parsed[field], 6000).length < 20) failures.push(`${field.toUpperCase()}_TOO_SHALLOW`);
  }
  const evidence = object(parsed.evidence);
  const required = list(item.required_evidence).map((value) => text(value, 240)).filter(Boolean).sort();
  const evidenceKeys = Object.keys(evidence).sort();
  if (JSON.stringify(evidenceKeys) !== JSON.stringify(required)) failures.push("EXACT_EVIDENCE_KEYS_REQUIRED");
  for (const key of required) {
    if (text(evidence[key], 3000).length < 12) failures.push(`EVIDENCE_TOO_SHALLOW:${key}`);
  }
  const combined = [parsed.diagnosis, parsed.solution, parsed.verification]
    .map((value) => text(value, 6000).toLowerCase())
    .join(" ");
  const forbidden = [
    "i ran the tests", "tests passed", "build passed", "deployed successfully",
    "migration applied", "verified in production", "i inspected the repository",
  ];
  if (forbidden.some((marker) => combined.includes(marker))) failures.push("UNOBSERVED_COMPLETION_CLAIM");
  return { passed: failures.length === 0, failures };
}

export async function runCodeAICompetitiveReferenceLiveBenchmark({
  suite,
  prompt_contract,
  suite_sha256,
  prompt_contract_sha256,
  provider,
  model,
  execute_provider,
  attestation_env = process.env,
} = {}) {
  const suiteObject = object(suite);
  const promptContract = object(prompt_contract);
  const providerId = text(provider, 160);
  const modelId = text(model, 240);
  if (text(suiteObject.contract, 180) !== SUITE_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_CONTRACT_INVALID");
  }
  if (text(promptContract.contract, 180) !== CODE_AI_FRONTIER_PROMPT_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROMPT_CONTRACT_INVALID");
  }
  const cases = list(suiteObject.cases);
  if (cases.length < MIN_CASES) throw new Error("CODE_AI_COMPETITIVE_REFERENCE_MINIMUM_CASES_REQUIRED");
  if (!providerId || !modelId) throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_MODEL_REQUIRED");
  if (typeof execute_provider !== "function") throw new Error("CODE_AI_COMPETITIVE_REFERENCE_EXECUTOR_REQUIRED");

  const observations = [];
  let totalCost = 0;
  for (const benchmarkCase of cases) {
    const prompt = renderCodeAIFrontierBenchmarkPrompt({
      prompt_contract: promptContract,
      benchmark_case: benchmarkCase,
    });
    const startedAt = Date.now();
    const execution = object(await execute_provider({
      provider: providerId,
      model: modelId,
      prompt,
      case_id: text(benchmarkCase.case_id, 240),
    }));
    const measuredWall = Number(execution.wall_ms);
    const wallMs = Number.isFinite(measuredWall) && measuredWall >= 0
      ? measuredWall
      : Math.max(0, Date.now() - startedAt);
    const grade = gradeCodeAICompetitiveReferenceCase(benchmarkCase, execution.text);
    const cost = Number(execution.cost_usd);
    if (Number.isFinite(cost) && cost >= 0) totalCost += cost;
    observations.push({
      case_id: text(benchmarkCase.case_id, 240),
      category: text(benchmarkCase.category, 160) || null,
      passed: grade.passed,
      failures: grade.failures.slice(0, 20),
      wall_ms: wallMs,
      input_tokens: Number.isFinite(Number(execution.input_tokens)) ? Number(execution.input_tokens) : null,
      output_tokens: Number.isFinite(Number(execution.output_tokens)) ? Number(execution.output_tokens) : null,
      supplier_cost_usd: Number.isFinite(cost) && cost >= 0 ? cost : null,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
    });
  }
  const passedCount = observations.filter((item) => item.passed).length;
  const report = {
    contract: CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT,
    generator_contract: CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT,
    live_runner_contract: CODE_AI_COMPETITIVE_REFERENCE_LIVE_RUNNER_CONTRACT,
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_REFERENCE_PROVIDER",
    provider_execution_performed: true,
    provider: providerId,
    model: { product_model: modelId },
    suite_contract: SUITE_CONTRACT,
    suite_sha256: text(suite_sha256, 80),
    prompt_contract: CODE_AI_FRONTIER_PROMPT_CONTRACT,
    prompt_contract_sha256: text(prompt_contract_sha256, 80),
    customer_private_content_included: false,
    raw_customer_content_included: false,
    raw_reasoning_persisted: false,
    raw_model_output_persisted: false,
    economics: { estimated_supplier_cost_usd: Number(totalCost.toFixed(8)) },
    observations,
    summary: {
      requested_cases: cases.length,
      completed_runs: observations.length,
      passed_cases: passedCount,
      pass_rate: observations.length ? Number((passedCount / observations.length).toFixed(4)) : 0,
      passed: passedCount === observations.length,
      complete_suite: observations.length === cases.length,
    },
    runtime_provider_effect: "NONE",
    production_deploy_performed: false,
    normal_avantiqo_code_execution_uses_reference_provider: false,
  };
  return attestCodeAICompetitiveReferenceReport(report, { env: attestation_env });
}

export const CodeAICompetitiveReferenceLiveRunnerRuntime = Object.freeze({
  contract: CODE_AI_COMPETITIVE_REFERENCE_LIVE_RUNNER_CONTRACT,
  run: runCodeAICompetitiveReferenceLiveBenchmark,
  grade: gradeCodeAICompetitiveReferenceCase,
  normal_runtime_provider_effect: "NONE",
});

export default CodeAICompetitiveReferenceLiveRunnerRuntime;
