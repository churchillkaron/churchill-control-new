import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_SINGLE_GPU_PROVIDER_STARTUP_V3";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v3-local.mjs",
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
    const detail = options.stdio === "inherit"
      ? `exit=${result.status}`
      : text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${code}:${detail}`);
  }
  return options.stdio === "inherit" ? "" : text(result.stdout);
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_V3_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_V3_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V3_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_V3_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_V3_REMOTE_READ_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V3_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_SINGLE_GPU_V3_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_V3_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
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

  const oldCreateCompatibilityLine = "  const source = compatibilitySource(baseSource);";
  const newCreateCompatibilityBlock = [
    "  let source = compatibilitySource(baseSource);",
    "  const oldWaitForJob = [",
    "    \"async function waitForJob(endpointId, jobId, key, label, waitMs) {\",",
    "    \"  const deadline = Date.now() + waitMs;\",",
    "    \"  let lastStatus = \\\"\\\";\",",
    "    \"  while (Date.now() <= deadline) {\",",
    "    \"    const job = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, key);\",",
    "    \"    const status = text(job.status).toUpperCase();\",",
    "    \"    if (terminalStatus(status)) return job;\",",
    "    \"    if (status !== lastStatus || Date.now() % 60_000 < POLL_MS) {\",",
    "    \"      const health = healthSummary(await queueRequest(endpointId, \\\"/health\\\", key));\",",
    "    \"      console.log(`AVANTIQO_VIDEO_T2V_CACHE_${label}_PROGRESS status=${status || \\\"UNKNOWN\\\"} health=${JSON.stringify(health)}`);\",",
    "    \"      lastStatus = status;\",",
    "    \"    }\",",
    "    \"    await sleep(POLL_MS);\",",
    "    \"  }\",",
    "    \"  throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_WAIT_TIMEOUT:${jobId}`);\",",
    "    \"}\",",
    "  ].join(\"\\n\");",
    "  const newWaitForJob = [",
    "    \"async function waitForJob(endpointId, jobId, key, label, waitMs) {\",",
    "    \"  const deadline = Date.now() + waitMs;\",",
    "    \"  const startedAt = Date.now();\",",
    "    \"  let lastStatus = \\\"\\\";\",",
    "    \"  while (Date.now() <= deadline) {\",",
    "    \"    const job = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, key);\",",
    "    \"    const status = text(job.status).toUpperCase();\",",
    "    \"    if (terminalStatus(status)) return job;\",",
    "    \"    const printProgress = status !== lastStatus || Date.now() % 60_000 < POLL_MS;\",",
    "    \"    const checkNoWorker = status === \\\"IN_QUEUE\\\" && Date.now() - startedAt >= 120_000;\",",
    "    \"    let health = null;\",",
    "    \"    if (printProgress || checkNoWorker) {\",",
    "    \"      health = healthSummary(await queueRequest(endpointId, \\\"/health\\\", key));\",",
    "    \"    }\",",
    "    \"    if (printProgress) {\",",
    "    \"      console.log(`AVANTIQO_VIDEO_T2V_CACHE_${label}_PROGRESS status=${status || \\\"UNKNOWN\\\"} health=${JSON.stringify(health)}`);\",",
    "    \"      lastStatus = status;\",",
    "    \"    }\",",
    "    \"    if (checkNoWorker && health && health.jobs.in_queue > 0 && health.jobs.in_progress === 0 && activeQueueWorkers(health) === 0) {\",",
    "    \"      throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_NO_WORKER_STARTUP_TIMEOUT:${jobId}`);\",",
    "    \"    }\",",
    "    \"    await sleep(POLL_MS);\",",
    "    \"  }\",",
    "    \"  throw new Error(`AVANTIQO_VIDEO_T2V_CACHE_${label}_WAIT_TIMEOUT:${jobId}`);\",",
    "    \"}\",",
    "  ].join(\"\\n\");",
    "  const waitAnchorCount = source.split(oldWaitForJob).length - 1;",
    "  if (waitAnchorCount !== 1) {",
    "    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V3_WAIT_FOR_JOB_ANCHOR_INVALID:${waitAnchorCount}`);",
    "  }",
    "  source = source.replace(oldWaitForJob, newWaitForJob);",
  ].join("\n");

  const oldMainMovement = [
    "      const refs = currentMainRefs();",
    "      mainMovedDuringRun = refs.head !== refs.remote || refs.head !== mainSha;",
    "      if (mainMovedDuringRun) {",
    "        console.error(`AVANTIQO_VIDEO_SINGLE_GPU_MAIN_MOVED_DURING_RUN:head=${refs.head}:origin=${refs.remote}:start=${mainSha}`);",
    "      }",
  ].join("\n");

  const newMainMovement = [
    "      const refs = currentMainRefs();",
    "      const ownedPaths = [",
    "        VIDEO_SOURCE_PATH,",
    "        BASE_RUNNER,",
    "        VIDEO_EVIDENCE_PATH,",
    "        IMAGE_LOCK_PATH,",
    "        \"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-local.mjs\",",
    "        \"scripts/cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v3-local.mjs\",",
    "      ];",
    "      const remoteOwnedChanges = shell(",
    "        \"git\",",
    "        [\"diff\", \"--name-only\", mainSha, refs.remote, \"--\", ...ownedPaths],",
    "        \"AVANTIQO_VIDEO_SINGLE_GPU_OWNED_REMOTE_DIFF_FAILED\",",
    "      );",
    "      const headOwnedChanges = shell(",
    "        \"git\",",
    "        [\"diff\", \"--name-only\", mainSha, refs.head, \"--\", ...ownedPaths],",
    "        \"AVANTIQO_VIDEO_SINGLE_GPU_OWNED_HEAD_DIFF_FAILED\",",
    "      );",
    "      mainMovedDuringRun = Boolean(remoteOwnedChanges || headOwnedChanges);",
    "      if (mainMovedDuringRun) {",
    "        console.error(`AVANTIQO_VIDEO_SINGLE_GPU_VIDEO_OWNED_MAIN_MOVED_DURING_RUN:head=${refs.head}:origin=${refs.remote}:start=${mainSha}:paths=${[remoteOwnedChanges, headOwnedChanges].filter(Boolean).join(\",\")}`);",
    "      } else if (refs.head !== refs.remote || refs.head !== mainSha) {",
    "        console.log(`AVANTIQO_VIDEO_SINGLE_GPU_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${refs.head} origin=${refs.remote} start=${mainSha}`);",
    "      }",
  ].join("\n");

  let source = replaceExactlyOnce(
    baseSource,
    oldWorkerHelpers,
    newWorkerHelpers,
    "AVANTIQO_VIDEO_SINGLE_GPU_V3_WORKER_HELPERS",
  );
  source = replaceExactlyOnce(
    source,
    oldRestoreCondition,
    newRestoreCondition,
    "AVANTIQO_VIDEO_SINGLE_GPU_V3_RESTORE_CONDITION",
  );
  source = replaceExactlyOnce(
    source,
    oldCreateCompatibilityLine,
    newCreateCompatibilityBlock,
    "AVANTIQO_VIDEO_SINGLE_GPU_V3_BASE_WAIT_GUARD",
  );
  source = replaceExactlyOnce(
    source,
    oldMainMovement,
    newMainMovement,
    "AVANTIQO_VIDEO_SINGLE_GPU_V3_MAIN_MOVEMENT",
  );
  return source;
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V3_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireCurrentMain();
const baseSource = await readFile(BASE_RUNNER, "utf8");
const patchedSource = compatibilitySource(baseSource);
const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-v3-"));
const path = join(dir, "cache-avantiqo-video-wan22-t2v-a14b-single-gpu-v3-compat.mjs");

try {
  await writeFile(path, patchedSource, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V3_COMPATIBILITY_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 1200)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    provider_startup_guard: {
      queued_without_any_worker_timeout_ms: 120000,
      exact_submitted_job_cancelled_on_guard_failure: true,
      existing_base_cleanup_chain_preserved: true,
    },
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
    main_movement_policy: {
      unrelated_main_commits_tolerated_during_long_run: true,
      video_owned_input_changes_fail_closed: true,
    },
    image_mutation_performed_by_v3: false,
    video_mutation_performed_by_v3: false,
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
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_V3_CHILD_FAILED:exit=${child.status}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
