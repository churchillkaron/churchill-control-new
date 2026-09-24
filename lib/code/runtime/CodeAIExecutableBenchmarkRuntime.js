import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

export const CODE_AI_EXECUTABLE_BENCHMARK_CONTRACT =
  "AVANTIQO_CODE_EXECUTABLE_BENCHMARK_V1";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function unique(values) {
  return [...new Set(values.map((value) => text(value, 1200)).filter(Boolean))];
}
function exactSet(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

export function validateCodeAIExecutableBenchmarkCase(benchmarkCase = {}) {
  const item = object(benchmarkCase);
  const caseId = text(item.case_id, 240);
  const objective = text(item.objective, 6000);
  const allowedEditPaths = unique(list(item.allowed_edit_paths));
  const files = object(item.files);
  const verifier = object(item.public_verifier);
  const hiddenVerifierSource = text(item.hidden_verifier_source, 30000);
  if (!caseId) throw new Error("CODE_AI_EXECUTABLE_BENCHMARK_CASE_ID_REQUIRED");
  if (!objective) throw new Error(`CODE_AI_EXECUTABLE_BENCHMARK_OBJECTIVE_REQUIRED:${caseId}`);
  if (!allowedEditPaths.length) throw new Error(`CODE_AI_EXECUTABLE_BENCHMARK_ALLOWED_PATHS_REQUIRED:${caseId}`);
  if (allowedEditPaths.some((filePath) => /^tests?\//i.test(filePath))) {
    throw new Error(`CODE_AI_EXECUTABLE_BENCHMARK_TEST_EDIT_FORBIDDEN:${caseId}`);
  }
  if (text(verifier.command, 80) !== "node" || !list(verifier.args).length) {
    throw new Error(`CODE_AI_EXECUTABLE_BENCHMARK_NODE_VERIFIER_REQUIRED:${caseId}`);
  }
  if (!Object.keys(files).length || !files["tests/public.test.mjs"]) {
    throw new Error(`CODE_AI_EXECUTABLE_BENCHMARK_PUBLIC_FIXTURE_REQUIRED:${caseId}`);
  }
  if (!hiddenVerifierSource.includes("BENCHMARK_ROOT")) {
    throw new Error(`CODE_AI_EXECUTABLE_BENCHMARK_HIDDEN_VERIFIER_REQUIRED:${caseId}`);
  }
  return {
    case_id: caseId,
    category: text(item.category, 120) || "general",
    objective,
    allowed_edit_paths: allowedEditPaths,
    files,
    public_verifier: {
      command: "node",
      args: list(verifier.args).slice(0, 12).map((value) => text(value, 1000)),
    },
    hidden_verifier_source: hiddenVerifierSource,
  };
}

export function executableBenchmarkMissionInput(benchmarkCase = {}) {
  const item = validateCodeAIExecutableBenchmarkCase(benchmarkCase);
  const verifierPath = item.public_verifier.args.join(" ");
  const objective = [
    item.objective,
    `You may edit only: ${item.allowed_edit_paths.join(", ")}.`,
    "Do not edit tests, package metadata, or any other file.",
    `The authoritative public verification command is: node ${verifierPath}.`,
    "Use apply_files for source writes, run the exact public verifier after the final edit, inspect the final diff, and complete only when the verifier passes.",
  ].join(" ");
  return {
    objective,
    objective_context: {
      selection_contract: CODE_AI_EXECUTABLE_BENCHMARK_CONTRACT,
      executable_benchmark_case_id: item.case_id,
      evidence_backed: true,
      authoritative_verification_command: "node",
      authoritative_verification_args: item.public_verifier.args,
      allowed_edit_paths: item.allowed_edit_paths,
      implementation_required: true,
      completion_criterion_1: `The exact public verifier passes: node ${verifierPath}.`,
      completion_criterion_2: `Only the allowed source paths are changed: ${item.allowed_edit_paths.join(", ")}.`,
      completion_criterion_3: "The final diff is observed after the last edit and the mission reaches verified completion.",
    },
  };
}

function publicVerifierObserved(result, verifier) {
  const state = object(result?.state || result);
  const passedVerificationIds = new Set(
    list(state.verification)
      .filter((entry) => entry?.passed === true)
      .map((entry) => text(entry?.operation_id, 240))
      .filter(Boolean),
  );
  return list(state.tests).some((entry) =>
    passedVerificationIds.has(text(entry?.operation_id, 240)) &&
    text(entry?.command, 80) === verifier.command &&
    JSON.stringify(list(entry?.args).map((value) => text(value, 1000))) === JSON.stringify(verifier.args) &&
    Number(entry?.exit_code) === 0
  );
}

export function projectCodeAIExecutableBenchmarkCandidate(benchmarkCase = {}, result = {}) {
  const item = validateCodeAIExecutableBenchmarkCase(benchmarkCase);
  const state = object(result?.state || result);
  const changedFiles = unique(list(state.files_changed));
  const scopePassed = exactSet(changedFiles, item.allowed_edit_paths);
  const mutations = new Map(
    list(state.source_changes)
      .filter((entry) => text(entry?.operation, 40).toLowerCase() === "write")
      .map((entry) => [text(entry?.path, 1200), String(entry?.content ?? "")]),
  );
  const candidateFiles = { ...item.files };
  for (const filePath of item.allowed_edit_paths) {
    if (mutations.has(filePath)) candidateFiles[filePath] = mutations.get(filePath);
  }
  const allAllowedWritesPresent = item.allowed_edit_paths.every((filePath) => mutations.has(filePath));
  return {
    case_id: item.case_id,
    candidate_files: candidateFiles,
    changed_files: changedFiles,
    scope_passed: scopePassed,
    all_allowed_writes_present: allAllowedWritesPresent,
    public_verifier_observed: publicVerifierObserved(result, item.public_verifier),
    completion_verified:
      result?.success === true &&
      text(result?.status, 80) === "completed" &&
      (result?.employee_completion?.complete === true || state?.employee_completion?.complete === true),
    final_diff_observed: Boolean(text(state.patch, 500000)),
  };
}

export async function verifyCodeAIExecutableBenchmarkResult({ benchmark_case, result } = {}) {
  const item = validateCodeAIExecutableBenchmarkCase(benchmark_case);
  const candidate = projectCodeAIExecutableBenchmarkCandidate(item, result);
  const root = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-exec-bench-"));
  try {
    for (const [filePath, content] of Object.entries(candidate.candidate_files)) {
      const absolute = path.join(root, filePath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, String(content ?? ""), "utf8");
    }
    const hiddenPath = path.join(root, ".hidden-verifier.mjs");
    await writeFile(hiddenPath, item.hidden_verifier_source, "utf8");
    const hidden = spawnSync(process.execPath, [hiddenPath], {
      cwd: root,
      env: { ...process.env, BENCHMARK_ROOT: root },
      encoding: "utf8",
      timeout: 30000,
    });
    const hiddenPassed = hidden.status === 0 && !hidden.error;
    const passed = Boolean(
      candidate.scope_passed &&
      candidate.all_allowed_writes_present &&
      candidate.public_verifier_observed &&
      candidate.completion_verified &&
      candidate.final_diff_observed &&
      hiddenPassed
    );
    return {
      contract: CODE_AI_EXECUTABLE_BENCHMARK_CONTRACT,
      case_id: item.case_id,
      passed,
      scope_passed: candidate.scope_passed,
      all_allowed_writes_present: candidate.all_allowed_writes_present,
      public_verifier_observed: candidate.public_verifier_observed,
      completion_verified: candidate.completion_verified,
      final_diff_observed: candidate.final_diff_observed,
      hidden_verifier_passed: hiddenPassed,
      hidden_verifier_exit_code: hidden.status ?? null,
      hidden_verifier_stderr: hiddenPassed ? null : text(hidden.stderr || hidden.error?.message, 1200) || null,
      candidate_test_edit_authority: false,
      hidden_expected_behavior_exposed_to_candidate: false,
      production_effect: "NONE",
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export default Object.freeze({
  contract: CODE_AI_EXECUTABLE_BENCHMARK_CONTRACT,
  validateCase: validateCodeAIExecutableBenchmarkCase,
  missionInput: executableBenchmarkMissionInput,
  projectCandidate: projectCodeAIExecutableBenchmarkCandidate,
  verifyResult: verifyCodeAIExecutableBenchmarkResult,
});
