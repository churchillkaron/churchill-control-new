import path from "node:path";
import { CodeWorkspaceSandboxRuntime } from "./CodeWorkspaceSandboxRuntime.js";

export const CODE_WORKSPACE_FILE_MUTATION_CONTRACT =
  "AVANTIQO_CODE_WORKSPACE_FILE_MUTATION_V1";

const MAX_MUTATIONS = 30;
const REPOSITORY_ROOT = CodeWorkspaceSandboxRuntime.repository_root;

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function assertWorkspace(workspace) {
  if (!workspace?.sandbox || !workspace?.read) {
    throw new Error("CODE_AI_MUTATION_WORKSPACE_REQUIRED");
  }
}

function assertRelativePath(value) {
  const candidate = text(value).replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || candidate.includes("\0")) {
    throw new Error("CODE_AI_REPOSITORY_PATH_INVALID");
  }
  const normalized = path.posix.normalize(candidate);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("CODE_AI_REPOSITORY_PATH_INVALID");
  }
  if (normalized === ".git" || normalized.startsWith(".git/")) {
    throw new Error("CODE_AI_GIT_METADATA_WRITE_BLOCKED");
  }
  if (/^\.env(?:\.|$)/i.test(normalized) || /\/(?:\.env)(?:\.|$)/i.test(normalized)) {
    throw new Error("CODE_AI_ENV_FILE_WRITE_BLOCKED");
  }
  return normalized;
}

async function commandOutput(result, field) {
  const candidate = result?.[field];
  const value = typeof candidate === "function" ? await candidate.call(result) : candidate;
  return String(value ?? "");
}

async function runIntentional(workspace, command, args = []) {
  assertWorkspace(workspace);
  const result = await workspace.sandbox.runCommand({
    cmd: command,
    args: args.map((item) => String(item ?? "")),
    cwd: REPOSITORY_ROOT,
  });
  const exitCode = Number(result?.exitCode);
  if (!Number.isFinite(exitCode)) {
    throw new Error("CODE_AI_MUTATION_COMMAND_EXIT_CODE_MISSING");
  }
  return {
    command,
    args,
    exit_code: exitCode,
    stdout: await commandOutput(result, "stdout"),
    stderr: await commandOutput(result, "stderr"),
  };
}

async function pathPresence(workspace, filePath) {
  const result = await runIntentional(workspace, "git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    filePath,
  ]);
  if (result.exit_code !== 0) {
    const error = new Error(`CODE_AI_FILE_PRESENCE_CHECK_FAILED:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  return result.stdout
    .split("\n")
    .map((item) => text(item))
    .filter(Boolean)
    .includes(filePath);
}

async function requireExistingPath(workspace, filePath) {
  if (!(await pathPresence(workspace, filePath))) {
    throw new Error(`CODE_AI_MUTATION_SOURCE_NOT_FOUND:${filePath}`);
  }
}

async function requireAbsentPath(workspace, filePath) {
  if (await pathPresence(workspace, filePath)) {
    throw new Error(`CODE_AI_RENAME_DESTINATION_EXISTS:${filePath}`);
  }
}

async function diffCheck(workspace) {
  return runIntentional(workspace, "git", ["diff", "--check"]);
}

export async function deleteCodeWorkspaceFiles(workspace, paths = []) {
  assertWorkspace(workspace);
  const requested = list(paths).map(assertRelativePath);
  if (!requested.length) throw new Error("CODE_AI_DELETE_FILES_REQUIRED");
  if (requested.length > MAX_MUTATIONS) {
    throw new Error("CODE_AI_FILE_CHANGE_LIMIT_EXCEEDED");
  }
  if (new Set(requested).size !== requested.length) {
    throw new Error("CODE_AI_DELETE_DUPLICATE_PATH");
  }

  for (const filePath of requested) await requireExistingPath(workspace, filePath);
  for (const filePath of requested) {
    const result = await runIntentional(workspace, "rm", ["--", filePath]);
    if (result.exit_code !== 0) {
      const error = new Error(`CODE_AI_FILE_DELETE_FAILED:${filePath}:${result.exit_code}`);
      error.details = result;
      throw error;
    }
  }

  const check = await diffCheck(workspace);
  return {
    contract: CODE_WORKSPACE_FILE_MUTATION_CONTRACT,
    mutation: "delete",
    deleted: requested.map((filePath) => ({ path: filePath })),
    diff_check: check,
    valid: check.exit_code === 0,
  };
}

export async function renameCodeWorkspaceFiles(workspace, renames = []) {
  assertWorkspace(workspace);
  const requested = list(renames).map((item) => ({
    from_path: assertRelativePath(item?.from_path),
    to_path: assertRelativePath(item?.to_path),
  }));
  if (!requested.length) throw new Error("CODE_AI_RENAME_FILES_REQUIRED");
  if (requested.length > MAX_MUTATIONS) {
    throw new Error("CODE_AI_FILE_CHANGE_LIMIT_EXCEEDED");
  }

  const allPaths = [];
  for (const item of requested) {
    if (item.from_path === item.to_path) throw new Error("CODE_AI_RENAME_PATHS_MUST_DIFFER");
    allPaths.push(item.from_path, item.to_path);
  }
  if (new Set(allPaths).size !== allPaths.length) {
    throw new Error("CODE_AI_RENAME_PATH_COLLISION");
  }

  for (const item of requested) {
    await requireExistingPath(workspace, item.from_path);
    await requireAbsentPath(workspace, item.to_path);
  }

  const renamed = [];
  for (const item of requested) {
    const parent = path.posix.dirname(item.to_path);
    if (parent && parent !== ".") {
      const mkdir = await runIntentional(workspace, "mkdir", ["-p", "--", parent]);
      if (mkdir.exit_code !== 0) {
        const error = new Error(`CODE_AI_RENAME_PARENT_CREATE_FAILED:${parent}:${mkdir.exit_code}`);
        error.details = mkdir;
        throw error;
      }
    }
    const move = await runIntentional(workspace, "mv", ["--", item.from_path, item.to_path]);
    if (move.exit_code !== 0) {
      const error = new Error(
        `CODE_AI_FILE_RENAME_FAILED:${item.from_path}:${item.to_path}:${move.exit_code}`,
      );
      error.details = move;
      throw error;
    }
    const destination = await workspace.read({
      file_path: item.to_path,
      start_line: 1,
      end_line: 1000000,
    });
    renamed.push({
      from_path: item.from_path,
      to_path: item.to_path,
      content: destination.content,
    });
  }

  const check = await diffCheck(workspace);
  return {
    contract: CODE_WORKSPACE_FILE_MUTATION_CONTRACT,
    mutation: "rename",
    renamed,
    diff_check: check,
    valid: check.exit_code === 0,
  };
}

export const CodeWorkspaceFileMutationRuntime = Object.freeze({
  contract: CODE_WORKSPACE_FILE_MUTATION_CONTRACT,
  deleteFiles: deleteCodeWorkspaceFiles,
  renameFiles: renameCodeWorkspaceFiles,
});

export default CodeWorkspaceFileMutationRuntime;
