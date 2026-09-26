import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const suite = JSON.parse(await readFile(
  "benchmarks/avantiqo-code-executable-repository-suite.json",
  "utf8",
));
const validator = await readFile(
  "scripts/validate-avantiqo-code-executable-repository-suite.mjs",
  "utf8",
);
const liveRunner = await readFile(
  "scripts/run-avantiqo-code-executable-repository-local.mjs",
  "utf8",
);
const pkg = JSON.parse(await readFile("package.json", "utf8"));

test("executable repository benchmark keeps hidden acceptance outside candidate workspaces", () => {
  assert.equal(suite.contract, "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_SUITE_V1");
  assert.equal(suite.candidate_workspace_contains_expected_answers, false);
  assert.equal(
    suite.hidden_acceptance_materialization,
    "RUNNER_ONLY_OUTSIDE_CANDIDATE_REPOSITORY",
  );
  assert.ok(suite.cases.length >= 2);
  for (const benchmarkCase of suite.cases) {
    assert.ok(benchmarkCase.objective);
    assert.deepEqual(
      [...benchmarkCase.candidate_paths].sort(),
      [...benchmarkCase.allowed_edit_paths].sort(),
    );
    assert.equal(benchmarkCase.seed_files.length, benchmarkCase.candidate_paths.length);
    assert.equal(benchmarkCase.hidden_acceptance.kind, "NODE_ASSERT_GENERATED");
  }
});

test("suite validator proves baseline failure and blocks hidden-answer leakage", () => {
  assert.match(validator, /BASELINE_MUST_FAIL/);
  assert.match(validator, /HIDDEN_EVIDENCE_LEAKED/);
  assert.match(validator, /hidden_acceptance_outside_candidate_repository/);
  assert.match(validator, /candidate_repository_files/);
  assert.match(validator, /hidden_answers_exposed_to_candidate: false/);
});

test("autonomy audit includes executable repository benchmark validation", () => {
  assert.equal(
    pkg.scripts["audit:code-executable-benchmark"],
    "node scripts/validate-avantiqo-code-executable-repository-suite.mjs",
  );
  assert.match(pkg.scripts["audit:code-ai-autonomy"], /audit:code-executable-benchmark/);
});
test("live executable benchmark requires exact fresh Node01 Code worker attestation", () => {
  assert.match(liveRunner, /AVANTIQO_NODE01_WORKER_V6_MODEL_AWARE_CODE/);
  assert.match(liveRunner, /heartbeat_source_lane/);
  assert.match(liveRunner, /worker_source_sha256/);
  assert.match(liveRunner, /WORKER_ATTESTATION_REQUIRED/);
  assert.match(liveRunner, /const workerAttestation = await assertCodeWorkerAttested\(\)/);
  assert.match(liveRunner, /worker_attestation: workerAttestation/);
});


test("live executable verifier includes untracked candidate files in edit scope evidence", () => {
  assert.match(liveRunner, /ls-files/);
  assert.match(liveRunner, /--others/);
  assert.match(liveRunner, /--exclude-standard/);
  assert.match(liveRunner, /value !== "hidden-acceptance\.mjs"/);
  assert.match(liveRunner, /verifierChangedPaths = \[\.\.\.new Set/);
});


test("hidden acceptance assertion count is derived from generated source", () => {
  assert.match(liveRunner, /function hiddenAssertionCount/);
  assert.match(liveRunner, /hiddenAcceptanceTestCount = hiddenAssertionCount\(hiddenAcceptanceSource\)/);
  assert.doesNotMatch(liveRunner, /case_id\.includes\("multifile"\) \? 5 : 4/);
});


test("live executable verifier never persists raw hidden output", () => {
  assert.doesNotMatch(liveRunner, /hidden_stdout:\s*hiddenStdout/);
  assert.doesNotMatch(liveRunner, /hidden_stderr:\s*hiddenStderr/);
  assert.match(liveRunner, /hidden_stdout_sha256: sha256\(hiddenStdout\)/);
  assert.match(liveRunner, /hidden_stderr_sha256: sha256\(hiddenStderr\)/);
  assert.match(liveRunner, /raw_hidden_verifier_output_persisted: false/);
});
