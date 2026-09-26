import assert from "node:assert/strict";
import test from "node:test";
import {
  attestCodeAICompetitiveReferenceReport,
  verifyCodeAICompetitiveReferenceReport,
  validateCodeAICompetitiveReferenceReportShape,
} from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";

const SECRET = "competitive-reference-secret-0123456789abcdef";
const SUITE_SHA = "a".repeat(64);
const PROMPT_SHA = "c".repeat(64);
const CASES = ["case_a", "case_b"];

function report(overrides = {}) {
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPORT_V1",
    generator_contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_RUNNER_V1",
    benchmark_run_id: "11111111-1111-4111-8111-111111111111",
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_REFERENCE_PROVIDER",
    provider_execution_performed: true,
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    provider: "reference-provider",
    model: { product_model: "reference-model" },
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_sha256: SUITE_SHA,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: PROMPT_SHA,
    customer_private_content_included: false,
    raw_customer_content_included: false,
    raw_reasoning_persisted: false,
    raw_model_output_persisted: false,
    economics: {
      estimated_supplier_cost_usd: Number((CASES.length * 0.0013).toFixed(8)),
      cost_measurement_source: "RUNNER_SUM_OF_RECOMPUTED_CASE_COSTS_V1",
    },
    summary: {
      requested_cases: CASES.length,
      completed_runs: CASES.length,
      passed_cases: CASES.length,
      pass_rate: 1,
      passed: true,
      complete_suite: true,
    },
    observations: CASES.map((case_id, index) => ({
      case_id,
      category: "repository",
      passed: true,
      failures: [],
      quality_score: 0.85,
      evidence_grounding_score: 0.9,
      narrative_grounding_score: 0.9,
      evidence_distinctness_score: 0.9,
      response_template_fingerprint_sha256: (index === 0 ? "1" : "2").repeat(64),
      response_template_simhash64: (index === 0 ? "3" : "4").repeat(16),
      evidence_key_count: 2,
      latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
      wall_ms: 100 + index,
      input_tokens: 100,
      output_tokens: 80,
      token_usage_source: "PROVIDER_API_USAGE_V1",
      pricing_input_usd_per_1m: 5,
      pricing_output_usd_per_1m: 10,
      pricing_source: "OPERATOR_APPROVED_REFERENCE_PRICING_V1",
      cost_measurement_source: "RUNNER_RECOMPUTED_FROM_USAGE_AND_PRICING_V1",
      supplier_cost_usd: 0.0013,
    })),
    ...overrides,
  };
}

const env = { AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET: SECRET };
const verifyOptions = {
  env,
  suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
  suite_sha256: SUITE_SHA,
  prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
  prompt_contract_sha256: PROMPT_SHA,
  required_case_ids: CASES,
};

test("valid controlled live reference report attests and verifies", () => {
  const signed = attestCodeAICompetitiveReferenceReport(report(), { env });
  assert.equal(verifyCodeAICompetitiveReferenceReport(signed, verifyOptions), true);
});

test("tampered reference observations fail attestation verification", () => {
  const signed = attestCodeAICompetitiveReferenceReport(report(), { env });
  signed.observations[0].wall_ms = 1;
  assert.throws(
    () => verifyCodeAICompetitiveReferenceReport(signed, verifyOptions),
    /CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID/,
  );
});

test("wrong canonical suite binding fails closed", () => {
  const signed = attestCodeAICompetitiveReferenceReport(report(), { env });
  assert.throws(
    () => verifyCodeAICompetitiveReferenceReport(signed, { ...verifyOptions, suite_sha256: "b".repeat(64) }),
    /CODE_AI_COMPETITIVE_REFERENCE_SUITE_SHA256_MISMATCH/,
  );
});

test("mismatched prompt contract fails closed", () => {
  const signed = attestCodeAICompetitiveReferenceReport(report(), { env });
  assert.throws(
    () => verifyCodeAICompetitiveReferenceReport(signed, { ...verifyOptions, prompt_contract_sha256: "d".repeat(64) }),
    /CODE_AI_COMPETITIVE_REFERENCE_PROMPT_SHA256_MISMATCH/,
  );
});

test("unsigned or spoofed live reference reports are rejected", () => {
  assert.throws(
    () => verifyCodeAICompetitiveReferenceReport(report(), verifyOptions),
    /CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_REQUIRED/,
  );
  assert.throws(
    () => validateCodeAICompetitiveReferenceReportShape(report({ provider_execution_performed: false }), verifyOptions),
    /CODE_AI_COMPETITIVE_REFERENCE_PROVIDER_EXECUTION_REQUIRED/,
  );
});


test("tampered recomputed cost is rejected before signing", () => {
  const invalid = report();
  invalid.observations[0].supplier_cost_usd = 0.00001;
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_COST_RECOMPUTATION_MISMATCH/,
  );
});


test("tampered aggregate supplier cost is rejected before signing", () => {
  const invalid = report();
  invalid.economics.estimated_supplier_cost_usd = 0.00001;
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_AGGREGATE_COST_RECOMPUTATION_MISMATCH/,
  );
});


test("reference attestation rejects missing deterministic quality evidence before signing", () => {
  const invalid = report();
  delete invalid.observations[0].response_template_simhash64;
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_QUALITY_EVIDENCE_REQUIRED/,
  );
});

test("reference attestation forbids persisted raw model output", () => {
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(report({ raw_model_output_persisted: true }), { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_RAW_OUTPUT_FORBIDDEN/,
  );
});


test("reference attestation rejects summary counters that disagree with observations", () => {
  const invalid = report();
  invalid.summary.passed_cases = 1;
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_SUMMARY_MISMATCH/,
  );
});


test("failed reference case cannot retain positive quality evidence", () => {
  const invalid = report();
  invalid.observations[0].passed = false;
  invalid.observations[0].failures = ["GRADE_FAILED"];
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_FAILED_CASE_QUALITY_EVIDENCE_FORBIDDEN/,
  );
});


test("reference attestation binds pass status to failure evidence", () => {
  const passedWithFailure = report();
  passedWithFailure.observations[0].failures = ["UNEXPECTED_FAILURE"];
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(passedWithFailure, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_CASE_PASS_FAILURE_MISMATCH/,
  );

  const failedWithoutFailure = report();
  failedWithoutFailure.observations[0].passed = false;
  failedWithoutFailure.observations[0].quality_score = 0;
  failedWithoutFailure.observations[0].evidence_grounding_score = 0;
  failedWithoutFailure.observations[0].narrative_grounding_score = 0;
  failedWithoutFailure.observations[0].evidence_distinctness_score = 0;
  failedWithoutFailure.observations[0].response_template_fingerprint_sha256 = null;
  failedWithoutFailure.observations[0].response_template_simhash64 = null;
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(failedWithoutFailure, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_CASE_PASS_FAILURE_MISMATCH/,
  );
});


test("reference failure evidence must be bounded machine codes", () => {
  const invalid = report();
  invalid.observations[0].passed = false;
  invalid.observations[0].failures = ["raw provider output must never be persisted here"];
  invalid.observations[0].quality_score = 0;
  invalid.observations[0].evidence_grounding_score = 0;
  invalid.observations[0].narrative_grounding_score = 0;
  invalid.observations[0].evidence_distinctness_score = 0;
  invalid.observations[0].response_template_fingerprint_sha256 = null;
  invalid.observations[0].response_template_simhash64 = null;
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_CASE_FAILURES_INVALID/,
  );
});


test("reference attestation rejects ambiguous case identity before signing", () => {
  const invalidCase = report();
  invalidCase.observations[0].case_id += "\nsecret";
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalidCase, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_CASE_ID_INVALID/,
  );

  const invalidCategory = report();
  invalidCategory.observations[0].category = "security/context";
  assert.throws(
    () => attestCodeAICompetitiveReferenceReport(invalidCategory, { env }),
    /CODE_AI_COMPETITIVE_REFERENCE_CATEGORY_INVALID/,
  );
});
