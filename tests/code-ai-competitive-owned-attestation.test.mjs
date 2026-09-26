import assert from "node:assert/strict";
import test from "node:test";
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
  return {
    contract: "AVANTIQO_CODE_FRONTIER_LOCAL_RUNNER_V1",
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
    observations: CASES.map((case_id) => ({ case_id, passed: true, quality_score: 0.85 })),
    summary: { passed: true, complete_suite: true },
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
