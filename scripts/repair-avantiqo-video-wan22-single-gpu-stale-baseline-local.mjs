import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_REPAIR = "scripts/repair-avantiqo-video-wan22-stalled-active-probe-v2-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_SINGLE_GPU_STALE_BASELINE_RECOVERY_V1";
const OLD_TEMP_POOL = 'const EXPECTED_TEMP_POOL = ["NVIDIA B200", ...ORIGINAL_BLACKWELL_POOL].sort();';
const NEW_TEMP_POOL = 'const EXPECTED_TEMP_POOL = ["NVIDIA B200"];';

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

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_REMOTE_READ_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", BASE_REPAIR],
    "AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_BASE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_BASE_REPAIR_HAS_LOCAL_CHANGES");
  return head;
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireCurrentMain();
const source = await readFile(BASE_REPAIR, "utf8");
const count = source.split(OLD_TEMP_POOL).length - 1;
if (count !== 1) {
  throw new Error(`AVANTIQO_VIDEO_SINGLE_GPU_RECOVERY_TEMP_POOL_ANCHOR_COUNT:${count}`);
}
const patched = source.replace(OLD_TEMP_POOL, NEW_TEMP_POOL);
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
    required_terminal_job: true,
    required_zero_queue_and_workers: true,
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
