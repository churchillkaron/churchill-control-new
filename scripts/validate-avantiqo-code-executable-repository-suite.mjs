import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_SUITE_VALIDATOR_V1";
const SUITE_CONTRACT = "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_SUITE_V1";
const suitePath = resolve(process.argv[2] || "benchmarks/avantiqo-code-executable-repository-suite.json");

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
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

const suite = JSON.parse(await readFile(suitePath, "utf8"));
assert.equal(text(suite.contract), SUITE_CONTRACT);
assert.equal(suite.candidate_workspace_contains_expected_answers, false);
assert.equal(
  suite.hidden_acceptance_materialization,
  "RUNNER_ONLY_OUTSIDE_CANDIDATE_REPOSITORY",
);
const cases = list(suite.cases);
if (cases.length < 2) throw new Error(`${CONTRACT}_MINIMUM_CASES_REQUIRED`);

const results = [];
for (const benchmarkCase of cases) {
  const caseId = text(benchmarkCase.case_id, 240);
  const root = await mkdtemp(join(tmpdir(), "avantiqo-code-exec-suite-"));
  const candidateRepo = join(root, "candidate");
  const hiddenDir = join(root, "hidden");
  await mkdir(candidateRepo, { recursive: true });
  await mkdir(hiddenDir, { recursive: true });
  try {
    const seedFiles = list(benchmarkCase.seed_files);
    const candidatePaths = list(benchmarkCase.candidate_paths);
    const allowedEditPaths = list(benchmarkCase.allowed_edit_paths);
    if (!seedFiles.length || seedFiles.length !== candidatePaths.length) {
      throw new Error(`${CONTRACT}_SEED_MAPPING_INVALID:${caseId}`);
    }
    if (JSON.stringify([...candidatePaths].sort()) !== JSON.stringify([...allowedEditPaths].sort())) {
      throw new Error(`${CONTRACT}_ALLOWED_EDIT_SCOPE_INVALID:${caseId}`);
    }
    for (let index = 0; index < seedFiles.length; index += 1) {
      const source = resolve(seedFiles[index]);
      const targetName = candidatePaths[index] || basename(source);
      await copyFile(source, join(candidateRepo, targetName));
      await copyFile(source, join(hiddenDir, targetName));
    }

    const hiddenPath = join(hiddenDir, "hidden-acceptance.mjs");
    await writeFile(hiddenPath, hiddenSource(benchmarkCase?.hidden_acceptance?.case_set), "utf8");

    const gitInit = run("git", ["init", "-q"], candidateRepo);
    if (gitInit.status !== 0) throw new Error(`${CONTRACT}_GIT_INIT_FAILED:${caseId}`);
    run("git", ["config", "user.email", "benchmark@example.invalid"], candidateRepo);
    run("git", ["config", "user.name", "Benchmark Runner"], candidateRepo);
    run("git", ["add", "."], candidateRepo);
    const commit = run("git", ["commit", "-qm", "baseline"], candidateRepo);
    if (commit.status !== 0) throw new Error(`${CONTRACT}_BASELINE_COMMIT_FAILED:${caseId}`);

    const baseline = run(process.execPath, [hiddenPath], hiddenDir);
    if (baseline.status === 0) {
      throw new Error(`${CONTRACT}_BASELINE_MUST_FAIL:${caseId}`);
    }

    const candidateListing = run("git", ["ls-files"], candidateRepo);
    const tracked = text(candidateListing.stdout, 12000).split("\n").filter(Boolean);
    if (tracked.some((item) => /hidden|benchmark|expected|answer/i.test(item))) {
      throw new Error(`${CONTRACT}_HIDDEN_EVIDENCE_LEAKED:${caseId}`);
    }

    results.push({
      case_id: caseId,
      baseline_failed_as_expected: true,
      candidate_repository_file_count: tracked.length,
      candidate_repository_files: tracked,
      hidden_acceptance_outside_candidate_repository: !hiddenPath.startsWith(candidateRepo + "/"),
      allowed_edit_paths: allowedEditPaths,
      hidden_acceptance_case_set: text(benchmarkCase?.hidden_acceptance?.case_set, 240),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  suite_contract: SUITE_CONTRACT,
  case_count: results.length,
  hidden_answers_exposed_to_candidate: false,
  baseline_failure_verified: results.every((item) => item.baseline_failed_as_expected),
  cases: results,
  production_deploy_performed: false,
}, null, 2));
