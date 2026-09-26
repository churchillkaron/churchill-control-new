import assert from "node:assert/strict";
import test from "node:test";
import { assessCodeAIRepositoryTaskBenchmark } from "../lib/code/runtime/CodeAIRepositoryTaskBenchmarkRuntime.js";

function proof(overrides = {}) {
  return {
    case_id: "case-1",
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
      case_id: overrides.case_id || "case-1",
      independent: true,
      verifier: "hidden-node-test",
      evidence_source: "INDEPENDENT_RUNNER",
      passed: true,
      exit_code: 0,
      hidden_acceptance_sha256: "4".repeat(64),
      hidden_acceptance_executed: true,
      hidden_acceptance_test_count: 4,
      protected_baseline_sha256: "5".repeat(64),
      protected_baseline_executed: true,
      protected_baseline_test_count: 12,
      candidate_self_report_authority: false,
    },
    ...overrides,
  };
}

test("repository benchmark requires actual independently verified artifacts", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({ observations: [proof()] });
  assert.equal(result.repository_task_artifact_certified, true);
  assert.equal(result.candidate_self_report_authority, false);
  assert.equal(result.cases[0].passed, true);
});

test("candidate pass flag alone cannot certify repository task superiority", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({ observations: [{ case_id: "case-1", passed: true }] });
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
      independent: true,
      verifier: "hidden-node-test",
      evidence_source: "INDEPENDENT_RUNNER",
      passed: true,
      exit_code: 0,
      hidden_acceptance_sha256: "4".repeat(64),
      protected_baseline_sha256: "5".repeat(64),
      candidate_self_report_authority: false,
    },
  };
  const result = assessCodeAIRepositoryTaskBenchmark({ observations: [synthetic] });
  assert.equal(result.repository_task_artifact_certified, false);
  assert.equal(result.cases[0].gates.repository_mutation_observed, false);
  assert.equal(result.cases[0].gates.hidden_acceptance_bound, false);
});


test("reused proof identity across cases is rejected", () => {
  const first = proof();
  const second = proof({ case_id: "case-2" });
  const result = assessCodeAIRepositoryTaskBenchmark({ observations: [first, second] });
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
      hidden_acceptance_sha256: "8".repeat(64),
    },
  };
  const result = assessCodeAIRepositoryTaskBenchmark({ observations: [first, second] });
  assert.equal(result.repository_proof_identity_unique_per_case, true);
  assert.equal(result.unique_repository_proof_identity_count, 2);
  assert.equal(result.repository_task_artifact_certified, true);
});


test("mismatched verification case id cannot certify", () => {
  const result = assessCodeAIRepositoryTaskBenchmark({
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
