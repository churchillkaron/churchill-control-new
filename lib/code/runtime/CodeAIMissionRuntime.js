import crypto from "node:crypto";
import { CodeWorkspaceSandboxRuntime } from "./CodeWorkspaceSandboxRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_MISSION_V1";
const MAX_OPERATIONS = 24;
const MAX_EVIDENCE_ITEMS = 120;
const MAX_FAILURES = 20;
const MAX_PATCH_CHARS = 768 * 1024;
const MAX_SOURCE_CHANGE_BYTES = 1024 * 1024;
const VALID_ACTIONS = new Set(["inspect", "search", "read", "apply_files", "run", "verify", "diff"]);
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
  const changes = list(value).map((change) => ({
    path: text(change?.path),
    content: String(change?.content ?? ""),
  })).filter((change) => change.path);
  const totalBytes = changes.reduce((sum, change) => sum + Buffer.byteLength(change.content, "utf8"), 0);
  if (totalBytes > MAX_SOURCE_CHANGE_BYTES) throw new Error("CODE_AI_SOURCE_CHANGE_STATE_TOO_LARGE");
  return changes;
}

function recordSourceChanges(state, files) {
  const current = new Map(normalizedSourceChanges(state.source_changes).map((change) => [change.path, change]));
  for (const file of list(files)) {
    const path = text(file?.path);
    if (!path) throw new Error("CODE_AI_SOURCE_CHANGE_PATH_REQUIRED");
    current.set(path, { path, content: String(file?.content ?? "") });
  }
  state.source_changes = normalizedSourceChanges([...current.values()]);
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

async function executeOperation(workspace, operation, state) {
  switch (operation.action) {
    case "inspect":
      return workspace.inspect();
    case "search":
      return workspace.search(operation.input);
    case "read":
      return workspace.read(operation.input);
    case "apply_files": {
      const files = list(operation.input.files);
      const result = await workspace.applyFiles(files);
      if (!result.valid) throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT"), { details: result });
      recordSourceChanges(state, files);
      state.files_changed = [...new Set([...state.files_changed, ...result.written.map((item) => item.path)])];
      state.repairs = [...state.repairs, {
        at: now(),
        operation_id: operation.id,
        files: result.written.map((item) => item.path),
      }].slice(-40);
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
      state.status = "blocked";
      state.blockers = ["CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED"];
      addEvidence(state, {
        kind: "concurrency_guard",
        expected_base_commit: state.base_commit,
        actual_base_commit: workspace.base_commit,
      });
      return { success: false, status: state.status, state, reason: state.blockers[0] };
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
        const diff = await workspace.diff().catch(() => null);
        if (diff?.patch !== undefined) state.patch = diff.patch || null;
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

    const finalDiff = await workspace.diff();
    state.patch = finalDiff.patch || null;
    state.files_changed = [...new Set([
      ...state.files_changed,
      ...finalDiff.status.map((line) => text(line).slice(3)).filter(Boolean),
    ])];
    const hasChanges = finalDiff.status.length > 0;
    const successfulVerification = state.verification.some((item) => item?.passed === true);

    if (finalDiff.diff_check.exit_code !== 0) {
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
