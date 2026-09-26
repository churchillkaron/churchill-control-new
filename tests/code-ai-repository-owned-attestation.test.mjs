import assert from "node:assert/strict";
import test from "node:test";
import {
  attestCodeAIRepositoryOwnedReport,
  verifyCodeAIRepositoryOwnedReport,
} from "../lib/code/runtime/CodeAIRepositoryOwnedAttestationRuntime.js";

const env = {
  AVANTIQO_CODE_REPOSITORY_OWNED_ATTESTATION_SECRET: "repository-owned-secret-0123456789abcdef",
};
function report() {
  return {
    contract: "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_RUNNER_V1",
    benchmark_run_id: "11111111-1111-4111-8111-111111111111",
    generated_at: new Date().toISOString(),
    provider_execution_performed: false,
    local_compute_only: true,
    commit_performed: false,
    production_deploy_performed: false,
    observations: [{ case_id: "repo-case-1", passed: true, diff_sha256: "a".repeat(64) }],
  };
}

test("owned repository report HMAC verifies", () => {
  const signed = attestCodeAIRepositoryOwnedReport(report(), { env });
  assert.equal(verifyCodeAIRepositoryOwnedReport(signed, { env }), true);
  assert.equal(signed.repository_owned_attestation.server_only, true);
});

test("owned repository attestation rejects post-signing mutation", () => {
  const signed = attestCodeAIRepositoryOwnedReport(report(), { env });
  signed.observations[0].diff_sha256 = "b".repeat(64);
  assert.throws(() => verifyCodeAIRepositoryOwnedReport(signed, { env }), /ATTESTATION_INVALID/);
});

test("owned repository live signing requires a strong secret", () => {
  assert.throws(() => attestCodeAIRepositoryOwnedReport(report(), { env: {} }), /SECRET_REQUIRED/);
});
