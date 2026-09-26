import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = "scripts/run-avantiqo-code-competitive-full-live.mjs";
const source = await readFile(SCRIPT, "utf8");

function dryRun(extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS: JSON.stringify({ openai: "model-a", google: "model-b" }),
      ...extraEnv,
    },
  });
}

test("full competitive orchestrator dry-run plans evidence without execution", () => {
  const run = dryRun({ OPENAI_API_KEY: "", GEMINI_API_KEY: "", GOOGLE_API_KEY: "" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.contract, "AVANTIQO_CODE_COMPETITIVE_FULL_LIVE_ORCHESTRATOR_V1");
  assert.equal(report.external_provider_execution_performed, false);
  assert.equal(report.production_deploy_performed, false);
  assert.deepEqual(report.providers, ["google", "openai"]);
  assert.match(report.paths.owned_repository, /executable-repository-owned\.json$/);
  assert.match(report.paths.references.openai.repository, /repository-reference-openai\.json$/);
  assert.match(report.paths.manifest, /full-run-manifest\.json$/);
  assert.equal(report.fresh_artifact_policy.stale_output_reuse_forbidden, true);
  assert.equal(report.fresh_artifact_policy.generated_at_must_be_within_orchestrator_run, true);
});

test("full competitive orchestrator requires an exact model binding for every provider", () => {
  const run = dryRun({
    AVANTIQO_CODE_COMPETITIVE_REQUIRED_PROVIDERS: "openai,google,anthropic",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /MODEL_REQUIRED:anthropic/);
});

test("full orchestrator wires frontier and executable evidence into competitive certification", () => {
  assert.match(source, /run-avantiqo-code-frontier-local\.mjs/);
  assert.match(source, /run-avantiqo-code-competitive-reference-live\.mjs/);
  assert.match(source, /run-avantiqo-code-executable-repository-local\.mjs/);
  assert.match(source, /benchmark-avantiqo-code-competitive\.mjs/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_OWNED_REPOSITORY_EVIDENCE/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPOSITORY_EVIDENCE/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_FULL_BENCHMARK_APPROVED/);
  assert.match(source, /runtime_provider_effect: "NONE"/);
  assert.match(source, /production_deploy_performed: false/);
});


test("full orchestrator forbids stale artifact reuse and emits a hashed run manifest", () => {
  assert.match(source, /clearRunOutputs/);
  assert.match(source, /verifyFreshArtifact/);
  assert.match(source, /ARTIFACT_PREDATES_RUN/);
  assert.match(source, /manifest_sha256/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_FULL_RUN_MANIFEST_V1/);
  assert.match(source, /benchmark_run_id: text\(parsed\?\.benchmark_run_id\)/);
});


test("full orchestrator derives provider execution claims from produced reference artifacts", () => {
  assert.match(source, /provider_execution_performed: parsed\?\.provider_execution_performed === true/);
  assert.match(source, /REFERENCE_PROVIDER_EXECUTION_EVIDENCE_INCOMPLETE/);
  assert.match(source, /REFERENCE_PROVIDER_MODEL_EVIDENCE_MISMATCH/);
  assert.match(source, /external_provider_execution_performed: externalProviderExecutionPerformed/);
  assert.doesNotMatch(source, /external_provider_execution_performed: true,\n\s*runtime_provider_effect/);
});


test("full orchestrator binds the run manifest to clean main source and exact configuration", () => {
  assert.match(source, /CURRENT_MAIN_REQUIRED/);
  assert.match(source, /CLEAN_REPOSITORY_REQUIRED/);
  assert.match(source, /configurationSha256/);
  assert.match(source, /ARTIFACT_SOURCE_COMMIT_MISMATCH/);
  assert.match(source, /runner_source_commit: orchestratorSource\.source_commit/);
  assert.match(source, /configuration_sha256: configurationSha256/);
});


test("full orchestrator isolates concurrent live runs in unique evidence directories", () => {
  assert.match(source, /const runRoot = resolve\(evidenceRoot, orchestratorRunId\)/);
  assert.match(source, /mkdir\(runRoot, \{ recursive: false \}\)/);
  assert.match(source, /RUN_DIRECTORY_ALREADY_EXISTS/);
  assert.match(source, /concurrent_run_isolation_required: true/);
  assert.match(source, /run_root: runRoot/);
});
