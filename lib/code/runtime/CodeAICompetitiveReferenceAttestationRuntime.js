import crypto from "node:crypto";

export const CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPORT_V1";
export const CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_V1";
export const CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_REFERENCE_RUNNER_V1";

const ALGORITHM = "hmac-sha256";
const SECRET_ENV = "AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET";
const MIN_SECRET_BYTES = 32;
const SHA256 = /^[a-f0-9]{64}$/i;
const SIMHASH64 = /^[a-f0-9]{16}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function secretFrom(env) {
  const secret = String(env?.[SECRET_ENV] ?? "");
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_SECRET_REQUIRED");
  }
  return secret;
}
function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "attestation")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
function payloadJson(report) {
  return JSON.stringify(canonical(object(report)));
}
function digestFor(report, secret) {
  return crypto.createHmac("sha256", secret).update(payloadJson(report), "utf8").digest("hex");
}

export function validateCodeAICompetitiveReferenceReportShape(
  report,
  { suite_contract = null, suite_sha256 = null, prompt_contract = null, prompt_contract_sha256 = null, required_case_ids = null } = {},
) {
  const source = object(report);
  const provider = text(source.provider || source?.model?.provider, 160);
  const model = text(source.model?.product_model || source.model?.runtime_model || source.model, 240);
  const observations = list(source.observations);
  const generatedAt = Date.parse(text(source.generated_at || source.measured_at, 120));
  const caseIds = observations.map((item) => text(item?.case_id, 160)).filter(Boolean).sort();
  const required = list(required_case_ids).map((item) => text(item, 160)).filter(Boolean).sort();

  if (text(source.contract, 180) !== CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT_INVALID");
  }
  if (text(source.generator_contract, 180) !== CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT_INVALID");
  }
  if (text(source.measurement_mode, 120) !== "LIVE_REFERENCE_PROVIDER") {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_LIVE_MEASUREMENT_REQUIRED");
  }
  if (source.provider_execution_performed !== true) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_EXECUTION_REQUIRED");
  }
  if (!provider || provider === "unknown" || !model || model === "unknown") {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_MODEL_REQUIRED");
  }
  if (!GIT_SHA.test(text(source.runner_source_commit, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RUNNER_SOURCE_COMMIT_REQUIRED");
  }
  if (text(source.runner_ref, 80) !== "main" || source.runner_repository_clean !== true) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CURRENT_CLEAN_MAIN_REQUIRED");
  }
  if (!Number.isFinite(generatedAt)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_MEASURED_AT_REQUIRED");
  }
  if (source.customer_private_content_included !== false || source.raw_customer_content_included !== false) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CUSTOMER_CONTENT_FORBIDDEN");
  }
  if (source.raw_reasoning_persisted !== false || source.raw_model_output_persisted !== false) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RAW_OUTPUT_FORBIDDEN");
  }
  if (!SHA256.test(text(source.suite_sha256, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_SHA256_REQUIRED");
  }
  if (!SHA256.test(text(source.prompt_contract_sha256, 80))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROMPT_SHA256_REQUIRED");
  }
  if (suite_contract && text(source.suite_contract, 180) !== text(suite_contract, 180)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_CONTRACT_MISMATCH");
  }
  if (suite_sha256 && text(source.suite_sha256, 80).toLowerCase() !== text(suite_sha256, 80).toLowerCase()) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUITE_SHA256_MISMATCH");
  }
  if (prompt_contract && text(source.prompt_contract, 180) !== text(prompt_contract, 180)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROMPT_CONTRACT_MISMATCH");
  }
  if (prompt_contract_sha256 && text(source.prompt_contract_sha256, 80).toLowerCase() !== text(prompt_contract_sha256, 80).toLowerCase()) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROMPT_SHA256_MISMATCH");
  }
  if (required.length && (caseIds.length !== required.length || caseIds.some((id, index) => id !== required[index]))) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CANONICAL_CASE_SET_REQUIRED");
  }
  if (new Set(caseIds).size !== caseIds.length || observations.length !== caseIds.length) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_IDS_INVALID");
  }
  let recomputedSupplierCostTotal = 0;
  for (const observation of observations) {
    if (typeof observation?.passed !== "boolean") {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_PASS_STATUS_REQUIRED");
    }
    if (!Array.isArray(observation?.failures)) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_FAILURES_REQUIRED");
    }
    const failureCodes = observation.failures.map((value) => text(value, 240)).filter(Boolean);
    if (failureCodes.length !== observation.failures.length || new Set(failureCodes).size !== failureCodes.length) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_FAILURES_INVALID");
    }
    if ((observation.passed === true && failureCodes.length !== 0) || (observation.passed === false && failureCodes.length === 0)) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_PASS_FAILURE_MISMATCH");
    }
    if (!Number.isFinite(Number(observation?.wall_ms)) || Number(observation.wall_ms) < 0) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_CASE_LATENCY_REQUIRED");
    }
    if (observation?.passed === true) {
      const quality = Number(observation?.quality_score);
      const evidenceGrounding = Number(observation?.evidence_grounding_score);
      const narrativeGrounding = Number(observation?.narrative_grounding_score);
      const evidenceDistinctness = Number(observation?.evidence_distinctness_score);
      const evidenceKeyCount = Number(observation?.evidence_key_count);
      if (
        !Number.isFinite(quality) || quality <= 0 || quality > 1 ||
        !Number.isFinite(evidenceGrounding) || evidenceGrounding <= 0 || evidenceGrounding > 1 ||
        !Number.isFinite(narrativeGrounding) || narrativeGrounding <= 0 || narrativeGrounding > 1 ||
        !Number.isFinite(evidenceDistinctness) || evidenceDistinctness <= 0 || evidenceDistinctness > 1 ||
        !Number.isInteger(evidenceKeyCount) || evidenceKeyCount <= 0 ||
        !SHA256.test(text(observation?.response_template_fingerprint_sha256, 80)) ||
        !SIMHASH64.test(text(observation?.response_template_simhash64, 32))
      ) {
        throw new Error("CODE_AI_COMPETITIVE_REFERENCE_QUALITY_EVIDENCE_REQUIRED");
      }
    }
    if (observation?.passed === false) {
      if (
        Number(observation?.quality_score) !== 0 ||
        Number(observation?.evidence_grounding_score) !== 0 ||
        Number(observation?.narrative_grounding_score) !== 0 ||
        Number(observation?.evidence_distinctness_score) !== 0 ||
        text(observation?.response_template_fingerprint_sha256, 80) ||
        text(observation?.response_template_simhash64, 32)
      ) {
        throw new Error("CODE_AI_COMPETITIVE_REFERENCE_FAILED_CASE_QUALITY_EVIDENCE_FORBIDDEN");
      }
    }
    if (text(observation?.latency_measurement_source, 120) !== "RUNNER_MONOTONIC_CLOCK_V1") {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RUNNER_LATENCY_MEASUREMENT_REQUIRED");
    }
    const inputTokens = Number(observation?.input_tokens);
    const outputTokens = Number(observation?.output_tokens);
    const inputUsdPer1m = Number(observation?.pricing_input_usd_per_1m);
    const outputUsdPer1m = Number(observation?.pricing_output_usd_per_1m);
    const cost = Number(observation?.supplier_cost_usd);
    if (text(observation?.token_usage_source, 120) !== "PROVIDER_API_USAGE_V1") {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_USAGE_REQUIRED");
    }
    if (text(observation?.pricing_source, 120) !== "OPERATOR_APPROVED_REFERENCE_PRICING_V1") {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_PRICING_PROVENANCE_REQUIRED");
    }
    if (text(observation?.cost_measurement_source, 160) !== "RUNNER_RECOMPUTED_FROM_USAGE_AND_PRICING_V1") {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_RUNNER_COST_MEASUREMENT_REQUIRED");
    }
    if (
      !Number.isFinite(inputTokens) || inputTokens < 0 ||
      !Number.isFinite(outputTokens) || outputTokens < 0 ||
      !Number.isFinite(inputUsdPer1m) || inputUsdPer1m <= 0 ||
      !Number.isFinite(outputUsdPer1m) || outputUsdPer1m <= 0 ||
      !Number.isFinite(cost) || cost < 0
    ) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_USAGE_PRICING_REQUIRED");
    }
    const expectedCost = Number((((inputTokens * inputUsdPer1m) + (outputTokens * outputUsdPer1m)) / 1_000_000).toFixed(8));
    if (Math.abs(cost - expectedCost) > 1e-8) {
      throw new Error("CODE_AI_COMPETITIVE_REFERENCE_COST_RECOMPUTATION_MISMATCH");
    }
    recomputedSupplierCostTotal += expectedCost;
  }
  const passedCount = observations.filter((item) => item?.passed === true).length;
  const expectedPassRate = observations.length ? Number((passedCount / observations.length).toFixed(4)) : 0;
  const summary = object(source.summary);
  if (
    Number(summary.requested_cases) !== observations.length ||
    Number(summary.completed_runs) !== observations.length ||
    Number(summary.passed_cases) !== passedCount ||
    Number(summary.pass_rate) !== expectedPassRate ||
    summary.passed !== (passedCount === observations.length) ||
    summary.complete_suite !== true
  ) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_SUMMARY_MISMATCH");
  }

  const economics = object(source.economics);
  const reportedSupplierCostTotal = Number(economics.estimated_supplier_cost_usd);
  const expectedSupplierCostTotal = Number(recomputedSupplierCostTotal.toFixed(8));
  if (text(economics.cost_measurement_source, 180) !== "RUNNER_SUM_OF_RECOMPUTED_CASE_COSTS_V1") {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_AGGREGATE_COST_PROVENANCE_REQUIRED");
  }
  if (!Number.isFinite(reportedSupplierCostTotal) || reportedSupplierCostTotal < 0 || Math.abs(reportedSupplierCostTotal - expectedSupplierCostTotal) > 1e-8) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_AGGREGATE_COST_RECOMPUTATION_MISMATCH");
  }
  return {
    provider,
    model,
    generated_at: new Date(generatedAt).toISOString(),
    case_ids: caseIds,
    observation_count: observations.length,
  };
}

export function attestCodeAICompetitiveReferenceReport(report, { env = process.env } = {}) {
  validateCodeAICompetitiveReferenceReportShape(report);
  const source = object(report);
  const digest = digestFor(source, secretFrom(env));
  return {
    ...source,
    attestation: {
      contract: CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT,
      algorithm: ALGORITHM,
      digest,
      server_only: true,
    },
  };
}

export function verifyCodeAICompetitiveReferenceReport(
  report,
  {
    env = process.env,
    suite_contract = null,
    suite_sha256 = null,
    prompt_contract = null,
    prompt_contract_sha256 = null,
    required_case_ids = null,
  } = {},
) {
  const source = object(report);
  const attestation = object(source.attestation);
  validateCodeAICompetitiveReferenceReportShape(source, {
    suite_contract,
    suite_sha256,
    prompt_contract,
    prompt_contract_sha256,
    required_case_ids,
  });
  if (
    text(attestation.contract, 180) !== CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT ||
    text(attestation.algorithm, 80) !== ALGORITHM ||
    attestation.server_only !== true
  ) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_REQUIRED");
  }
  const supplied = text(attestation.digest, 80);
  if (!SHA256.test(supplied)) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID");
  }
  const expected = digestFor(source, secretFrom(env));
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new Error("CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID");
  }
  return true;
}

export const CodeAICompetitiveReferenceAttestationRuntime = Object.freeze({
  report_contract: CODE_AI_COMPETITIVE_REFERENCE_REPORT_CONTRACT,
  attestation_contract: CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_CONTRACT,
  runner_contract: CODE_AI_COMPETITIVE_REFERENCE_RUNNER_CONTRACT,
  secret_env: SECRET_ENV,
  attest: attestCodeAICompetitiveReferenceReport,
  verify: verifyCodeAICompetitiveReferenceReport,
  validateShape: validateCodeAICompetitiveReferenceReportShape,
});

export default CodeAICompetitiveReferenceAttestationRuntime;
