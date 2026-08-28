export const CODE_AI_WORK_PACKAGE_CONTRACT = "AVANTIQO_CODE_AI_WORK_PACKAGE_V1";
export const CODE_AI_BATCHED_AUTONOMY_CONTRACT = "AVANTIQO_CODE_AI_BATCHED_AUTONOMY_V1";
export const CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT = "AVANTIQO_CODE_AI_WORK_PACKAGE_CONTROL_V1";

const MAX_PACKAGE_OPERATIONS = 12;
const MAX_PLANNER_OUTPUT_CHARS = 120000;
const MAX_CURRENT_SOURCE_SNAPSHOTS = 4;
const MAX_CURRENT_SOURCE_CHARS = 5000;
const ALLOWED_PACKAGE_ACTIONS = new Set([
  "search",
  "read",
  "apply_files",
  "run",
  "verify",
  "diff",
]);
const IMPLEMENTATION_ACTIONS = Object.freeze([
  "apply_files",
  "verify",
  "diff",
]);

function text(value, maximum = 120000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedObjectiveContext(value) {
  const source = object(value);
  return {
    evidence_path_1: text(source.evidence_path_1, 1000) || null,
    evidence_path_2: text(source.evidence_path_2, 1000) || null,
    evidence_path_3: text(source.evidence_path_3, 1000) || null,
    evidence_path_4: text(source.evidence_path_4, 1000) || null,
  };
}

function objectiveEvidencePaths(value) {
  const source = normalizedObjectiveContext(value);
  return [
    source.evidence_path_1,
    source.evidence_path_2,
    source.evidence_path_3,
    source.evidence_path_4,
  ].filter(Boolean);
}

function stripFence(value) {
  let raw = text(value, MAX_PLANNER_OUTPUT_CHARS);
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) raw = raw.slice(fence.length).replace(/^json\s*/i, "");
  if (raw.endsWith(fence)) raw = raw.slice(0, -fence.length).trim();
  return raw;
}

export function parseCodeAIWorkPackage(value, {
  authoritative_verification = null,
} = {}) {
  const raw = stripFence(value);
  if (!raw) throw new Error("CODE_AI_WORK_PACKAGE_OUTPUT_REQUIRED");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CODE_AI_WORK_PACKAGE_JSON_INVALID");
  }
  const packageObject = object(parsed);
  if (text(packageObject.contract, 160) !== CODE_AI_WORK_PACKAGE_CONTRACT) {
    throw new Error("CODE_AI_WORK_PACKAGE_CONTRACT_INVALID");
  }
  const rawOperations = list(packageObject.operations);
  if (!rawOperations.length) throw new Error("CODE_AI_WORK_PACKAGE_OPERATIONS_REQUIRED");
  if (rawOperations.length > MAX_PACKAGE_OPERATIONS) {
    throw new Error(`CODE_AI_WORK_PACKAGE_OPERATION_LIMIT_EXCEEDED:${rawOperations.length}`);
  }
  let operations = rawOperations.map((candidate, index) => {
    const item = object(candidate);
    const action = text(item.action, 80).toLowerCase();
    if (!ALLOWED_PACKAGE_ACTIONS.has(action)) {
      throw new Error(`CODE_AI_WORK_PACKAGE_ACTION_UNSUPPORTED:${action || "missing"}`);
    }
    return {
      action,
      description: text(item.description, 1200) || `Batched ${action}`,
      input: object(item.input),
      package_index: index + 1,
    };
  });
  const controllerNormalizations = [];
  const mutationIndexes = operations
    .map((operation, index) => operation.action === "apply_files" ? index : -1)
    .filter((index) => index >= 0);
  let verificationIndexes = operations
    .map((operation, index) => operation.action === "verify" ? index : -1)
    .filter((index) => index >= 0);
  let diffIndexes = operations
    .map((operation, index) => operation.action === "diff" ? index : -1)
    .filter((index) => index >= 0);

  if (mutationIndexes.length) {
    const lastMutation = Math.max(...mutationIndexes);
    if (!verificationIndexes.some((index) => index > lastMutation)) {
      const promotableRunIndex = operations.findIndex(
        (operation, index) => index > lastMutation && operation.action === "run",
      );
      if (promotableRunIndex >= 0) {
        operations = operations.map((operation, index) => index === promotableRunIndex
          ? {
              ...operation,
              action: "verify",
              description:
                operation.description ||
                "Deterministically promoted post-mutation command to verification.",
            }
          : operation);
        verificationIndexes = [...verificationIndexes, promotableRunIndex]
          .sort((left, right) => left - right);
        controllerNormalizations.push({
          kind: "PROMOTE_POST_MUTATION_RUN_TO_VERIFY",
          package_index: promotableRunIndex + 1,
          authorization_effect: "NONE",
        });
      } else if (authoritative_verification?.command) {
        const controllerVerifyIndex = operations.length;
        operations = [
          ...operations,
          {
            action: "verify",
            description:
              "Controller-owned authoritative verification after the model-supplied mutation.",
            input: {
              command: text(authoritative_verification.command, 300),
              args: list(authoritative_verification.args)
                .slice(0, 24)
                .map((item) => text(item, 500)),
            },
            package_index: controllerVerifyIndex + 1,
          },
        ];
        verificationIndexes = [...verificationIndexes, controllerVerifyIndex];
        controllerNormalizations.push({
          kind: "APPEND_CONTROLLER_AUTHORITATIVE_VERIFY",
          package_index: controllerVerifyIndex + 1,
          authorization_effect: "NONE",
        });
      } else {
        throw new Error("CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION");
      }
    }
    if (!verificationIndexes.some((index) => index > lastMutation)) {
      throw new Error("CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION");
    }
    if (!diffIndexes.some((index) => index > lastMutation)) {
      const controllerDiffIndex = operations.length;
      operations = [
        ...operations,
        {
          action: "diff",
          description:
            "Controller-owned final diff review after all mutation and verification work.",
          input: {},
          package_index: controllerDiffIndex + 1,
        },
      ];
      diffIndexes = [...diffIndexes, controllerDiffIndex];
      controllerNormalizations.push({
        kind: "APPEND_CONTROLLER_FINAL_DIFF",
        package_index: controllerDiffIndex + 1,
        authorization_effect: "NONE",
      });
    }
  }

  return {
    contract: CODE_AI_WORK_PACKAGE_CONTRACT,
    phase: text(packageObject.phase, 80).toLowerCase() || "engineering",
    summary: text(packageObject.summary, 2000),
    operations,
    controller_normalizations: controllerNormalizations,
  };
}

function compactOperationEvidence(entry) {
  const source = object(entry);
  const result = object(source.result);
  const action = text(source.action, 80);
  if (action === "read") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        file_path: text(result.file_path || result.path, 1000),
        start_line: result.start_line ?? null,
        end_line: result.end_line ?? null,
        total_lines: result.total_lines ?? null,
        content: text(result.content, 10000),
      },
    };
  }
  if (action === "search") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        mode: text(result.mode, 80),
        query: text(result.query, 1000),
        match_count: result.match_count ?? null,
        matches: list(result.matches).slice(0, 40).map((item) => text(item, 1200)),
      },
    };
  }
  if (action === "verify" || action === "run") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        command: text(result.command, 300),
        args: list(result.args).slice(0, 24).map((item) => text(item, 500)),
        cwd: text(result.cwd, 1000),
        exit_code: result.exit_code ?? null,
        stdout: text(result.stdout, 3000),
        stderr: text(result.stderr, 3000),
      },
    };
  }
  if (action === "diff") {
    return {
      operation_id: text(source.operation_id, 200),
      action,
      status: text(source.status, 80),
      result: {
        status: list(result.status).slice(0, 40),
        patch: text(result.patch, 12000),
        patch_bytes: result.patch_bytes ?? null,
      },
    };
  }
  return {
    operation_id: text(source.operation_id, 200),
    action,
    status: text(source.status, 80),
    result: JSON.stringify(result).slice(0, 5000),
  };
}

function compactCurrentSourceChanges(state) {
  return list(state?.source_changes)
    .slice(-MAX_CURRENT_SOURCE_SNAPSHOTS)
    .map((candidate) => {
      const change = object(candidate);
      const operation = text(change.operation, 40).toLowerCase() || "write";
      return {
        path: text(change.path, 1000),
        operation,
        content: operation === "delete"
          ? null
          : text(change.content, MAX_CURRENT_SOURCE_CHARS),
        content_truncated:
          operation === "write" &&
          String(change.content ?? "").length > MAX_CURRENT_SOURCE_CHARS,
      };
    })
    .filter((change) => change.path);
}

function latestFailedVerification(state) {
  const tests = list(state?.tests);
  const failures = list(state?.failures);
  for (let index = tests.length - 1; index >= 0; index -= 1) {
    const test = object(tests[index]);
    const exitCode = Number(test.exit_code);
    if (!Number.isFinite(exitCode) || exitCode === 0) continue;
    const operationId = text(test.operation_id, 200);
    const matchingFailure = failures
      .slice()
      .reverse()
      .find((failure) => text(failure?.operation_id, 200) === operationId);
    return {
      operation_id: operationId || null,
      command: text(test.command, 300) || null,
      args: list(test.args).slice(0, 24).map((item) => text(item, 500)),
      exit_code: exitCode,
      stdout: text(test.stdout, 3500),
      stderr: text(test.stderr, 3500),
      failure_message: text(matchingFailure?.message, 1800) || null,
    };
  }
  return null;
}

export function compactCodeAIMissionStateForPlanner(state) {
  const source = object(state);
  return {
    mission_id: text(source.mission_id, 200) || null,
    base_commit: text(source.base_commit, 160) || null,
    status: text(source.status, 100) || null,
    files_changed: list(source.files_changed).slice(-40),
    completed_operation_ids: list(source.completed_operation_ids).slice(-60),
    repository_guidance: {
      contract: text(source.repository_guidance?.contract, 160) || null,
      instructions_text: text(source.repository_guidance?.instructions_text, 5000),
      verification_commands_text: text(source.repository_guidance?.verification_commands_text, 2500),
      ci_workflows_text: text(source.repository_guidance?.ci_workflows_text, 1400),
      monorepo_summary: text(source.repository_guidance?.monorepo_summary, 800),
    },
    tests: list(source.tests).slice(-8).map((item) => ({
      operation_id: text(item?.operation_id, 200),
      command: text(item?.command, 300),
      args: list(item?.args).slice(0, 20),
      exit_code: item?.exit_code ?? null,
      stdout: text(item?.stdout, 2000),
      stderr: text(item?.stderr, 2000),
    })),
    verification: list(source.verification).slice(-8),
    failures: list(source.failures).slice(-6).map((item) => ({
      operation_id: text(item?.operation_id, 200),
      action: text(item?.action, 80),
      message: text(item?.message, 1800),
    })),
    latest_failed_verification: latestFailedVerification(source),
    current_source_changes: compactCurrentSourceChanges(source),
    patch: text(source.patch, 14000) || null,
    evidence: list(source.evidence)
      .filter((entry) => text(entry?.kind, 120) === "operation")
      .slice(-18)
      .map(compactOperationEvidence),
  };
}

export function resolveCodeAIWorkPackageActionPolicy({
  objective_context = null,
  state = null,
} = {}) {
  const compact = compactCodeAIMissionStateForPlanner(state);
  const requiredEvidencePaths = objectiveEvidencePaths(objective_context);
  const observedReadPaths = new Set(
    compact.evidence
      .filter((entry) => entry.action === "read" && entry.status === "completed")
      .map((entry) => text(entry?.result?.file_path, 1000))
      .filter(Boolean),
  );
  const allDeclaredEvidenceLoaded =
    requiredEvidencePaths.length > 0 &&
    requiredEvidencePaths.every((filePath) => observedReadPaths.has(filePath));
  const repairState =
    Boolean(compact.latest_failed_verification) ||
    compact.current_source_changes.length > 0;
  const discoveryLocked = repairState || allDeclaredEvidenceLoaded;
  return {
    discovery_locked: discoveryLocked,
    repair_state: repairState,
    all_declared_evidence_loaded: allDeclaredEvidenceLoaded,
    declared_evidence_paths: requiredEvidencePaths,
    observed_read_paths: [...observedReadPaths],
    allowed_actions: discoveryLocked
      ? [...IMPLEMENTATION_ACTIONS]
      : [...ALLOWED_PACKAGE_ACTIONS],
  };
}

export const CodeAIWorkPackageCoreRuntime = Object.freeze({
  contract: CODE_AI_BATCHED_AUTONOMY_CONTRACT,
  work_package_contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  control_contract: CODE_AI_WORK_PACKAGE_CONTROL_CONTRACT,
  max_package_operations: MAX_PACKAGE_OPERATIONS,
  allowed_package_actions: [...ALLOWED_PACKAGE_ACTIONS],
  implementation_actions: [...IMPLEMENTATION_ACTIONS],
  parse: parseCodeAIWorkPackage,
  compactStateForPlanner: compactCodeAIMissionStateForPlanner,
  resolveActionPolicy: resolveCodeAIWorkPackageActionPolicy,
});

export default CodeAIWorkPackageCoreRuntime;
