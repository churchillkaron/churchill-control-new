import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V6_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v6-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_BLACKWELL_SERVER_INNER_MAIN_V7";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v4-local.mjs",
  V6_RUNNER,
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v7-local.mjs",
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
    const detail = options.stdio === "inherit" ? `exit=${result.status}` : text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${code}:${detail}`);
  }
  return options.stdio === "inherit" ? "" : text(result.stdout);
}

function requireScopedMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_V7_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_V7_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V7_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_V7_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_V7_REMOTE_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_SINGLE_GPU_V7_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V7_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (head !== remote) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_SINGLE_GPU_V7_SCOPED_DIFF_FAILED",
    );
    if (changed) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V7_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    console.log(`AVANTIQO_VIDEO_SINGLE_GPU_V7_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_SINGLE_GPU_V7_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_V7_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V7_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
const v6Source = await readFile(V6_RUNNER, "utf8");
const oldPatchedSingleLine = "const patchedSingleGpu = singleGpuSource.replace(oldSelectSingleGpu, newSelectSingleGpu);";
const newPatchedSingleBlock = String.raw`let patchedSingleGpu = singleGpuSource.replace(oldSelectSingleGpu, newSelectSingleGpu);
const oldCompatibilityReturn = "  return baseSource.replace(vulnerable, guarded);";
const newCompatibilityReturn = [
  "  let source = baseSource.replace(vulnerable, guarded);",
  "  const oldMainGate = [",
  "    \"function requireCurrentMain() {\",",
  "    \"  shell(\\\"git\\\", [\\\"fetch\\\", \\\"origin\\\", \\\"main\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED\\\");\",",
  "    \"  const branch = shell(\\\"git\\\", [\\\"branch\\\", \\\"--show-current\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED\\\");\",",
  "    \"  if (branch !== \\\"main\\\") throw new Error(\\\`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:\\${branch || \\\"DETACHED\\\"}\\\`);\",",
  "    \"  const head = shell(\\\"git\\\", [\\\"rev-parse\\\", \\\"HEAD\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED\\\");\",",
  "    \"  const remote = shell(\\\"git\\\", [\\\"rev-parse\\\", \\\"origin/main\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED\\\");\",",
  "    \"  if (head !== remote) throw new Error(\\\`AVANTIQO_VIDEO_T2V_CACHE_LOCAL_MAIN_NOT_CURRENT:head=\\${head}:origin=\\${remote}\\\`);\",",
  "    \"  const dirty = shell(\",",
  "    \"    \\\"git\\\",\",",
  "    \"    [\\\"status\\\", \\\"--porcelain\\\", \\\"--untracked-files=no\\\", \\\"--\\\", VIDEO_SOURCE_PATH],\",",
  "    \"    \\\"AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED\\\",\",",
  "    \"  );\",",
  "    \"  if (dirty) throw new Error(\\\"AVANTIQO_VIDEO_T2V_CACHE_VIDEO_SOURCE_HAS_LOCAL_CHANGES\\\");\",",
  "    \"  return head;\",",
  "    \"}\",",
  "  ].join(\"\\n\");",
  "  const newMainGate = [",
  "    \"function requireCurrentMain() {\",",
  "    \"  shell(\\\"git\\\", [\\\"fetch\\\", \\\"origin\\\", \\\"main\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED\\\");\",",
  "    \"  const branch = shell(\\\"git\\\", [\\\"branch\\\", \\\"--show-current\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED\\\");\",",
  "    \"  if (branch !== \\\"main\\\") throw new Error(\\\`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:\\${branch || \\\"DETACHED\\\"}\\\`);\",",
  "    \"  const head = shell(\\\"git\\\", [\\\"rev-parse\\\", \\\"HEAD\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED\\\");\",",
  "    \"  const remote = shell(\\\"git\\\", [\\\"rev-parse\\\", \\\"origin/main\\\"], \\\"AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED\\\");\",",
  "    \"  const relation = shell(\\\"git\\\", [\\\"rev-list\\\", \\\"--left-right\\\", \\\"--count\\\", \\\`\\${head}...\\${remote}\\\`], \\\"AVANTIQO_VIDEO_T2V_CACHE_MAIN_RELATION_FAILED\\\").split(/\\\\s+/).map(Number);\",",
  "    \"  if (Number(relation[0] || 0) !== 0) throw new Error(\\\`AVANTIQO_VIDEO_T2V_CACHE_MAIN_DIVERGED:head=\\${head}:origin=\\${remote}\\\`);\",",
  "    \"  const scopedPaths = [VIDEO_SOURCE_PATH, VIDEO_EVIDENCE_PATH, IMAGE_LOCK_PATH, \\\"scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs\\\", \\\"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs\\\", \\\"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v4-local.mjs\\\", \\\"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v6-local.mjs\\\", \\\"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v7-local.mjs\\\"];\",",
  "    \"  if (head !== remote) {\",",
  "    \"    const changed = shell(\\\"git\\\", [\\\"diff\\\", \\\"--name-only\\\", head, remote, \\\"--\\\", ...scopedPaths], \\\"AVANTIQO_VIDEO_T2V_CACHE_SCOPED_DIFF_FAILED\\\");\",",
  "    \"    if (changed) throw new Error(\\\`AVANTIQO_VIDEO_T2V_CACHE_VIDEO_INPUTS_CHANGED_ON_MAIN:\\${changed.replace(/\\\\n/g, \\\",\\\")}\\\`);\",",
  "    \"    console.log(\\\`AVANTIQO_VIDEO_T2V_CACHE_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=\\${head} origin=\\${remote}\\\`);\",",
  "    \"  }\",",
  "    \"  const dirty = shell(\\\"git\\\", [\\\"status\\\", \\\"--porcelain\\\", \\\"--untracked-files=no\\\", \\\"--\\\", ...scopedPaths], \\\"AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED\\\");\",",
  "    \"  if (dirty) throw new Error(\\\"AVANTIQO_VIDEO_T2V_CACHE_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES\\\");\",",
  "    \"  return head;\",",
  "    \"}\",",
  "  ].join(\"\\n\");",
  "  const mainGateCount = source.split(oldMainGate).length - 1;",
  "  if (mainGateCount !== 1) throw new Error(\\\`AVANTIQO_VIDEO_SINGLE_GPU_V7_INNER_MAIN_GATE_ANCHOR_INVALID:\\${mainGateCount}\\\`);",
  "  source = source.replace(oldMainGate, newMainGate);",
  "  return source;",
].join("\n");
patchedSingleGpu = replaceExactlyOnce(
  patchedSingleGpu,
  oldCompatibilityReturn,
  newCompatibilityReturn,
  "AVANTIQO_VIDEO_SINGLE_GPU_V7_INNER_COMPATIBILITY_RETURN",
);`;

const patchedV6 = replaceExactlyOnce(
  v6Source,
  oldPatchedSingleLine,
  newPatchedSingleBlock,
  "AVANTIQO_VIDEO_SINGLE_GPU_V7_V6_PATCHED_SINGLE",
);

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-v7-"));
const path = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v7-compat.mjs");

try {
  await writeFile(path, patchedV6, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V7_COMPATIBILITY_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 1600)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    selected_gpu: "NVIDIA RTX PRO 6000 Blackwell Server Edition",
    nested_main_guard: {
      outer_v7_scoped_main: true,
      v6_scoped_main_preserved: true,
      v4_scoped_main_preserved: true,
      inner_t2v_scoped_main_added: true,
      unrelated_main_commits_tolerated: true,
      video_or_image_safety_input_changes_fail_closed: true,
      local_only_main_commits_fail_closed: true,
    },
    inherited_safety: {
      no_worker_startup_timeout_ms: 120000,
      exact_submitted_job_cancelled_on_guard_failure: true,
      original_blackwell_pool_restored_after_run: true,
      image_mutation: false,
      template_mutation: false,
      volume_mutation: false,
      production_web_deploy: false,
    },
    mutation_performed_by_v7_wrapper: false,
    secrets_printed: false,
  }, null, 2));

  const child = spawnSync(process.execPath, [path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V7_CHILD_FAILED:exit=${child.status}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
