import path from "node:path";
import { Sandbox } from "@vercel/sandbox";

const CONTRACT = "AVANTIQO_CODE_WORKSPACE_SANDBOX_V1";
const WORKSPACE_ROOT = "/tmp/avantiqo-code-workspace";
const REPOSITORY_ROOT = `${WORKSPACE_ROOT}/repo`;
const RESUME_PATCH = `${WORKSPACE_ROOT}/resume.patch`;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const MAX_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_OUTPUT_CHARS = 40000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PATCH_BYTES = 768 * 1024;
const MAX_SEARCH_RESULTS = 250;

const BLOCKED_TOP_LEVEL_COMMANDS = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "psql",
  "bash",
  "sh",
  "zsh",
  "fish",
  "env",
  "xargs",
  "vercel",
  "supabase",
]);

const DANGEROUS_TOKENS = [
  "deploy",
  "publish",
  "release",
  "production",
  "prod",
  "db:push",
  "db push",
  "migrate:up",
  "migration:up",
  "remote set-url",
];

function text(value) {
  return String(value ?? "").trim();
}

function integer(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function boundedText(value, maximum = MAX_OUTPUT_CHARS) {
  const output = String(value ?? "");
  if (output.length <= maximum) return output;
  return `${output.slice(0, maximum)}\n...[truncated ${output.length - maximum} chars]`;
}

function normalizedTimeout(value) {
  const requested = integer(value, DEFAULT_TIMEOUT_MS);
  return Math.max(30000, Math.min(MAX_TIMEOUT_MS, requested));
}

function assertRepositoryUrl(value) {
  const repositoryUrl = text(value).replace(/\.git$/i, "");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/i.test(repositoryUrl)) {
    throw new Error("CODE_AI_GITHUB_REPOSITORY_URL_REQUIRED");
  }
  return repositoryUrl;
}

function assertGitRef(value) {
  const ref = text(value) || "main";
  if (ref.length > 160 || ref.startsWith("-") || /[\s~^:?*\[\\\]]/.test(ref) || ref.includes("..")) {
    throw new Error("CODE_AI_GIT_REF_INVALID");
  }
  return ref;
}

function assertRelativePath(value) {
  const candidate = text(value).replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || candidate.includes("\0")) {
    throw new Error("CODE_AI_REPOSITORY_PATH_INVALID");
  }
  const normalized = path.posix.normalize(candidate);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
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

function normalizedArgs(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 80) throw new Error("CODE_AI_COMMAND_ARGUMENT_LIMIT_EXCEEDED");
  return value.map((item) => String(item ?? "")).map((item) => {
    if (item.length > 4000) throw new Error("CODE_AI_COMMAND_ARGUMENT_TOO_LONG");
    return item;
  });
}

function dangerousCommandReason(command, args) {
  const cmd = text(command).toLowerCase();
  const normalized = normalizedArgs(args);
  if (!cmd) return "CODE_AI_COMMAND_REQUIRED";
  if (BLOCKED_TOP_LEVEL_COMMANDS.has(cmd)) return "CODE_AI_EXTERNAL_SIDE_EFFECT_COMMAND_BLOCKED";

  const joined = `${cmd} ${normalized.join(" ")}`.toLowerCase();
  if (cmd === "git" && normalized.some((item) => item.toLowerCase() === "push")) {
    return "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME";
  }
  if (cmd === "git" && normalized.some((item) => item.toLowerCase() === "clean")) {
    return "CODE_AI_DESTRUCTIVE_GIT_COMMAND_BLOCKED";
  }
  if (cmd === "npm" && normalized.some((item) => item.toLowerCase() === "publish")) {
    return "CODE_AI_PACKAGE_PUBLISH_BLOCKED";
  }
  if (["npx", "npm", "pnpm", "yarn", "bun"].includes(cmd)) {
    if (normalized.some((item) => ["vercel", "supabase"].includes(item.toLowerCase()))) {
      return "CODE_AI_DEPLOYMENT_OR_DATABASE_TOOL_BLOCKED";
    }
  }
  if (DANGEROUS_TOKENS.some((token) => joined.includes(token))) {
    return "CODE_AI_DANGEROUS_COMMAND_REQUIRES_GOVERNED_RUNTIME";
  }
  return null;
}

async function output(result, field) {
  const candidate = result?.[field];
  const value = typeof candidate === "function" ? await candidate.call(result) : candidate;
  return boundedText(value);
}

async function runDirect(sandbox, command, args = [], cwd = REPOSITORY_ROOT) {
  const result = await sandbox.runCommand({
    cmd: text(command),
    args: normalizedArgs(args),
    ...(text(cwd) ? { cwd: text(cwd) } : {}),
  });
  const exitCode = Number(result?.exitCode);
  if (!Number.isFinite(exitCode)) throw new Error("CODE_AI_SANDBOX_COMMAND_EXIT_CODE_MISSING");
  return {
    command: text(command),
    args: normalizedArgs(args),
    cwd: text(cwd) || null,
    exit_code: exitCode,
    stdout: await output(result, "stdout"),
    stderr: await output(result, "stderr"),
  };
}

async function runRequired(sandbox, command, args = [], cwd = REPOSITORY_ROOT, prefix = "CODE_AI_COMMAND_FAILED") {
  const result = await runDirect(sandbox, command, args, cwd);
  if (result.exit_code !== 0) {
    const error = new Error(`${prefix}:${command}:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  return result;
}

async function writeWorkspaceFile(sandbox, repositoryPath, content) {
  const relativePath = assertRelativePath(repositoryPath);
  const buffer = Buffer.from(String(content ?? ""), "utf8");
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("CODE_AI_FILE_WRITE_TOO_LARGE");
  await sandbox.writeFiles([{ path: `${REPOSITORY_ROOT}/${relativePath}`, content: buffer }]);
  return { path: relativePath, bytes: buffer.byteLength };
}

async function applyPatch(sandbox, patchText) {
  const patch = String(patchText ?? "");
  if (!patch.trim()) return { applied: false };
  if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) {
    throw new Error("CODE_AI_RESUME_PATCH_TOO_LARGE");
  }
  await sandbox.writeFiles([{ path: RESUME_PATCH, content: Buffer.from(patch, "utf8") }]);
  await runRequired(sandbox, "git", ["apply", "--check", RESUME_PATCH], REPOSITORY_ROOT, "CODE_AI_RESUME_PATCH_CHECK_FAILED");
  await runRequired(sandbox, "git", ["apply", RESUME_PATCH], REPOSITORY_ROOT, "CODE_AI_RESUME_PATCH_APPLY_FAILED");
  return { applied: true, bytes: Buffer.byteLength(patch, "utf8") };
}

async function inspectRepository(sandbox) {
  const [head, status, files, packageManager] = await Promise.all([
    runRequired(sandbox, "git", ["rev-parse", "HEAD"]),
    runRequired(sandbox, "git", ["status", "--porcelain=v1"]),
    runRequired(sandbox, "git", ["ls-files"]),
    runDirect(sandbox, "bash", ["-lc", "if [ -f pnpm-lock.yaml ]; then printf pnpm; elif [ -f package-lock.json ]; then printf npm; elif [ -f yarn.lock ]; then printf yarn; elif [ -f bun.lockb ] || [ -f bun.lock ]; then printf bun; else printf unknown; fi"]),
  ]);
  const tracked = files.stdout.split("\n").map(text).filter(Boolean);
  return {
    head_sha: text(head.stdout),
    clean: !text(status.stdout),
    package_manager: text(packageManager.stdout) || "unknown",
    tracked_file_count: tracked.length,
    tracked_files_sample: tracked.slice(0, 200),
  };
}

async function searchRepository(sandbox, { query, paths = [] } = {}) {
  const needle = text(query);
  if (!needle) throw new Error("CODE_AI_SEARCH_QUERY_REQUIRED");
  const scopedPaths = Array.isArray(paths) ? paths.slice(0, 20).map(assertRelativePath) : [];
  const args = ["grep", "-n", "-I", "-F", "--", needle];
  if (scopedPaths.length) args.push(...scopedPaths);
  const result = await runDirect(sandbox, "git", args);
  if (![0, 1].includes(result.exit_code)) {
    const error = new Error(`CODE_AI_SEARCH_FAILED:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  const matches = result.stdout.split("\n").map(text).filter(Boolean);
  return {
    query: needle,
    match_count: matches.length,
    truncated: matches.length > MAX_SEARCH_RESULTS,
    matches: matches.slice(0, MAX_SEARCH_RESULTS),
  };
}

async function readRepositoryFile(sandbox, { file_path, start_line = 1, end_line = null } = {}) {
  const relativePath = assertRelativePath(file_path);
  const buffer = await sandbox.readFileToBuffer({ path: `${REPOSITORY_ROOT}/${relativePath}` });
  if (!buffer) throw new Error(`CODE_AI_REPOSITORY_FILE_NOT_FOUND:${relativePath}`);
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("CODE_AI_FILE_READ_TOO_LARGE");
  const lines = buffer.toString("utf8").split("\n");
  const start = Math.max(1, integer(start_line, 1));
  const end = end_line === null || end_line === undefined
    ? Math.min(lines.length, start + 399)
    : Math.min(lines.length, Math.max(start, integer(end_line, start)));
  return {
    file_path: relativePath,
    start_line: start,
    end_line: end,
    total_lines: lines.length,
    content: lines.slice(start - 1, end).join("\n"),
  };
}

async function applyFiles(sandbox, files = []) {
  if (!Array.isArray(files) || !files.length) throw new Error("CODE_AI_FILES_REQUIRED");
  if (files.length > 30) throw new Error("CODE_AI_FILE_CHANGE_LIMIT_EXCEEDED");
  const written = [];
  for (const file of files) {
    written.push(await writeWorkspaceFile(sandbox, file?.path, file?.content));
  }
  const diffCheck = await runDirect(sandbox, "git", ["diff", "--check"]);
  return {
    written,
    diff_check: diffCheck,
    valid: diffCheck.exit_code === 0,
  };
}

async function runRepositoryCommand(sandbox, { command, args = [], cwd = "." } = {}) {
  const reason = dangerousCommandReason(command, args);
  if (reason) throw new Error(reason);
  const relativeCwd = cwd === "." ? "" : assertRelativePath(cwd);
  const resolvedCwd = relativeCwd ? `${REPOSITORY_ROOT}/${relativeCwd}` : REPOSITORY_ROOT;
  return runDirect(sandbox, command, args, resolvedCwd);
}

async function repositoryDiff(sandbox) {
  const [status, diff, diffCheck] = await Promise.all([
    runRequired(sandbox, "git", ["status", "--porcelain=v1"]),
    runRequired(sandbox, "git", ["diff", "--binary", "--no-ext-diff"]),
    runDirect(sandbox, "git", ["diff", "--check"]),
  ]);
  const patch = diff.stdout;
  if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) {
    throw new Error("CODE_AI_PATCH_TOO_LARGE_FOR_DURABLE_STATE");
  }
  return {
    status: status.stdout.split("\n").map(text).filter(Boolean),
    patch,
    patch_bytes: Buffer.byteLength(patch, "utf8"),
    diff_check: diffCheck,
  };
}

export async function openCodeWorkspace({ repository_url, ref = "main", resume_patch = null, timeout_ms = DEFAULT_TIMEOUT_MS } = {}) {
  const repositoryUrl = assertRepositoryUrl(repository_url);
  const gitRef = assertGitRef(ref);
  const sandbox = await Sandbox.create({
    persistent: false,
    timeout: normalizedTimeout(timeout_ms),
    networkPolicy: "allow-all",
  });

  try {
    await runRequired(sandbox, "mkdir", ["-p", WORKSPACE_ROOT], "/tmp", "CODE_AI_WORKSPACE_CREATE_FAILED");
    await runRequired(
      sandbox,
      "git",
      ["clone", "--depth", "1", "--branch", gitRef, "--single-branch", repositoryUrl, REPOSITORY_ROOT],
      WORKSPACE_ROOT,
      "CODE_AI_REPOSITORY_CLONE_FAILED",
    );
    const baseline = await inspectRepository(sandbox);
    const resume = await applyPatch(sandbox, resume_patch);

    return {
      contract: CONTRACT,
      sandbox,
      repository_url: repositoryUrl,
      ref: gitRef,
      base_commit: baseline.head_sha,
      resume,
      inspect: () => inspectRepository(sandbox),
      search: (input) => searchRepository(sandbox, input),
      read: (input) => readRepositoryFile(sandbox, input),
      applyFiles: (files) => applyFiles(sandbox, files),
      run: (input) => runRepositoryCommand(sandbox, input),
      diff: () => repositoryDiff(sandbox),
      stop: async () => {
        try { await sandbox.stop(); } catch { /* sandbox may already be stopped */ }
      },
    };
  } catch (error) {
    try { await sandbox.stop(); } catch { /* preserve original failure */ }
    throw error;
  }
}

export function codeWorkspaceCommandPolicy({ command, args = [] } = {}) {
  const reason = dangerousCommandReason(command, args);
  return { allowed: !reason, reason };
}

export const CodeWorkspaceSandboxRuntime = Object.freeze({
  contract: CONTRACT,
  repository_root: REPOSITORY_ROOT,
  open: openCodeWorkspace,
  commandPolicy: codeWorkspaceCommandPolicy,
});
