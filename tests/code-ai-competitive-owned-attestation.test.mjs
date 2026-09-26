import assert from "node:assert/strict";
import test from "node:test";
import { certifyCodeAIFrontierLatency } from "../lib/code/runtime/CodeAIFrontierLatencyCertificationRuntime.js";
import {
  attestCodeAICompetitiveOwnedReport,
  verifyCodeAICompetitiveOwnedReport,
} from "../lib/code/runtime/CodeAICompetitiveOwnedAttestationRuntime.js";

const env = {
  AVANTIQO_CODE_COMPETITIVE_OWNED_ATTESTATION_SECRET: "owned-attestation-secret-0123456789abcdef",
};
const CASES = Array.from({ length: 20 }, (_, index) => `owned_case_${index + 1}`);
const SUITE_SHA = "a".repeat(64);
const PROMPT_SHA = "b".repeat(64);

function report() {
  const observations = CASES.map((case_id, index) => ({
      case_id,
      category: "repository",
      passed: true,
      failures: [],
      quality_score: 0.85,
      evidence_grounding_score: 0.9,
      narrative_grounding_score: 0.9,
      evidence_distinctness_score: 0.9,
      response_template_fingerprint_sha256: (index + 1).toString(16).padStart(2, "0").repeat(32),
      response_template_simhash64: (index + 40).toString(16).padStart(2, "0").repeat(8),
      evidence_key_count: 2,
      wall_ms: 100 + index,
      latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
      code_cpu_fallback: false,
      code_runtime_model_already_gpu_resident: index > 0,
      inference_elapsed_ms: 1000,
      owned_compute_usd_per_hour: 1.8,
      owned_compute_rate_source: "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1",
      cost_measurement_source: "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1",
      supplier_cost_usd: 0.0005,
    }));
  const latencyCertification = certifyCodeAIFrontierLatency(observations);
  return {
    contract: "AVANTIQO_CODE_FRONTIER_LOCAL_RUNNER_V1",
    benchmark_run_id: "22222222-2222-4222-8222-222222222222",
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_OWNED_LOCAL_NODE",
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_sha256: SUITE_SHA,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: PROMPT_SHA,
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    local_owned_only: true,
    external_fallback_allowed: false,
    external_provider_execution_performed: false,
    raw_model_output_persisted: false,
    raw_reasoning_persisted: false,
    observations,
    economics: {
      estimated_supplier_cost_usd: 0.01,
      cost_measurement_source: "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1",
      owned_compute_usd_per_hour: 1.8,
      owned_compute_rate_source: "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1",
    },
    summary: {
      requested_cases: CASES.length,
      completed_runs: CASES.length,
      passed_cases: CASES.length,
      pass_rate: 1,
      correctness_passed: true,
      latency_certification: latencyCertification,
      passed: true,
      complete_suite: true,
    },
  };
}

const verifyOptions = {
  env,
  suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
  suite_sha256: SUITE_SHA,
  prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
  prompt_contract_sha256: PROMPT_SHA,
  required_case_ids: CASES,
};

test("owned competitive evidence attests and verifies", () => {
  const signed = attestCodeAICompetitiveOwnedReport(report(), { env });
  assert.equal(signed.owned_attestation.domain, "OWNED_COMPETITIVE_EVIDENCE");
  assert.equal(verifyCodeAICompetitiveOwnedReport(signed, verifyOptions), true);
});

test("tampering owned benchmark quality after run invalidates attestation", () => {
  const signed = attestCodeAICompetitiveOwnedReport(report(), { env });
  signed.observations[0].quality_score = 1;
  assert.throws(
    () => verifyCodeAICompetitiveOwnedReport(signed, verifyOptions),
    /CODE_AI_COMPETITIVE_OWNED_ATTESTATION_INVALID/,
  );
});

test("owned attestation fails closed without separate signing secret", () => {
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(report(), { env: {} }),
    /CODE_AI_COMPETITIVE_OWNED_ATTESTATION_SECRET_REQUIRED/,
  );
});


test("owned attestation rejects unproven latency source", () => {
  const invalid = report();
  invalid.observations[0].latency_measurement_source = "SELF_REPORTED";
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_RUNNER_LATENCY_MEASUREMENT_REQUIRED/,
  );
});


test("owned attestation rejects understated recomputed local cost", () => {
  const invalid = report();
  invalid.observations[0].supplier_cost_usd = 0.00001;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_COST_RECOMPUTATION_MISMATCH/,
  );
});


test("owned attestation rejects malformed quality evidence before signing", () => {
  const invalid = report();
  invalid.observations[0].evidence_grounding_score = 1.5;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_QUALITY_EVIDENCE_REQUIRED/,
  );
});


test("owned attestation rejects a contradictory signed summary", () => {
  const invalid = report();
  invalid.summary.passed = false;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_SUMMARY_MISMATCH/,
  );
});


test("owned attestation recomputes latency certification and rejects spoofed pass", () => {
  const invalid = report();
  invalid.summary.latency_certification.measurements.warm_p95_ms = 1;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_LATENCY_CERTIFICATION_MISMATCH/,
  );
});

test("owned attestation rejects weakened latency limits", () => {
  const invalid = report();
  invalid.summary.latency_certification.limits.warm_p95_ms = 10000;
  invalid.summary.latency_certification.passed = true;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_LATENCY_LIMITS_INVALID/,
  );
});


test("failed owned case cannot retain positive quality evidence", () => {
  const invalid = report();
  invalid.observations[0].passed = false;
  invalid.observations[0].failures = ["GRADE_FAILED"];
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_FAILED_CASE_QUALITY_EVIDENCE_FORBIDDEN/,
  );
});


test("owned attestation binds pass status to failure evidence", () => {
  const passedWithFailure = report();
  passedWithFailure.observations[0].failures = ["UNEXPECTED_FAILURE"];
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(passedWithFailure, { env }),
    /CODE_AI_COMPETITIVE_OWNED_CASE_PASS_FAILURE_MISMATCH/,
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
    () => attestCodeAICompetitiveOwnedReport(failedWithoutFailure, { env }),
    /CODE_AI_COMPETITIVE_OWNED_CASE_PASS_FAILURE_MISMATCH/,
  );
});


test("owned failure evidence must be bounded machine codes", () => {
  const invalid = report();
  invalid.observations[0].passed = false;
  invalid.observations[0].failures = ["customer said secret text should appear here"];
  invalid.observations[0].quality_score = 0;
  invalid.observations[0].evidence_grounding_score = 0;
  invalid.observations[0].narrative_grounding_score = 0;
  invalid.observations[0].evidence_distinctness_score = 0;
  invalid.observations[0].response_template_fingerprint_sha256 = null;
  invalid.observations[0].response_template_simhash64 = null;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalid, { env }),
    /CODE_AI_COMPETITIVE_OWNED_CASE_FAILURES_INVALID/,
  );
});


test("owned attestation rejects ambiguous case identity before signing", () => {
  const invalidCase = report();
  invalidCase.observations[0].case_id = ` ${invalidCase.observations[0].case_id}`;
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalidCase, { env }),
    /CODE_AI_COMPETITIVE_OWNED_CASE_ID_INVALID/,
  );

  const invalidCategory = report();
  invalidCategory.observations[0].category = "repository data";
  assert.throws(
    () => attestCodeAICompetitiveOwnedReport(invalidCategory, { env }),
    /CODE_AI_COMPETITIVE_OWNED_CATEGORY_INVALID/,
  );
});
