import { performance } from "node:perf_hooks";
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


function contentDepthScore(value, { minimum = 20 } = {}) {
  const source = text(value, 6000);
  if (source.length < minimum) return 0;
  const words = source.toLowerCase().match(/[a-z0-9_./:-]+/g) || [];
  if (words.length < 4) return 0;
  const uniqueRatio = new Set(words).size / words.length;
  const lengthScore = source.length >= 220 ? 1 : source.length >= 120 ? 0.85 : source.length >= 60 ? 0.7 : 0.55;
  const diversityMultiplier = uniqueRatio >= 0.65 ? 1 : uniqueRatio >= 0.5 ? 0.9 : uniqueRatio >= 0.35 ? 0.75 : 0.55;
  return Math.min(1, Number((lengthScore * diversityMultiplier).toFixed(4)));
}

const GROUNDING_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "it", "no", "not", "of", "on", "or", "the", "to", "with", "without",
  "correct", "required", "preserved", "performed", "used",
]);

function normalizedAnchorTokens(value) {
  const raw = text(value, 4000).toLowerCase().replace(/[_-]+/g, " ").match(/[a-z0-9]+/g) || [];
  return [...new Set(raw.map((token) => {
    if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
    return token;
  }).filter((token) => token.length >= 3 && !GROUNDING_STOP_WORDS.has(token)))];
}

function evidenceGroundingScore(benchmarkCase, parsed, requiredEvidence = []) {
  const evidence = object(parsed?.evidence);
  const caseAnchors = normalizedAnchorTokens(`${text(benchmarkCase?.title, 1200)} ${text(benchmarkCase?.category, 240)}`);
  if (!requiredEvidence.length) return 1;
  const scores = requiredEvidence.map((key) => {
    const keyAnchors = normalizedAnchorTokens(key);
    const anchors = [...new Set([...keyAnchors, ...caseAnchors])];
    const valueTokens = new Set(normalizedAnchorTokens(evidence?.[key]));
    const overlap = anchors.filter((token) => valueTokens.has(token)).length;
    if (overlap >= 2) return 1;
    if (overlap === 1) return 0.75;
    return 0;
  });
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4));
}


function narrativeGroundingScore(benchmarkCase, parsed, requiredEvidence = []) {
  const anchors = normalizedAnchorTokens([
    text(benchmarkCase?.title, 1200),
    text(benchmarkCase?.category, 240),
    ...requiredEvidence,
  ].join(" "));
  if (!anchors.length) return 1;
  const scores = ["diagnosis", "solution", "verification"].map((field) => {
    const valueTokens = new Set(normalizedAnchorTokens(parsed?.[field]));
    const overlap = anchors.filter((token) => valueTokens.has(token)).length;
    if (overlap >= 3) return 1;
    if (overlap === 2) return 0.85;
    if (overlap === 1) return 0.6;
    return 0;
  });
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4));
}

function qualityScore(benchmarkCase, parsed, requiredEvidence = []) {
  const evidence = object(parsed?.evidence);
  const fieldScores = ["diagnosis", "solution", "verification"].map((field) =>
    contentDepthScore(parsed?.[field], { minimum: 20 }),
  );
  const evidenceScores = requiredEvidence.map((key) =>
    contentDepthScore(evidence?.[key], { minimum: 12 }),
  );
  const all = [...fieldScores, ...evidenceScores];
  if (!all.length) return 0;
  const depth = all.reduce((sum, value) => sum + value, 0) / all.length;
  const evidenceGrounding = evidenceGroundingScore(benchmarkCase, parsed, requiredEvidence);
  const narrativeGrounding = narrativeGroundingScore(benchmarkCase, parsed, requiredEvidence);
  const grounding = 0.5 * evidenceGrounding + 0.5 * narrativeGrounding;
  return Number((depth * (0.55 + 0.45 * grounding)).toFixed(4));
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
  return {
    passed: failures.length === 0,
    failures,
    quality_score: failures.length === 0 ? qualityScore(item, parsed, required) : 0,
    evidence_grounding_score: failures.length === 0 ? evidenceGroundingScore(item, parsed, required) : 0,
    narrative_grounding_score: failures.length === 0 ? narrativeGroundingScore(item, parsed, required) : 0,
    evidence_key_count: required.length,
  };
}

export async function runCodeAICompetitiveReferenceLiveBenchmark({
  suite,
  prompt_contract,
  suite_sha256,
  prompt_contract_sha256,
  provider,
  model,
  execute_provider,
  runner_provenance = null,
  attestation_env = process.env,
} = {}) {
  const suiteObject = object(suite);
  const promptContract = object(prompt_contract);
  const providerId = text(provider, 160);
  const modelId = text(model, 240);
  const provenance = object(runner_provenance);
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
  if (!/^[a-f0-9]{40}$/i.test(text(provenance.source_commit, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RUNNER_SOURCE_COMMIT_REQUIRED");
  }
  if (text(provenance.ref, 80) !== "main" || provenance.repository_clean !== true) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CURRENT_CLEAN_MAIN_REQUIRED");
  }

  const observations = [];
  let totalCost = 0;
  for (const benchmarkCase of cases) {
    const prompt = renderCodeAIFrontierBenchmarkPrompt({
      prompt_contract: promptContract,
      benchmark_case: benchmarkCase,
    });
    const startedAt = performance.now();
    const execution = object(await execute_provider({
      provider: providerId,
      model: modelId,
      prompt,
      case_id: text(benchmarkCase.case_id, 240),
    }));
    const wallMs = Number(Math.max(0, performance.now() - startedAt).toFixed(3));
    const providerReportedWall = Number(execution.wall_ms);
    const providerReportedWallMs = Number.isFinite(providerReportedWall) && providerReportedWall >= 0
      ? providerReportedWall
      : null;
    const grade = gradeCodeAICompetitiveReferenceCase(benchmarkCase, execution.text);
    const inputTokens = Number(execution.input_tokens);
    const outputTokens = Number(execution.output_tokens);
    const inputUsdPer1m = Number(execution.pricing_input_usd_per_1m);
    const outputUsdPer1m = Number(execution.pricing_output_usd_per_1m);
    const usageValid = Number.isFinite(inputTokens) && inputTokens >= 0 && Number.isFinite(outputTokens) && outputTokens >= 0;
    const pricingValid = Number.isFinite(inputUsdPer1m) && inputUsdPer1m > 0 && Number.isFinite(outputUsdPer1m) && outputUsdPer1m > 0;
    const cost = usageValid && pricingValid
      ? Number((((inputTokens * inputUsdPer1m) + (outputTokens * outputUsdPer1m)) / 1_000_000).toFixed(8))
      : null;
    if (cost !== null) totalCost += cost;
    const providerReportedCost = Number(execution.cost_usd);
    observations.push({
      case_id: text(benchmarkCase.case_id, 240),
      category: text(benchmarkCase.category, 160) || null,
      passed: grade.passed,
      failures: grade.failures.slice(0, 20),
      quality_score: Number(grade.quality_score || 0),
      evidence_grounding_score: Number(grade.evidence_grounding_score || 0),
      narrative_grounding_score: Number(grade.narrative_grounding_score || 0),
      evidence_key_count: Number(grade.evidence_key_count || 0),
      wall_ms: wallMs,
      latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
      provider_reported_wall_ms: providerReportedWallMs,
      input_tokens: usageValid ? inputTokens : null,
      output_tokens: usageValid ? outputTokens : null,
      token_usage_source: text(execution.token_usage_source, 120) || null,
      pricing_input_usd_per_1m: pricingValid ? inputUsdPer1m : null,
      pricing_output_usd_per_1m: pricingValid ? outputUsdPer1m : null,
      pricing_source: text(execution.pricing_source, 120) || null,
      cost_measurement_source: cost !== null ? "RUNNER_RECOMPUTED_FROM_USAGE_AND_PRICING_V1" : null,
      supplier_cost_usd: cost,
      provider_reported_cost_usd: Number.isFinite(providerReportedCost) && providerReportedCost >= 0 ? providerReportedCost : null,
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
    runner_source_commit: text(provenance.source_commit, 80).toLowerCase(),
    runner_ref: "main",
    runner_repository_clean: true,
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
