import crypto from "node:crypto";
import { CodeWorkspaceSandboxRuntime } from "./CodeWorkspaceSandboxRuntime.js";
import { inspectCodeRepositoryIntelligence } from "./CodeRepositoryIntelligenceRuntime.js";
import {
  deleteCodeWorkspaceFiles,
  renameCodeWorkspaceFiles,
} from "./CodeWorkspaceFileMutationRuntime.js";
import {
  codeAIChangedPathsFromDiff,
  normalizeCodeAISourceChanges,
} from "./CodeAISourceChangePolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_MISSION_V1";
const MAX_OPERATIONS = 24;
const MAX_EVIDENCE_ITEMS = 120;
const MAX_FAILURES = 20;
const MAX_PATCH_CHARS = 768 * 1024;
const MAX_SOURCE_CHANGE_BYTES = 1024 * 1024;
const VALID_ACTIONS = new Set([
  "inspect",
  "search",
  "read",
  "apply_files",
  "delete_files",
  "rename_files",
  "run",
  "verify",
  "diff",
]);
const BLOCKED_MISSION_COMMANDS = new Set([
  "bash", "sh", "zsh", "fish", "env", "xargs",
  "curl", "wget", "ssh", "scp", "rsync", "psql", "vercel", "supabase",
]);

function text(value) {
  return String(value ?? "").trim();
}

function assertMissionCommand(input = {}) {
  const command = text(input.command).toLowerCase();
  if (BLOCKED_MISSION_COMMANDS.has(command)) {
    throw new Error("CODE_AI_MISSION_COMMAND_NOT_ALLOWED");
  }
  const decision = CodeWorkspaceSandboxRuntime.commandPolicy(input);
  if (!decision.allowed) throw new Error(decision.reason);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function now() {
  return new Date().toISOString();
}

function bounded(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.slice(0, 12000);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 4) return "[bounded]";
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => bounded(item, depth + 1));
  if (typeof value !== "object") return text(value).slice(0, 12000);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .filter(([, candidate]) => candidate !== undefined && typeof candidate !== "function")
      .map(([key, candidate]) => [key, bounded(candidate, depth + 1)]),
  );
}

function normalizedOperations(operations) {
  const requested = list(operations);
  if (!requested.length) throw new Error("CODE_AI_MISSION_OPERATIONS_REQUIRED");
  if (requested.length > MAX_OPERATIONS) throw new Error("CODE_AI_MISSION_OPERATION_LIMIT_EXCEEDED");
  const ids = new Set();
  return requested.map((operation, index) => {
    const action = text(operation?.action).toLowerCase();
    if (!VALID_ACTIONS.has(action)) throw new Error(`CODE_AI_MISSION_ACTION_UNSUPPORTED:${action || "missing"}`);
    const id = text(operation?.id) || `operation_${index + 1}`;
    if (ids.has(id)) throw new Error("CODE_AI_MISSION_OPERATION_IDS_MUST_BE_UNIQUE");
    ids.add(id);
    return {
      id,
      action,
      description: text(operation?.description) || `${action} repository`,
      input: object(operation?.input),
    };
  });
}

function normalizedSourceChanges(value) {
  return normalizeCodeAISourceChanges(value, {
    maxTotalWriteBytes: MAX_SOURCE_CHANGE_BYTES,
  });
}

function upsertSourceChanges(state, changes) {
  const current = new Map(
    normalizedSourceChanges(state.source_changes).map((change) => [change.path, change]),
  );
  for (const change of normalizedSourceChanges(changes)) {
    current.set(change.path, change);
  }
  state.source_changes = normalizedSourceChanges([...current.values()]);
}

function recordSourceWrites(state, files) {
  upsertSourceChanges(
    state,
    list(files).map((file) => {
      const filePath = text(file?.path);
      if (!filePath) throw new Error("CODE_AI_SOURCE_CHANGE_PATH_REQUIRED");
      return {
        path: filePath,
        operation: "write",
        content: String(file?.content ?? ""),
      };
    }),
  );
}

function recordSourceDeletes(state, paths) {
  upsertSourceChanges(
    state,
    list(paths).map((filePath) => ({
      path: text(filePath),
      operation: "delete",
      content: null,
    })),
  );
}

function recordSourceRenames(state, renamed) {
  const changes = [];
  for (const item of list(renamed)) {
    changes.push({
      path: text(item?.from_path),
      operation: "delete",
      content: null,
    });
    changes.push({
      path: text(item?.to_path),
      operation: "write",
      content: String(item?.content ?? ""),
    });
  }
  upsertSourceChanges(state, changes);
}

async function deletedPathAbsent(workspace, filePath) {
  try {
    await workspace.read({
      file_path: filePath,
      start_line: 1,
      end_line: 1,
    });
    return false;
  } catch (error) {
    if (text(error?.message).startsWith("CODE_AI_REPOSITORY_FILE_NOT_FOUND:")) {
      return true;
    }
    throw error;
  }
}

async function refreshSourceChanges(workspace, state, diff = null) {
  const snapshot = diff || await workspace.diff();
  const actualChanged = new Set(codeAIChangedPathsFromDiff(snapshot));
  const declared = normalizedSourceChanges(state.source_changes);
  const refreshed = [];

  for (const change of declared) {
    if (!actualChanged.has(change.path)) continue;
    if (change.operation === "delete") {
      if (await deletedPathAbsent(workspace, change.path)) refreshed.push(change);
      continue;
    }
    const file = await workspace.read({
      file_path: change.path,
      start_line: 1,
      end_line: 1000000,
    });
    refreshed.push({
      path: change.path,
      operation: "write",
      content: file.content,
    });
  }

  state.source_changes = normalizedSourceChanges(refreshed);
  state.files_changed = [...actualChanged];
  const declaredPaths = new Set(refreshed.map((item) => item.path));
  return {
    diff: snapshot,
    actual_changed_paths: [...actualChanged],
    declared_changed_paths: [...declaredPaths],
    unexpected_changed_paths: [...actualChanged].filter((filePath) => !declaredPaths.has(filePath)),
  };
}

function createState({ objective, repositoryUrl, ref, previous = null }) {
  const prior = object(previous);
  const createdAt = text(prior.created_at) || now();
  return {
    contract: CONTRACT,
    mission_id: text(prior.mission_id) || `code-mission-${crypto.randomUUID()}`,
    objective: text(prior.objective) || text(objective),
    repository_url: text(prior.repository_url) || text(repositoryUrl),
    ref: text(prior.ref) || text(ref) || "main",
    base_commit: text(prior.base_commit) || null,
    status: "running",
    current_operation_id: null,
    completed_operation_ids: list(prior.completed_operation_ids).map(text).filter(Boolean),
    evidence: list(prior.evidence).slice(-MAX_EVIDENCE_ITEMS),
    files_changed: list(prior.files_changed).map(text).filter(Boolean),
    source_changes: normalizedSourceChanges(prior.source_changes),
    tests: list(prior.tests).slice(-40),
    failures: list(prior.failures).slice(-MAX_FAILURES),
    repairs: list(prior.repairs).slice(-40),
    blockers: [],
    verification: list(prior.verification).slice(-40),
    patch: text(prior.patch).slice(0, MAX_PATCH_CHARS) || null,
    created_at: createdAt,
    updated_at: now(),
  };
}

function addEvidence(state, item) {
  state.evidence = [...state.evidence, { at: now(), ...bounded(item) }].slice(-MAX_EVIDENCE_ITEMS);
}

function recordFailure(state, operation, error, result = null) {
  const failure = {
    at: now(),
    operation_id: operation.id,
    action: operation.action,
    message: text(error?.message || error) || "CODE_AI_OPERATION_FAILED",
    result: bounded(result || error?.details || null),
  };
  state.failures = [...state.failures, failure].slice(-MAX_FAILURES);
  state.blockers = [failure.message];
  addEvidence(state, { kind: "failure", ...failure });
}

async function runWithoutSourceMutation(workspace, input) {
  assertMissionCommand(input);
  const before = await workspace.diff();
  const result = await workspace.run(input);
  const after = await workspace.diff();
  if (after.patch !== before.patch) {
    const error = new Error("CODE_AI_COMMAND_MUTATED_SOURCE_USE_APPLY_FILES");
    error.details = {
      command: result.command,
      args: result.args,
      before_patch_bytes: before.patch_bytes,
      after_patch_bytes: after.patch_bytes,
    };
    throw error;
  }
  return result;
}

function appendRepair(state, operation, files, metadata = {}) {
  state.repairs = [...state.repairs, {
    at: now(),
    operation_id: operation.id,
    action: operation.action,
    files: [...new Set(list(files).map(text).filter(Boolean))],
    ...bounded(metadata),
  }].slice(-40);
}

async function executeOperation(workspace, operation, state) {
  switch (operation.action) {
    case "inspect":
      return inspectCodeRepositoryIntelligence(workspace);
    case "search":
      return workspace.search(operation.input);
    case "read":
      return workspace.read(operation.input);
    case "apply_files": {
      const files = list(operation.input.files);
      const result = await workspace.applyFiles(files);
      if (!result.valid) throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT"), { details: result });
      recordSourceWrites(state, files);
      const changed = result.written.map((item) => item.path);
      state.files_changed = [...new Set([...state.files_changed, ...changed])];
      appendRepair(state, operation, changed);
      return result;
    }
    case "delete_files": {
      const paths = list(operation.input.paths);
      const result = await deleteCodeWorkspaceFiles(workspace, paths);
      if (!result.valid) throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_DELETE"), { details: result });
      const deleted = result.deleted.map((item) => item.path);
      recordSourceDeletes(state, deleted);
      state.files_changed = [...new Set([...state.files_changed, ...deleted])];
      appendRepair(state, operation, deleted, { mutation: "delete" });
      return result;
    }
    case "rename_files": {
      const result = await renameCodeWorkspaceFiles(workspace, list(operation.input.renames));
      if (!result.valid) throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_RENAME"), { details: result });
      recordSourceRenames(state, result.renamed);
      const changed = result.renamed.flatMap((item) => [item.from_path, item.to_path]);
      state.files_changed = [...new Set([...state.files_changed, ...changed])];
      appendRepair(state, operation, changed, {
        mutation: "rename",
        renames: result.renamed.map((item) => ({
          from_path: item.from_path,
          to_path: item.to_path,
        })),
      });
      return result;
    }
    case "run": {
      const result = await runWithoutSourceMutation(workspace, operation.input);
      if (result.exit_code !== 0) {
        const error = new Error(`CODE_AI_COMMAND_FAILED:${result.command}:${result.exit_code}`);
        error.details = result;
        throw error;
      }
      return result;
    }
    case "verify": {
      const result = await runWithoutSourceMutation(workspace, operation.input);
      state.tests = [...state.tests, {
        at: now(),
        operation_id: operation.id,
        command: result.command,
        args: result.args,
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
      }].slice(-40);
      state.verification = [...state.verification, {
        at: now(),
        operation_id: operation.id,
        passed: result.exit_code === 0,
      }].slice(-40);
      if (result.exit_code !== 0) {
        const error = new Error(`CODE_AI_VERIFICATION_FAILED:${result.command}:${result.exit_code}`);
        error.details = result;
        throw error;
      }
      return result;
    }
    case "diff":
      return workspace.diff();
    default:
      throw new Error(`CODE_AI_MISSION_ACTION_UNSUPPORTED:${operation.action}`);
  }
}

export async function executeCodeAIMission({
  objective,
  repository_url,
  ref = "main",
  operations,
  resume_state = null,
  timeout_ms = null,
} = {}) {
  const state = createState({
    objective,
    repositoryUrl: repository_url,
    ref,
    previous: resume_state,
  });
  if (!state.objective) throw new Error("CODE_AI_MISSION_OBJECTIVE_REQUIRED");
  if (!state.repository_url) throw new Error("CODE_AI_MISSION_REPOSITORY_REQUIRED");
  if (resume_state && text(resume_state.repository_url) !== text(repository_url || resume_state.repository_url)) {
    throw new Error("CODE_AI_MISSION_RESUME_REPOSITORY_MISMATCH");
  }
  if (resume_state && text(resume_state.ref) !== text(ref || resume_state.ref)) {
    throw new Error("CODE_AI_MISSION_RESUME_REF_MISMATCH");
  }

  const plan = normalizedOperations(operations);
  const workspace = await CodeWorkspaceSandboxRuntime.open({
    repository_url: state.repository_url,
    ref: state.ref,
    resume_patch: state.patch,
    ...(timeout_ms ? { timeout_ms } : {}),
  });

  try {
    if (state.base_commit && state.base_commit !== workspace.base_commit) {
      const previousBase = state.base_commit;
      state.base_commit = workspace.base_commit;
      const refreshed = await refreshSourceChanges(workspace, state).catch(() => null);
      if (refreshed?.diff?.patch !== undefined) state.patch = refreshed.diff.patch || null;
      state.status = "replan_required";
      state.blockers = [];
      state.current_operation_id = null;
      state.updated_at = now();
      addEvidence(state, {
        kind: "concurrency_replan",
        previous_base_commit: previousBase,
        current_base_commit: workspace.base_commit,
        resumed_patch_applied: workspace.resume.applied === true,
        actual_changed_paths: refreshed?.actual_changed_paths || [],
        unexpected_changed_paths: refreshed?.unexpected_changed_paths || [],
        reason: "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
      });
      return {
        success: false,
        status: state.status,
        state,
        reason: "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
      };
    }
    state.base_commit = workspace.base_commit;
    addEvidence(state, {
      kind: "workspace_opened",
      repository_url: state.repository_url,
      ref: state.ref,
      base_commit: state.base_commit,
      resumed_from_patch: workspace.resume.applied === true,
    });

    for (const operation of plan) {
      if (state.completed_operation_ids.includes(operation.id)) continue;
      state.current_operation_id = operation.id;
      state.updated_at = now();
      try {
        const result = await executeOperation(workspace, operation, state);
        state.completed_operation_ids = [...new Set([...state.completed_operation_ids, operation.id])];
        addEvidence(state, {
          kind: "operation",
          operation_id: operation.id,
          action: operation.action,
          description: operation.description,
          status: "completed",
          result,
        });
      } catch (error) {
        recordFailure(state, operation, error);
        const refreshed = await refreshSourceChanges(workspace, state).catch(() => null);
        if (refreshed?.diff?.patch !== undefined) state.patch = refreshed.diff.patch || null;
        if (refreshed?.unexpected_changed_paths?.length) {
          addEvidence(state, {
            kind: "undeclared_source_mutation",
            paths: refreshed.unexpected_changed_paths,
          });
        }
        state.status = operation.action === "verify" || operation.action === "run"
          ? "repair_required"
          : "blocked";
        state.updated_at = now();
        return {
          success: false,
          status: state.status,
          reason: text(error?.message || error),
          state,
          failed_operation: operation,
          evidence: bounded(error?.details || null),
        };
      }
    }

    const refreshed = await refreshSourceChanges(workspace, state);
    const finalDiff = refreshed.diff;
    state.patch = finalDiff.patch || null;
    const hasChanges = finalDiff.status.length > 0;
    const successfulVerification = state.verification.some((item) => item?.passed === true);

    if (refreshed.unexpected_changed_paths.length) {
      state.status = "repair_required";
      state.blockers = ["CODE_AI_UNDECLARED_SOURCE_MUTATION"];
    } else if (finalDiff.diff_check.exit_code !== 0) {
      state.status = "repair_required";
      state.blockers = ["CODE_AI_FINAL_DIFF_CHECK_FAILED"];
    } else if (hasChanges && !successfulVerification) {
      state.status = "verification_required";
      state.blockers = ["CODE_AI_CHANGED_FILES_REQUIRE_SUCCESSFUL_VERIFICATION"];
    } else {
      state.status = "completed";
      state.blockers = [];
      state.current_operation_id = null;
    }
    state.updated_at = now();
    addEvidence(state, {
      kind: "final_verification",
      status: state.status,
      has_changes: hasChanges,
      diff_check_exit_code: finalDiff.diff_check.exit_code,
      successful_verification: successfulVerification,
      source_change_count: state.source_changes.length,
      actual_changed_paths: refreshed.actual_changed_paths,
      unexpected_changed_paths: refreshed.unexpected_changed_paths,
      patch_bytes: finalDiff.patch_bytes,
    });

    return {
      success: state.status === "completed",
      status: state.status,
      reason: state.blockers[0] || null,
      state,
      diff: finalDiff,
    };
  } finally {
    await workspace.stop();
  }
}

export const CodeAIMissionRuntime = Object.freeze({
  contract: CONTRACT,
  max_operations: MAX_OPERATIONS,
  actions: [...VALID_ACTIONS],
  execute: executeCodeAIMission,
});
