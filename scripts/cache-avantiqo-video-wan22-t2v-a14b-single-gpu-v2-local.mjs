import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_GPU_SHARED_QUIESCENCE_V2";

const text = (value) => String(value ?? "").trim();

function shell(name, args, code, options = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = options.stdio === "inherit"
      ? `exit=${result.status}`
      : text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${code}:${detail}`);
  }
  return options.stdio === "inherit" ? "" : text(result.stdout);
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_V2_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_V2_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V2_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_V2_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_V2_REMOTE_READ_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V2_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", BASE_RUNNER],
    "AVANTIQO_VIDEO_SINGLE_GPU_V2_BASE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_V2_BASE_RUNNER_HAS_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

function compatibilitySource(baseSource) {
  const oldWorkerHelpers = [
    "function workerCount(health) {",
    "  return Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);",
    "}",
    "",
    "function assertIdle(health, label) {",
    "  const workers = workerCount(health);",
    "  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || workers !== 0) {",
    "    throw new Error(`${label}_NOT_IDLE:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${workers}`);",
    "  }",
    "}",
  ].join("\n");

  const newWorkerHelpers = [
    "function liveWorkerCount(health) {",
    "  return Number(health.workers.initializing || 0) + Number(health.workers.running || 0);",
    "}",
    "",
    "function assertIdle(health, label) {",
    "  const liveWorkers = liveWorkerCount(health);",
    "  if (",
    "    health.jobs.in_queue !== 0 ||",
    "    health.jobs.in_progress !== 0 ||",
    "    health.workers.unhealthy !== 0 ||",
    "    liveWorkers !== 0",
    "  ) {",
    "    throw new Error(`${label}_NOT_QUIESCENT:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:initializing=${health.workers.initializing}:running=${health.workers.running}:unhealthy=${health.workers.unhealthy}`);",
    "  }",
    "}",
  ].join("\n");

  const oldRestoreCondition = [
    "      health.jobs.in_queue === 0 &&",
    "      health.jobs.in_progress === 0 &&",
    "      workerCount(health) === 0",
  ].join("\n");

  const newRestoreCondition = [
    "      health.jobs.in_queue === 0 &&",
    "      health.jobs.in_progress === 0 &&",
    "      health.workers.unhealthy === 0 &&",
    "      liveWorkerCount(health) === 0",
  ].join("\n");

  let source = replaceExactlyOnce(
    baseSource,
    oldWorkerHelpers,
    newWorkerHelpers,
    "AVANTIQO_VIDEO_SINGLE_GPU_V2_WORKER_HELPERS",
  );
  source = replaceExactlyOnce(
    source,
    oldRestoreCondition,
    newRestoreCondition,
    "AVANTIQO_VIDEO_SINGLE_GPU_V2_RESTORE_CONDITION",
  );
  return source;
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V2_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireCurrentMain();
const baseSource = await readFile(BASE_RUNNER, "utf8");
const patchedSource = compatibilitySource(baseSource);
const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-v2-"));
const path = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v2-compat.mjs");

try {
  await writeFile(path, patchedSource, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V2_COMPATIBILITY_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 1200)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    base_runner: BASE_RUNNER,
    image_quiescence_semantics: {
      queued_jobs_block: true,
      in_progress_jobs_block: true,
      initializing_workers_block: true,
      running_workers_block: true,
      unhealthy_workers_block: true,
      idle_workers_block: false,
      ready_workers_block: false,
      throttled_workers_block: false,
    },
    image_mutation_performed_by_v2: false,
    video_mutation_performed_by_v2: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));

  const child = spawnSync(process.execPath, [path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V2_CHILD_FAILED:exit=${child.status}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
