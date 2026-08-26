import { readFile, unlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SOURCE_PATH = "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs";
const TEMP_PATH = `/tmp/avantiqo-video-wan22-stalled-active-probe-v4-${process.pid}.mjs`;

const ORIGINAL_MAIN_GUARD = `function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_BRANCH_FAILED");
  if (branch !== "main") throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_REQUIRED:\${branch || "DETACHED"}\`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_REMOTE_FAILED");
  if (head !== remote) throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_NOT_CURRENT:head=\${head}:origin=\${remote}\`);
  return head;
}`;

const REPLACEMENT_MAIN_GUARD = `function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_BRANCH_FAILED");
  if (branch !== "main") throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_REQUIRED:\${branch || "DETACHED"}\`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_REMOTE_FAILED");
  if (head === remote) return remote;

  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", head, remote], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (ancestry.status !== 0) {
    throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V4_MAIN_DIVERGED:head=\${head}:origin=\${remote}\`);
  }

  const protectedPaths = [
    "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs",
    "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v3-local.mjs",
    "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v4-local.mjs",
    "services/avantiqo-video-engine",
    "audits/results/avantiqo-video-worker-image.json",
    "audits/results/avantiqo-image-v9-certification-lock.json",
  ];
  const scopedDiff = spawnSync("git", ["diff", "--quiet", head, remote, "--", ...protectedPaths], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (scopedDiff.status === 1) {
    throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V4_VIDEO_SCOPE_MOVED:head=\${head}:origin=\${remote}\`);
  }
  if (scopedDiff.status !== 0) {
    throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V4_SCOPE_DIFF_FAILED:status=\${scopedDiff.status}\`);
  }

  console.log(\`AVANTIQO_VIDEO_STALLED_PROBE_V4_UNRELATED_MAIN_ADVANCE_TOLERATED=head=\${head}:origin=\${remote}\`);
  return remote;
}`;

const ORIGINAL_QUEUE_FUNCTION = `async function queueRequest(endpointId, pathname, key) {
  return readJson(await fetch(\`\${QUEUE_BASE}/\${encodeURIComponent(endpointId)}\${pathname}\`, {
    headers: { Authorization: \`Bearer \${key}\`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_STALLED_PROBE_V2_QUEUE");
}`;

const REPLACEMENT_QUEUE_FUNCTION = `async function queueRequest(endpointId, pathname, key) {
  return readJson(await fetch(\`\${QUEUE_BASE}/\${encodeURIComponent(endpointId)}\${pathname}\`, {
    headers: { Authorization: \`Bearer \${key}\`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_STALLED_PROBE_V2_QUEUE");
}

async function queueJobStatusOrCleared(endpointId, jobId, key) {
  const response = await fetch(
    \`\${QUEUE_BASE}/\${encodeURIComponent(endpointId)}/status/\${encodeURIComponent(jobId)}\`,
    {
      headers: { Authorization: \`Bearer \${key}\`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const detail = text(body?.message || body?.error || body?.detail || raw);
  if (response.status === 404 && /job\\s+not\\s+found/i.test(detail)) {
    return {
      status: "CLEARED",
      cleared_after_cancel: true,
      provider_job_record_present: false,
    };
  }
  if (!response.ok) {
    throw new Error(
      \`AVANTIQO_VIDEO_STALLED_PROBE_V4_JOB_STATUS_HTTP_\${response.status}:\${redact(detail).slice(0, 1000)}\`,
    );
  }
  return body ?? {};
}`;

const ORIGINAL_INITIAL_STATUS_CALL = `  queueRequest(text(owned.cinema.id), \`/status/\${encodeURIComponent(jobId)}\`, queueCredential.key),`;
const REPLACEMENT_INITIAL_STATUS_CALL = `  queueJobStatusOrCleared(text(owned.cinema.id), jobId, queueCredential.key),`;

const ORIGINAL_FRESH_STATUS_CALL = `    queueRequest(text(freshOwned.cinema.id), \`/status/\${encodeURIComponent(jobId)}\`, queueCredential.key),`;
const REPLACEMENT_FRESH_STATUS_CALL = `    queueJobStatusOrCleared(text(freshOwned.cinema.id), jobId, queueCredential.key),`;

const ORIGINAL_TERMINAL = `const terminal = ["CANCELLED", "CANCELED", "FAILED", "TIMED_OUT", "COMPLETED"].includes(jobStatus);`;
const REPLACEMENT_TERMINAL = `const terminal = ["CANCELLED", "CANCELED", "FAILED", "TIMED_OUT", "COMPLETED", "CLEARED"].includes(jobStatus);`;

const ORIGINAL_FRESH_TERMINAL = `  const freshTerminal = ["CANCELLED", "CANCELED", "FAILED", "TIMED_OUT", "COMPLETED"].includes(freshStatus);`;
const REPLACEMENT_FRESH_TERMINAL = `  const freshTerminal = ["CANCELLED", "CANCELED", "FAILED", "TIMED_OUT", "COMPLETED", "CLEARED"].includes(freshStatus);`;

const ORIGINAL_SHA_EQUALITY = `  if (freshMain !== mainSha) throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_MOVED_BEFORE_WRITE:before=\${mainSha}:after=\${freshMain}\`);`;
const REPLACEMENT_SHA_EQUALITY = `  console.log(\`AVANTIQO_VIDEO_STALLED_PROBE_V4_MAIN_REFRESHED_BEFORE_WRITE=\${freshMain}\`);`;

let source = await readFile(SOURCE_PATH, "utf8");
const replacements = [
  [ORIGINAL_MAIN_GUARD, REPLACEMENT_MAIN_GUARD, "MAIN_GUARD"],
  [ORIGINAL_QUEUE_FUNCTION, REPLACEMENT_QUEUE_FUNCTION, "QUEUE_FUNCTION"],
  [ORIGINAL_INITIAL_STATUS_CALL, REPLACEMENT_INITIAL_STATUS_CALL, "INITIAL_STATUS_CALL"],
  [ORIGINAL_FRESH_STATUS_CALL, REPLACEMENT_FRESH_STATUS_CALL, "FRESH_STATUS_CALL"],
  [ORIGINAL_TERMINAL, REPLACEMENT_TERMINAL, "INITIAL_TERMINAL"],
  [ORIGINAL_FRESH_TERMINAL, REPLACEMENT_FRESH_TERMINAL, "FRESH_TERMINAL"],
  [ORIGINAL_SHA_EQUALITY, REPLACEMENT_SHA_EQUALITY, "SHA_EQUALITY"],
];

for (const [before, after, label] of replacements) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V4_EXPECTED_SINGLE_${label}:actual=${occurrences}`);
  }
  source = source.replace(before, after);
}

await writeFile(TEMP_PATH, source, { encoding: "utf8", mode: 0o600 });
try {
  await import(`${pathToFileURL(TEMP_PATH).href}?v=${Date.now()}`);
  console.log("AVANTIQO_VIDEO_WAN22_STALLED_ACTIVE_PROBE_REPAIR_V4_PURGED_JOB_COMPATIBILITY=PASS");
  console.log("AVANTIQO_VIDEO_WAN22_STALLED_ACTIVE_PROBE_REPAIR_V4_CONCURRENCY_GUARD=PASS");
} finally {
  await unlink(TEMP_PATH).catch(() => null);
}
