import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assessCodeAIRepositoryTaskBenchmark as assessRepositoryTaskBenchmarkRaw,
  codeAIRepositoryVerifierEnvironmentSha256,
  codeAIRepositoryVerifierInvocationSha256,
  codeAIRepositoryVerifierProtocolSha256,
  codeAIRepositoryVerifierResourceSha256,
} from "../lib/code/runtime/CodeAIRepositoryTaskBenchmarkRuntime.js";

const BENCHMARK_RUN_ID = "11111111-1111-4111-8111-111111111111";
const SUITE_SHA256 = "9".repeat(64);
const assessCodeAIRepositoryTaskBenchmark = (report) => assessRepositoryTaskBenchmarkRaw({ suite_sha256: SUITE_SHA256, runner_source_clean: true, ...report });
const VERIFIER_RUNTIME_IDENTITY = Object.freeze({ engine: "node", version: "v24.14.1", platform: "darwin", arch: "arm64" });
const VERIFIER_RUNTIME_SHA256 = createHash("sha256").update(JSON.stringify(VERIFIER_RUNTIME_IDENTITY), "utf8").digest("hex");
const VERIFIER_ENVIRONMENT_SHA256 = codeAIRepositoryVerifierEnvironmentSha256();

function baselineDigest({ caseId, baseCommit = "1".repeat(40), hiddenSha = "4".repeat(64), environmentSha = codeAIRepositoryVerifierEnvironmentSha256(), invocationSha = codeAIRepositoryVerifierInvocationSha256(), resourceSha = codeAIRepositoryVerifierResourceSha256(), exitCode = 1, passed = false }) {
  return createHash("sha256").update(JSON.stringify({
    case_id: caseId,
    base_commit: baseCommit.toLowerCase(),
    hidden_acceptance_sha256: hiddenSha.toLowerCase(),
    verifier_environment_sha256: environmentSha.toLowerCase(),
    verifier_invocation_sha256: invocationSha.toLowerCase(),
    verifier_resource_sha256: resourceSha.toLowerCase(),
    exit_code: exitCode,
    passed,
  }), "utf8").digest("hex");
}

function proof(overrides = {}) {
  const caseId = overrides.case_id || "case-1";
  const baseCommit = overrides.base_commit || "1".repeat(40);
  const runnerSourceCommit = overrides.runner_source_commit || "1".repeat(40);
  return {
    case_id: caseId,
    repository_origin: `https://github.com/avantiqo-benchmark/${caseId}`,
    allowed_edit_paths: ["invoice-total.mjs"],
    passed: true,
    base_commit: baseCommit,
    diff_sha256: "2".repeat(64),
    artifact_sha256: "3".repeat(64),
    candidate_tree_sha: overrides.candidate_tree_sha || "a".repeat(40),
    repository_mutation_observed: true,
    diff_nonempty: true,
    diff_bytes: 512,
    artifact_materialized: true,
    artifact_bytes: 1024,
    hidden_stdout_sha256: "a".repeat(64),
    hidden_stdout_bytes: 0,
    hidden_stderr_sha256: "b".repeat(64),
    hidden_stderr_bytes: 0,
    raw_hidden_verifier_output_persisted: false,
    repository_verification: {
      case_id: caseId,
      benchmark_run_id: overrides.benchmark_run_id || BENCHMARK_RUN_ID,
      runner_source_commit: runnerSourceCommit,
      runner_source_clean: true,
      repository_origin: `https://github.com/avantiqo-benchmark/${caseId}`,
      suite_sha256: overrides.suite_sha256 || SUITE_SHA256,
      independent: true,
      verifier: "hidden-node-test",
      verifier_contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1",
      verifier_protocol_sha256: codeAIRepositoryVerifierProtocolSha256(),
      verifier_runtime_contract: "AVANTIQO_CODE_REPOSITORY_NODE_RUNTIME_V1",
      verifier_runtime_identity: VERIFIER_RUNTIME_IDENTITY,
      verifier_runtime_sha256: VERIFIER_RUNTIME_SHA256,
      verifier_environment_contract: "AVANTIQO_CODE_REPOSITORY_DETERMINISTIC_ENV_V1",
      verifier_environment_sha256: VERIFIER_ENVIRONMENT_SHA256,
      verifier_invocation_contract: "AVANTIQO_CODE_REPOSITORY_NODE_INVOCATION_V1",
      verifier_invocation_sha256: codeAIRepositoryVerifierInvocationSha256(),
      verifier_resource_contract: "AVANTIQO_CODE_REPOSITORY_BOUNDED_EXECUTION_V1",
      verifier_resource_sha256: codeAIRepositoryVerifierResourceSha256(),
      evidence_source: "INDEPENDENT_RUNNER",
      candidate_diff_sha256: overrides.diff_sha256 || "2".repeat(64),
      candidate_artifact_sha256: overrides.artifact_sha256 || "3".repeat(64),
      candidate_diff_bytes: overrides.diff_bytes || 512,
      candidate_artifact_bytes: overrides.artifact_bytes || 1024,
      candidate_tree_sha: overrides.candidate_tree_sha || "a".repeat(40),
      changed_paths: ["invoice-total.mjs"],
      allowed_edit_paths: ["invoice-total.mjs"],
      passed: true,
      exit_code: 0,
      hidden_acceptance_sha256: "4".repeat(64),
      hidden_acceptance_executed: true,
      hidden_acceptance_test_count: 4,
      protected_baseline_sha256: baselineDigest({ caseId, baseCommit }),
      protected_baseline_executed: true,
      protected_baseline_test_count: 4,
      protected_baseline_base_commit: baseCommit,
      protected_baseline_hidden_acceptance_sha256: "4".repeat(64),
      protected_baseline_verifier_runtime_sha256: VERIFIER_RUNTIME_SHA256,
      verifier_environment_contract: "AVANTIQO_CODE_REPOSITORY_DETERMINISTIC_ENV_V1",
      verifier_environment_sha256: VERIFIER_ENVIRONMENT_SHA256,
      verifier_invocation_contract: "AVANTIQO_CODE_REPOSITORY_NODE_INVOCATION_V1",
      verifier_invocation_sha256: codeAIRepositoryVerifierInvocationSha256(),
      verifier_resource_contract: "AVANTIQO_CODE_REPOSITORY_BOUNDED_EXECUTION_V1",
      verifier_resource_sha256: codeAIRepositoryVerifierResourceSha256(),
      protected_baseline_verifier_environment_sha256: VERIFIER_ENVIRONMENT_SHA256,
      protected_baseline_verifier_invocation_sha256: codeAIRepositoryVerifierInvocationSha256(),
      protected_baseline_verifier_resource_sha256: codeAIRepositoryVerifierResourceSha256(),
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
    repository_origin: "https://github.com/avantiqo-benchmark/case-2",
    allowed_edit_paths: ["invoice-total.mjs"],
    passed: true,
    base_commit: "1".repeat(40),
    diff_sha256: "2".repeat(64),
    artifact_sha256: "3".repeat(64),
    candidate_tree_sha: "a".repeat(40),
    hidden_stdout_sha256: "a".repeat(64),
    hidden_stdout_bytes: 0,
    hidden_stderr_sha256: "b".repeat(64),
    hidden_stderr_bytes: 0,
    raw_hidden_verifier_output_persisted: false,
    repository_verification: {
      case_id: "case-2",
      benchmark_run_id: BENCHMARK_RUN_ID,
      runner_source_commit: "1".repeat(40),
      runner_source_clean: true,
      repository_origin: "https://github.com/avantiqo-benchmark/case-2",
      suite_sha256: SUITE_SHA256,
      independent: true,
      verifier: "hidden-node-test",
      verifier_contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1",
      verifier_protocol_sha256: codeAIRepositoryVerifierProtocolSha256(),
      verifier_runtime_contract: "AVANTIQO_CODE_REPOSITORY_NODE_RUNTIME_V1",
      verifier_runtime_identity: VERIFIER_RUNTIME_IDENTITY,
      verifier_runtime_sha256: VERIFIER_RUNTIME_SHA256,
      evidence_source: "INDEPENDENT_RUNNER",
      candidate_diff_sha256: "2".repeat(64),
      candidate_artifact_sha256: "3".repeat(64),
      candidate_diff_bytes: 512,
      candidate_artifact_bytes: 1024,
      candidate_tree_sha: "a".repeat(40),
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
      protected_baseline_verifier_runtime_sha256: VERIFIER_RUNTIME_SHA256,
      protected_baseline_verifier_environment_sha256: VERIFIER_ENVIRONMENT_SHA256,
      protected_baseline_verifier_invocation_sha256: codeAIRepositoryVerifierInvocationSha256(),
      protected_baseline_verifier_resource_sha256: codeAIRepositoryVerifierResourceSha256(),
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


test("candidate base commit is independent from the attested runner source commit", () => {
  const candidate = proof({ base_commit: "9".repeat(40), runner_source_commit: "1".repeat(40) });
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [candidate],
  });
  assert.equal(result.cases[0].gates.exact_base_commit, true);
  assert.equal(result.cases[0].gates.verification_runner_source_bound, true);
  assert.equal(result.repository_task_artifact_certified, true);
});

test("repository verification must match the attested runner source commit", () => {
  const candidate = proof({ runner_source_commit: "8".repeat(40) });
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [candidate],
  });
  assert.equal(result.cases[0].gates.verification_runner_source_bound, false);
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



test("protected baseline and post-fix verification must execute the same hidden test count", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        protected_baseline_test_count: base.repository_verification.hidden_acceptance_test_count + 1,
      },
    }],
  });
  assert.equal(result.cases[0].gates.protected_baseline_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("out-of-scope changed path cannot certify repository proof", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        changed_paths: ["invoice-total.mjs", "hidden-acceptance.mjs"],
        allowed_edit_paths: ["invoice-total.mjs"],
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_edit_scope_bound, false);
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


test("fractional verification test counts cannot certify", () => {
  const base = proof();
  const hiddenFraction = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: { ...base.repository_verification, hidden_acceptance_test_count: 0.5 },
    }],
  });
  assert.equal(hiddenFraction.cases[0].gates.hidden_acceptance_bound, false);

  const baselineFraction = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: { ...base.repository_verification, protected_baseline_test_count: 0.5 },
    }],
  });
  assert.equal(baselineFraction.cases[0].gates.protected_baseline_bound, false);
});


test("verifier allowed scope must match signed observation scope", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      allowed_edit_paths: ["invoice-total.mjs"],
      repository_verification: {
        ...base.repository_verification,
        changed_paths: ["invoice-total.mjs", "extra-helper.mjs"],
        allowed_edit_paths: ["invoice-total.mjs", "extra-helper.mjs"],
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_edit_scope_bound, true);
  assert.equal(result.cases[0].gates.observation_edit_scope_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("raw hidden verifier output cannot certify", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{ ...base, raw_hidden_verifier_output_persisted: true }],
  });
  assert.equal(result.cases[0].gates.hidden_verifier_output_redacted, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("spoofed verifier protocol cannot certify", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [{ ...base, repository_verification: { ...base.repository_verification, verifier_protocol_sha256: "e".repeat(64) } }] });
  assert.equal(result.cases[0].gates.independent_verifier, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("verification proof must bind the exact mutated candidate tree", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [{ ...base, repository_verification: { ...base.repository_verification, candidate_tree_sha: "b".repeat(40) } }] });
  assert.equal(result.cases[0].gates.verifier_candidate_tree_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("baseline and candidate verification must use the same verifier runtime", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [{ ...base, repository_verification: { ...base.repository_verification, protected_baseline_verifier_runtime_sha256: "d".repeat(64) } }] });
  assert.equal(result.cases[0].gates.verifier_runtime_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("spoofed verifier runtime digest cannot certify", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [{ ...base, repository_verification: { ...base.repository_verification, verifier_runtime_sha256: "e".repeat(64) } }] });
  assert.equal(result.cases[0].gates.verifier_runtime_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("baseline and candidate verification must use the same deterministic environment", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({ benchmark_run_id: BENCHMARK_RUN_ID, runner_source_commit: "1".repeat(40), observations: [{ ...base, repository_verification: { ...base.repository_verification, protected_baseline_verifier_environment_sha256: "f".repeat(64) } }] });
  assert.equal(result.cases[0].gates.verifier_environment_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("matching fabricated verifier environment hashes cannot certify", () => {
  const base = proof();
  const fake = "f".repeat(64);
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        verifier_environment_sha256: fake,
        protected_baseline_verifier_environment_sha256: fake,
        protected_baseline_sha256: baselineDigest({ caseId: base.case_id, environmentSha: fake }),
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_environment_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("repository proof must match canonical case origin", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{ ...base, repository_origin: "https://github.com/avantiqo-benchmark/other-case" }],
  });
  assert.equal(result.cases[0].gates.repository_origin_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});

test("candidate byte lengths must match the verified diff and artifact evidence", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{ ...base, repository_verification: { ...base.repository_verification, candidate_diff_bytes: base.diff_bytes + 1 } }],
  });
  assert.equal(result.cases[0].gates.verifier_candidate_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("repository verification must match the exact suite digest", () => {
  const base = proof();
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{ ...base, repository_verification: { ...base.repository_verification, suite_sha256: "8".repeat(64) } }],
  });
  assert.equal(result.cases[0].gates.verification_suite_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("matching fabricated verifier invocation hashes cannot certify", () => {
  const base = proof();
  const fake = "d".repeat(64);
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        verifier_invocation_sha256: fake,
        protected_baseline_verifier_invocation_sha256: fake,
        protected_baseline_sha256: baselineDigest({ caseId: base.case_id, invocationSha: fake }),
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_invocation_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("matching fabricated verifier resource hashes cannot certify", () => {
  const base = proof();
  const fake = "c".repeat(64);
  const result = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{
      ...base,
      repository_verification: {
        ...base.repository_verification,
        verifier_resource_sha256: fake,
        protected_baseline_verifier_resource_sha256: fake,
        protected_baseline_sha256: baselineDigest({ caseId: base.case_id, resourceSha: fake }),
      },
    }],
  });
  assert.equal(result.cases[0].gates.verifier_resource_bound, false);
  assert.equal(result.repository_task_artifact_certified, false);
});


test("dirty runner source cannot certify repository proof", () => {
  const base = proof();
  const reportDirty = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    runner_source_clean: false,
    observations: [base],
  });
  assert.equal(reportDirty.cases[0].gates.runner_source_clean_bound, false);
  assert.equal(reportDirty.repository_task_artifact_certified, false);

  const verifierDirty = assessCodeAIRepositoryTaskBenchmark({
    benchmark_run_id: BENCHMARK_RUN_ID,
    runner_source_commit: "1".repeat(40),
    observations: [{ ...base, repository_verification: { ...base.repository_verification, runner_source_clean: false } }],
  });
  assert.equal(verifierDirty.cases[0].gates.runner_source_clean_bound, false);
  assert.equal(verifierDirty.repository_task_artifact_certified, false);
});
