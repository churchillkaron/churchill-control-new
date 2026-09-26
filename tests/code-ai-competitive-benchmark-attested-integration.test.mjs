import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { certifyCodeAIFrontierLatency } from "../lib/code/runtime/CodeAIFrontierLatencyCertificationRuntime.js";
import {
  attestCodeAICompetitiveReferenceReport,
} from "../lib/code/runtime/CodeAICompetitiveReferenceAttestationRuntime.js";
import { attestCodeAICompetitiveOwnedReport } from "../lib/code/runtime/CodeAICompetitiveOwnedAttestationRuntime.js";
import { attestCodeAIRepositoryReferenceReport } from "../lib/code/runtime/CodeAIRepositoryReferenceAttestationRuntime.js";
import { attestCodeAIRepositoryOwnedReport } from "../lib/code/runtime/CodeAIRepositoryOwnedAttestationRuntime.js";

const SECRET = "competitive-reference-integration-secret-0123456789abcdef";
const SUITE_PATH = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const PROMPT_PATH = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const REPOSITORY_SUITE_PATH = "benchmarks/avantiqo-code-executable-repository-suite.json";
const env = {
  AVANTIQO_CODE_COMPETITIVE_REFERENCE_ATTESTATION_SECRET: SECRET,
  AVANTIQO_CODE_COMPETITIVE_OWNED_ATTESTATION_SECRET: "owned-competitive-secret-0123456789abcdef",
  AVANTIQO_CODE_REPOSITORY_REFERENCE_ATTESTATION_SECRET: "repository-reference-secret-0123456789abcdef",
  AVANTIQO_CODE_REPOSITORY_OWNED_ATTESTATION_SECRET: "repository-owned-secret-0123456789abcdef",
};
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const REPOSITORY_VERIFIER_RUNTIME_IDENTITY = Object.freeze({ engine: "node", version: "v24.14.1", platform: "linux", arch: "x64" });
const REPOSITORY_VERIFIER_RUNTIME_SHA256 = sha256(JSON.stringify(REPOSITORY_VERIFIER_RUNTIME_IDENTITY));
const REPOSITORY_VERIFIER_ENVIRONMENT_SHA256 = sha256(JSON.stringify({ NODE_ENV: "test", TZ: "UTC", LANG: "C", LC_ALL: "C" }));
const REPOSITORY_VERIFIER_INVOCATION_SHA256 = sha256(JSON.stringify({ engine: "node", script: "hidden-acceptance.mjs", argv: [], cwd: "VERIFIER_REPOSITORY_ROOT" }));
const REPOSITORY_VERIFIER_RESOURCE_SHA256 = sha256(JSON.stringify({ timeout_ms: 5000, kill_signal: "SIGKILL", max_buffer_bytes: 1048576, stdin: "NONE" }));
const REPOSITORY_GIT_TOOLCHAIN_IDENTITY = Object.freeze({ engine: "git", version_output: "git version 2.43.0", platform: "linux", arch: "x64" });
const REPOSITORY_GIT_TOOLCHAIN_SHA256 = sha256(JSON.stringify(REPOSITORY_GIT_TOOLCHAIN_IDENTITY));
const repositoryVerifierProtocolSha256 = sha256(JSON.stringify({ contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1", evidence_source: "INDEPENDENT_RUNNER", runtime: "node", candidate_binding: "DIFF_AND_ARTIFACT_SHA256", hidden_acceptance_required: true, protected_baseline_required: true }));
const repositoryBaselineDigest = ({ caseId, hiddenSha }) => sha256(JSON.stringify({ case_id: caseId, case_definition_sha256: caseDefinitionSha(caseId), base_commit: "1".repeat(40), hidden_acceptance_sha256: hiddenSha, verifier_environment_sha256: REPOSITORY_VERIFIER_ENVIRONMENT_SHA256, verifier_invocation_sha256: REPOSITORY_VERIFIER_INVOCATION_SHA256, verifier_resource_sha256: REPOSITORY_VERIFIER_RESOURCE_SHA256, git_toolchain_sha256: REPOSITORY_GIT_TOOLCHAIN_SHA256, exit_code: 1, passed: false }));
const caseDefinitionSha = (caseId) => sha256(`case-definition:${caseId}`);
const canonicalRepositoryCaseDefinitionSha = (benchmarkCase) => sha256(JSON.stringify({
  case_id: String(benchmarkCase.case_id || "").trim(),
  title: String(benchmarkCase.title || "").trim(),
  objective: String(benchmarkCase.objective || "").trim(),
  seed_files: Array.isArray(benchmarkCase.seed_files) ? benchmarkCase.seed_files.map((value) => String(value || "").trim()) : [],
  candidate_paths: Array.isArray(benchmarkCase.candidate_paths) ? benchmarkCase.candidate_paths.map((value) => String(value || "").trim()) : [],
  allowed_edit_paths: Array.isArray(benchmarkCase.allowed_edit_paths) ? benchmarkCase.allowed_edit_paths.map((value) => String(value || "").trim()) : [],
  hidden_acceptance: benchmarkCase.hidden_acceptance || {},
}));
const repositoryBaselineDigestForCase = ({ caseId, caseDefinitionSha256, hiddenSha }) => sha256(JSON.stringify({
  case_id: caseId,
  case_definition_sha256: caseDefinitionSha256,
  base_commit: "1".repeat(40),
  hidden_acceptance_sha256: hiddenSha,
  verifier_environment_sha256: REPOSITORY_VERIFIER_ENVIRONMENT_SHA256,
  verifier_invocation_sha256: REPOSITORY_VERIFIER_INVOCATION_SHA256,
  verifier_resource_sha256: REPOSITORY_VERIFIER_RESOURCE_SHA256,
  git_toolchain_sha256: REPOSITORY_GIT_TOOLCHAIN_SHA256,
  exit_code: 1,
  passed: false,
}));

function repositoryEvidenceReport({ benchmarkCases, suiteSha, benchmarkRunId, provider = null, model = null, providerExecutionPerformed = false }) {
  const observations = benchmarkCases.map((benchmarkCase, index) => {
    const caseId = benchmarkCase.case_id;
    const caseDefinitionSha256 = canonicalRepositoryCaseDefinitionSha(benchmarkCase);
    const hiddenSha = ((index + 180).toString(16).padStart(2, "0")).repeat(32);
    const diffSha = ((index + 20).toString(16).padStart(2, "0")).repeat(32);
    const artifactSha = ((index + 60).toString(16).padStart(2, "0")).repeat(32);
    const candidateTreeSha = ((index + 100).toString(16).padStart(2, "0")).repeat(20);
    const allowedPaths = benchmarkCase.allowed_edit_paths;
    return {
      case_id: caseId,
      case_definition_sha256: caseDefinitionSha256,
      repository_origin: `https://github.com/avantiqo-benchmark/${caseId}`,
      allowed_edit_paths: allowedPaths,
      passed: true,
      base_commit: "1".repeat(40),
      diff_sha256: diffSha,
      artifact_sha256: artifactSha,
      candidate_tree_sha: candidateTreeSha,
      repository_mutation_observed: true,
      diff_nonempty: true,
      diff_bytes: 512 + index,
      artifact_materialized: true,
      artifact_bytes: 1024 + index,
      hidden_stdout_sha256: sha256(`stdout:${caseId}`),
      hidden_stdout_bytes: 0,
      hidden_stderr_sha256: sha256(`stderr:${caseId}`),
      hidden_stderr_bytes: 0,
      raw_hidden_verifier_output_persisted: false,
      repository_verification: {
        case_id: caseId,
        case_definition_sha256: caseDefinitionSha256,
        benchmark_run_id: benchmarkRunId,
        runner_source_commit: "1".repeat(40),
        runner_source_clean: true,
        repository_origin: `https://github.com/avantiqo-benchmark/${caseId}`,
        suite_sha256: suiteSha,
        independent: true,
        verifier: "hidden-node-test",
        verifier_contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1",
        verifier_protocol_sha256: repositoryVerifierProtocolSha256,
        verifier_runtime_contract: "AVANTIQO_CODE_REPOSITORY_NODE_RUNTIME_V1",
        verifier_runtime_identity: REPOSITORY_VERIFIER_RUNTIME_IDENTITY,
        verifier_runtime_sha256: REPOSITORY_VERIFIER_RUNTIME_SHA256,
        verifier_environment_contract: "AVANTIQO_CODE_REPOSITORY_DETERMINISTIC_ENV_V1",
        verifier_environment_sha256: REPOSITORY_VERIFIER_ENVIRONMENT_SHA256,
        verifier_invocation_contract: "AVANTIQO_CODE_REPOSITORY_NODE_INVOCATION_V1",
        verifier_invocation_sha256: REPOSITORY_VERIFIER_INVOCATION_SHA256,
        verifier_resource_contract: "AVANTIQO_CODE_REPOSITORY_BOUNDED_EXECUTION_V1",
        verifier_resource_sha256: REPOSITORY_VERIFIER_RESOURCE_SHA256,
        git_toolchain_contract: "AVANTIQO_CODE_REPOSITORY_GIT_TOOLCHAIN_V1",
        git_toolchain_identity: REPOSITORY_GIT_TOOLCHAIN_IDENTITY,
        git_toolchain_sha256: REPOSITORY_GIT_TOOLCHAIN_SHA256,
        evidence_source: "INDEPENDENT_RUNNER",
        candidate_diff_sha256: diffSha,
        candidate_artifact_sha256: artifactSha,
        candidate_diff_bytes: 512 + index,
        candidate_artifact_bytes: 1024 + index,
        candidate_tree_sha: candidateTreeSha,
        changed_paths: allowedPaths,
        allowed_edit_paths: allowedPaths,
        passed: true,
        exit_code: 0,
        hidden_acceptance_sha256: hiddenSha,
        hidden_acceptance_executed: true,
        hidden_acceptance_test_count: index === 0 ? 4 : 5,
        protected_baseline_sha256: repositoryBaselineDigestForCase({ caseId, caseDefinitionSha256, hiddenSha }),
        protected_baseline_executed: true,
        protected_baseline_test_count: index === 0 ? 4 : 5,
        protected_baseline_base_commit: "1".repeat(40),
        protected_baseline_hidden_acceptance_sha256: hiddenSha,
        protected_baseline_verifier_runtime_sha256: REPOSITORY_VERIFIER_RUNTIME_SHA256,
        protected_baseline_verifier_environment_sha256: REPOSITORY_VERIFIER_ENVIRONMENT_SHA256,
        protected_baseline_verifier_invocation_sha256: REPOSITORY_VERIFIER_INVOCATION_SHA256,
        protected_baseline_verifier_resource_sha256: REPOSITORY_VERIFIER_RESOURCE_SHA256,
        protected_baseline_git_toolchain_sha256: REPOSITORY_GIT_TOOLCHAIN_SHA256,
        protected_baseline_exit_code: 1,
        protected_baseline_passed: false,
        candidate_self_report_authority: false,
      },
    };
  });
  return {
    contract: provider ? "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_RUNNER_V1" : "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_RUNNER_V1",
    benchmark_run_id: benchmarkRunId,
    generated_at: new Date().toISOString(),
    suite_contract: "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_SUITE_V1",
    suite_sha256: suiteSha,
    runner_source_commit: "1".repeat(40),
    runner_source_clean: true,
    ...(provider ? {
      provider,
      model: { provider, product_model: model },
      provider_execution_performed: providerExecutionPerformed,
      benchmark_only: true,
      normal_avantiqo_code_execution_uses_reference_provider: false,
      runtime_provider_effect: "NONE",
      raw_provider_output_persisted: false,
      production_deploy_performed: false,
    } : {
      provider_execution_performed: false,
      local_compute_only: true,
      commit_performed: false,
      production_deploy_performed: false,
    }),
    observations,
  };
}

function observations(caseIds, wallMs, { repositoryProof = true, qualityScore = 0.85, categoryByCase = {}, evidenceCountByCase = {}, benchmarkRunId = "55555555-5555-4555-8555-555555555555", suiteSha = null, runnerSourceCommit = "1".repeat(40) } = {}) {
  return caseIds.map((case_id, index) => ({
    case_id,
    case_definition_sha256: caseDefinitionSha(case_id),
    repository_origin: `https://github.com/avantiqo-benchmark/${case_id}`,
    category: categoryByCase[case_id] || null,
    allowed_edit_paths: [`benchmark-case-${index}.mjs`],
    passed: true,
    failures: [],
    quality_score: qualityScore,
    evidence_grounding_score: 0.9,
    narrative_grounding_score: 0.9,
    evidence_distinctness_score: 0.9,
    response_template_fingerprint_sha256: sha256(`template:${case_id}`),
    response_template_simhash64: sha256(`simhash:${case_id}`).slice(0, 16),
    evidence_key_count: evidenceCountByCase[case_id] ?? 1,
    latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
    wall_ms: wallMs + index,
    input_tokens: 100,
    output_tokens: 80,
    token_usage_source: "PROVIDER_API_USAGE_V1",
    pricing_input_usd_per_1m: 1,
    pricing_output_usd_per_1m: 5,
    pricing_source: "OPERATOR_APPROVED_REFERENCE_PRICING_V1",
    cost_measurement_source: "RUNNER_RECOMPUTED_FROM_USAGE_AND_PRICING_V1",
    supplier_cost_usd: 0.0005,
    ...(repositoryProof ? {
      base_commit: "1".repeat(40),
      diff_sha256: ((index + 2).toString(16).padStart(2, "0")).repeat(32),
      artifact_sha256: ((index + 40).toString(16).padStart(2, "0")).repeat(32),
      candidate_tree_sha: ((index + 120).toString(16).padStart(2, "0")).repeat(20),
      repository_mutation_observed: true,
      diff_nonempty: true,
      diff_bytes: 512,
      artifact_materialized: true,
      artifact_bytes: 1024,
      repository_verification: {
        case_id,
        case_definition_sha256: caseDefinitionSha(case_id),
        benchmark_run_id: benchmarkRunId,
        runner_source_commit: runnerSourceCommit,
        runner_source_clean: true,
        repository_origin: `https://github.com/avantiqo-benchmark/${case_id}`,
        suite_sha256: suiteSha,
        independent: true,
        verifier: "hidden-node-test",
        verifier_contract: "AVANTIQO_CODE_REPOSITORY_HIDDEN_VERIFIER_V1",
        verifier_protocol_sha256: repositoryVerifierProtocolSha256,
        verifier_runtime_contract: "AVANTIQO_CODE_REPOSITORY_NODE_RUNTIME_V1",
        verifier_runtime_identity: REPOSITORY_VERIFIER_RUNTIME_IDENTITY,
        verifier_runtime_sha256: REPOSITORY_VERIFIER_RUNTIME_SHA256,
        verifier_environment_contract: "AVANTIQO_CODE_REPOSITORY_DETERMINISTIC_ENV_V1",
        verifier_environment_sha256: REPOSITORY_VERIFIER_ENVIRONMENT_SHA256,
        verifier_invocation_contract: "AVANTIQO_CODE_REPOSITORY_NODE_INVOCATION_V1",
        verifier_invocation_sha256: REPOSITORY_VERIFIER_INVOCATION_SHA256,
        verifier_resource_contract: "AVANTIQO_CODE_REPOSITORY_BOUNDED_EXECUTION_V1",
        verifier_resource_sha256: REPOSITORY_VERIFIER_RESOURCE_SHA256,
        git_toolchain_contract: "AVANTIQO_CODE_REPOSITORY_GIT_TOOLCHAIN_V1",
        git_toolchain_identity: REPOSITORY_GIT_TOOLCHAIN_IDENTITY,
        git_toolchain_sha256: REPOSITORY_GIT_TOOLCHAIN_SHA256,
        evidence_source: "INDEPENDENT_RUNNER",
        candidate_diff_sha256: ((index + 2).toString(16).padStart(2, "0")).repeat(32),
        candidate_artifact_sha256: ((index + 40).toString(16).padStart(2, "0")).repeat(32),
        candidate_diff_bytes: 512,
        candidate_artifact_bytes: 1024,
        candidate_tree_sha: ((index + 120).toString(16).padStart(2, "0")).repeat(20),
        changed_paths: [`benchmark-case-${index}.mjs`],
        allowed_edit_paths: [`benchmark-case-${index}.mjs`],
        passed: true,
        exit_code: 0,
        hidden_acceptance_sha256: ((index + 80).toString(16).padStart(2, "0")).repeat(32),
        hidden_acceptance_executed: true,
        hidden_acceptance_test_count: 4,
        protected_baseline_sha256: repositoryBaselineDigest({ caseId: case_id, hiddenSha: ((index + 80).toString(16).padStart(2, "0")).repeat(32) }),
        protected_baseline_executed: true,
        protected_baseline_test_count: 4,
        protected_baseline_base_commit: "1".repeat(40),
        protected_baseline_hidden_acceptance_sha256: ((index + 80).toString(16).padStart(2, "0")).repeat(32),
        protected_baseline_verifier_runtime_sha256: REPOSITORY_VERIFIER_RUNTIME_SHA256,
        protected_baseline_verifier_environment_sha256: REPOSITORY_VERIFIER_ENVIRONMENT_SHA256,
        protected_baseline_verifier_invocation_sha256: REPOSITORY_VERIFIER_INVOCATION_SHA256,
        protected_baseline_verifier_resource_sha256: REPOSITORY_VERIFIER_RESOURCE_SHA256,
        protected_baseline_git_toolchain_sha256: REPOSITORY_GIT_TOOLCHAIN_SHA256,
        protected_baseline_exit_code: 1,
        protected_baseline_passed: false,
        candidate_self_report_authority: false,
      },
    } : {}),
  }));
}

function referenceReport({ provider, model, caseIds, suiteSha, promptSha, wallMs, qualityScore = 0.85, categoryByCase = {}, evidenceCountByCase = {} }) {
  const benchmarkRunId = provider === "openai"
    ? "33333333-3333-4333-8333-333333333333"
    : "44444444-4444-4444-8444-444444444444";
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPORT_V1",
    generator_contract: "AVANTIQO_CODE_COMPETITIVE_REFERENCE_RUNNER_V1",
    benchmark_run_id: benchmarkRunId,
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_REFERENCE_PROVIDER",
    provider_execution_performed: true,
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    provider,
    model: { product_model: model },
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_sha256: suiteSha,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: promptSha,
    customer_private_content_included: false,
    raw_customer_content_included: false,
    raw_reasoning_persisted: false,
    raw_model_output_persisted: false,
    summary: {
      requested_cases: caseIds.length,
      completed_runs: caseIds.length,
      passed_cases: caseIds.length,
      pass_rate: 1,
      passed: true,
      complete_suite: true,
    },
    economics: {
      estimated_supplier_cost_usd: Number((caseIds.length * 0.0005).toFixed(8)),
      cost_measurement_source: "RUNNER_SUM_OF_RECOMPUTED_CASE_COSTS_V1",
    },
    observations: observations(caseIds, wallMs, { repositoryProof: false, qualityScore, categoryByCase, evidenceCountByCase, benchmarkRunId, suiteSha }),
  };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "avantiqo-code-competitive-"));
  const suiteSource = await readFile(SUITE_PATH, "utf8");
  const suite = JSON.parse(suiteSource);
  const promptSource = await readFile(PROMPT_PATH, "utf8");
  const repositorySuiteSource = await readFile(REPOSITORY_SUITE_PATH, "utf8");
  const repositorySuite = JSON.parse(repositorySuiteSource);
  const repositorySuiteSha = sha256(repositorySuiteSource);
  const caseIds = suite.cases.map((item) => item.case_id).sort();
  const categoryByCase = Object.fromEntries(suite.cases.map((item) => [item.case_id, item.category]));
  const evidenceCountByCase = Object.fromEntries(suite.cases.map((item) => [item.case_id, item.required_evidence.length]));
  const suiteSha = sha256(suiteSource);
  const promptSha = sha256(promptSource);
  const ownedPath = join(dir, "owned.json");
  const refAPath = join(dir, "ref-a.json");
  const refBPath = join(dir, "ref-b.json");
  const ownedRepositoryPath = join(dir, "owned-repository.json");
  const refARepositoryPath = join(dir, "ref-a-repository.json");
  const refBRepositoryPath = join(dir, "ref-b-repository.json");
  const outputPath = join(dir, "competitive.json");
  const ownedObservations = observations(caseIds, 50, { repositoryProof: false, categoryByCase, evidenceCountByCase, benchmarkRunId: "55555555-5555-4555-8555-555555555555", suiteSha }).map((item, index) => ({
    ...item,
    code_cpu_fallback: false,
    code_runtime_model_already_gpu_resident: index > 0,
    inference_elapsed_ms: 1000,
    owned_compute_usd_per_hour: 1.8,
    owned_compute_rate_source: "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1",
    cost_measurement_source: "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1",
    supplier_cost_usd: 0.0005,
  }));
  const ownedLatencyCertification = certifyCodeAIFrontierLatency(ownedObservations);
  const owned = attestCodeAICompetitiveOwnedReport({
    contract: "AVANTIQO_CODE_FRONTIER_LOCAL_RUNNER_V1",
    benchmark_run_id: "55555555-5555-4555-8555-555555555555",
    generated_at: new Date().toISOString(),
    measurement_mode: "LIVE_OWNED_LOCAL_NODE",
    model: { provider: "avantiqo-code", product_model: "avantiqo-code-v1" },
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_sha256: suiteSha,
    prompt_contract: "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1",
    prompt_contract_sha256: promptSha,
    local_owned_only: true,
    external_fallback_allowed: false,
    external_provider_execution_performed: false,
    raw_model_output_persisted: false,
    raw_reasoning_persisted: false,
    raw_model_output_persisted: false,
    summary: {
      requested_cases: caseIds.length,
      completed_runs: caseIds.length,
      passed_cases: caseIds.length,
      pass_rate: 1,
      correctness_passed: true,
      latency_certification: ownedLatencyCertification,
      passed: true,
      complete_suite: true,
    },
    economics: {
      estimated_supplier_cost_usd: Number((caseIds.length * 0.0005).toFixed(8)),
      cost_measurement_source: "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1",
      owned_compute_usd_per_hour: 1.8,
      owned_compute_rate_source: "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1",
    },
    observations: ownedObservations,
  }, { env });
  await writeFile(ownedPath, JSON.stringify(owned));
  const refA = attestCodeAICompetitiveReferenceReport(referenceReport({
    provider: "openai", model: "model-a", caseIds, suiteSha, promptSha, wallMs: 100, categoryByCase, evidenceCountByCase,
  }), { env });
  const refB = attestCodeAICompetitiveReferenceReport(referenceReport({
    provider: "google", model: "model-b", caseIds, suiteSha, promptSha, wallMs: 110, categoryByCase, evidenceCountByCase,
  }), { env });
  await writeFile(refAPath, JSON.stringify(refA));
  await writeFile(refBPath, JSON.stringify(refB));
  await writeFile(ownedRepositoryPath, JSON.stringify(attestCodeAIRepositoryOwnedReport(repositoryEvidenceReport({
    benchmarkCases: repositorySuite.cases, suiteSha: repositorySuiteSha, benchmarkRunId: "66666666-6666-4666-8666-666666666666",
  }), { env })));
  await writeFile(refARepositoryPath, JSON.stringify(attestCodeAIRepositoryReferenceReport(repositoryEvidenceReport({
    benchmarkCases: repositorySuite.cases, suiteSha: repositorySuiteSha, benchmarkRunId: "77777777-7777-4777-8777-777777777777", provider: "openai", model: "model-a", providerExecutionPerformed: true,
  }), { env })));
  await writeFile(refBRepositoryPath, JSON.stringify(attestCodeAIRepositoryReferenceReport(repositoryEvidenceReport({
    benchmarkCases: repositorySuite.cases, suiteSha: repositorySuiteSha, benchmarkRunId: "88888888-8888-4888-8888-888888888888", provider: "google", model: "model-b", providerExecutionPerformed: true,
  }), { env })));
  return { dir, ownedPath, refAPath, refBPath, ownedRepositoryPath, refARepositoryPath, refBRepositoryPath, outputPath, refA };
}

function runBenchmark(paths) {
  return spawnSync(process.execPath, ["scripts/benchmark-avantiqo-code-competitive.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      AVANTIQO_CODE_COMPETITIVE_OWNED: paths.ownedPath,
      AVANTIQO_CODE_COMPETITIVE_REFERENCES: `${paths.refAPath},${paths.refBPath}`,
      AVANTIQO_CODE_COMPETITIVE_OWNED_REPOSITORY_EVIDENCE: paths.ownedRepositoryPath,
      AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPOSITORY_EVIDENCE: `${paths.refARepositoryPath},${paths.refBRepositoryPath}`,
      AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS: JSON.stringify({ openai: "model-a", google: "model-b" }),
      AVANTIQO_CODE_COMPETITIVE_OUTPUT: paths.outputPath,
    },
  });
}

test("competitive certification requires valid attested live reference artifacts end to end", async () => {
  const paths = await fixture();
  const passed = runBenchmark(paths);
  assert.equal(passed.status, 0, passed.stderr || passed.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  assert.equal(report.competitive_certified, true);
  assert.equal(report.competitive_certified, true);
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
  assert.equal(report.requirements.cryptographic_reference_attestation_required, true);
  assert.equal(report.repository_task_evidence.mode, "SEPARATE_EXECUTABLE_REPOSITORY_REPORTS");
  assert.equal(report.repository_task_evidence.certified, true);
  assert.equal(report.requirements.separate_executable_repository_evidence_supported, true);

  const tampered = structuredClone(paths.refA);
  tampered.observations[0].wall_ms = 1;
  await writeFile(paths.refAPath, JSON.stringify(tampered));
  const rejected = runBenchmark(paths);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /CODE_AI_COMPETITIVE_REFERENCE_ATTESTATION_INVALID/);
});


test("near-equal quality scores remain ties and cannot establish superiority", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item) => ({ ...item, quality_score: 0.81 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));

  for (const referencePath of [paths.refAPath, paths.refBPath]) {
    const current = JSON.parse(await readFile(referencePath, "utf8"));
    const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.80 })) };
    delete unsigned.attestation;
    const resigned = attestCodeAICompetitiveReferenceReport(unsigned, { env });
    await writeFile(referencePath, JSON.stringify(resigned));
  }

  const run = runBenchmark(paths);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  for (const reference of report.comparisons) {
    assert.equal(reference.wins, 0);
    assert.equal(reference.losses, 0);
    assert.equal(reference.ties, reference.case_count);
    assert.equal(reference.cases[0].quality_score_delta, 0.01);
  }
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
});


test("single material quality win cannot establish superiority", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item, index) => ({
    ...item,
    quality_score: index === 0 ? 0.90 : 0.85,
  }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));

  for (const referencePath of [paths.refAPath, paths.refBPath]) {
    const current = JSON.parse(await readFile(referencePath, "utf8"));
    const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.85 })) };
    delete unsigned.attestation;
    const resigned = attestCodeAICompetitiveReferenceReport(unsigned, { env });
    await writeFile(referencePath, JSON.stringify(resigned));
  }

  const run = runBenchmark(paths);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  for (const reference of report.comparisons) {
    assert.equal(reference.wins, 1);
    assert.equal(reference.losses, 0);
    assert.ok(reference.quality_win_rate < 0.10);
  }
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
});


test("three wins in one canonical category cannot establish broad superiority", async () => {
  const paths = await fixture();
  const suite = JSON.parse(await readFile(SUITE_PATH, "utf8"));
  const securityCases = new Set(suite.cases.filter((item) => item.category === "security").slice(0, 3).map((item) => item.case_id));
  assert.equal(securityCases.size, 3);
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item) => ({ ...item, quality_score: securityCases.has(item.case_id) ? 0.90 : 0.85 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));

  for (const referencePath of [paths.refAPath, paths.refBPath]) {
    const current = JSON.parse(await readFile(referencePath, "utf8"));
    const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.85 })) };
    delete unsigned.attestation;
    await writeFile(referencePath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  }

  const run = runBenchmark(paths);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  for (const reference of report.comparisons) {
    assert.equal(reference.wins, 3);
    assert.equal(reference.quality_win_rate, 0.1);
    assert.deepEqual(reference.quality_win_categories, ["security"]);
    assert.equal(reference.quality_win_category_count, 1);
  }
  assert.equal(report.quality_superiority_observed, false);
  assert.equal(report.superiority_claim_allowed, false);
});

test("spoofed observation category is rejected against the canonical suite", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[0].category = "spoofed-category";
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_CANONICAL_CATEGORY_MISMATCH/);
});

test("duplicate vendor references cannot satisfy the provider floor", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...current, provider: "openai" };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_PROVIDERS_MISSING:google/);
});


test("wrong model under correct provider cannot satisfy the floor", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...current, model: { product_model: "weaker-model" } };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODEL_MISMATCH:google/);
});


test("reference evidence measured too far from owned evidence is rejected", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refAPath, "utf8"));
  const unsigned = { ...current, generated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
  delete unsigned.attestation;
  await writeFile(paths.refAPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_CROSS_EVIDENCE_SKEW_EXCEEDED/);
});

test("duplicate signed benchmark run ids are rejected", async () => {
  const paths = await fixture();
  const refA = JSON.parse(await readFile(paths.refAPath, "utf8"));
  const refB = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...refB, benchmark_run_id: refA.benchmark_run_id };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_UNIQUE_BENCHMARK_RUN_IDS_REQUIRED/);
});


test("owned benchmark below the absolute quality floor is rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item, index) => ({ ...item, quality_score: index === 0 ? 0.49 : 0.85 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_OWNED_ABSOLUTE_QUALITY_FLOOR_NOT_MET/);
});

test("owned benchmark below the absolute mean quality floor is rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations = owned.observations.map((item) => ({ ...item, quality_score: 0.60 }));
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_OWNED_ABSOLUTE_QUALITY_FLOOR_NOT_MET/);
});


test("degraded reference below the absolute quality floor is rejected", async () => {
  const paths = await fixture();
  const current = JSON.parse(await readFile(paths.refBPath, "utf8"));
  const unsigned = { ...current, observations: current.observations.map((item) => ({ ...item, quality_score: 0.60 })) };
  delete unsigned.attestation;
  await writeFile(paths.refBPath, JSON.stringify(attestCodeAICompetitiveReferenceReport(unsigned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REFERENCE_ABSOLUTE_QUALITY_FLOOR_NOT_MET:google/);
});


test("duplicate cross-case template fingerprints are rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[1].response_template_fingerprint_sha256 = owned.observations[0].response_template_fingerprint_sha256;
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  assert.equal(report.competitive_certified, false);
  assert.equal(report.comparisons[0].gates.owned_cross_case_templates_unique, false);
  assert.equal(report.comparisons[1].gates.owned_cross_case_templates_unique, false);
});


test("near-duplicate cross-case template simhashes are rejected", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[1].response_template_simhash64 = owned.observations[0].response_template_simhash64.slice(0, 15) +
    (owned.observations[0].response_template_simhash64.endsWith("0") ? "1" : "0");
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  const report = JSON.parse(await readFile(paths.outputPath, "utf8"));
  assert.equal(report.comparisons[0].gates.owned_cross_case_templates_unique, false);
  assert.ok(report.comparisons[0].owned_template_fingerprints.minimum_simhash_hamming_distance < 8);
});


test("canonical evidence obligation count cannot be understated", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  owned.observations[0].evidence_key_count -= 1;
  delete owned.owned_attestation;
  await writeFile(paths.ownedPath, JSON.stringify(attestCodeAICompetitiveOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_CANONICAL_EVIDENCE_COUNT_MISMATCH/);
});

test("separate repository reference evidence must match the required provider and model", async () => {
  const paths = await fixture();
  const referenceRepository = JSON.parse(await readFile(paths.refARepositoryPath, "utf8"));
  referenceRepository.model = { provider: "openai", product_model: "wrong-model" };
  await writeFile(paths.refARepositoryPath, JSON.stringify(attestCodeAIRepositoryReferenceReport(referenceRepository, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_REFERENCE_MISSING:openai/);
});

test("separate repository evidence must match the canonical executable case definition", async () => {
  const paths = await fixture();
  const ownedRepository = JSON.parse(await readFile(paths.ownedRepositoryPath, "utf8"));
  ownedRepository.observations[0].case_definition_sha256 = "f".repeat(64);
  ownedRepository.observations[0].repository_verification.case_definition_sha256 = "f".repeat(64);
  await writeFile(paths.ownedRepositoryPath, JSON.stringify(attestCodeAIRepositoryOwnedReport(ownedRepository, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_CASE_DEFINITION_MISMATCH/);
});


test("tampered signed repository reference evidence is rejected", async () => {
  const paths = await fixture();
  const report = JSON.parse(await readFile(paths.refARepositoryPath, "utf8"));
  report.observations[0].artifact_bytes += 1;
  await writeFile(paths.refARepositoryPath, JSON.stringify(report));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_REFERENCE_ATTESTATION_INVALID/);
});


test("tampered signed owned repository evidence is rejected", async () => {
  const paths = await fixture();
  const report = JSON.parse(await readFile(paths.ownedRepositoryPath, "utf8"));
  report.observations[0].diff_bytes += 1;
  await writeFile(paths.ownedRepositoryPath, JSON.stringify(report));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_OWNED_ATTESTATION_INVALID/);
});

test("stale signed owned repository evidence is rejected", async () => {
  const paths = await fixture();
  const report = JSON.parse(await readFile(paths.ownedRepositoryPath, "utf8"));
  report.generated_at = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString();
  await writeFile(paths.ownedRepositoryPath, JSON.stringify(attestCodeAIRepositoryOwnedReport(report, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_EVIDENCE_STALE:owned/);
});

test("signed repository evidence must align in time with its frontier reference", async () => {
  const paths = await fixture();
  const frontier = JSON.parse(await readFile(paths.refAPath, "utf8"));
  const report = JSON.parse(await readFile(paths.refARepositoryPath, "utf8"));
  report.generated_at = new Date(Date.parse(frontier.generated_at) - (48 * 60 * 60 * 1000)).toISOString();
  await writeFile(paths.refARepositoryPath, JSON.stringify(attestCodeAIRepositoryReferenceReport(report, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_FRONTIER_SKEW_EXCEEDED:openai:model-a/);
});

test("signed repository benchmark run ids must be unique", async () => {
  const paths = await fixture();
  const owned = JSON.parse(await readFile(paths.ownedRepositoryPath, "utf8"));
  const reference = JSON.parse(await readFile(paths.refARepositoryPath, "utf8"));
  reference.benchmark_run_id = owned.benchmark_run_id;
  for (const observation of reference.observations) {
    observation.repository_verification.benchmark_run_id = owned.benchmark_run_id;
  }
  await writeFile(paths.refARepositoryPath, JSON.stringify(attestCodeAIRepositoryReferenceReport(reference, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_UNIQUE_REPOSITORY_RUN_IDS_REQUIRED/);
});

test("repository benchmark run ids cannot collide with frontier run ids", async () => {
  const paths = await fixture();
  const frontier = JSON.parse(await readFile(paths.ownedPath, "utf8"));
  const owned = JSON.parse(await readFile(paths.ownedRepositoryPath, "utf8"));
  owned.benchmark_run_id = frontier.benchmark_run_id;
  for (const observation of owned.observations) {
    observation.repository_verification.benchmark_run_id = frontier.benchmark_run_id;
  }
  await writeFile(paths.ownedRepositoryPath, JSON.stringify(attestCodeAIRepositoryOwnedReport(owned, { env })));
  const run = runBenchmark(paths);
  assert.notEqual(run.status, 0);
  assert.match(`${run.stderr}\n${run.stdout}`, /AVANTIQO_CODE_COMPETITIVE_REPOSITORY_FRONTIER_RUN_ID_COLLISION/);
});
