import assert from "node:assert/strict";
import test from "node:test";
import {
  attestCodeAICompetitiveFullRunManifest,
  verifyCodeAICompetitiveFullRunManifest,
} from "../lib/code/runtime/CodeAICompetitiveFullRunAttestationRuntime.js";

const env = {
  AVANTIQO_CODE_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET:
    "full-run-attestation-secret-0123456789abcdef",
};

function manifest() {
  const started = new Date(Date.now() - 2000).toISOString();
  const completed = new Date(Date.now() - 1000).toISOString();
  const providers = ["google", "openai"];
  const artifacts = Array.from({ length: 6 }, (_, index) => ({
    path: `/tmp/run/artifact-${index}.json`,
    sha256: String(index + 1).padStart(64, "a").slice(-64),
    bytes: 100 + index,
    generated_at: completed,
  }));
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_MANIFEST_V1",
    orchestrator_run_id: "11111111-1111-4111-8111-111111111111",
    run_root: "/tmp/11111111-1111-4111-8111-111111111111",
    started_at: started,
    completed_at: completed,
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    source_stable_for_entire_run: true,
    configuration_sha256: "2".repeat(64),
    providers,
    models: { google: "gemini-test", openai: "gpt-test" },
    artifacts,
    external_provider_execution_performed: true,
    competitive_certified: true,
    production_deploy_performed: false,
  };
}

test("full run manifest HMAC verifies", () => {
  const sealed = attestCodeAICompetitiveFullRunManifest(manifest(), { env });
  assert.equal(verifyCodeAICompetitiveFullRunManifest(sealed, { env }), true);
  assert.equal(sealed.full_run_attestation.server_only, true);
  assert.match(sealed.full_run_attestation.digest, /^[a-f0-9]{64}$/);
});

test("tampered full run manifest is rejected", () => {
  const sealed = attestCodeAICompetitiveFullRunManifest(manifest(), { env });
  const tampered = { ...sealed, configuration_sha256: "9".repeat(64) };
  assert.throws(
    () => verifyCodeAICompetitiveFullRunManifest(tampered, { env }),
    /CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_INVALID/,
  );
});

test("full run attestation secret is required", () => {
  assert.throws(
    () => attestCodeAICompetitiveFullRunManifest(manifest(), { env: {} }),
    /CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET_REQUIRED/,
  );
});
