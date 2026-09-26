import assert from "node:assert/strict";
import test from "node:test";
import {
  attestCodeAIRepositoryReferenceReport,
  verifyCodeAIRepositoryReferenceReport,
} from "../lib/code/runtime/CodeAIRepositoryReferenceAttestationRuntime.js";

const env = {
  AVANTIQO_CODE_REPOSITORY_REFERENCE_ATTESTATION_SECRET: "repository-reference-secret-0123456789abcdef",
};
function report() {
  return {
    contract: "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_RUNNER_V1",
    benchmark_run_id: "11111111-1111-4111-8111-111111111111",
    generated_at: new Date().toISOString(),
    provider: "openai",
    model: { provider: "openai", product_model: "model-a" },
    provider_execution_performed: true,
    benchmark_only: true,
    runtime_provider_effect: "NONE",
    raw_provider_output_persisted: false,
    production_deploy_performed: false,
    observations: [{ case_id: "repo-case-1", passed: true, artifact_sha256: "a".repeat(64) }],
  };
}

test("repository reference report HMAC verifies", () => {
  const signed = attestCodeAIRepositoryReferenceReport(report(), { env });
  assert.equal(verifyCodeAIRepositoryReferenceReport(signed, { env }), true);
  assert.equal(signed.repository_reference_attestation.server_only, true);
});

test("repository reference attestation rejects post-signing mutation", () => {
  const signed = attestCodeAIRepositoryReferenceReport(report(), { env });
  signed.observations[0].artifact_sha256 = "b".repeat(64);
  assert.throws(() => verifyCodeAIRepositoryReferenceReport(signed, { env }), /ATTESTATION_INVALID/);
});

test("repository reference live signing requires a strong secret", () => {
  assert.throws(() => attestCodeAIRepositoryReferenceReport(report(), { env: {} }), /SECRET_REQUIRED/);
});
