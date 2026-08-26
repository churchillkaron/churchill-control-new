import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPROVAL_ENV = "SECRETARY_SUPABASE_AWAIT_REPAIR_APPROVED";
const RESPONSE_READ = /\bresult\.(error|data|count|status|statusText)\b/g;
const RESPONSE_READ_TEST = /\bresult\.(?:error|data|count|status|statusText)\b/;
const AWAIT_RESULT_TEST = /\bawait\s+result\b/;
const MAX_REPAIR_COMMITS = 50;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const secretaryRoot = path.join(repositoryRoot, "lib", "operator", "secretary");
const auditPath = path.join(repositoryRoot, "scripts", "operator-secretary-supabase-await-audit.mjs");

function fail(code, details = null) {
  console.error(`SECRETARY_SUPABASE_AWAIT_REPAIR=FAIL`);
  console.error(`SECRETARY_SUPABASE_AWAIT_REPAIR_REASON=${code}`);
  if (details) console.error(String(details).trim());
  console.error("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
  console.error("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  process.exit(1);
}

function run(command, args, { inherit = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    }) || "";
  } catch (error) {
    const stdout = String(error?.stdout || "").trim();
    const stderr = String(error?.stderr || "").trim();
    const detail = [stdout, stderr].filter(Boolean).join("\n");
    const wrapped = new Error(`${command} ${args.join(" ")} failed${detail ? `\n${detail}` : ""}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function git(args, options) {
  return run("git", args, options);
}

function assertMainBranch() {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "main") fail("MAIN_BRANCH_REQUIRED", `current_branch=${branch || "UNKNOWN"}`);
}

function assertTrackedTreeClean() {
  const tracked = git(["status", "--porcelain", "--untracked-files=no"]).trim();
  if (tracked) fail("TRACKED_WORKTREE_NOT_CLEAN", tracked);
}

function synchronizeMain() {
  git(["fetch", "origin", "main"], { inherit: true });
  git(["merge", "--ff-only", "origin/main"], { inherit: true });
}

async function listSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(absolute));
      continue;
    }
    if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(absolute);
  }
  return files.sort();
}

function matchingBraceIndex(source, openBraceIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }

    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findUnawaitedHelpers(source) {
  const findings = [];
  const declaration = /async\s+function\s+([A-Za-z_$][\w$]*)\s*\(\s*result\s*\)\s*\{/g;
  let match;
  while ((match = declaration.exec(source))) {
    const openBraceIndex = source.indexOf("{", match.index + match[0].lastIndexOf("{") - 1);
    const closeBraceIndex = matchingBraceIndex(source, openBraceIndex);
    if (closeBraceIndex < 0) throw new Error(`Unable to match helper body for ${match[1]}`);
    const body = source.slice(openBraceIndex + 1, closeBraceIndex);
    if (!RESPONSE_READ_TEST.test(body) || AWAIT_RESULT_TEST.test(body)) continue;
    findings.push({
      name: match[1],
      openBraceIndex,
      closeBraceIndex,
      body,
    });
    declaration.lastIndex = closeBraceIndex + 1;
  }
  return findings;
}

function patchHelperBody(body) {
  const replaced = body.replace(RESPONSE_READ, "resolved.$1");
  if (replaced === body) throw new Error("Expected response read was not replaced");

  if (replaced.startsWith("\r\n")) {
    const indent = replaced.match(/^\r\n([ \t]*)/)?.[1] || "  ";
    return `\r\n${indent}const resolved = await result;\r\n${replaced.slice(2)}`;
  }
  if (replaced.startsWith("\n")) {
    const indent = replaced.match(/^\n([ \t]*)/)?.[1] || "  ";
    return `\n${indent}const resolved = await result;\n${replaced.slice(1)}`;
  }
  return ` const resolved = await result;${replaced}`;
}

function patchSource(source, helpers) {
  let next = source;
  for (const helper of [...helpers].sort((a, b) => b.openBraceIndex - a.openBraceIndex)) {
    const body = patchHelperBody(helper.body);
    next = `${next.slice(0, helper.openBraceIndex + 1)}${body}${next.slice(helper.closeBraceIndex)}`;
  }
  return next;
}

async function scan() {
  const files = await listSourceFiles(secretaryRoot);
  const findings = [];
  for (const absolute of files) {
    const source = await fs.readFile(absolute, "utf8");
    const helpers = findUnawaitedHelpers(source);
    if (!helpers.length) continue;
    findings.push({
      absolute,
      relative: path.relative(repositoryRoot, absolute).split(path.sep).join("/"),
      helpers,
    });
  }
  return findings;
}

function commitMessage(relative) {
  const base = path.basename(relative).replace(/\.(?:js|mjs|cjs)$/, "");
  const label = base
    .replace(/^Secretary/, "")
    .replace(/Runtime$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return `Await Secretary ${label || "runtime"} Supabase helpers`;
}

function pushCurrentCommit() {
  try {
    git(["push", "origin", "main"], { inherit: true });
    return;
  } catch (firstError) {
    console.log("SECRETARY_SUPABASE_AWAIT_REPAIR_PUSH_RACE=true");
    git(["fetch", "origin", "main"], { inherit: true });
    try {
      git(["merge", "--no-edit", "origin/main"], { inherit: true });
    } catch (mergeError) {
      try {
        git(["merge", "--abort"], { inherit: true });
      } catch {
        // Best-effort cleanup only. The original merge error is authoritative.
      }
      throw new Error(`Concurrent main update could not be merged safely.\n${mergeError.message}`);
    }
    git(["push", "origin", "main"], { inherit: true });
  }
}

if (process.env[APPROVAL_ENV] !== "YES") {
  fail("EXPLICIT_APPROVAL_REQUIRED", `${APPROVAL_ENV}=YES`);
}

process.chdir(repositoryRoot);
assertMainBranch();
assertTrackedTreeClean();

let repairedFiles = 0;
let repairedHelpers = 0;

try {
  while (true) {
    if (repairedFiles >= MAX_REPAIR_COMMITS) fail("REPAIR_COMMIT_LIMIT_EXCEEDED");

    assertTrackedTreeClean();
    synchronizeMain();
    assertTrackedTreeClean();

    const findings = await scan();
    if (!findings.length) break;

    const target = findings[0];
    const freshSource = await fs.readFile(target.absolute, "utf8");
    const freshHelpers = findUnawaitedHelpers(freshSource);
    if (!freshHelpers.length) continue;

    const repairedSource = patchSource(freshSource, freshHelpers);
    const remaining = findUnawaitedHelpers(repairedSource);
    if (remaining.length) {
      fail(
        "TARGET_HELPER_REPAIR_INCOMPLETE",
        `${target.relative}:${remaining.map((item) => item.name).join(",")}`,
      );
    }

    await fs.writeFile(target.absolute, repairedSource, "utf8");
    run(process.execPath, ["--check", target.absolute], { inherit: true });
    git(["diff", "--check", "--", target.relative], { inherit: true });
    git(["add", "--", target.relative]);
    git(["commit", "-m", commitMessage(target.relative)], { inherit: true });
    pushCurrentCommit();

    repairedFiles += 1;
    repairedHelpers += freshHelpers.length;
    console.log(`SECRETARY_SUPABASE_AWAIT_REPAIRED_FILE=${target.relative}`);
    console.log(`SECRETARY_SUPABASE_AWAIT_REPAIRED_HELPERS=${freshHelpers.map((item) => item.name).join(",")}`);
  }

  assertTrackedTreeClean();
  synchronizeMain();
  assertTrackedTreeClean();
  run(process.execPath, [auditPath], { inherit: true });

  console.log("SECRETARY_SUPABASE_AWAIT_REPAIR=PASS");
  console.log(`SECRETARY_SUPABASE_AWAIT_REPAIR_FILE_COUNT=${repairedFiles}`);
  console.log(`SECRETARY_SUPABASE_AWAIT_REPAIR_HELPER_COUNT=${repairedHelpers}`);
  console.log("SECRETARY_SUPABASE_RESPONSE_READS_REQUIRE_AWAIT=true");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
} catch (error) {
  fail("REPAIR_EXECUTION_FAILED", error?.stack || error?.message || error);
}
