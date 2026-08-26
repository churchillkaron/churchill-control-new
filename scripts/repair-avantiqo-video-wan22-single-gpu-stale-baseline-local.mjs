import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_REPAIR = "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_SINGLE_GPU_STALE_BASELINE_RECOVERY_V3";
const OLD_TEMP_POOL = 'const EXPECTED_TEMP_POOL = ["NVIDIA B200", ...ORIGINAL_BLACKWELL_POOL].sort();';
const NEW_TEMP_POOL = 'const EXPECTED_TEMP_POOL = ["NVIDIA B200"];';
const SCOPED_PATHS = [
  BASE_REPAIR,
  "scripts/repair-avantiqo-video-wan22-single-gpu-stale-baseline-local.mjs",
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
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}

function requireScopedMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_REMOTE_READ_FAILED");
  const counts = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  const localOnly = Number(counts[0] || 0);
  if (localOnly !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_MAIN_DIVERGED:head=${head}:origin=${remote}:local_only=${localOnly}`);
  }
  if (head !== remote) {
    const scopedChanges = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...SCOPED_PATHS],
      "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_SCOPED_DIFF_FAILED",
    );
    if (scopedChanges) {
      throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_VIDEO_INPUTS_CHANGED_ON_MAIN:${scopedChanges.replace(/\n/g, ",")}`);
    }
    console.log(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...SCOPED_PATHS],
    "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_SCOPED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

const OLD_BASE_REQUIRE_MAIN = [
  "function requireCurrentMain() {",
  "  shell(\"git\", [\"fetch\", \"origin\", \"main\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_FETCH_FAILED\");",
  "  const branch = shell(\"git\", [\"branch\", \"--show-current\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_BRANCH_FAILED\");",
  "  if (branch !== \"main\") throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_REQUIRED:${branch || \"DETACHED\"}`);",
  "  const head = shell(\"git\", [\"rev-parse\", \"HEAD\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_HEAD_FAILED\");",
  "  const remote = shell(\"git\", [\"rev-parse\", \"origin/main\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_REMOTE_FAILED\");",
  "  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);",
  "  return head;",
  "}",
].join("\n");

const NEW_BASE_REQUIRE_MAIN = [
  "function requireCurrentMain() {",
  "  shell(\"git\", [\"fetch\", \"origin\", \"main\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_FETCH_FAILED\");",
  "  const branch = shell(\"git\", [\"branch\", \"--show-current\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_BRANCH_FAILED\");",
  "  if (branch !== \"main\") throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_REQUIRED:${branch || \"DETACHED\"}`);",
  "  const head = shell(\"git\", [\"rev-parse\", \"HEAD\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_HEAD_FAILED\");",
  "  const remote = shell(\"git\", [\"rev-parse\", \"origin/main\"], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_REMOTE_FAILED\");",
  "  const relation = shell(\"git\", [\"rev-list\", \"--left-right\", \"--count\", `${head}...${remote}`], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_RELATION_FAILED\").split(/\\s+/).map(Number);",
  "  if (Number(relation[0] || 0) !== 0) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_DIVERGED:head=${head}:origin=${remote}`);",
  "  if (head !== remote) {",
  "    const scopedPaths = [VIDEO_EVIDENCE_PATH, IMAGE_LOCK_PATH, \"scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs\", \"scripts/repair-avantiqo-video-wan22-single-gpu-stale-baseline-local.mjs\"];",
  "    const changed = shell(\"git\", [\"diff\", \"--name-only\", head, remote, \"--\", ...scopedPaths], \"AVANTIQO_VIDEO_STALLED_PROBE_V2_SCOPED_DIFF_FAILED\");",
  "    if (changed) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\\n/g, \",\")}`);",
  "    console.log(`AVANTIQO_VIDEO_STALLED_PROBE_V2_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);",
  "  }",
  "  return head;",
  "}",
].join("\n");

const OLD_BASE_QUEUE_REQUEST = [
  "async function queueRequest(endpointId, pathname, key) {",
  "  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {",
  "    headers: { Authorization: `Bearer ${key}`, Accept: \"application/json\" },",
  "    signal: AbortSignal.timeout(30_000),",
  "  }), \"AVANTIQO_VIDEO_STALLED_PROBE_V2_QUEUE\");",
  "}",
].join("\n");

const NEW_BASE_QUEUE_REQUEST = [
  "async function queueRequest(endpointId, pathname, key, options = {}) {",
  "  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {",
  "    headers: { Authorization: `Bearer ${key}`, Accept: \"application/json\" },",
  "    signal: AbortSignal.timeout(30_000),",
  "  });",
  "  if (options.allow404 === true && response.status === 404) {",
  "    await response.arrayBuffer();",
  "    return { __not_found: true };",
  "  }",
  "  return readJson(response, \"AVANTIQO_VIDEO_STALLED_PROBE_V2_QUEUE\");",
  "}",
].join("\n");

const OLD_BASE_INITIAL_STATUS = [
  "const [job, healthRaw, control] = await Promise.all([",
  "  queueRequest(text(owned.cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key),",
  "  queueRequest(text(owned.cinema.id), \"/health\", queueCredential.key),",
  "  optionalControlWorkers(text(owned.cinema.id), controlCandidates),",
  "]);",
  "const health = healthSummary(healthRaw);",
  "const jobStatus = text(job.status).toUpperCase();",
  "const terminal = [\"CANCELLED\", \"CANCELED\", \"FAILED\", \"TIMED_OUT\", \"COMPLETED\"].includes(jobStatus);",
].join("\n");

const NEW_BASE_INITIAL_STATUS = [
  "const [job, healthRaw, control] = await Promise.all([",
  "  queueRequest(text(owned.cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key, { allow404: true }),",
  "  queueRequest(text(owned.cinema.id), \"/health\", queueCredential.key),",
  "  optionalControlWorkers(text(owned.cinema.id), controlCandidates),",
  "]);",
  "const health = healthSummary(healthRaw);",
  "const jobStatus = job.__not_found === true ? \"NOT_FOUND\" : text(job.status).toUpperCase();",
  "const terminal = job.__not_found === true || [\"CANCELLED\", \"CANCELED\", \"FAILED\", \"TIMED_OUT\", \"COMPLETED\"].includes(jobStatus);",
].join("\n");

const OLD_BASE_FRESH_STATUS = [
  "  const [freshJob, freshHealthRaw, freshControl] = await Promise.all([",
  "    queueRequest(text(freshOwned.cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key),",
  "    queueRequest(text(freshOwned.cinema.id), \"/health\", queueCredential.key),",
  "    optionalControlWorkers(text(freshOwned.cinema.id), controlCandidates),",
  "  ]);",
  "  const freshHealth = healthSummary(freshHealthRaw);",
  "  const freshStatus = text(freshJob.status).toUpperCase();",
  "  const freshTerminal = [\"CANCELLED\", \"CANCELED\", \"FAILED\", \"TIMED_OUT\", \"COMPLETED\"].includes(freshStatus);",
].join("\n");

const NEW_BASE_FRESH_STATUS = [
  "  const [freshJob, freshHealthRaw, freshControl] = await Promise.all([",
  "    queueRequest(text(freshOwned.cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key, { allow404: true }),",
  "    queueRequest(text(freshOwned.cinema.id), \"/health\", queueCredential.key),",
  "    optionalControlWorkers(text(freshOwned.cinema.id), controlCandidates),",
  "  ]);",
  "  const freshHealth = healthSummary(freshHealthRaw);",
  "  const freshStatus = freshJob.__not_found === true ? \"NOT_FOUND\" : text(freshJob.status).toUpperCase();",
  "  const freshTerminal = freshJob.__not_found === true || [\"CANCELLED\", \"CANCELED\", \"FAILED\", \"TIMED_OUT\", \"COMPLETED\"].includes(freshStatus);",
].join("\n");

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
const source = await readFile(BASE_REPAIR, "utf8");
let patched = replaceExactlyOnce(
  source,
  OLD_TEMP_POOL,
  NEW_TEMP_POOL,
  "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_TEMP_POOL",
);
patched = replaceExactlyOnce(
  patched,
  OLD_BASE_REQUIRE_MAIN,
  NEW_BASE_REQUIRE_MAIN,
  "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_MAIN_GUARD",
);
patched = replaceExactlyOnce(
  patched,
  OLD_BASE_QUEUE_REQUEST,
  NEW_BASE_QUEUE_REQUEST,
  "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_QUEUE_REQUEST",
);
patched = replaceExactlyOnce(
  patched,
  OLD_BASE_INITIAL_STATUS,
  NEW_BASE_INITIAL_STATUS,
  "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_INITIAL_JOB_STATUS",
);
patched = replaceExactlyOnce(
  patched,
  OLD_BASE_FRESH_STATUS,
  NEW_BASE_FRESH_STATUS,
  "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_FRESH_JOB_STATUS",
);
const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-single-gpu-recovery-"));
const path = join(dir, "repair-avantiqo-video-wan22-single-gpu-stale-baseline-compat.mjs");

try {
  await writeFile(path, patched, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_COMPATIBILITY_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 1200)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_ONLY",
    accepted_temporary_state: {
      gpu_type_ids: ["NVIDIA B200"],
      workers_max: 1,
      execution_timeout_ms: 7200000,
    },
    terminal_job_policy: {
      explicit_terminal_status_allowed: true,
      purged_status_404_allowed: true,
      purged_status_requires_zero_queue_workers_and_control_surfaces: true,
    },
    required_zero_queue_and_workers: true,
    main_movement_policy: {
      unrelated_main_commits_tolerated: true,
      video_or_image_safety_input_changes_fail_closed: true,
      local_only_main_commits_fail_closed: true,
    },
    target_baseline: {
      workers_max: 0,
      execution_timeout_ms: 1800000,
      gpu_type_ids: [
        "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
        "NVIDIA RTX PRO 6000 Blackwell Server Edition",
        "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
      ],
    },
    image_mutation_performed_by_wrapper: false,
    new_job_submitted_by_wrapper: false,
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
    throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_CHILD_FAILED:exit=${child.status}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
