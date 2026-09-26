import { createHash } from "node:crypto";

export const CODE_AI_REPOSITORY_TASK_BENCHMARK_CONTRACT =
  "AVANTIQO_CODE_AI_REPOSITORY_TASK_BENCHMARK_V1";
export const CODE_AI_REPOSITORY_VERIFIER_CONTRACT =
  "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1";

function text(value, maximum = 1000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function sha(value) {
  return /^[a-f0-9]{64}$/i.test(text(value, 80));
}
function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function commit(value) {
  return /^[a-f0-9]{40}$/i.test(text(value, 80));
}
function benchmarkRunId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80));
}

export function codeAIRepositoryVerifierProtocolSha256() {
  return sha256(JSON.stringify({
    contract: CODE_AI_REPOSITORY_VERIFIER_CONTRACT,
    evidence_source: "INDEPENDENT_RUNNER",
    runtime: "node",
    candidate_binding: "DIFF_AND_ARTIFACT_SHA256",
    hidden_acceptance_required: true,
    protected_baseline_required: true,
  }));
}

export function assessCodeAIRepositoryTaskBenchmark(report = {}) {
  const observations = list(report?.observations);
  const runnerSourceCommit = text(report?.runner_source_commit, 80).toLowerCase();
  const reportBenchmarkRunId = text(report?.benchmark_run_id, 80).toLowerCase();
  const cases = observations.map((item) => {
    const verification = item?.repository_verification || {};
    const gates = {
      candidate_case_passed: item?.passed === true,
      exact_base_commit: commit(item?.base_commit),
      base_commit_bound_to_runner:
        commit(item?.base_commit) &&
        commit(runnerSourceCommit) &&
        text(item?.base_commit, 80).toLowerCase() === runnerSourceCommit,
      diff_artifact_bound: sha(item?.diff_sha256) && sha(item?.artifact_sha256),
      repository_mutation_observed:
        item?.repository_mutation_observed === true &&
        item?.diff_nonempty === true &&
        Number(item?.diff_bytes) > 0,
      artifact_materialized:
        item?.artifact_materialized === true &&
        Number(item?.artifact_bytes) > 0,
      verification_case_bound:
        text(verification?.case_id, 240) === text(item?.case_id, 240) &&
        text(item?.case_id, 240).length > 0,
      verification_run_bound:
        benchmarkRunId(reportBenchmarkRunId) &&
        benchmarkRunId(verification?.benchmark_run_id) &&
        text(verification?.benchmark_run_id, 80).toLowerCase() === reportBenchmarkRunId,
      independent_verifier:
        verification?.independent === true &&
        text(verification?.verifier, 240).length >= 3 &&
        text(verification?.evidence_source, 120) === "INDEPENDENT_RUNNER" &&
        text(verification?.verifier_contract, 160) === CODE_AI_REPOSITORY_VERIFIER_CONTRACT &&
        text(verification?.verifier_protocol_sha256, 80).toLowerCase() === codeAIRepositoryVerifierProtocolSha256(),
      verifier_candidate_bound:
        sha(verification?.candidate_diff_sha256) &&
        sha(verification?.candidate_artifact_sha256) &&
        text(verification?.candidate_diff_sha256, 80).toLowerCase() === text(item?.diff_sha256, 80).toLowerCase() &&
        text(verification?.candidate_artifact_sha256, 80).toLowerCase() === text(item?.artifact_sha256, 80).toLowerCase(),
      verifier_passed: Number(verification?.exit_code) === 0 && verification?.passed === true,
      hidden_acceptance_bound:
        sha(verification?.hidden_acceptance_sha256) &&
        verification?.hidden_acceptance_executed === true &&
        Number(verification?.hidden_acceptance_test_count) > 0,
      protected_baseline_bound: (() => {
        const baselineExitCode = Number(verification?.protected_baseline_exit_code);
        const baselineCommit = text(verification?.protected_baseline_base_commit, 80).toLowerCase();
        const hiddenAcceptanceSha = text(verification?.protected_baseline_hidden_acceptance_sha256, 80).toLowerCase();
        const expectedBaselineSha = sha256(JSON.stringify({
          case_id: text(item?.case_id, 240),
          base_commit: baselineCommit,
          hidden_acceptance_sha256: hiddenAcceptanceSha,
          exit_code: baselineExitCode,
          passed: false,
        }));
        return (
          sha(verification?.protected_baseline_sha256) &&
          text(verification?.protected_baseline_sha256, 80).toLowerCase() === expectedBaselineSha &&
          verification?.protected_baseline_executed === true &&
          Number(verification?.protected_baseline_test_count) > 0 &&
          Number(verification?.protected_baseline_test_count) === Number(verification?.hidden_acceptance_test_count) &&
          commit(baselineCommit) &&
          baselineCommit === text(item?.base_commit, 80).toLowerCase() &&
          sha(hiddenAcceptanceSha) &&
          hiddenAcceptanceSha === text(verification?.hidden_acceptance_sha256, 80).toLowerCase() &&
          Number.isInteger(baselineExitCode) &&
          baselineExitCode !== 0 &&
          verification?.protected_baseline_passed === false
        );
      })(),
      candidate_self_report_rejected: verification?.candidate_self_report_authority === false,
    };
    return { case_id: text(item?.case_id, 240), passed: Object.values(gates).every(Boolean), gates };
  });
  const passed = cases.filter((item) => item.passed).length;
  const proofIdentity = (item) => [
    text(item?.diff_sha256, 80).toLowerCase(),
    text(item?.artifact_sha256, 80).toLowerCase(),
    text(item?.repository_verification?.hidden_acceptance_sha256, 80).toLowerCase(),
  ].join(":");
  const proofIdentities = observations.map(proofIdentity).filter(Boolean);
  const uniqueProofIdentityCount = new Set(proofIdentities).size;
  const proofIdentityUniquePerCase =
    observations.length > 0 &&
    proofIdentities.length === observations.length &&
    uniqueProofIdentityCount === observations.length;
  const certified = observations.length > 0 && passed === observations.length && proofIdentityUniquePerCase;
  return {
    contract: CODE_AI_REPOSITORY_TASK_BENCHMARK_CONTRACT,
    case_count: observations.length,
    passed_case_count: passed,
    repository_task_artifact_certified: certified,
    repository_proof_identity_unique_per_case: proofIdentityUniquePerCase,
    unique_repository_proof_identity_count: uniqueProofIdentityCount,
    candidate_self_report_authority: false,
    actual_repository_mutation_evidence_required: true,
    failed_case_repository_proof_cannot_certify: true,
    repository_proof_must_match_attested_runner_commit: true,
    independent_verification_must_bind_exact_candidate: true,
    repository_verification_must_bind_exact_benchmark_run: true,
    canonical_repository_verifier_contract_required: CODE_AI_REPOSITORY_VERIFIER_CONTRACT,
    canonical_repository_verifier_protocol_sha256_required: codeAIRepositoryVerifierProtocolSha256(),
    hidden_acceptance_evidence_required: true,
    protected_baseline_must_bind_same_commit_and_hidden_acceptance: true,
    protected_baseline_must_execute_same_hidden_suite_count: true,
    protected_baseline_digest_must_recompute: true,
    cross_case_repository_proof_replay_forbidden: true,
    cases,
  };
}

export default Object.freeze({
  contract: CODE_AI_REPOSITORY_TASK_BENCHMARK_CONTRACT,
  assess: assessCodeAIRepositoryTaskBenchmark,
});
