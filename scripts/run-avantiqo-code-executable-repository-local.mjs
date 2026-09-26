import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import {
  CODE_AI_REPOSITORY_VERIFIER_CONTRACT,
  CODE_AI_REPOSITORY_VERIFIER_RUNTIME_CONTRACT,
  codeAIRepositoryVerifierProtocolSha256,
} from "../lib/code/runtime/CodeAIRepositoryTaskBenchmarkRuntime.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_RUNNER_V1";
const SUITE_CONTRACT = "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_SUITE_V1";
const APPROVAL = "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_APPROVED";
const REQUIRED_WORKER_CONTRACT = "AVANTIQO_NODE01_WORKER_V6_MODEL_AWARE_CODE";
const WORKER_SOURCE_PATH = resolve("scripts/local-node/avantiqo-node01-worker.ps1");
const WORKER_ATTESTATION_WAIT_MS = Math.max(5000, Number(process.env.AVANTIQO_CODE_BENCHMARK_WORKER_ATTESTATION_WAIT_MS || 45000));
const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const requestedLimit = Math.max(0, Number(limitArg?.split("=")[1] || 0));
const suiteArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const suitePath = resolve(suiteArg || "benchmarks/avantiqo-code-executable-repository-suite.json");
const benchmarkRunId = randomUUID();

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const sha256 = (value) => createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
const verifierRuntimeIdentity = Object.freeze({
  engine: process.release?.name || "node",
  version: process.version,
  platform: process.platform,
  arch: process.arch,
});
const verifierRuntimeSha256 = sha256(JSON.stringify(verifierRuntimeIdentity));
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function run(command, args, cwd, env = process.env) {
  return spawnSync(command, args, { cwd, encoding: "utf8", env });
}
function must(command, args, cwd) {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_COMMAND_FAILED:${command}:${args.join(" ")}:${text(result.stderr || result.stdout, 1200)}`);
  }
  return result;
}
function hiddenAssertionCount(source) {
  const count = (String(source || "").match(/\bassert\.[A-Za-z]+\s*\(/g) || []).length;
  if (count <= 0) throw new Error(`${CONTRACT}_HIDDEN_ASSERTION_COUNT_REQUIRED`);
  return count;
}

function hiddenSource(caseSet) {
  if (caseSet === "INVOICE_TOTAL_V1") {
    return `import assert from "node:assert/strict";
import { sumInvoiceLines } from "./invoice-total.mjs";
assert.equal(sumInvoiceLines(null), 0);
assert.equal(sumInvoiceLines([]), 0);
assert.equal(sumInvoiceLines([{total:10},{total:"12.50"},{total:"invalid"},{total:null},{}]), 22.5);
assert.equal(sumInvoiceLines([{total:0},{total:"0"},{total:-3.25},{total:"4.25"}]), 1);
`;
  }
  if (caseSet === "INVOICE_SUMMARY_MULTIFILE_V1") {
    return `import assert from "node:assert/strict";
import { normalizeMoney } from "./normalize-money.mjs";
import { summarizeInvoice } from "./invoice-summary.mjs";
assert.equal(normalizeMoney("12.50"), 12.5);
assert.equal(normalizeMoney(7), 7);
assert.equal(normalizeMoney("not-a-number"), 0);
assert.deepEqual(summarizeInvoice([{total:"12.50"},{total:7},{total:"not-a-number"}]), {total:19.5,valid_line_count:2});
assert.deepEqual(summarizeInvoice(null), {total:0,valid_line_count:0});
`;
  }
  throw new Error(`${CONTRACT}_UNKNOWN_CASE_SET:${caseSet}`);
}
async function assertCodeWorkerAttested() {
  const workerSource = await readFile(WORKER_SOURCE_PATH, "utf8");
  const expectedSha = sha256(workerSource);
  const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
  const deadline = Date.now() + WORKER_ATTESTATION_WAIT_MS;
  let observed = null;
  while (Date.now() < deadline) {
    const query = await supabaseAdmin
      .from("avantiqo_local_compute_nodes")
      .select("id,enabled,last_seen_at,metadata")
      .eq("id", "avantiqo-node-01")
      .maybeSingle();
    if (query.error) throw query.error;
    observed = query.data || null;
    const metadata = object(observed?.metadata);
    const laneAttestations = object(metadata.lane_attestations);
    const durableCodeAttestation = object(laneAttestations.code);
    const heartbeatAt = Date.parse(observed?.last_seen_at || "");
    const codeAttestationAt = Date.parse(durableCodeAttestation.observed_at || "");
    const fresh = Number.isFinite(heartbeatAt) && Date.now() - heartbeatAt <= 90000;
    const codeAttestationFresh =
      Number.isFinite(codeAttestationAt) && Date.now() - codeAttestationAt <= 90000;
    const currentHeartbeatIsCode = text(metadata.heartbeat_source_lane).toLowerCase() === "code";
    const attestedContract =
      text(durableCodeAttestation.worker_contract) || (currentHeartbeatIsCode ? text(metadata.worker_contract) : "");
    const attestedSha =
      text(durableCodeAttestation.worker_source_sha256).toLowerCase() ||
      (currentHeartbeatIsCode ? text(metadata.worker_source_sha256).toLowerCase() : "");
    if (
      observed?.enabled === true &&
      fresh &&
      (codeAttestationFresh || currentHeartbeatIsCode) &&
      attestedContract === REQUIRED_WORKER_CONTRACT &&
      attestedSha === expectedSha
    ) {
      return {
        node_id: "avantiqo-node-01",
        worker_contract: REQUIRED_WORKER_CONTRACT,
        worker_source_sha256: expectedSha,
        code_lane_heartbeat_verified: true,
        durable_lane_attestation_verified: codeAttestationFresh,
      };
    }
    await sleep(1000);
  }
  const metadata = object(observed?.metadata);
  throw new Error(
    `${CONTRACT}_WORKER_ATTESTATION_REQUIRED:${text(metadata.heartbeat_source_lane) || "none"}:${text(metadata.worker_contract) || "none"}`,
  );
}

async function seedRepository(benchmarkCase) {
  const root = await mkdtemp(join(tmpdir(), "avantiqo-code-live-benchmark-"));
  const repo = join(root, "candidate");
  const verifier = join(root, "verifier");
  await mkdir(repo, { recursive: true });
  await mkdir(verifier, { recursive: true });
  const seeds = list(benchmarkCase.seed_files);
  const candidatePaths = list(benchmarkCase.candidate_paths);
  for (let index = 0; index < seeds.length; index += 1) {
    const source = resolve(seeds[index]);
    const target = candidatePaths[index];
    await copyFile(source, join(repo, target));
    await copyFile(source, join(verifier, target));
  }
  const origin = `https://github.com/avantiqo-benchmark/${text(benchmarkCase.case_id, 120)}`;
  for (const dir of [repo, verifier]) {
    must("git", ["init", "-q"], dir);
    must("git", ["config", "user.email", "benchmark@example.invalid"], dir);
    must("git", ["config", "user.name", "Avantiqo Benchmark"], dir);
    must("git", ["remote", "add", "origin", origin], dir);
    must("git", ["add", "."], dir);
    must("git", ["commit", "-qm", "broken baseline"], dir);
  }
  const baseCommit = text(must("git", ["rev-parse", "HEAD"], repo).stdout, 80);
  const hiddenPath = join(verifier, "hidden-acceptance.mjs");
  const hiddenAcceptanceSource = hiddenSource(benchmarkCase?.hidden_acceptance?.case_set);
  const hiddenAcceptanceSha256 = sha256(hiddenAcceptanceSource);
  const hiddenAcceptanceTestCount = hiddenAssertionCount(hiddenAcceptanceSource);
  await writeFile(hiddenPath, hiddenAcceptanceSource, "utf8");
  const baseline = run(process.execPath, [hiddenPath], verifier);
  if (baseline.status === 0) throw new Error(`${CONTRACT}_BASELINE_MUST_FAIL:${benchmarkCase.case_id}`);
  const baselineExitCode = Number(baseline.status);
  const protectedBaselineSha256 = sha256(JSON.stringify({
    case_id: benchmarkCase.case_id,
    base_commit: baseCommit,
    hidden_acceptance_sha256: hiddenAcceptanceSha256,
    exit_code: baselineExitCode,
    passed: false,
  }));
  return {
    root, repo, verifier, origin, baseCommit, hiddenPath,
    hiddenAcceptanceSha256, hiddenAcceptanceTestCount, baselineExitCode, protectedBaselineSha256,
  };
}

const suiteSource = await readFile(suitePath, "utf8");
const suiteSha256 = sha256(suiteSource);
const suite = JSON.parse(suiteSource);
if (text(suite.contract, 180) !== SUITE_CONTRACT) throw new Error(`${CONTRACT}_SUITE_CONTRACT_INVALID`);
const allCases = list(suite.cases);
const cases = requestedLimit > 0 ? allCases.slice(0, Math.min(requestedLimit, allCases.length)) : allCases;
if (!cases.length) throw new Error(`${CONTRACT}_CASES_REQUIRED`);

if (dryRun) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "DRY_RUN",
    suite_contract: SUITE_CONTRACT,
    case_count: cases.length,
    isolated_candidate_trial: true,
    hidden_acceptance_after_candidate_only: true,
    hidden_answers_exposed_to_candidate: false,
    local_compute_only: true,
    production_deploy_performed: false
  }, null, 2));
  process.exit();
}
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}

const { executeCodeAIEmployeeMission } = await import("../lib/code/runtime/CodeAIEmployeeRuntime.js");
const { AvantiqoCodeLocalQueueProvider } = await import("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js");
const { resolveAvantiqoLearningOrganization } = await import("../lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime.js");
const organization = await resolveAvantiqoLearningOrganization({ allowDatabaseFallback: true });
const organizationId = text(organization?.organization_id, 200);
if (!organizationId) throw new Error(`${CONTRACT}_ORGANIZATION_REQUIRED`);
const workerAttestation = await assertCodeWorkerAttested();

const observations = [];
for (const benchmarkCase of cases) {
  const fixture = await seedRepository(benchmarkCase);
  const originalRoot = process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
  try {
    process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = fixture.repo;
    const started = Date.now();
    const caseDeadline = started + 180000;
    let result = null;
    let resumeState = null;
    let continuationSlices = 0;
    do {
      result = await executeCodeAIEmployeeMission({
        context: {
          organizationId,
          actor: { id: "avantiqo-code-benchmark-runner" },
          metadata: {
            codeAIIsolatedCandidateTrial: true,
            benchmark_only: true,
            benchmark_contract: CONTRACT,
            benchmark_case_id: benchmarkCase.case_id,
            commit_authority: false,
            production_deploy_authority: false,
          },
        },
        objective: benchmarkCase.objective,
        owner_intent: benchmarkCase.objective,
        objective_context: {
          organization_id: organizationId,
          workspace_target: "LOCAL_COMPUTER",
          owner_objective: benchmarkCase.objective,
          allowed_edit_paths: benchmarkCase.allowed_edit_paths,
          implementation_required: true,
          authoritative_verification_command: "node",
          authoritative_verification_args: ["--check", benchmarkCase.candidate_paths.at(-1)],
          completion_criterion_1: "Implement the requested behavior in the allowed source paths.",
          completion_criterion_2: "Keep the patch minimal and preserve unrelated behavior.",
        },
        repository_url: fixture.origin,
        ref: fixture.baseCommit,
        resume_state: resumeState,
        reasoning_call_budget: 4,
        max_employee_passes: 6,
        local_compute_required: true,
        infrastructure_policy: "local_only",
        timeout_ms: 120000,
      });
      continuationSlices += 1;
      resumeState = object(result?.state);
      console.log("AVANTIQO_CODE_EXEC_REPO_SLICE=" + JSON.stringify({
        case_id: benchmarkCase.case_id,
        slice: continuationSlices,
        status: text(result?.status, 120),
        pending_provider_job_id: text(resumeState?.planner_pending?.provider_job_id, 300) || null,
        reasoning_calls: Number(resumeState?.work_package_control?.reasoning_calls_used || result?.reasoning_calls || 0),
        elapsed_ms: Date.now() - started,
        patch_present: Boolean(String(resumeState?.patch || "").trim()),
        raw_reasoning_persisted: false,
      }));
      if (text(result?.status, 120) !== "planner_pending") break;
      if (Date.now() >= caseDeadline) break;
      await sleep(250);
    } while (continuationSlices < 24);
    const wallMs = Date.now() - started;
    const state = object(result?.state);
    let benchmarkPendingJobCancelled = false;
    if (text(result?.status, 120) === "planner_pending") {
      const pendingJobId = text(state?.planner_pending?.provider_job_id, 300);
      if (pendingJobId) {
        const cancelled = await AvantiqoCodeLocalQueueProvider.cancel({ provider_job_id: pendingJobId }).catch(() => null);
        benchmarkPendingJobCancelled = cancelled?.cancelled === true;
      }
    }
    const patch = String(state.patch || "");
    const diffBytes = Buffer.byteLength(patch, "utf8");
    let hiddenPassed = false;
    let hiddenExitCode = null;
    let candidateTreeSha = null;
    let hiddenStdout = "";
    let hiddenStderr = "";
    let verifierChangedPaths = [];
    if (patch.trim()) {
      const patchPath = join(fixture.root, "candidate.patch");
      await writeFile(patchPath, patch, "utf8");
      const applied = run("git", ["apply", "--check", patchPath], fixture.verifier);
      if (applied.status === 0) {
        must("git", ["apply", patchPath], fixture.verifier);
        const trackedChangedPaths = text(run("git", ["diff", "--name-only", "HEAD"], fixture.verifier).stdout, 12000)
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean);
        const untrackedChangedPaths = text(run("git", ["ls-files", "--others", "--exclude-standard"], fixture.verifier).stdout, 12000)
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter((value) => Boolean(value) && value !== "hidden-acceptance.mjs");
        verifierChangedPaths = [...new Set([...trackedChangedPaths, ...untrackedChangedPaths])].sort();
        must("git", ["add", "-A"], fixture.verifier);
        run("git", ["reset", "--", "hidden-acceptance.mjs"], fixture.verifier);
        candidateTreeSha = text(must("git", ["write-tree"], fixture.verifier).stdout, 80);
        const hidden = run(process.execPath, [fixture.hiddenPath], fixture.verifier);
        hiddenExitCode = hidden.status;
        hiddenStdout = text(hidden.stdout, 1200);
        hiddenStderr = text(hidden.stderr, 1200);
        hiddenPassed = hidden.status === 0;
      } else {
        hiddenStderr = text(applied.stderr || applied.stdout, 1200);
      }
    }
    const artifact = list(benchmarkCase.candidate_paths)
      .map((candidatePath) => text(run("cat", [candidatePath], fixture.verifier).stdout, 30000))
      .join("\n---FILE---\n");
    observations.push({
      case_id: benchmarkCase.case_id,
      repository_origin: fixture.origin,
      allowed_edit_paths: list(benchmarkCase.allowed_edit_paths).map((value) => text(value, 500)),
      passed: hiddenPassed,
      status: text(result?.status, 120),
      reason: text(result?.reason, 500) || null,
      wall_ms: wallMs,
      continuation_slices: continuationSlices,
      benchmark_pending_job_cancelled: benchmarkPendingJobCancelled,
      reasoning_calls: Number(state?.work_package_control?.reasoning_calls_used || result?.reasoning_calls || 0),
      employee_passes: Number(state?.employee_mission?.employee_passes_used || result?.employee_passes || 0),
      base_commit: fixture.baseCommit,
      diff_sha256: sha256(patch),
      artifact_sha256: sha256(artifact),
      candidate_tree_sha: candidateTreeSha,
      repository_mutation_observed: patch.trim().length > 0,
      diff_nonempty: patch.trim().length > 0,
      diff_bytes: diffBytes,
      artifact_materialized: artifact.length > 0,
      artifact_bytes: Buffer.byteLength(artifact, "utf8"),
      repository_verification: {
        case_id: benchmarkCase.case_id,
        repository_origin: fixture.origin,
        benchmark_run_id: benchmarkRunId,
        suite_sha256: suiteSha256,
        independent: true,
        verifier: "avantiqo-hidden-node-assert",
        verifier_contract: CODE_AI_REPOSITORY_VERIFIER_CONTRACT,
        verifier_protocol_sha256: codeAIRepositoryVerifierProtocolSha256(),
        verifier_runtime_contract: CODE_AI_REPOSITORY_VERIFIER_RUNTIME_CONTRACT,
        verifier_runtime_identity: verifierRuntimeIdentity,
        verifier_runtime_sha256: verifierRuntimeSha256,
        evidence_source: "INDEPENDENT_RUNNER",
        candidate_diff_sha256: sha256(patch),
        candidate_artifact_sha256: sha256(artifact),
        candidate_tree_sha: candidateTreeSha,
        changed_paths: verifierChangedPaths,
        allowed_edit_paths: list(benchmarkCase.allowed_edit_paths).map((value) => text(value, 500)),
        passed: hiddenPassed,
        exit_code: hiddenExitCode,
        hidden_acceptance_sha256: fixture.hiddenAcceptanceSha256,
        hidden_acceptance_executed: hiddenExitCode !== null,
        hidden_acceptance_test_count: fixture.hiddenAcceptanceTestCount,
        protected_baseline_sha256: fixture.protectedBaselineSha256,
        protected_baseline_executed: true,
        protected_baseline_test_count: fixture.hiddenAcceptanceTestCount,
        protected_baseline_base_commit: fixture.baseCommit,
        protected_baseline_hidden_acceptance_sha256: fixture.hiddenAcceptanceSha256,
        protected_baseline_verifier_runtime_sha256: verifierRuntimeSha256,
        protected_baseline_exit_code: fixture.baselineExitCode,
        protected_baseline_passed: false,
        candidate_self_report_authority: false,
      },
      hidden_stdout_sha256: sha256(hiddenStdout),
      hidden_stdout_bytes: Buffer.byteLength(hiddenStdout, "utf8"),
      hidden_stderr_sha256: sha256(hiddenStderr),
      hidden_stderr_bytes: Buffer.byteLength(hiddenStderr, "utf8"),
      raw_hidden_verifier_output_persisted: false,
      commit_performed: false,
      production_deploy_performed: false,
      raw_reasoning_persisted: false,
      run_id: randomUUID(),
    });
    console.log("AVANTIQO_CODE_EXEC_REPO_CASE=" + JSON.stringify(observations.at(-1)));
  } finally {
    if (originalRoot === undefined) delete process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
    else process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = originalRoot;
    await rm(fixture.root, { recursive: true, force: true });
  }
}

const passed = observations.filter((item) => item.passed).length;
console.log(JSON.stringify({
  success: passed === observations.length,
  contract: CONTRACT,
  suite_contract: SUITE_CONTRACT,
  suite_sha256: suiteSha256,
  case_count: observations.length,
  passed_case_count: passed,
  pass_rate: observations.length ? passed / observations.length : 0,
  worker_attestation: workerAttestation,
  benchmark_run_id: benchmarkRunId,
  runner_source_commit: observations[0]?.base_commit || null,
  observations,
  local_compute_only: true,
  commit_performed: false,
  production_deploy_performed: false,
}, null, 2));
if (passed !== observations.length) process.exitCode = 2;
