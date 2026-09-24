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
  "record_reproduction",
  "record_hypotheses",
  "record_database_review",
  "record_security_review",
  "record_performance_evidence",
  "record_observability_evidence",
  "record_precision_evidence",
  "history",
  "precision_analyze",
  "mutation_test",
  "coverage_test",
  "fuzz_test",
  "apply_files",
  "replace_range",
  "run",
  "verify",
  "browser_verify",
  "diff",
]);
const IMPLEMENTATION_ACTIONS = Object.freeze([
  "apply_files",
  "replace_range",
  "verify",
  "browser_verify",
  "diff",
]);
const PRE_EDIT_INSPECTION_ACTIONS = Object.freeze([
  "search",
  "read",
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
    pre_edit_inspection_paths: list(source.pre_edit_inspection_paths)
      .slice(0, 4)
      .map((item) => text(item, 1000))
      .filter(Boolean),
    allowed_edit_paths: list(source.allowed_edit_paths)
      .slice(0, 80)
      .map((item) => text(item, 1000))
      .filter(Boolean),
    implementation_required: source.implementation_required === true,
    test_runtime_guidance: text(source.test_runtime_guidance, 2400) || null,
    adaptive_reasoning_budget_applied: source.adaptive_reasoning_budget_applied === true,
    owner_objective: text(source.owner_objective, 12000) || null,
    owner_constraints: list(source.owner_constraints).slice(-8).map((item) => text(item, 500)).filter(Boolean),
    workspace_target: text(source.workspace_target, 80).toUpperCase() || null,
    device_id: text(source.device_id, 160) || null,
    organization_id: text(source.organization_id, 200) || null,
  };
}

function objectiveRequiresImplementation(value) {
  const source = normalizedObjectiveContext(value);
  const objective = text(source.owner_objective, 12000).toLowerCase();
  if (!objective) return source.implementation_required === true;
  const explicitlyReadOnly =
    /\bread[- ]?only\b|\bmake no (?:source )?changes\b|\bno source changes\b|\bwithout (?:source )?changes\b|\b(?:do not|don't) modify (?:the )?(?:source|repository|code|files?|anything)\b/.test(objective);
  if (explicitlyReadOnly) return false;
  return source.implementation_required === true ||
    /\b(?:fix|repair|implement|change|edit|refactor|update|modify|add|remove|replace|create|build)\b/.test(objective);
}

function objectiveEvidencePaths(value) {
  const source = normalizedObjectiveContext(value);
  return [
    source.evidence_path_1,
    source.evidence_path_2,
    source.evidence_path_3,
    source.evidence_path_4,
    ...list(source.pre_edit_inspection_paths),
  ].filter(Boolean);
}

function stripFence(value) {
  let raw = text(value, MAX_PLANNER_OUTPUT_CHARS);
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) raw = raw.slice(fence.length).replace(/^json\s*/i, "");
  if (raw.endsWith(fence)) raw = raw.slice(0, -fence.length).trim();
  return raw;
}

function balancedJsonObjectCandidates(value) {
  const raw = text(value, MAX_PLANNER_OUTPUT_CHARS);
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== "}" || depth === 0) continue;

    depth -= 1;
    if (depth !== 0 || start < 0) continue;
    const candidate = raw.slice(start, index + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push({ raw: candidate, parsed });
      }
    } catch {
      // A balanced brace envelope is not enough. Never repair malformed JSON.
    }
    start = -1;
  }

  return candidates;
}

function repairMalformedApplyFilesFileBoundary(value) {
  const raw = text(value, MAX_PLANNER_OUTPUT_CHARS);
  const repaired = raw
    .replace(/"\}\},(\s*)\{"path"/g, '"},$1{"path"')
    .replace(/"\}\},(\s*)\{"action"/g, '"}]}},$1{"action"')
    .replace(/"\}\]\},(\s*)\{"action"/g, '"}]}},$1{"action"')
    .replace(
      /\],"verification":\{"command":"([^"\\]+)","args":(\[[^\]]*\])\},"diff":\{\}\}$/,
      ']}} ,{"action":"verify","description":"verify","input":{"command":"$1","args":$2}},{"action":"diff","description":"review diff","input":{}}]}'.replace(']}} ,', ']}} ,').replace(']}} ,', ']}} ,'),
    )
    .replace(/\},(\s*)"diff":\{"description":/g, '},$1{"action":"diff","description":')
    .replace(/"\}\]\}\]\}$/, '"}]}}]}');
  return repaired === raw ? null : repaired;
}

function structurallyValidOperation(operation) {
  const item = object(operation);
  const action = text(item.action, 80).toLowerCase();
  const input = object(item.input);
  if (!ALLOWED_PACKAGE_ACTIONS.has(action)) return false;

  if (action === "apply_files") {
    if ("file_path" in input || "patch" in input || "diff" in input || "start_line" in input || "end_line" in input) {
      return false;
    }
    const files = list(input.files);
    return files.length > 0 && files.every((file) => {
      const candidate = object(file);
      return Boolean(text(candidate.path, 1000)) && typeof candidate.content === "string";
    });
  }
  if (action === "replace_range") {
    const startLine = Number(input.start_line);
    const endLine = Number(input.end_line);
    return Boolean(text(input.file_path || input.path, 1000)) &&
      Number.isInteger(startLine) &&
      startLine >= 1 &&
      Number.isInteger(endLine) &&
      endLine >= startLine &&
      typeof input.expected === "string" &&
      typeof input.replacement === "string";
  }
  if (action === "verify" || action === "run") {
    const command = text(input.command, 300);
    if (!command) return false;
    if (!("env" in input)) return true;
    const env = object(input.env);
    const entries = Object.entries(env);
    const args = list(input.args).map((item) => text(item, 1200));
    return command.toLowerCase() === "npm" &&
      args.length === 2 &&
      args[0] === "run" &&
      args[1] === "build" &&
      entries.length === 1 &&
      entries[0][0] === "AVANTIQO_NEXT_DIST_DIR" &&
      entries[0][1] === ".next-code-verify";
  }
  if (action === "read") {
    return Boolean(text(input.file_path || input.path, 1000));
  }
  if (action === "search") {
    return Boolean(
      text(input.query || input.pattern || input.search, 1000) ||
      list(input.paths).length ||
      list(input.path_globs).length
    );
  }
  if (action === "browser_verify") {
    return Boolean(text(input.url, 2000));
  }
  return true;
}

function executableShapeWorkPackageCandidate(value) {
  const candidate = object(value);
  if (text(candidate.contract, 160) !== CODE_AI_WORK_PACKAGE_CONTRACT) return false;
  const operations = list(candidate.operations);
  if (!operations.length) return false;
  return operations.every(structurallyValidOperation);
}

function structurallyValidWorkPackageCandidate(value) {
  const candidate = object(value);
  const operations = list(candidate.operations);
  return executableShapeWorkPackageCandidate(candidate) && operations.length <= MAX_PACKAGE_OPERATIONS;
}

function parsePlannerOutputJson(value) {
  const raw = stripFence(value);
  if (!raw) throw new Error("CODE_AI_WORK_PACKAGE_OUTPUT_REQUIRED");
  try {
    return {
      parsed: JSON.parse(raw),
      json_envelope_extracted: false,
    };
  } catch {
    const repairedBoundary = repairMalformedApplyFilesFileBoundary(raw);
    if (repairedBoundary) {
      try {
        return {
          parsed: JSON.parse(repairedBoundary),
          json_envelope_extracted: false,
          json_apply_files_boundary_repaired: true,
        };
      } catch {
        if (repairedBoundary.endsWith("}}")) {
          const oneBraceTrimmed = repairedBoundary.slice(0, -1);
          try {
            return {
              parsed: JSON.parse(oneBraceTrimmed),
              json_envelope_extracted: false,
              json_apply_files_boundary_repaired: true,
              json_trailing_extra_brace_repaired: true,
            };
          } catch {
            // Continue only with deterministic extraction of an already-valid object.
          }
        }
      }
    }
  }

  const candidates = balancedJsonObjectCandidates(raw);
  if (!candidates.length) throw new Error("CODE_AI_WORK_PACKAGE_JSON_INVALID");
  if (candidates.length === 1) {
    return {
      parsed: candidates[0].parsed,
      json_envelope_extracted: true,
    };
  }

  const contracted = candidates.filter(
    (candidate) =>
      text(object(candidate.parsed).contract, 160) === CODE_AI_WORK_PACKAGE_CONTRACT,
  );
  if (contracted.length === 1) {
    return {
      parsed: contracted[0].parsed,
      json_envelope_extracted: true,
    };
  }

  if (contracted.length >= 1) {
    const executableShape = contracted.filter((candidate) =>
      executableShapeWorkPackageCandidate(candidate.parsed),
    );
    const structurallyValid = executableShape.filter((candidate) =>
      structurallyValidWorkPackageCandidate(candidate.parsed),
    );
    const selected = executableShape.at(-1) || contracted.at(-1);
    return {
      parsed: selected.parsed,
      json_envelope_extracted: true,
      json_ambiguity_resolved_by_latest_executable_contract_package:
        contracted.length > 1 && executableShape.length > 0,
      json_contract_candidate_count: contracted.length,
      json_executable_candidate_count: executableShape.length,
      json_valid_candidate_count: structurallyValid.length,
      json_selected_contract_candidate_structurally_valid:
        structurallyValidWorkPackageCandidate(selected.parsed),
    };
  }

  throw new Error("CODE_AI_WORK_PACKAGE_JSON_AMBIGUOUS");
}

export function parseCodeAIWorkPackage(value, {
  authoritative_verification = null,
} = {}) {
  const {
    parsed,
    json_envelope_extracted: jsonEnvelopeExtracted,
  } = parsePlannerOutputJson(value);
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
  if (!operations
    .filter((operation) => operation.action !== "apply_files")
    .every(structurallyValidOperation)) {
    throw new Error("CODE_AI_WORK_PACKAGE_OPERATION_CONTRACT_INVALID");
  }
  for (const operation of operations) {
    if (operation.action !== "apply_files") continue;
    const input = object(operation.input);
    const forbiddenPatchShape =
      "file_path" in input ||
      "patch" in input ||
      "diff" in input ||
      "start_line" in input ||
      "end_line" in input;
    const files = list(input.files);
    const validFiles =
      files.length > 0 &&
      files.every((file) => {
        const candidate = object(file);
        return Boolean(text(candidate.path, 1000)) &&
          typeof candidate.content === "string";
      });
    if (forbiddenPatchShape || !validFiles) {
      throw new Error("CODE_AI_WORK_PACKAGE_APPLY_FILES_CONTRACT_INVALID");
    }
  }

  const controllerNormalizations = [];
  if (jsonEnvelopeExtracted) {
    controllerNormalizations.push({
      kind: "EXTRACT_SINGLE_VALID_JSON_OBJECT_ENVELOPE",
      authorization_effect: "NONE",
      source_repair_performed: false,
    });
  }
  const mutationIndexes = operations
    .map((operation, index) => ["apply_files", "replace_range"].includes(operation.action) ? index : -1)
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
        content_bytes: result.content_bytes ?? null,
        content_sha256: text(result.content_sha256, 80) || null,
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
    if (!Number.isFinite(exitCode)) continue;
    if (exitCode === 0) return null;
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

function allCompletedReadEvidence(state) {
  const source = object(state);
  return [...list(source.source_read_evidence), ...list(source.evidence)]
    .filter((entry) => text(entry?.kind, 120) === "operation")
    .filter((entry) => text(entry?.action, 80) === "read")
    .filter((entry) => text(entry?.status, 80) === "completed");
}

function completedReadPaths(state) {
  return new Set(
    allCompletedReadEvidence(state)
      .map((entry) => text(entry?.result?.file_path || entry?.result?.path, 1000))
      .filter(Boolean),
  );
}

function compactDeclaredEvidenceReads(state) {
  const required = new Set(objectiveEvidencePaths(state?.objective_context));
  if (!required.size) return [];
  const latestByPath = new Map();
  for (const entry of allCompletedReadEvidence(state)) {
    const filePath = text(entry?.result?.file_path || entry?.result?.path, 1000);
    if (required.has(filePath)) latestByPath.set(filePath, entry);
  }
  return [...latestByPath.values()].map(compactOperationEvidence);
}

function controllerOwnedFinalizationIndexes(workPackage) {
  return new Set(
    list(workPackage?.controller_normalizations)
      .filter((entry) => [
        "APPEND_CONTROLLER_AUTHORITATIVE_VERIFY",
        "APPEND_CONTROLLER_FINAL_DIFF",
      ].includes(text(entry?.kind, 120)))
      .map((entry) => Number(entry?.package_index))
      .filter((index) => Number.isInteger(index) && index > 0),
  );
}

export function codeAIWorkPackageModelOperationCount(workPackage) {
  const controllerOwnedIndexes = controllerOwnedFinalizationIndexes(workPackage);
  return list(workPackage?.operations)
    .filter((operation) => !controllerOwnedIndexes.has(Number(operation?.package_index)))
    .length;
}

export function codeAIWorkPackageForbiddenModelActions(workPackage, allowedActions = []) {
  const allowed = new Set(list(allowedActions).map((action) => text(action, 80)).filter(Boolean));
  const controllerOwnedIndexes = controllerOwnedFinalizationIndexes(workPackage);
  return [...new Set(
    list(workPackage?.operations)
      .filter((operation) =>
        !allowed.has(text(operation?.action, 80)) &&
        !controllerOwnedIndexes.has(Number(operation?.package_index))
      )
      .map((operation) => text(operation?.action, 80))
      .filter(Boolean),
  )];
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
      result: item?.result && typeof item.result === "object"
        ? {
            requested_path: text(item.result?.requested_path, 1000) || null,
            candidate_paths: list(item.result?.candidate_paths).map((value) => text(value, 1000)).filter(Boolean).slice(0, 12),
            candidate_count: Number(item.result?.candidate_count || 0),
            original_reason: text(item.result?.original_reason, 1200) || null,
          }
        : null,
    })),
    latest_failed_verification: latestFailedVerification(source),
    current_source_changes: compactCurrentSourceChanges(source),
    declared_evidence_reads: compactDeclaredEvidenceReads(source),
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
  const normalizedContext = normalizedObjectiveContext(objective_context);
  const deviceBrowserAllowed = normalizedContext.workspace_target === "DEVICE" && Boolean(normalizedContext.device_id);
  const packageActions = [...ALLOWED_PACKAGE_ACTIONS].filter((action) => action !== "browser_verify" || deviceBrowserAllowed);
  const implementationActions = [...IMPLEMENTATION_ACTIONS].filter((action) => action !== "browser_verify" || deviceBrowserAllowed);
  const requiredEvidencePaths = objectiveEvidencePaths(objective_context);
  const observedReadPaths = completedReadPaths(state);
  const allDeclaredEvidenceLoaded =
    requiredEvidencePaths.length > 0 &&
    requiredEvidencePaths.every((filePath) => observedReadPaths.has(filePath));
  const preEditInspectionPaths = list(normalizedContext.pre_edit_inspection_paths);
  const preEditInspectionRequired = preEditInspectionPaths.length > 0;
  const preEditInspectionLoaded =
    !preEditInspectionRequired ||
    preEditInspectionPaths.every((filePath) => observedReadPaths.has(filePath));
  const missionOwnedMutation = list(state?.evidence).some((entry) =>
    text(entry?.kind, 120) === "operation" &&
    text(entry?.status, 80) === "completed" &&
    ["apply_files", "replace_range", "delete_files", "rename_files"].includes(text(entry?.action, 80))
  );
  const implementationPresent =
    missionOwnedMutation && compact.current_source_changes.length > 0;
  const verificationFailed = Boolean(compact.latest_failed_verification);
  const declaredEvidenceRequired = requiredEvidencePaths.length > 0;
  const mutationBlockedByDeclaredEvidence =
    declaredEvidenceRequired && !allDeclaredEvidenceLoaded && !implementationPresent;
  const implementationRequired =
    objectiveRequiresImplementation(normalizedContext) ||
    verificationFailed ||
    (allDeclaredEvidenceLoaded && !implementationPresent);
  const explicitTargetPaths = list(normalizedContext.allowed_edit_paths);
  const explicitTargetsLoaded =
    explicitTargetPaths.length > 0 &&
    explicitTargetPaths.every((filePath) => observedReadPaths.has(filePath));
  const implementationEvidenceReady =
    implementationRequired &&
    explicitTargetsLoaded &&
    preEditInspectionLoaded;
  const repairState = verificationFailed;
  const discoveryLocked =
    repairState ||
    implementationPresent ||
    allDeclaredEvidenceLoaded ||
    implementationEvidenceReady;
  const mutationFirstRequired =
    !implementationPresent &&
    implementationRequired &&
    preEditInspectionLoaded &&
    (implementationEvidenceReady || allDeclaredEvidenceLoaded);
  return {
    discovery_locked: discoveryLocked,
    repair_state: repairState,
    implementation_present: implementationPresent,
    verification_failed: verificationFailed,
    implementation_required: implementationRequired,
    all_declared_evidence_loaded: allDeclaredEvidenceLoaded,
    pre_edit_inspection_required: preEditInspectionRequired,
    pre_edit_inspection_loaded: preEditInspectionLoaded,
    pre_edit_inspection_paths: preEditInspectionPaths,
    explicit_target_paths: explicitTargetPaths,
    explicit_targets_loaded: explicitTargetsLoaded,
    implementation_evidence_ready: implementationEvidenceReady,
    mutation_first_required: mutationFirstRequired,
    mutation_blocked_by_declared_evidence: mutationBlockedByDeclaredEvidence,
    mutation_blocked_by_pre_edit_inspection:
      preEditInspectionRequired && !preEditInspectionLoaded && !implementationPresent,
    declared_evidence_paths: requiredEvidencePaths,
    observed_read_paths: [...observedReadPaths],
    observed_read_source: "FULL_SERVER_OWNED_MISSION_EVIDENCE",
    declared_evidence_prompt_source: "DURABLE_COMPACT_DECLARED_READS",
    allowed_actions:
      mutationBlockedByDeclaredEvidence ||
      (preEditInspectionRequired && !preEditInspectionLoaded && !implementationPresent)
        ? [...PRE_EDIT_INSPECTION_ACTIONS]
        : mutationFirstRequired
          ? ["apply_files", "replace_range"]
          : discoveryLocked
            ? implementationActions
            : packageActions,
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
