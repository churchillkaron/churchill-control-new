import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assessCodeAIRepositoryTaskBenchmark } from "../lib/code/runtime/CodeAIRepositoryTaskBenchmarkRuntime.js";

const BENCHMARK_RUN_ID = "11111111-1111-4111-8111-111111111111";

function baselineDigest({ caseId, baseCommit = "1".repeat(40), hiddenSha = "4".repeat(64), exitCode = 1, passed = false }) {
  return createHash("sha256").update(JSON.stringify({
    case_id: caseId,
    base_commit: baseCommit.toLowerCase(),
    hidden_acceptance_sha256: hiddenSha.toLowerCase(),
    exit_code: exitCode,
    passed,
  }), "utf8").digest("hex");
}

function proof(overrides = {}) {
  const caseId = overrides.case_id || "case-1";
  return {
    case_id: caseId,
    passed: true,
    base_commit: "1".repeat(40),
    diff_sha256: "2".repeat(64),
    artifact_sha256: "3".repeat(64),
    repository_mutation_observed: true,
    diff_nonempty: true,
    diff_bytes: 512,
    artifact_materialized: true,
    artifact_bytes: 1024,
    repository_verification: {
      case_id: caseId,
      benchmark_run_id: overrides.benchmark_run_id || BENCHMARK_RUN_ID,
      independent: true,
      verifier: "hidden-node-test",
      verifier_contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1",
      evidence_source: "INDEPENDENT_RUNNER",
      candidate_diff_sha256: overrides.diff_sha256 || "2".repeat(64),
      candidate_artifact_sha256: overrides.artifact_sha256 || "3".repeat(64),
      changed_paths: ["invoice-total.mjs"],
      allowed_edit_paths: ["invoice-total.mjs"],
      passed: true,
      exit_code: 0,
      hidden_acceptance_sha256: "4".repeat(64),
      hidden_acceptance_executed: true,
      hidden_acceptance_test_count: 4,
      protected_baseline_sha256: baselineDigest({ caseId }),
      protected_baseline_executed: true,
      protected_baseline_test_count: 4,
      protected_baseline_base_commit: "1".repeat(40),
      protected_baseline_hidden_acceptance_sha256: "4".repeat(64),
      protected_baseline_exit_code: 1,
      protected_baseline_passed: false,
      candidate_self_report_authority: false,
    },
    ...overrides,
  };
}

test("repository benchmark requires actual independently verified artifacts", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [proof()] });
  assert.equal(result.repository_task_artifact_certified, true);
  assert.equal(result.candidate_self_report_authority, false);
  assert.equal(result.cases[0].passed, true);
});

test("candidate pass flag alone cannot certify repository task superiority", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [{ case_id: "case-1", passed: true }] });
  assert.equal(result.repository_task_artifact_certified, false);
  assert.equal(result.cases[0].passed, false);
});
test("synthetic-looking hashes without executed repository evidence cannot certify", () => {
  const synthetic = {
    case_id: "case-2",
    passed: true,
    base_commit: "1".repeat(40),
    diff_sha256: "2".repeat(64),
    artifact_sha256: "3".repeat(64),
    repository_verification: {
      case_id: "case-2",
      benchmark_run_id: BENCHMARK_RUN_ID,
      independent: true,
      verifier: "hidden-node-test",
      verifier_contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1",
      evidence_source: "INDEPENDENT_RUNNER",
      candidate_diff_sha256: "2".repeat(64),
      candidate_artifact_sha256: "3".repeat(64),
      changed_paths: ["invoice-total.mjs"],
      allowed_edit_paths: ["invoice-total.mjs"],
      passed: true,
      exit_code: 0,
      hidden_acceptance_sha256: "4".repeat(64),
      protected_baseline_sha256: baselineDigest({ caseId: "case-2" }),
      protected_baseline_executed: true,
      protected_baseline_test_count: 1,
      protected_baseline_base_commit: "1".repeat(40),
      protected_baseline_hidden_acceptance_sha256: "4".repeat(64),
      protected_baseline_exit_code: 1,
      protected_baseline_passed: false,
      candidate_self_report_authority: false,
    },
  };
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [synthetic] });
  assert.equal(result.repository_task_artifact_certified, false);
  assert.equal(result.cases[0].gates.repository_mutation_observed, false);
  assert.equal(result.cases[0].gates.hidden_acceptance_bound, false);
});


test("reused proof identity across cases is rejected", () => {
  const first = proof();
  const second = proof({ case_id: "case-2" });
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [first, second] });
  assert.equal(result.passed_case_count, 2);
  assert.equal(result.repository_proof_identity_unique_per_case, false);
  assert.equal(result.unique_repository_proof_identity_count, 1);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("distinct proof identities across cases certify", () => {
  const first = proof();
  const secondBase = proof({ case_id: "case-2" });
  const second = {
    ...secondBase,
    diff_sha256: "6".repeat(64),
    artifact_sha256: "7".repeat(64),
    repository_verification: {
      ...secondBase.repository_verification,
      candidate_diff_sha256: "6".repeat(64),
      candidate_artifact_sha256: "7".repeat(64),
      hidden_acceptance_sha256: "8".repeat(64),
      protected_baseline_hidden_acceptance_sha256: "8".repeat(64),
      protected_baseline_sha256: baselineDigest({ caseId: "case-2", hiddenSha: "8".repeat(64) }),
    },
  };
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [first, second] });
  assert.equal(result.repository_proof_identity_unique_per_case, true);
  assert.equal(result.unique_repository_proof_identity_count, 2);
  assert.equal(result.repository_task_artifact_certified, true);
});


test("mismatched verification case id cannot certify", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [proof({
      case_id: "case-1",
      repository_verification: {
        ...proof().repository_verification,
        case_id: "case-other",
      },
    })],
  });
  assert.equal(result.cases[0].gates.verification_case_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("failed benchmark case cannot certify repository proof", () => {
  const failed = proof({ passed: false });
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [failed] });
  assert.equal(result.cases[0].gates.candidate_case_passed, false);
  assert.equal(result.cases[0].passed, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("repository proof base commit must match attested runner commit", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "9".repeat(40),
    observations: [proof()],
  });
  assert.equal(result.cases[0].gates.base_commit_bound_to_runner, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("verification proof must bind the exact candidate diff and artifact", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        candidate_diff_sha256: "9".repeat(64),
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_candidate_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("protected baseline must bind the exact base commit and hidden acceptance program", () => {
  const base = proof();
  const wrongHidden = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        protected_baseline_hidden_acceptance_sha256: "9".repeat(64),
      },
    }],
  });
  assert.equal(wrongHidden.cases[0].gates.protected_baseline_bound, false);
  assert.equal(wrongHidden.repository_task_artifact_certified, false);

  const passingBaseline = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        protected_baseline_exit_code: 0,
        protected_baseline_passed: true,
      },
    }],
  });
  assert.equal(passingBaseline.cases[0].gates.protected_baseline_bound, false);
  assert.equal(passingBaseline.repository_task_artifact_certified, false);
});


test("repository verification must match the exact benchmark run id", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        benchmark_run_id: "99999999-9999-4999-8999-999999999999",
      },
    }],
  });
  assert.equal(result.cases[0].gates.verification_run_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("repository verifier must use the canonical verifier contract", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        verifier_contract: "ARBITRARY_VERIFIER_V1",
      },
    }],
  });
  assert.equal(result.cases[0].gates.independent_verifier, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("arbitrary protected baseline digest cannot certify", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        protected_baseline_sha256: "f".repeat(64),
      },
    }],
  });
  assert.equal(result.cases[0].gates.protected_baseline_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});



<<<<<<< HEAD
test("protected baseline and post-fix verification must execute the same hidden test count", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
=======
test("out-of-scope changed path cannot certify repository proof", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
>>>>>>> 3e789f315 (harden(code): prove repository edits stay in scope)
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
<<<<<<< HEAD
        protected_baseline_test_count: base.repository_verification.hidden_acceptance_test_count + 1,
      },
    }],
  });
  assert.equal(result.cases[0].gates.protected_baseline_bound, false);
=======
        changed_paths: ["invoice-total.mjs", "hidden-acceptance.mjs"],
        allowed_edit_paths: ["invoice-total.mjs"],
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_edit_scope_bound, false);
>>>>>>> 3e789f315 (harden(code): prove repository edits stay in scope)
  assert.equal(result.repository_task_artifact_certified, false);
});


test("widened allowed scope cannot hide missing verifier mutations", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        changed_paths: ["invoice-total.mjs"],
        allowed_edit_paths: ["invoice-total.mjs", "extra-helper.mjs"],
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_edit_scope_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});
