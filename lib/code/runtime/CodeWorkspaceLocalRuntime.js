import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";

export const CODE_WORKSPACE_LOCAL_CONTRACT =
  "AVANTIQO_CODE_WORKSPACE_LOCAL_COMPUTER_V1";

const MAX_OUTPUT_CHARS = 40000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_RANGE_MUTATION_FILE_BYTES = 1024 * 1024;
const MAX_PATCH_BYTES = 768 * 1024;
const MAX_SEARCH_RESULTS = 250;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const WORKTREE_LOCK_WAIT_MS = 12_000;
const WORKTREE_LOCK_STALE_MS = 120_000;
const WORKTREE_LOCK_RETRY_MS = 120;
const SEARCH_MODES = new Set(["literal", "regex", "path", "glob"]);
const VERIFICATION_ARTIFACT_EXCLUDE_PATHSPEC = ":(exclude).next-code-verify/**";
const BLOCKED_TOP_LEVEL_COMMANDS = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "psql",
  "vercel",
  "supabase",
  "bash",
  "sh",
  "zsh",
  "fish",
  "env",
  "xargs",
]);
const ALLOWED_ENGINEERING_EXECUTABLES = new Set([
  "git",
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "python",
  "python3",
  "pytest",
  "tsc",
  "tsx",
  "eslint",
  "prettier",
  "jest",
  "vitest",
  "playwright",
  "next",
  "make",
  "cmake",
  "go",
  "cargo",
  "rustc",
  "java",
  "javac",
  "mvn",
  "gradle",
  "dotnet",
  "php",
  "composer",
  "ruby",
  "bundle",
  "swift",
  "clang",
  "gcc",
  "g++",
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function repositoryWorktreeLockPath(sourceRoot) {
  const digest = crypto.createHash("sha256").update(sourceRoot, "utf8").digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `avantiqo-code-worktree-${digest}.lock`);
}

async function acquireRepositoryWorktreeLock(sourceRoot) {
  const lockPath = repositoryWorktreeLockPath(sourceRoot);
  const deadline = Date.now() + WORKTREE_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        source_root: sourceRoot,
        acquired_at: new Date().toISOString(),
      }));
      await handle.close();
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await rm(lockPath, { force: true }).catch(() => null);
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > WORKTREE_LOCK_STALE_MS) {
        await rm(lockPath, { force: true }).catch(() => null);
        continue;
      }
      await delay(WORKTREE_LOCK_RETRY_MS);
    }
  }
  throw new Error("CODE_AI_LOCAL_WORKTREE_LOCK_TIMEOUT");
}

async function cleanupLocalWorktree(sourceRoot, workspaceRoot) {
  let releaseCleanupLock = null;
  try {
    releaseCleanupLock = await acquireRepositoryWorktreeLock(sourceRoot);
  } catch {
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => null);
    return {
      metadata_cleanup_deferred: true,
      repository_lock_acquired: false,
    };
  }
  try {
    await runProcess("git", ["worktree", "remove", "--force", workspaceRoot], {
      cwd: sourceRoot,
      timeout_ms: 60_000,
    }).catch(() => null);
    return {
      metadata_cleanup_deferred: false,
      repository_lock_acquired: true,
    };
  } finally {
    await releaseCleanupLock();
    await rm(workspaceRoot, { recursive: true, force: true }).catch(() => null);
  }
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

function unsafeWorkspaceFilesystemArgument(args = []) {
  for (const item of normalizedArgs(args)) {
    const candidates = [item];
    const equalsIndex = item.indexOf("=");
    if (item.startsWith("-") && equalsIndex > 0) candidates.push(item.slice(equalsIndex + 1));
    for (const candidateRaw of candidates) {
      const candidate = String(candidateRaw || "").trim();
      if (!candidate) continue;
      if (/^[a-z]+:\/\//i.test(candidate)) {
        if (/^file:\/\//i.test(candidate)) return item;
        continue;
      }
      const normalized = candidate.replaceAll("\\", "/");
      if (
        path.isAbsolute(candidate) ||
        /^[A-Za-z]:\//.test(normalized) ||
        normalized === ".." ||
        normalized.startsWith("../") ||
        normalized.includes("/../") ||
        normalized === "~" ||
        normalized.startsWith("~/")
      ) return item;
    }
  }
  return null;
}

function exactIsolatedBuildEnvironment(value) {
  const env = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const entries = Object.entries(env);
  return entries.length === 1 &&
    entries[0][0] === "AVANTIQO_NEXT_DIST_DIR" &&
    entries[0][1] === ".next-code-verify";
}

function invalidCommandEnvironment(command, args, value) {
  if (value === undefined || value === null) return false;
  const cmd = text(command, 500).toLowerCase();
  const normalized = normalizedArgs(args);
  return !(
    exactIsolatedBuildEnvironment(value) &&
    cmd === "npm" &&
    normalized.length === 2 &&
    normalized[0] === "run" &&
    normalized[1] === "build"
  );
}

function dangerousCommandReason(command, args = [], env = null) {
  const rawCommand = text(command, 160);
  const cmd = path.basename(rawCommand).toLowerCase();
  const normalized = normalizedArgs(args);
  if (!cmd) return "CODE_AI_COMMAND_REQUIRED";
  if (invalidCommandEnvironment(command, args, env)) return "CODE_AI_COMMAND_ENVIRONMENT_NOT_ALLOWED";
  if (unsafeWorkspaceFilesystemArgument(normalized)) {
    return "CODE_AI_COMMAND_ARGUMENT_OUTSIDE_WORKSPACE_BLOCKED";
  }
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
  const [topResult, prefixResult] = await Promise.all([
    runRequired("git", ["rev-parse", "--show-toplevel"], { cwd: repositoryRoot }),
    runRequired("git", ["rev-parse", "--show-prefix"], { cwd: repositoryRoot }),
  ]);
  const top = text(topResult.stdout, 2000);
  const prefix = text(prefixResult.stdout, 2000);
  if (!top || prefix) {
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
  const explicitWindow = end_line !== null && end_line !== undefined;
  if (buffer.byteLength > MAX_FILE_BYTES && !explicitWindow) {
    throw new Error("CODE_AI_FILE_READ_TOO_LARGE");
  }
  if (buffer.byteLength > MAX_RANGE_MUTATION_FILE_BYTES) {
    throw new Error("CODE_AI_FILE_READ_TOO_LARGE");
  }
  const lines = buffer.toString("utf8").split("\n");
  const start = Math.max(1, integer(start_line, 1));
  const requestedEnd = explicitWindow ? Math.max(start, integer(end_line, start)) : start + 399;
  if (explicitWindow && requestedEnd - start + 1 > 200) {
    throw new Error("CODE_AI_LARGE_FILE_READ_WINDOW_TOO_WIDE");
  }
  const end = Math.min(lines.length, requestedEnd);
  const content = lines.slice(start - 1, end).join("\n");
  const contentBytes = Buffer.byteLength(content, "utf8");
  if (contentBytes > 64 * 1024) {
    throw new Error("CODE_AI_LARGE_FILE_READ_WINDOW_TOO_LARGE");
  }
  return {
    file_path: relative,
    start_line: start,
    end_line: end,
    total_lines: lines.length,
    file_bytes: buffer.byteLength,
    content,
    content_bytes: contentBytes,
    content_sha256: crypto.createHash("sha256").update(content, "utf8").digest("hex"),
    large_file_window_read: buffer.byteLength > MAX_FILE_BYTES,
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

async function replaceRange(repositoryRoot, {
  file_path,
  start_line,
  end_line,
  expected,
  replacement,
} = {}) {
  const relative = assertRelativePath(file_path);
  const absolute = path.join(repositoryRoot, relative);
  const start = Number(start_line);
  const end = Number(end_line);
  if (!Number.isInteger(start) || start < 1) throw new Error("CODE_AI_REPLACE_RANGE_START_LINE_INVALID");
  if (!Number.isInteger(end) || end < start) throw new Error("CODE_AI_REPLACE_RANGE_END_LINE_INVALID");
  if (typeof expected !== "string" || typeof replacement !== "string") {
    throw new Error("CODE_AI_REPLACE_RANGE_TEXT_REQUIRED");
  }

  const buffer = await readFile(absolute).catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`CODE_AI_REPOSITORY_FILE_NOT_FOUND:${relative}`);
    throw error;
  });
  if (buffer.byteLength > MAX_RANGE_MUTATION_FILE_BYTES) {
    throw new Error("CODE_AI_REPLACE_RANGE_FILE_TOO_LARGE");
  }

  const lines = buffer.toString("utf8").split("\n");
  if (end > lines.length) throw new Error("CODE_AI_REPLACE_RANGE_OUT_OF_BOUNDS");
  const observed = lines.slice(start - 1, end).join("\n");
  if (observed !== expected) {
    const error = new Error("CODE_AI_REPLACE_RANGE_STALE_SOURCE");
    error.details = {
      file_path: relative,
      start_line: start,
      end_line: end,
      expected_sha256: crypto.createHash("sha256").update(expected, "utf8").digest("hex"),
      observed_sha256: crypto.createHash("sha256").update(observed, "utf8").digest("hex"),
      raw_source_persisted: false,
    };
    throw error;
  }

  const replacementLines = replacement === "" ? [] : replacement.split("\n");
  const nextContent = [
    ...lines.slice(0, start - 1),
    ...replacementLines,
    ...lines.slice(end),
  ].join("\n");
  const nextBuffer = Buffer.from(nextContent, "utf8");
  if (nextBuffer.byteLength > MAX_RANGE_MUTATION_FILE_BYTES) {
    throw new Error("CODE_AI_REPLACE_RANGE_RESULT_TOO_LARGE");
  }
  await writeFile(absolute, nextBuffer);
  const check = await runProcess("git", ["diff", "--check"], { cwd: repositoryRoot });
  return {
    contract: "AVANTIQO_CODE_WORKSPACE_REPLACE_RANGE_V1",
    file_path: relative,
    start_line: start,
    end_line: end,
    bytes: nextBuffer.byteLength,
    diff_check: check,
    valid: check.exit_code === 0,
    expected_sha256: crypto.createHash("sha256").update(expected, "utf8").digest("hex"),
    replacement_sha256: crypto.createHash("sha256").update(replacement, "utf8").digest("hex"),
    raw_full_file_persisted: false,
  };
}

async function repositoryDiff(repositoryRoot) {
  const untracked = await runRequired(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", VERIFICATION_ARTIFACT_EXCLUDE_PATHSPEC],
    { cwd: repositoryRoot },
  );
  const untrackedPaths = untracked.stdout.split("\0").map((entry) => text(entry)).filter(Boolean);
  for (const candidate of untrackedPaths) {
    await runRequired("git", ["add", "-N", "--", assertRelativePath(candidate)], { cwd: repositoryRoot });
  }
  const pathspec = ["--", ".", VERIFICATION_ARTIFACT_EXCLUDE_PATHSPEC];
  const [status, diff, check] = await Promise.all([
    runRequired("git", ["status", "--porcelain=v1", ...pathspec], { cwd: repositoryRoot }),
    runRequired("git", ["diff", "--binary", "--no-ext-diff", ...pathspec], { cwd: repositoryRoot }),
    runProcess("git", ["diff", "--check", ...pathspec], { cwd: repositoryRoot }),
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
  const releaseWorktreeLock = await acquireRepositoryWorktreeLock(sourceRoot);
  try {
    const worktreeTimeoutMs = Math.min(normalizedTimeout(timeout_ms), 15_000);
    let created = await runProcess("git", ["worktree", "add", "--detach", workspaceRoot, target], {
      cwd: sourceRoot,
      timeout_ms: worktreeTimeoutMs,
    });
    if (created.exit_code !== 0) {
      await rm(workspaceRoot, { recursive: true, force: true }).catch(() => null);
      await runProcess("git", ["worktree", "prune", "--expire", "now"], {
        cwd: sourceRoot,
        timeout_ms: worktreeTimeoutMs,
      }).catch(() => null);
      created = await runProcess("git", ["worktree", "add", "--detach", workspaceRoot, target], {
        cwd: sourceRoot,
        timeout_ms: worktreeTimeoutMs,
      });
    }
    if (created.exit_code !== 0) {
      const error = new Error(`CODE_AI_LOCAL_WORKTREE_CREATE_FAILED:git:${created.exit_code}`);
      error.details = created;
      throw error;
    }
  } finally {
    await releaseWorktreeLock();
  }

  const sandbox = localSandboxAdapter(workspaceRoot);
  const detachedChildren = new Set();
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
      replaceRange: (input) => replaceRange(workspaceRoot, input),
      run: async ({ command, args = [], cwd = ".", timeout_ms: commandTimeout, env = null } = {}) => {
        const policy = localCodeWorkspaceCommandPolicy({ command, args, env });
        if (!policy.allowed) throw new Error(policy.reason);
        const relativeCwd = cwd === "." ? "" : assertRelativePath(cwd);
        const resolvedCwd = relativeCwd ? path.join(workspaceRoot, relativeCwd) : workspaceRoot;
        return runProcess(command, args, {
          cwd: resolvedCwd,
          timeout_ms: commandTimeout || timeout_ms,
          env: env ? { ...process.env, ...env } : process.env,
        });
      },
      startDetached: async ({ command, args = [], cwd = "." } = {}) => {
        const policy = localCodeWorkspaceCommandPolicy({ command, args });
        if (!policy.allowed) throw new Error(policy.reason);
        const normalized = normalizedArgs(args);
        const relativeCwd = cwd === "." ? "" : assertRelativePath(cwd);
        const resolvedCwd = relativeCwd ? path.join(workspaceRoot, relativeCwd) : workspaceRoot;
        const child = spawn(command, normalized, {
          cwd: resolvedCwd,
          env: process.env,
          stdio: "ignore",
          shell: false,
        });
        detachedChildren.add(child);
        child.once("close", () => detachedChildren.delete(child));
        child.once("error", () => detachedChildren.delete(child));
        return {
          command,
          args: normalized,
          cwd: resolvedCwd,
          pid: child.pid || null,
          kill: async () => {
            if (!child.killed) child.kill("SIGTERM");
            detachedChildren.delete(child);
          },
        };
      },
      diff: () => repositoryDiff(workspaceRoot),
      stop: async () => {
        if (stopped) return;
        stopped = true;
        for (const child of detachedChildren) {
          try { if (!child.killed) child.kill("SIGTERM"); } catch { /* already stopped */ }
        }
        detachedChildren.clear();
        await cleanupLocalWorktree(sourceRoot, workspaceRoot);
      },
    };
  } catch (error) {
    await cleanupLocalWorktree(sourceRoot, workspaceRoot);
    throw error;
  }
}

export function localCodeWorkspaceCommandPolicy({ command, args = [], env = null } = {}) {
  const normalizedCommand = text(command, 500);
  const dangerReason = dangerousCommandReason(normalizedCommand, args, env);
  if (dangerReason) return { allowed: false, reason: dangerReason };

  const executable = normalizedCommand.toLowerCase();
  if (path.isAbsolute(normalizedCommand) || normalizedCommand.startsWith("../")) {
    return {
      allowed: false,
      reason: "CODE_AI_COMMAND_EXECUTABLE_OUTSIDE_WORKSPACE_BLOCKED",
    };
  }
  const repoLocalExecutable = normalizedCommand.startsWith("./");
  if (!repoLocalExecutable && !ALLOWED_ENGINEERING_EXECUTABLES.has(executable)) {
    return {
      allowed: false,
      reason: "CODE_AI_COMMAND_EXECUTABLE_UNRECOGNIZED:" + (normalizedCommand || "missing"),
    };
  }
  return { allowed: true, reason: null };
}

export const CodeWorkspaceLocalRuntime = Object.freeze({
  contract: CODE_WORKSPACE_LOCAL_CONTRACT,
  search_modes: [...SEARCH_MODES],
  open: openLocalCodeWorkspace,
  commandPolicy: localCodeWorkspaceCommandPolicy,
});

export default CodeWorkspaceLocalRuntime;
