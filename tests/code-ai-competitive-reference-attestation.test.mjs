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
    observations: CASES.map((case_id, index) => ({
      case_id,
      passed: true,
      wall_ms: 100 + index,
      supplier_cost_usd: 0.001,
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
