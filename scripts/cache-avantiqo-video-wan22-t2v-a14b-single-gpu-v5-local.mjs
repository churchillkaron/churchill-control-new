import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V4_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v4-local.mjs";
const SINGLE_GPU_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_GPU_B200_EXCLUSION_V5";
const EXCLUDED_GPU = "NVIDIA B200";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs",
  SINGLE_GPU_RUNNER,
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v3-local.mjs",
  V4_RUNNER,
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v5-local.mjs",
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
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_V5_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_V5_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_V5_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_V5_REMOTE_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_SINGLE_GPU_V5_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (head !== remote) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_SINGLE_GPU_V5_SCOPED_DIFF_FAILED",
    );
    if (changed) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    console.log(`AVANTIQO_VIDEO_SINGLE_GPU_V5_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_SINGLE_GPU_V5_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_V5_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
const [v4Source, singleGpuSource] = await Promise.all([
  readFile(V4_RUNNER, "utf8"),
  readFile(SINGLE_GPU_RUNNER, "utf8"),
]);

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
  `  const excluded = new Set([${JSON.stringify(EXCLUDED_GPU)}]);`,
  "  const nonBlackwell = candidates.filter((gpu) => !ORIGINAL_BLACKWELL_POOL.includes(gpu.id) && !excluded.has(gpu.id));",
  "  const requested = text(process.env.AVANTIQO_VIDEO_WAN22_T2V_SINGLE_GPU_TYPE_ID);",
  "  if (requested) {",
  "    if (excluded.has(requested)) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_REQUESTED_GPU_EXCLUDED_AFTER_PROVIDER_NO_START:${requested}`);",
  "    const exact = nonBlackwell.find((gpu) => gpu.id === requested);",
  "    if (!exact) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_REQUESTED_GPU_NOT_LIVE:${requested}`);",
  "    return exact;",
  "  }",
  "  if (!nonBlackwell.length) {",
  "    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_NO_NON_BLACKWELL_NON_B200_CAPACITY:${JSON.stringify(candidates)}`);",
  "  }",
  "  return nonBlackwell[0];",
  "}",
].join("\n");

const selectionCount = singleGpuSource.split(oldSelectSingleGpu).length - 1;
if (selectionCount !== 1) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_SELECTION_ANCHOR_COUNT:${selectionCount}`);
}
const patchedSingleGpu = singleGpuSource.replace(oldSelectSingleGpu, newSelectSingleGpu);

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-v5-"));
const patchedSinglePath = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-gpu-b200-excluded.mjs");
const patchedV4Path = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v5-compat.mjs");

try {
  await writeFile(patchedSinglePath, patchedSingleGpu, "utf8");
  const patchedV4 = replaceExactlyOnce(
    v4Source,
    `const BASE_RUNNER = ${JSON.stringify(SINGLE_GPU_RUNNER)};`,
    `const BASE_RUNNER = ${JSON.stringify(patchedSinglePath)};`,
    "AVANTIQO_VIDEO_SINGLE_GPU_V5_V4_BASE_RUNNER",
  );
  await writeFile(patchedV4Path, patchedV4, "utf8");

  for (const [label, path] of [["SINGLE_GPU", patchedSinglePath], ["V4", patchedV4Path]]) {
    const syntax = spawnSync(process.execPath, ["--check", path], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (syntax.status !== 0) {
      throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_${label}_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 1200)}`);
    }
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    provider_scheduling_evidence: {
      excluded_gpu_type_id: EXCLUDED_GPU,
      reason: "TWO_RUNTIME_PROBES_REMAINED_IN_QUEUE_WITH_ZERO_WORKERS_AND_WERE_CANCELLED",
    },
    selection_policy: {
      one_live_compatible_non_blackwell_gpu: true,
      b200_excluded: true,
      automatic_second_attempt: false,
      no_runpod_mutation_if_no_remaining_candidate: true,
    },
    inherited_v4_guards: {
      no_worker_startup_timeout_ms: 120000,
      exact_job_cancel_on_guard_failure: true,
      baseline_restore: true,
      image_shared_volume_quiescence_guard: true,
      unrelated_main_movement_tolerated: true,
    },
    image_mutation_performed_by_v5: false,
    video_mutation_performed_by_v5: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));

  const child = spawnSync(process.execPath, [patchedV4Path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V5_CHILD_FAILED:exit=${child.status}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
