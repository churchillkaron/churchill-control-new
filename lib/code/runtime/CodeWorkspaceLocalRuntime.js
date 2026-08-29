import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

export const CODE_WORKSPACE_LOCAL_CONTRACT =
  "AVANTIQO_CODE_WORKSPACE_LOCAL_COMPUTER_V1";

const MAX_OUTPUT_CHARS = 40000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PATCH_BYTES = 768 * 1024;
const MAX_SEARCH_RESULTS = 250;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const SEARCH_MODES = new Set(["literal", "regex", "path", "glob"]);
const BLOCKED_TOP_LEVEL_COMMANDS = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "psql",
  "vercel",
  "supabase",
]);
const DANGEROUS_TOKENS = [
  "deploy --prod",
  "--prod",
  "publish",
  "release",
  "db:push",
  "db push",
  "migrate:up",
  "migration:up",
  "remote set-url",
];

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function boundedText(value, maximum = MAX_OUTPUT_CHARS) {
  const raw = String(value ?? "");
  if (raw.length <= maximum) return raw;
  return `${raw.slice(0, maximum)}\n...[truncated ${raw.length - maximum} chars]`;
}

function normalizedTimeout(value) {
  const requested = integer(value, DEFAULT_TIMEOUT_MS);
  return Math.max(30_000, Math.min(MAX_TIMEOUT_MS, requested));
}

function assertAbsoluteConfiguredRoot() {
  const configured = text(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT, 2000);
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT_REQUIRED");
  }
  return path.resolve(configured);
}

function assertRepositoryUrl(value) {
  const repositoryUrl = text(value, 1000).replace(/\.git$/i, "");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/i.test(repositoryUrl)) {
    throw new Error("CODE_AI_GITHUB_REPOSITORY_URL_REQUIRED");
  }
  return repositoryUrl;
}

function assertGitRef(value) {
  const ref = text(value, 160) || "main";
  if (ref.startsWith("-") || /[\s~^:?*\[\\\]]/.test(ref) || ref.includes("..")) {
    throw new Error("CODE_AI_GIT_REF_INVALID");
  }
  return ref;
}

function isExactCommitSha(value) {
  return /^[a-f0-9]{40}$/i.test(text(value, 160));
}

function assertRelativePath(value) {
  const candidate = text(value, 2000).replaceAll("\\", "/");
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
  if (value.length > 100) throw new Error("CODE_AI_COMMAND_ARGUMENT_LIMIT_EXCEEDED");
  return value.map((entry) => String(entry ?? "")).map((entry) => {
    if (entry.length > 8000) throw new Error("CODE_AI_COMMAND_ARGUMENT_TOO_LONG");
    return entry;
  });
}

function dangerousCommandReason(command, args = []) {
  const cmd = text(command, 160).toLowerCase();
  const normalized = normalizedArgs(args);
  if (!cmd) return "CODE_AI_COMMAND_REQUIRED";
  if (BLOCKED_TOP_LEVEL_COMMANDS.has(cmd)) {
    return "CODE_AI_EXTERNAL_SIDE_EFFECT_COMMAND_REQUIRES_GOVERNED_RUNTIME";
  }
  if (cmd === "git" && normalized.some((entry) => entry.toLowerCase() === "push")) {
    return "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME";
  }
  if (cmd === "git" && normalized.some((entry) => entry.toLowerCase() === "clean")) {
    return "CODE_AI_DESTRUCTIVE_GIT_COMMAND_BLOCKED";
  }
  const joined = `${cmd} ${normalized.join(" ")}`.toLowerCase();
  if (DANGEROUS_TOKENS.some((token) => joined.includes(token))) {
    return "CODE_AI_DANGEROUS_COMMAND_REQUIRES_GOVERNED_RUNTIME";
  }
  return null;
}

function commandResult(command, args, cwd, exitCode, stdout, stderr) {
  return {
    command,
    args,
    cwd,
    exit_code: exitCode,
    stdout: boundedText(stdout),
    stderr: boundedText(stderr),
  };
}

async function runProcess(command, args = [], {
  cwd,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  env = process.env,
} = {}) {
  const normalized = normalizedArgs(args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, normalized, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, normalizedTimeout(timeout_ms));
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const exitCode = Number.isInteger(code) ? code : 124;
      const result = commandResult(command, normalized, cwd || null, exitCode, stdout, stderr);
      if (signal && exitCode === 124) result.stderr = boundedText(`${result.stderr}\nterminated:${signal}`);
      resolve(result);
    });
  });
}

async function runRequired(command, args, options, prefix = "CODE_AI_LOCAL_COMMAND_FAILED") {
  const result = await runProcess(command, args, options);
  if (result.exit_code !== 0) {
    const error = new Error(`${prefix}:${command}:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  return result;
}

async function verifyRepositoryBinding(repositoryRoot, repositoryUrl) {
  const top = text((await runRequired("git", ["rev-parse", "--show-toplevel"], { cwd: repositoryRoot })).stdout, 2000);
  if (path.resolve(top) !== repositoryRoot) {
    throw new Error("CODE_AI_LOCAL_REPOSITORY_ROOT_MISMATCH");
  }
  const origin = text((await runRequired("git", ["remote", "get-url", "origin"], { cwd: repositoryRoot })).stdout, 2000)
    .replace(/\.git$/i, "");
  if (origin !== repositoryUrl) {
    throw new Error(`CODE_AI_LOCAL_REPOSITORY_REMOTE_MISMATCH:${origin}`);
  }
}

async function inspectRepository(repositoryRoot) {
  const [head, status, tracked] = await Promise.all([
    runRequired("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
    runRequired("git", ["status", "--porcelain=v1"], { cwd: repositoryRoot }),
    runRequired("git", ["ls-files"], { cwd: repositoryRoot }),
  ]);
  const trackedFiles = tracked.stdout.split("\n").map((entry) => text(entry)).filter(Boolean);
  return {
    head_sha: text(head.stdout, 160),
    clean: !text(status.stdout),
    tracked_file_count: trackedFiles.length,
    tracked_files_sample: trackedFiles.slice(0, 200),
    package_manager: "unknown",
    local_computer: true,
  };
}

async function searchRepository(repositoryRoot, {
  query,
  paths = [],
  mode = "literal",
  path_globs = [],
} = {}) {
  const searchMode = text(mode, 40).toLowerCase() || "literal";
  if (!SEARCH_MODES.has(searchMode)) throw new Error(`CODE_AI_SEARCH_MODE_UNSUPPORTED:${searchMode}`);
  const needle = text(query, 4000);
  const scopedPaths = Array.isArray(paths) ? paths.slice(0, 30).map(assertRelativePath) : [];
  if (searchMode === "path" || searchMode === "glob") {
    const rawPatterns = searchMode === "glob" && Array.isArray(path_globs) && path_globs.length
      ? path_globs.slice(0, 30)
      : [needle];
    if (!rawPatterns.filter(Boolean).length) throw new Error("CODE_AI_SEARCH_QUERY_REQUIRED");
    const tracked = (await runRequired("git", ["ls-files"], { cwd: repositoryRoot })).stdout
      .split("\n").map((entry) => text(entry)).filter(Boolean);
    const patterns = rawPatterns.map((entry) => text(entry, 1000)).filter(Boolean);
    const matches = tracked.filter((filePath) => {
      if (searchMode === "path") return filePath.toLowerCase().includes(patterns[0].toLowerCase());
      return patterns.some((pattern) => {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".");
        return new RegExp(`^${escaped}$`).test(filePath);
      });
    });
    return {
      mode: searchMode,
      query: needle || null,
      path_globs: searchMode === "glob" ? patterns : undefined,
      match_count: matches.length,
      truncated: matches.length > MAX_SEARCH_RESULTS,
      matches: matches.slice(0, MAX_SEARCH_RESULTS),
    };
  }
  if (!needle) throw new Error("CODE_AI_SEARCH_QUERY_REQUIRED");
  const args = ["grep", "-n", "-I"];
  if (searchMode === "literal") args.push("-F");
  if (searchMode === "regex") args.push("-E");
  args.push("--", needle, ...(scopedPaths.length ? scopedPaths : ["."]));
  const result = await runProcess("git", args, { cwd: repositoryRoot });
  if (![0, 1].includes(result.exit_code)) {
    const error = new Error(`CODE_AI_SEARCH_FAILED:${searchMode}:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  const matches = result.stdout.split("\n").map((entry) => text(entry, 4000)).filter(Boolean);
  return {
    mode: searchMode,
    query: needle,
    paths: scopedPaths,
    match_count: matches.length,
    truncated: matches.length > MAX_SEARCH_RESULTS,
    matches: matches.slice(0, MAX_SEARCH_RESULTS),
  };
}

async function readRepositoryFile(repositoryRoot, { file_path, start_line = 1, end_line = null } = {}) {
  const relative = assertRelativePath(file_path);
  const absolute = path.join(repositoryRoot, relative);
  let buffer;
  try {
    buffer = await readFile(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`CODE_AI_REPOSITORY_FILE_NOT_FOUND:${relative}`);
    throw error;
  }
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("CODE_AI_FILE_READ_TOO_LARGE");
  const lines = buffer.toString("utf8").split("\n");
  const start = Math.max(1, integer(start_line, 1));
  const end = end_line === null || end_line === undefined
    ? Math.min(lines.length, start + 399)
    : Math.min(lines.length, Math.max(start, integer(end_line, start)));
  return {
    file_path: relative,
    start_line: start,
    end_line: end,
    total_lines: lines.length,
    content: lines.slice(start - 1, end).join("\n"),
  };
}

async function writeWorkspaceFile(repositoryRoot, filePath, content) {
  const relative = assertRelativePath(filePath);
  const buffer = Buffer.from(String(content ?? ""), "utf8");
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("CODE_AI_FILE_WRITE_TOO_LARGE");
  const absolute = path.join(repositoryRoot, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer);
  return { path: relative, bytes: buffer.byteLength };
}

async function applyFiles(repositoryRoot, files = []) {
  if (!Array.isArray(files) || !files.length) throw new Error("CODE_AI_FILES_REQUIRED");
  if (files.length > 30) throw new Error("CODE_AI_FILE_CHANGE_LIMIT_EXCEEDED");
  const written = [];
  for (const file of files) written.push(await writeWorkspaceFile(repositoryRoot, file?.path, file?.content));
  const check = await runProcess("git", ["diff", "--check"], { cwd: repositoryRoot });
  return { written, diff_check: check, valid: check.exit_code === 0 };
}

async function repositoryDiff(repositoryRoot) {
  const untracked = await runRequired("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repositoryRoot });
  const untrackedPaths = untracked.stdout.split("\0").map((entry) => text(entry)).filter(Boolean);
  for (const candidate of untrackedPaths) {
    await runRequired("git", ["add", "-N", "--", assertRelativePath(candidate)], { cwd: repositoryRoot });
  }
  const [status, diff, check] = await Promise.all([
    runRequired("git", ["status", "--porcelain=v1"], { cwd: repositoryRoot }),
    runRequired("git", ["diff", "--binary", "--no-ext-diff"], { cwd: repositoryRoot }),
    runProcess("git", ["diff", "--check"], { cwd: repositoryRoot }),
  ]);
  if (Buffer.byteLength(diff.stdout, "utf8") > MAX_PATCH_BYTES) {
    throw new Error("CODE_AI_PATCH_TOO_LARGE_FOR_DURABLE_STATE");
  }
  return {
    status: status.stdout.split("\n").map((entry) => text(entry)).filter(Boolean),
    patch: diff.stdout,
    patch_bytes: Buffer.byteLength(diff.stdout, "utf8"),
    diff_check: check,
  };
}

function localSandboxAdapter(repositoryRoot) {
  return {
    runCommand: async ({ cmd, args = [], cwd = repositoryRoot } = {}) => {
      const resolvedCwd = path.resolve(cwd || repositoryRoot);
      if (resolvedCwd !== repositoryRoot && !resolvedCwd.startsWith(`${repositoryRoot}${path.sep}`)) {
        throw new Error("CODE_AI_LOCAL_CWD_OUTSIDE_WORKTREE");
      }
      return runProcess(text(cmd, 160), args, { cwd: resolvedCwd });
    },
    readFileToBuffer: async ({ path: requested } = {}) => readFile(requested).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    }),
    writeFiles: async (files = []) => {
      for (const file of files) {
        await mkdir(path.dirname(file.path), { recursive: true });
        await writeFile(file.path, file.content);
      }
    },
    stop: async () => {},
  };
}

export async function openLocalCodeWorkspace({
  repository_url,
  ref = "main",
  resume_patch = null,
  timeout_ms = DEFAULT_TIMEOUT_MS,
} = {}) {
  const repositoryUrl = assertRepositoryUrl(repository_url);
  const gitRef = assertGitRef(ref);
  const exactCommit = isExactCommitSha(gitRef);
  const sourceRoot = assertAbsoluteConfiguredRoot();
  await verifyRepositoryBinding(sourceRoot, repositoryUrl);

  const workspaceParent = path.join(os.tmpdir(), "avantiqo-code-local-worktrees");
  await mkdir(workspaceParent, { recursive: true });
  const workspaceRoot = path.join(workspaceParent, `mission-${crypto.randomUUID()}`);

  if (exactCommit) {
    await runRequired("git", ["cat-file", "-e", `${gitRef}^{commit}`], {
      cwd: sourceRoot,
      timeout_ms,
    }, "CODE_AI_LOCAL_PINNED_COMMIT_NOT_AVAILABLE");
  } else {
    await runRequired("git", ["fetch", "--prune", "origin", gitRef], {
      cwd: sourceRoot,
      timeout_ms,
    }, "CODE_AI_LOCAL_FETCH_FAILED");
  }
  const target = exactCommit ? gitRef : gitRef === "main" ? "origin/main" : gitRef;
  await runRequired("git", ["worktree", "add", "--detach", workspaceRoot, target], {
    cwd: sourceRoot,
    timeout_ms,
  }, "CODE_AI_LOCAL_WORKTREE_CREATE_FAILED");

  const sandbox = localSandboxAdapter(workspaceRoot);
  let stopped = false;
  try {
    const baseline = await inspectRepository(workspaceRoot);
    if (exactCommit && text(baseline.head_sha, 160).toLowerCase() !== gitRef.toLowerCase()) {
      throw new Error(`CODE_AI_LOCAL_PINNED_COMMIT_MISMATCH:${baseline.head_sha}:${gitRef}`);
    }
    if (resume_patch) {
      const patchPath = path.join(workspaceRoot, ".avantiqo-resume.patch");
      await writeFile(patchPath, String(resume_patch), "utf8");
      await runRequired("git", ["apply", "--check", patchPath], { cwd: workspaceRoot });
      await runRequired("git", ["apply", patchPath], { cwd: workspaceRoot });
      await rm(patchPath, { force: true });
    }
    return {
      contract: CODE_WORKSPACE_LOCAL_CONTRACT,
      transport: "LOCAL_COMPUTER",
      sandbox,
      repository_root: workspaceRoot,
      source_repository_root: sourceRoot,
      repository_url: repositoryUrl,
      ref: gitRef,
      base_commit: baseline.head_sha,
      exact_commit_ref: exactCommit,
      remote_fetch_performed: !exactCommit,
      resume: { applied: Boolean(resume_patch) },
      inspect: () => inspectRepository(workspaceRoot),
      search: (input) => searchRepository(workspaceRoot, input),
      read: (input) => readRepositoryFile(workspaceRoot, input),
      applyFiles: (files) => applyFiles(workspaceRoot, files),
      run: async ({ command, args = [], cwd = ".", timeout_ms: commandTimeout } = {}) => {
        const reason = dangerousCommandReason(command, args);
        if (reason) throw new Error(reason);
        const relativeCwd = cwd === "." ? "" : assertRelativePath(cwd);
        const resolvedCwd = relativeCwd ? path.join(workspaceRoot, relativeCwd) : workspaceRoot;
        return runProcess(command, args, {
          cwd: resolvedCwd,
          timeout_ms: commandTimeout || timeout_ms,
        });
      },
      diff: () => repositoryDiff(workspaceRoot),
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await runProcess("git", ["worktree", "remove", "--force", workspaceRoot], {
          cwd: sourceRoot,
          timeout_ms: 60_000,
        }).catch(() => null);
        await rm(workspaceRoot, { recursive: true, force: true }).catch(() => null);
      },
    };
  } catch (error) {
    await runProcess("git", ["worktree", "remove", "--force", workspaceRoot], {
      cwd: sourceRoot,
      timeout_ms: 60_000,
    }).catch(() => null);
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => null);
    throw error;
  }
}

export function localCodeWorkspaceCommandPolicy({ command, args = [] } = {}) {
  const reason = dangerousCommandReason(command, args);
  return { allowed: !reason, reason };
}

export const CodeWorkspaceLocalRuntime = Object.freeze({
  contract: CODE_WORKSPACE_LOCAL_CONTRACT,
  search_modes: [...SEARCH_MODES],
  open: openLocalCodeWorkspace,
  commandPolicy: localCodeWorkspaceCommandPolicy,
});

export default CodeWorkspaceLocalRuntime;
