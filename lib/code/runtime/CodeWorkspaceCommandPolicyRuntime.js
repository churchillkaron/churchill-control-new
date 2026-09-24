import path from "node:path";

export const CODE_WORKSPACE_COMMAND_POLICY_CONTRACT =
  "AVANTIQO_CODE_WORKSPACE_COMMAND_POLICY_V1";

const UNIVERSAL_BLOCKED_TOP_LEVEL_COMMANDS = new Set([
  "curl", "wget", "ssh", "scp", "rsync", "psql",
  "bash", "sh", "zsh", "fish", "env", "xargs",
  "vercel", "supabase",
]);
const UNIVERSAL_DANGEROUS_TOKENS = [
  "deploy", "publish", "release", "production", "prod",
  "db:push", "db push", "migrate:up", "migration:up", "remote set-url",
];

const LOCAL_BLOCKED_TOP_LEVEL_COMMANDS = new Set([
  "curl", "wget", "ssh", "scp", "rsync", "psql", "vercel", "supabase",
  "bash", "sh", "zsh", "fish", "env", "xargs",
]);
const LOCAL_ALLOWED_ENGINEERING_EXECUTABLES = new Set([
  "git", "node", "npm", "npx", "pnpm", "yarn", "bun",
  "python", "python3", "pytest", "tsc", "tsx", "eslint", "prettier",
  "jest", "vitest", "playwright", "next", "make", "cmake", "go",
  "cargo", "rustc", "java", "javac", "mvn", "gradle", "dotnet",
  "php", "composer", "ruby", "bundle", "swift", "clang", "gcc", "g++",
]);
const LOCAL_DANGEROUS_TOKENS = [
  "deploy --prod", "--prod", "publish", "release",
  "db:push", "db push", "migrate:up", "migration:up", "remote set-url",
];

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function normalizedArgs(value, { maximumCount = 80, maximumChars = 4000 } = {}) {
  if (!Array.isArray(value)) return [];
  if (value.length > maximumCount) throw new Error("CODE_AI_COMMAND_ARGUMENT_LIMIT_EXCEEDED");
  return value.map((item) => String(item ?? "")).map((item) => {
    if (item.length > maximumChars) throw new Error("CODE_AI_COMMAND_ARGUMENT_TOO_LONG");
    return item;
  });
}
function decision(reason, policy) {
  return {
    contract: CODE_WORKSPACE_COMMAND_POLICY_CONTRACT,
    policy,
    allowed: !reason,
    reason,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

function unsafeWorkspaceFilesystemArgument(args = []) {
  for (const item of normalizedArgs(args, { maximumCount: 100, maximumChars: 8000 })) {
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
  const normalized = normalizedArgs(args, { maximumCount: 10, maximumChars: 1000 });
  return !(
    exactIsolatedBuildEnvironment(value) &&
    cmd === "npm" &&
    normalized.length === 2 &&
    normalized[0] === "run" &&
    normalized[1] === "build"
  );
}

export function codeWorkspaceUniversalCommandPolicy({ command, args = [], env = null } = {}) {
  const cmd = path.basename(text(command)).toLowerCase();
  const normalized = normalizedArgs(args);
  if (!cmd) return decision("CODE_AI_COMMAND_REQUIRED", "UNIVERSAL");
  const normalizedCommand = text(command, 500);
  if (path.isAbsolute(normalizedCommand) || normalizedCommand.startsWith("../")) {
    return decision("CODE_AI_COMMAND_EXECUTABLE_OUTSIDE_WORKSPACE_BLOCKED", "UNIVERSAL");
  }
  if (invalidCommandEnvironment(command, args, env)) {
    return decision("CODE_AI_COMMAND_ENVIRONMENT_NOT_ALLOWED", "UNIVERSAL");
  }
  const unsafeArgument = unsafeWorkspaceFilesystemArgument(normalized);
  if (unsafeArgument) {
    return decision("CODE_AI_COMMAND_ARGUMENT_OUTSIDE_WORKSPACE_BLOCKED", "UNIVERSAL");
  }
  if (UNIVERSAL_BLOCKED_TOP_LEVEL_COMMANDS.has(cmd)) {
    return decision("CODE_AI_EXTERNAL_SIDE_EFFECT_COMMAND_BLOCKED", "UNIVERSAL");
  }
  const joined = `${cmd} ${normalized.join(" ")}`.toLowerCase();
  if (cmd === "git" && normalized.some((item) => item.toLowerCase() === "push")) {
    return decision("CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME", "UNIVERSAL");
  }
  if (cmd === "git" && normalized.some((item) => item.toLowerCase() === "clean")) {
    return decision("CODE_AI_DESTRUCTIVE_GIT_COMMAND_BLOCKED", "UNIVERSAL");
  }
  if (cmd === "npm" && normalized.some((item) => item.toLowerCase() === "publish")) {
    return decision("CODE_AI_PACKAGE_PUBLISH_BLOCKED", "UNIVERSAL");
  }
  if (
    ["npx", "npm", "pnpm", "yarn", "bun"].includes(cmd) &&
    normalized.some((item) => ["vercel", "supabase"].includes(item.toLowerCase()))
  ) {
    return decision("CODE_AI_DEPLOYMENT_OR_DATABASE_TOOL_BLOCKED", "UNIVERSAL");
  }
  if (UNIVERSAL_DANGEROUS_TOKENS.some((token) => joined.includes(token))) {
    return decision("CODE_AI_DANGEROUS_COMMAND_REQUIRES_GOVERNED_RUNTIME", "UNIVERSAL");
  }
  return decision(null, "UNIVERSAL");
}

export function codeWorkspaceLocalCommandPolicy({ command, args = [], env = null } = {}) {
  const normalizedCommand = text(command, 500);
  const rawCommand = text(normalizedCommand, 160);
  const cmd = path.basename(rawCommand).toLowerCase();
  const normalized = normalizedArgs(args, { maximumCount: 100, maximumChars: 8000 });
  if (!cmd) return decision("CODE_AI_COMMAND_REQUIRED", "LOCAL");
  if (invalidCommandEnvironment(command, args, env)) {
    return decision("CODE_AI_COMMAND_ENVIRONMENT_NOT_ALLOWED", "LOCAL");
  }
  const unsafeArgument = unsafeWorkspaceFilesystemArgument(normalized);
  if (unsafeArgument) {
    return decision("CODE_AI_COMMAND_ARGUMENT_OUTSIDE_WORKSPACE_BLOCKED", "LOCAL");
  }
  if (LOCAL_BLOCKED_TOP_LEVEL_COMMANDS.has(cmd)) {
    return decision("CODE_AI_EXTERNAL_SIDE_EFFECT_COMMAND_REQUIRES_GOVERNED_RUNTIME", "LOCAL");
  }
  if (cmd === "git" && normalized.some((entry) => entry.toLowerCase() === "push")) {
    return decision("CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME", "LOCAL");
  }
  if (cmd === "git" && normalized.some((entry) => entry.toLowerCase() === "clean")) {
    return decision("CODE_AI_DESTRUCTIVE_GIT_COMMAND_BLOCKED", "LOCAL");
  }
  const joined = `${cmd} ${normalized.join(" ")}`.toLowerCase();
  if (LOCAL_DANGEROUS_TOKENS.some((token) => joined.includes(token))) {
    return decision("CODE_AI_DANGEROUS_COMMAND_REQUIRES_GOVERNED_RUNTIME", "LOCAL");
  }

  const executable = normalizedCommand.toLowerCase();
  if (path.isAbsolute(normalizedCommand) || normalizedCommand.startsWith("../")) {
    return decision("CODE_AI_COMMAND_EXECUTABLE_OUTSIDE_WORKSPACE_BLOCKED", "LOCAL");
  }
  const repoLocalExecutable = normalizedCommand.startsWith("./");
  if (!repoLocalExecutable && !LOCAL_ALLOWED_ENGINEERING_EXECUTABLES.has(executable)) {
    return decision(
      "CODE_AI_COMMAND_EXECUTABLE_UNRECOGNIZED:" + (normalizedCommand || "missing"),
      "LOCAL",
    );
  }
  return decision(null, "LOCAL");
}

export default Object.freeze({
  contract: CODE_WORKSPACE_COMMAND_POLICY_CONTRACT,
  universal: codeWorkspaceUniversalCommandPolicy,
  local: codeWorkspaceLocalCommandPolicy,
});
