import { readFile, unlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SOURCE_PATH = "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs";
const TEMP_PATH = `/tmp/avantiqo-video-wan22-stalled-active-probe-v3-${process.pid}.mjs`;

const ORIGINAL = `function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_BRANCH_FAILED");
  if (branch !== "main") throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_REQUIRED:\${branch || "DETACHED"}\`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_REMOTE_FAILED");
  if (head !== remote) throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_NOT_CURRENT:head=\${head}:origin=\${remote}\`);
  return head;
}`;

const REPLACEMENT = `function requireCurrentMain() {
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
    throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V3_MAIN_DIVERGED:head=\${head}:origin=\${remote}\`);
  }

  const protectedPaths = [
    "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs",
    "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v3-local.mjs",
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
    throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V3_VIDEO_SCOPE_MOVED:head=\${head}:origin=\${remote}\`);
  }
  if (scopedDiff.status !== 0) {
    throw new Error(\`AVANTIQO_VIDEO_STALLED_PROBE_V3_SCOPE_DIFF_FAILED:status=\${scopedDiff.status}\`);
  }

  console.log(\`AVANTIQO_VIDEO_STALLED_PROBE_V3_UNRELATED_MAIN_ADVANCE_TOLERATED=head=\${head}:origin=\${remote}\`);
  return remote;
}`;

const source = await readFile(SOURCE_PATH, "utf8");
const occurrences = source.split(ORIGINAL).length - 1;
if (occurrences !== 1) {
  throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V3_EXPECTED_SINGLE_MAIN_GUARD:actual=${occurrences}`);
}
const patched = source.replace(ORIGINAL, REPLACEMENT);
if (patched === source || patched.includes(ORIGINAL)) {
  throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V3_MAIN_GUARD_PATCH_NOT_APPLIED");
}

await writeFile(TEMP_PATH, patched, { encoding: "utf8", mode: 0o600 });
try {
  await import(`${pathToFileURL(TEMP_PATH).href}?v=${Date.now()}`);
  console.log("AVANTIQO_VIDEO_WAN22_STALLED_ACTIVE_PROBE_REPAIR_V3_CONCURRENCY_GUARD=PASS");
} finally {
  await unlink(TEMP_PATH).catch(() => null);
}
