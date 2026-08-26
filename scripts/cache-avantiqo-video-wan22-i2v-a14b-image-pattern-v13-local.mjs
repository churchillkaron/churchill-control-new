import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_RUNNER = "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs";
const SELF_PATH = "scripts/cache-avantiqo-video-wan22-i2v-a14b-image-pattern-v13-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_IMAGE_PATTERN_CACHE_V13";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  BASE_RUNNER,
  "scripts/stage-avantiqo-video-wan22-cache-only-local.mjs",
  SELF_PATH,
  "audits/results/avantiqo-video-worker-image.json",
  "audits/results/avantiqo-image-v9-certification-lock.json",
];

const text = (value) => String(value ?? "").trim();

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1600)}`);
  }
  return text(result.stdout);
}

function requireScopedMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_I2V_V13_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_I2V_V13_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_I2V_V13_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_I2V_V13_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_I2V_V13_REMOTE_READ_FAILED");
  const [ahead, behind] = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_I2V_V13_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(ahead || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_V13_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (Number(behind || 0) > 0) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_I2V_V13_SCOPED_DIFF_FAILED",
    );
    if (changed) {
      throw new Error(`AVANTIQO_VIDEO_I2V_V13_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    }
    console.log(`AVANTIQO_VIDEO_I2V_V13_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_I2V_V13_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_I2V_V13_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactly(source, before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}_ANCHOR_COUNT:${count}:expected=${expected}`);
  return source.split(before).join(after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V13_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
let source = await readFile(BASE_RUNNER, "utf8");

const oldMainGate = `function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(\`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:\${branch || "DETACHED"}\`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED");
  if (head !== remote) throw new Error(\`AVANTIQO_VIDEO_T2V_CACHE_LOCAL_MAIN_NOT_CURRENT:head=\${head}:origin=\${remote}\`);
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", VIDEO_SOURCE_PATH],
    "AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_VIDEO_SOURCE_HAS_LOCAL_CHANGES");
  return head;
}`;

const newMainGate = `function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_T2V_CACHE_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_T2V_CACHE_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(\`AVANTIQO_VIDEO_T2V_CACHE_MAIN_REQUIRED:\${branch || "DETACHED"}\`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_T2V_CACHE_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_T2V_CACHE_ORIGIN_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", \`\${head}...\${remote}\`],
    "AVANTIQO_VIDEO_T2V_CACHE_MAIN_RELATION_FAILED",
  ).split(/\\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(\`AVANTIQO_VIDEO_T2V_CACHE_MAIN_DIVERGED:head=\${head}:origin=\${remote}\`);
  }
  if (head !== remote) {
    const scopedPaths = [
      VIDEO_SOURCE_PATH,
      "scripts/cache-avantiqo-video-wan22-t2v-a14b-local.mjs",
      "scripts/stage-avantiqo-video-wan22-cache-only-local.mjs",
      "audits/results/avantiqo-video-worker-image.json",
      "audits/results/avantiqo-image-v9-certification-lock.json",
    ];
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...scopedPaths],
      "AVANTIQO_VIDEO_T2V_CACHE_SCOPED_DIFF_FAILED",
    );
    if (changed) throw new Error(\`AVANTIQO_VIDEO_T2V_CACHE_VIDEO_INPUTS_CHANGED_ON_MAIN:\${changed.replace(/\\n/g, ",")}\`);
    console.log(\`AVANTIQO_VIDEO_T2V_CACHE_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=\${head} origin=\${remote}\`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", VIDEO_SOURCE_PATH],
    "AVANTIQO_VIDEO_T2V_CACHE_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_T2V_CACHE_VIDEO_SOURCE_HAS_LOCAL_CHANGES");
  return head;
}`;
source = replaceExactly(source, oldMainGate, newMainGate, 1, "AVANTIQO_VIDEO_I2V_V13_MAIN_GATE");

source = replaceExactly(
  source,
  'const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_A14B_CACHE_FILL_V1";',
  'const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_IMAGE_PATTERN_CACHE_V13";',
  1,
  "AVANTIQO_VIDEO_I2V_V13_CONTRACT",
);
source = replaceExactly(
  source,
  "AVANTIQO_VIDEO_WAN22_T2V_CACHE_APPROVED",
  "AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_APPROVED",
  2,
  "AVANTIQO_VIDEO_I2V_V13_APPROVAL",
);
source = replaceExactly(
  source,
  "AVANTIQO_VIDEO_WAN22_T2V_CACHE_WAIT_MS",
  "AVANTIQO_VIDEO_WAN22_I2V_CACHE_WAIT_MS",
  1,
  "AVANTIQO_VIDEO_I2V_V13_WAIT_ENV",
);

source = replaceExactly(
  source,
  'if (t2v.cache_ready !== true && (free < 0 || minimum < 0 || free < minimum)) reasons.push("physicalFreeSpace");',
  'if (i2v.cache_ready !== true && (free < 0 || minimum < 0 || free < minimum)) reasons.push("physicalFreeSpace");',
  1,
  "AVANTIQO_VIDEO_I2V_V13_PROBE_SPACE",
);
source = replaceExactly(
  source,
  "target_already_cached: t2v.cache_ready === true,",
  "target_already_cached: i2v.cache_ready === true,",
  1,
  "AVANTIQO_VIDEO_I2V_V13_PROBE_READY",
);
source = replaceExactly(
  source,
  "target_snapshot_revision: text(t2v.snapshot_revision) || null,",
  "target_snapshot_revision: text(i2v.snapshot_revision) || null,",
  1,
  "AVANTIQO_VIDEO_I2V_V13_PROBE_REVISION",
);
source = replaceExactly(
  source,
  'if (text(output.target_model) !== T2V_MODEL) reasons.push("targetModel");',
  'if (text(output.target_model) !== I2V_MODEL) reasons.push("targetModel");',
  1,
  "AVANTIQO_VIDEO_I2V_V13_CACHE_TARGET_VALIDATION",
);
source = replaceExactly(
  source,
  "target_model: T2V_MODEL,",
  "target_model: I2V_MODEL,",
  3,
  "AVANTIQO_VIDEO_I2V_V13_TARGET_FIELDS",
);
source = replaceExactly(
  source,
  '"T2V_A14B_CACHE",',
  '"I2V_A14B_CACHE",',
  1,
  "AVANTIQO_VIDEO_I2V_V13_CACHE_LABEL",
);
source = replaceExactly(
  source,
  "t2v_cache_fill_maximum: 1,",
  "i2v_cache_fill_maximum: 1,",
  1,
  "AVANTIQO_VIDEO_I2V_V13_CONTROLLED_JOB",
);
source = replaceExactly(
  source,
  "t2v_cache_ready: true,",
  "i2v_cache_ready: true,",
  1,
  "AVANTIQO_VIDEO_I2V_V13_FINAL_READY",
);
source = replaceExactly(
  source,
  "i2v_download_requested: false,",
  "i2v_download_requested: true,",
  2,
  "AVANTIQO_VIDEO_I2V_V13_I2V_REQUEST_FLAG",
);
source = replaceExactly(
  source,
  'next_action: apply ? "RUN_RUNTIME_PROBE_THEN_T2V_A14B_CACHE_FILL" : "APPROVE_T2V_A14B_CACHE_FILL",',
  'next_action: apply ? "RUN_RUNTIME_PROBE_THEN_I2V_A14B_CACHE_FILL" : "APPROVE_I2V_A14B_CACHE_FILL",',
  1,
  "AVANTIQO_VIDEO_I2V_V13_PLAN_NEXT",
);
source = replaceExactly(
  source,
  'console.log("AVANTIQO_VIDEO_WAN22_T2V_A14B_CACHE_APPLIED=false");',
  'console.log("AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_V13_APPLIED=false");',
  1,
  "AVANTIQO_VIDEO_I2V_V13_PLAN_LINE",
);
source = replaceExactly(
  source,
  'next_action: "CACHE_WAN22_I2V_A14B_ON_SHARED_VOLUME",',
  'next_action: "INSPECT_BOTH_WAN22_CACHE_RESULTS_THEN_RUNTIME_CERTIFY",',
  1,
  "AVANTIQO_VIDEO_I2V_V13_FINAL_NEXT",
);
source = replaceExactly(
  source,
  'console.log("AVANTIQO_VIDEO_WAN22_T2V_A14B_CACHE_APPLIED=true");',
  'console.log("AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_V13_APPLIED=true");',
  1,
  "AVANTIQO_VIDEO_I2V_V13_FINAL_LINE",
);

const oldWaitForJob = `async function waitForJob(endpointId, jobId, key, label, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastStatus = "";
  while (Date.now() <= deadline) {
    const job = await queueRequest(endpointId, \`/status/\${encodeURIComponent(jobId)}\`, key);
    const status = text(job.status).toUpperCase();
    if (terminalStatus(status)) return job;
    if (status !== lastStatus || Date.now() % 60_000 < POLL_MS) {
      const health = healthSummary(await queueRequest(endpointId, "/health", key));
      console.log(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_PROGRESS status=\${status || "UNKNOWN"} health=\${JSON.stringify(health)}\`);
      lastStatus = status;
    }
    await sleep(POLL_MS);
  }
  throw new Error(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_WAIT_TIMEOUT:\${jobId}\`);
}`;

const newWaitForJob = `async function waitForJob(endpointId, jobId, key, label, waitMs) {
  const deadline = Date.now() + waitMs;
  const startupTimeoutMs = Math.max(120_000, Number(process.env.AVANTIQO_VIDEO_WAN22_I2V_WORKER_STARTUP_TIMEOUT_MS || 180_000));
  let lastStatus = "";
  let queuedWithoutWorkerAt = null;
  while (Date.now() <= deadline) {
    const job = await queueRequest(endpointId, \`/status/\${encodeURIComponent(jobId)}\`, key);
    const status = text(job.status).toUpperCase();
    if (terminalStatus(status)) return job;
    const health = healthSummary(await queueRequest(endpointId, "/health", key));
    const workerCount = Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
    if (status === "IN_QUEUE" && health.jobs.in_queue > 0 && health.jobs.in_progress === 0 && workerCount === 0) {
      queuedWithoutWorkerAt ||= Date.now();
      if (Date.now() - queuedWithoutWorkerAt >= startupTimeoutMs) {
        throw new Error(\`AVANTIQO_VIDEO_I2V_CACHE_\${label}_NO_WORKER_STARTUP_TIMEOUT:\${jobId}\`);
      }
    } else {
      queuedWithoutWorkerAt = null;
    }
    if (status !== lastStatus || Date.now() % 60_000 < POLL_MS) {
      console.log(\`AVANTIQO_VIDEO_I2V_CACHE_\${label}_PROGRESS status=\${status || "UNKNOWN"} health=\${JSON.stringify(health)}\`);
      lastStatus = status;
    }
    await sleep(POLL_MS);
  }
  throw new Error(\`AVANTIQO_VIDEO_I2V_CACHE_\${label}_WAIT_TIMEOUT:\${jobId}\`);
}`;
source = replaceExactly(source, oldWaitForJob, newWaitForJob, 1, "AVANTIQO_VIDEO_I2V_V13_WAIT_FOR_JOB");

const oldSubmitTail = `  console.log(\`AVANTIQO_VIDEO_T2V_CACHE_\${label}_JOB=\${jobId}\`);
  const job = await waitForJob(endpointId, jobId, key, label, waitMs);
  return { job, jobId };`;
const newSubmitTail = `  console.log(\`AVANTIQO_VIDEO_I2V_CACHE_\${label}_JOB=\${jobId}\`);
  try {
    const job = await waitForJob(endpointId, jobId, key, label, waitMs);
    return { job, jobId };
  } catch (error) {
    try {
      await queueRequest(endpointId, \`/cancel/\${encodeURIComponent(jobId)}\`, key, { method: "POST" });
      console.log(\`AVANTIQO_VIDEO_I2V_CACHE_\${label}_WAIT_FAILURE_CANCEL_REQUESTED=true job=\${jobId}\`);
    } catch (cancelError) {
      console.error(\`AVANTIQO_VIDEO_I2V_CACHE_\${label}_WAIT_FAILURE_CANCEL_FAILED=true job=\${jobId} error=\${redact(text(cancelError?.message || cancelError))}\`);
    }
    throw error;
  }`;
source = replaceExactly(source, oldSubmitTail, newSubmitTail, 1, "AVANTIQO_VIDEO_I2V_V13_SUBMIT_CANCEL");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v13-"));
const childPath = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-image-pattern-v13-compat.mjs");
try {
  await writeFile(childPath, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", childPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_V13_CHILD_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2400)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    pattern: "IMAGE_SHARED_VOLUME_ENDPOINT_CACHE_PATTERN",
    design: {
      temporary_pod: false,
      s3_credentials_required: false,
      shared_volume_rebind: false,
      gpu_pool_rebind: false,
      cinema_original_gpu_pool_preserved: true,
      cinema_workers_max_temporary: 1,
      cinema_workers_max_final: 0,
      timeout_only_temporary: true,
      runtime_probe_before_i2v: true,
      t2v_state_revalidated_by_runtime_probe: true,
      i2v_cache_fill_maximum: 1,
      exact_job_cancel_on_wait_failure: true,
      no_worker_startup_timeout_ms: Number(process.env.AVANTIQO_VIDEO_WAN22_I2V_WORKER_STARTUP_TIMEOUT_MS || 180000),
    },
    image: {
      mutation: false,
      idle_ready_worker_allowed: true,
    },
    safety: {
      video_generation: false,
      inference: false,
      production_web_deploy: false,
      pricing_activation: false,
      secrets_printed: false,
    },
  }, null, 2));

  const child = spawnSync(process.execPath, [childPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V13_CHILD_FAILED:exit=${child.status}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
