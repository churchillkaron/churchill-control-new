import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_T2V_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs";
const SINGLE_GPU_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs";
const V4_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v4-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_BLACKWELL_SERVER_DIRECT_V8";
const REQUIRED_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  BASE_T2V_RUNNER,
  SINGLE_GPU_RUNNER,
  V4_RUNNER,
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v6-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v7-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v8-local.mjs",
  "audits/results/avantiqo-video-worker-image.json",
  "audits/results/avantiqo-image-v9-certification-lock.json",
];

const text = (value) => String(value ?? "").trim();

function shell(name, args, code, options = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = options.stdio === "inherit" ? `exit=${result.status}` : text(result.stderr || result.stdout).slice(0, 1600);
    throw new Error(`${code}:${detail}`);
  }
  return options.stdio === "inherit" ? "" : text(result.stdout);
}

function requireScopedMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_V8_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_V8_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_V8_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_V8_REMOTE_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (head !== remote) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_SINGLE_GPU_V8_SCOPED_DIFF_FAILED",
    );
    if (changed) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    console.log(`AVANTIQO_VIDEO_SINGLE_GPU_V8_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_V8_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
const [baseSource, singleSource, v4Source] = await Promise.all([
  readFile(BASE_T2V_RUNNER, "utf8"),
  readFile(SINGLE_GPU_RUNNER, "utf8"),
  readFile(V4_RUNNER, "utf8"),
]);

const oldBaseMainGate = [
  "function requireCurrentMain() {",
  "  shell(\"git\", [\"fetch\", \"origin\", \"main\"], \"AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED\");",
  "  const branch = shell(\"git\", [\"branch\", \"--show-current\"], \"AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED\");",
  "  if (branch !== \"main\") throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:${branch || \"DETACHED\"}`);",
  "  const head = shell(\"git\", [\"rev-parse\", \"HEAD\"], \"AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED\");",
  "  const remote = shell(\"git\", [\"rev-parse\", \"origin/main\"], \"AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED\");",
  "  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);",
  "  const dirty = shell(",
  "    \"git\",",
  "    [\"status\", \"--porcelain\", \"--untracked-files=no\", \"--\", VIDEO_SOURCE_PATH],",
  "    \"AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED\",",
  "  );",
  "  if (dirty) throw new Error(\"AVANTIQO_VIDEO_T2V_CACHE_VIDEO_SOURCE_HAS_LOCAL_CHANGES\");",
  "  return head;",
  "}",
].join("\n");

const newBaseMainGate = [
  "function requireCurrentMain() {",
  "  shell(\"git\", [\"fetch\", \"origin\", \"main\"], \"AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED\");",
  "  const branch = shell(\"git\", [\"branch\", \"--show-current\"], \"AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED\");",
  "  if (branch !== \"main\") throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:${branch || \"DETACHED\"}`);",
  "  const head = shell(\"git\", [\"rev-parse\", \"HEAD\"], \"AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED\");",
  "  const remote = shell(\"git\", [\"rev-parse\", \"origin/main\"], \"AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED\");",
  "  const relation = shell(\"git\", [\"rev-list\", \"--left-right\", \"--count\", `${head}...${remote}`], \"AVANTIQO_VIDEO_T2V_CACHE_MAIN_RELATION_FAILED\").split(/\\s+/).map(Number);",
  "  if (Number(relation[0] || 0) !== 0) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_MAIN_DIVERGED:head=${head}:origin=${remote}`);",
  "  const scopedPaths = [VIDEO_SOURCE_PATH, VIDEO_EVIDENCE_PATH, IMAGE_LOCK_PATH, \"scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs\", \"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs\", \"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v4-local.mjs\", \"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v8-local.mjs\"];",
  "  if (head !== remote) {",
  "    const changed = shell(\"git\", [\"diff\", \"--name-only\", head, remote, \"--\", ...scopedPaths], \"AVANTIQO_VIDEO_T2V_CACHE_SCOPED_DIFF_FAILED\");",
  "    if (changed) throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\\n/g, \",\")}`);",
  "    console.log(`AVANTIQO_VIDEO_T2V_CACHE_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);",
  "  }",
  "  const dirty = shell(\"git\", [\"status\", \"--porcelain\", \"--untracked-files=no\", \"--\", ...scopedPaths], \"AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED\");",
  "  if (dirty) throw new Error(\"AVANTIQO_VIDEO_T2V_CACHE_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES\");",
  "  return head;",
  "}",
].join("\n");

const oldSelectSingleGpu = [
  "function selectSingleGpu(candidates) {",
  "  const nonBlackwell = candidates.filter((gpu) => !ORIGINAL_BLACKWELL_POOL.includes(gpu.id));",
  "  const requested = text(process.env.AVANTIQO_VIDEO_WAN22_T2V_SINGLE_GPU_TYPE_ID);",
  "  if (requested) {",
  "    const exact = nonBlackwell.find((gpu) => gpu.id === requested);",
  "    if (!exact) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_REQUESTED_GPU_NOT_LIVE:${requested}`);",
  "    return exact;",
  "  }",
  "  if (!nonBlackwell.length) {",
  "    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_NO_NON_BLACKWELL_CAPACITY:${JSON.stringify(candidates)}`);",
  "  }",
  "  return nonBlackwell[0];",
  "}",
].join("\n");

const newSelectSingleGpu = [
  "function selectSingleGpu(candidates) {",
  `  const required = ${JSON.stringify(REQUIRED_GPU)};`,
  "  const requested = text(process.env.AVANTIQO_VIDEO_WAN22_T2V_SINGLE_GPU_TYPE_ID);",
  "  if (requested && requested !== required) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_ONLY_BLACKWELL_SERVER_ALLOWED:${requested}`);",
  "  const exact = candidates.find((gpu) => gpu.id === required && gpu.stock_score > 0);",
  "  if (!exact) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_BLACKWELL_SERVER_NOT_LIVE:${JSON.stringify(candidates)}`);",
  "  return exact;",
  "}",
].join("\n");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-v8-"));
const patchedBasePath = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-scoped-main.mjs");
const patchedSinglePath = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-blackwell-server.mjs");
const patchedV4Path = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v8-compat.mjs");

try {
  const patchedBase = replaceExactlyOnce(
    baseSource,
    oldBaseMainGate,
    newBaseMainGate,
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_BASE_MAIN_GATE",
  );
  await writeFile(patchedBasePath, patchedBase, "utf8");

  let patchedSingle = replaceExactlyOnce(
    singleSource,
    oldSelectSingleGpu,
    newSelectSingleGpu,
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_SELECTION",
  );
  patchedSingle = replaceExactlyOnce(
    patchedSingle,
    `const BASE_RUNNER = ${JSON.stringify(BASE_T2V_RUNNER)};`,
    `const BASE_RUNNER = ${JSON.stringify(patchedBasePath)};`,
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_BASE_RUNNER_PATH",
  );
  await writeFile(patchedSinglePath, patchedSingle, "utf8");

  let patchedV4 = v4Source;
  patchedV4 = replaceExactlyOnce(
    patchedV4,
    `const BASE_RUNNER = ${JSON.stringify(SINGLE_GPU_RUNNER)};`,
    `const BASE_RUNNER = ${JSON.stringify(patchedSinglePath)};`,
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_V4_RUNNER_PATH",
  );
  patchedV4 = replaceExactlyOnce(
    patchedV4,
    '    "    BASE_RUNNER,",',
    `    ${JSON.stringify(`    ${JSON.stringify(BASE_T2V_RUNNER)},`)},`,
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_V4_CHILD_SCOPED_BASE",
  );
  patchedV4 = replaceExactlyOnce(
    patchedV4,
    '    "        BASE_RUNNER,",',
    `    ${JSON.stringify(`        ${JSON.stringify(BASE_T2V_RUNNER)},`)},`,
    "AVANTIQO_VIDEO_SINGLE_GPU_V8_V4_RUNTIME_SCOPED_BASE",
  );
  await writeFile(patchedV4Path, patchedV4, "utf8");

  for (const [label, path] of [
    ["BASE", patchedBasePath],
    ["SINGLE", patchedSinglePath],
    ["V4", patchedV4Path],
  ]) {
    const syntax = spawnSync(process.execPath, ["--check", path], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (syntax.status !== 0) {
      throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_${label}_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 1600)}`);
    }
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    selected_gpu: REQUIRED_GPU,
    design: {
      direct_temp_base_runner_patch: true,
      nested_string_codegen_removed: true,
      all_temp_files_syntax_checked_before_execution: true,
      unrelated_main_commits_tolerated: true,
      video_or_image_safety_input_changes_fail_closed: true,
    },
    inherited_v4_safety: {
      no_worker_startup_timeout_ms: 120000,
      exact_job_cancel_on_guard_failure: true,
      original_blackwell_pool_restored_after_run: true,
      image_shared_volume_quiescence_guard: true,
      automatic_second_attempt: false,
    },
    image_mutation_performed_by_v8: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));

  const child = spawnSync(process.execPath, [patchedV4Path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V8_CHILD_FAILED:exit=${child.status}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
