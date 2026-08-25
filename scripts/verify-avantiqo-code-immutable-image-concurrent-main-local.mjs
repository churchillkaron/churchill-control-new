import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_IMMUTABLE_IMAGE_CONCURRENT_MAIN_VERIFY_V1";
const BINDER = "bind-avantiqo-code-runpod-immutable-image-local.mjs";

function text(value) { return String(value ?? "").trim(); }
function run(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

if (process.argv.includes("--apply")) {
  throw new Error("AVANTIQO_CODE_IMMUTABLE_IMAGE_CONCURRENT_MAIN_VERIFY_READ_ONLY");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const binderPath = resolve(scriptDir, BINDER);
if (!existsSync(binderPath)) throw new Error("AVANTIQO_CODE_IMMUTABLE_IMAGE_BINDER_REQUIRED");

const source = readFileSync(binderPath, "utf8");
const start = source.indexOf("function validateLocalMainAndImageSource() {");
const end = source.indexOf("\n\nasync function readJson", start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error("AVANTIQO_CODE_IMMUTABLE_IMAGE_BINDER_GUARD_BOUNDARY_MISSING");
}

const replacement = `function validateLocalMainAndImageSource() {
  const protectedPaths = [
    "scripts/bind-avantiqo-code-runpod-immutable-image-local.mjs",
    "scripts/verify-avantiqo-code-immutable-image-concurrent-main-local.mjs",
    ".github/workflows/avantiqo-code-worker-image.yml",
    "services/avantiqo-code-engine",
  ];
  command("git", ["fetch", "origin", "main"], "AVANTIQO_CODE_IMAGE_BIND_GIT_FETCH_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_CODE_IMAGE_BIND_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error("AVANTIQO_CODE_IMAGE_BIND_MAIN_REQUIRED:actual=" + (branch || "DETACHED"));
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_CODE_IMAGE_BIND_GIT_HEAD_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_CODE_IMAGE_BIND_GIT_ORIGIN_MAIN_FAILED");
  if (head !== originMain) {
    const mergeBase = command("git", ["merge-base", head, originMain], "AVANTIQO_CODE_IMAGE_BIND_MERGE_BASE_FAILED");
    if (mergeBase !== head) {
      throw new Error("AVANTIQO_CODE_IMAGE_BIND_LOCAL_MAIN_DIVERGED:head=" + head + ":origin_main=" + originMain + ":merge_base=" + mergeBase);
    }
    const protectedChanges = command(
      "git",
      ["diff", "--name-only", head + ".." + originMain, "--", ...protectedPaths],
      "AVANTIQO_CODE_IMAGE_BIND_PROTECTED_DIFF_FAILED",
    ).split(String.fromCharCode(10)).map((value) => value.trim()).filter(Boolean);
    if (protectedChanges.length) {
      throw new Error(
        "AVANTIQO_CODE_IMAGE_BIND_PROTECTED_MAIN_ADVANCE_REPLAN_REQUIRED:head=" +
        head +
        ":origin_main=" +
        originMain +
        ":changed=" +
        protectedChanges.join("|"),
      );
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_IMAGE_BIND_UNRELATED_MAIN_ADVANCE_ACCEPTED",
      local_head: head,
      origin_main: originMain,
      protected_paths_changed: [],
      local_head_is_ancestor_of_origin_main: true,
    }));
  }
  const ancestor = commandStatus("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, head]);
  if (ancestor.status !== 0) {
    throw new Error("AVANTIQO_CODE_IMAGE_BIND_IMAGE_SOURCE_NOT_ANCESTOR_OF_MAIN");
  }
  const changes = command(
    "git",
    ["diff", "--name-only", IMAGE_SOURCE_SHA + ".." + head, "--", CODE_SOURCE_PATH],
    "AVANTIQO_CODE_IMAGE_BIND_SOURCE_DIFF_FAILED",
  ).split(String.fromCharCode(10)).map((value) => value.trim()).filter(Boolean);
  if (changes.length) {
    throw new Error("AVANTIQO_CODE_IMAGE_BIND_WORKER_SOURCE_MOVED:" + changes.join(","));
  }
  return head;
}`;

const patched = source.slice(0, start) + replacement + source.slice(end);
if (
  patched === source ||
  patched.includes("AVANTIQO_CODE_IMAGE_BIND_LOCAL_MAIN_NOT_CURRENT") ||
  !patched.includes("AVANTIQO_CODE_IMAGE_BIND_UNRELATED_MAIN_ADVANCE_ACCEPTED") ||
  !patched.includes("AVANTIQO_CODE_IMAGE_BIND_PROTECTED_MAIN_ADVANCE_REPLAN_REQUIRED")
) {
  throw new Error("AVANTIQO_CODE_IMMUTABLE_IMAGE_CONCURRENT_MAIN_PATCH_VERIFY_FAILED");
}

const tempPath = resolve(scriptDir, `.avantiqo-code-image-bind-concurrent-main-${process.pid}.mjs`);
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_IMMUTABLE_IMAGE_CONCURRENT_MAIN_VERIFY_START",
  contract: CONTRACT,
  mode: "READ_ONLY_PLAN",
  binder_guard: "PROTECTED_PATH_SCOPED",
  mutation_allowed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  writeFileSync(tempPath, patched, { encoding: "utf8", flag: "wx" });
  run(process.execPath, ["--check", tempPath], "AVANTIQO_CODE_IMMUTABLE_IMAGE_GENERATED_BINDER_SYNTAX_FAILED");
  const child = spawnSync(process.execPath, [tempPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error(`AVANTIQO_CODE_IMMUTABLE_IMAGE_VERIFY_CHILD_SIGNAL:${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_CODE_IMMUTABLE_IMAGE_VERIFY_CHILD_EXIT:${child.status ?? "UNKNOWN"}`);
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_IMMUTABLE_IMAGE_CONCURRENT_MAIN_VERIFY_COMPLETE",
    contract: CONTRACT,
    child_exit_code: 0,
    mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (existsSync(tempPath)) unlinkSync(tempPath);
}
