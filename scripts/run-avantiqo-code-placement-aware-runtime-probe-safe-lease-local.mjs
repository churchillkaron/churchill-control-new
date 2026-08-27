import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_PLACEMENT_AWARE_RUNTIME_PROBE_SAFE_LEASE_V1";
const SOURCE_SCRIPT = "probe-avantiqo-code-runtime.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function replaceExactlyOnce(source, needle, replacement, code) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${code}_ANCHOR_MISSING`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${code}_ANCHOR_AMBIGUOUS`);
  return source.replace(needle, replacement);
}

if (text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SPEND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_RUNTIME_PROBE_SPEND_APPROVED=YES_REQUIRED");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, SOURCE_SCRIPT);
if (!existsSync(sourcePath)) throw new Error("AVANTIQO_CODE_PLACEMENT_PROBE_SOURCE_REQUIRED");

const source = readFileSync(sourcePath, "utf8");
const workerAnchor = `  const safeWorkers = workers.map((worker) => ({\n    id_present: Boolean(text(worker?.id)),\n    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,\n    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,\n  }));`;
const workerReplacement = `  const safeWorkers = workers.map((worker) => ({\n    id_present: Boolean(text(worker?.id)),\n    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,\n    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,\n    gpu_type: text(worker?.gpuTypeId ?? worker?.gpu?.displayName ?? worker?.machine?.gpuDisplayName) || null,\n    data_center_id: text(worker?.dataCenterId ?? worker?.machine?.dataCenterId) || null,\n    cost_per_hr: Number.isFinite(Number(worker?.costPerHr)) ? Number(worker.costPerHr) : null,\n    last_started_at: text(worker?.lastStartedAt) || null,\n    last_status_change: text(worker?.lastStatusChange) || null,\n  }));`;
const loopAnchor = `    try {\n      const snapshot = await healthSnapshot();\n      latestWorkers = snapshot.workers;\n      latestJobs = snapshot.jobs;`;
const loopReplacement = `    let latestManagement = null;\n    try {\n      const snapshot = await readinessSnapshot();\n      latestWorkers = snapshot.workers;\n      latestJobs = snapshot.jobs;\n      latestManagement = snapshot.management;`;
const statusAnchor = `      workers: latestWorkers,\n      jobs: latestJobs,\n      generation_performed: false,`;
const statusReplacement = `      workers: latestWorkers,\n      jobs: latestJobs,\n      management: latestManagement,\n      generation_performed: false,`;

for (const [needle, code] of [
  [workerAnchor, "AVANTIQO_CODE_PLACEMENT_PROBE_WORKER"],
  [loopAnchor, "AVANTIQO_CODE_PLACEMENT_PROBE_LOOP"],
  [statusAnchor, "AVANTIQO_CODE_PLACEMENT_PROBE_STATUS"],
]) {
  if (!source.includes(needle)) throw new Error(`${code}_SOURCE_CHANGED_REPLAN_REQUIRED`);
}

let patched = replaceExactlyOnce(source, workerAnchor, workerReplacement, "AVANTIQO_CODE_PLACEMENT_PROBE_WORKER");
patched = replaceExactlyOnce(patched, loopAnchor, loopReplacement, "AVANTIQO_CODE_PLACEMENT_PROBE_LOOP");
patched = replaceExactlyOnce(patched, statusAnchor, statusReplacement, "AVANTIQO_CODE_PLACEMENT_PROBE_STATUS");

if (
  patched === source ||
  !patched.includes("gpu_type:") ||
  !patched.includes("data_center_id:") ||
  !patched.includes("management: latestManagement") ||
  !patched.includes("const snapshot = await readinessSnapshot();")
) {
  throw new Error("AVANTIQO_CODE_PLACEMENT_PROBE_PATCH_VERIFY_FAILED");
}

const tempPath = resolve(scriptDir, `.avantiqo-code-placement-probe-${process.pid}.mjs`);
const ttlMs = Math.max(
  6 * 60_000,
  Math.min(15 * 60_000, positiveInteger(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SAFE_LEASE_TTL_MS, 10 * 60_000)),
);
const env = {
  ...process.env,
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
  AVANTIQO_CODE_RUNTIME_PROBE_READY_TIMEOUT_MS: text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_READY_TIMEOUT_MS) || "60000",
  AVANTIQO_CODE_RUNTIME_PROBE_SCALE_ZERO_QUEUE_TIMEOUT_MS: text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SCALE_ZERO_QUEUE_TIMEOUT_MS) || "180000",
  AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS: text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS) || "300000",
};

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_PLACEMENT_AWARE_RUNTIME_PROBE_START",
  contract: CONTRACT,
  permanent_rest_state: "0/0",
  active_lease_state: "0/1",
  max_workers: 1,
  provider_jobs_planned: 1,
  metadata_only_probe: true,
  management_worker_gpu_capture: true,
  management_worker_datacenter_capture: true,
  management_worker_status_capture: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  writeFileSync(tempPath, patched, { encoding: "utf8", flag: "wx" });
  const syntax = spawnSync(process.execPath, ["--check", tempPath], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.error) throw syntax.error;
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_CODE_PLACEMENT_PROBE_GENERATED_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 900)}`);
  }

  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
      "--lane=code",
      `--ttl-ms=${ttlMs}`,
      "--",
      process.execPath,
      tempPath,
    ],
    { cwd: process.cwd(), env, stdio: "inherit" },
  );

  if (result.error) throw result.error;
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  console.log(JSON.stringify({
    success: exitCode === 0,
    contract: CONTRACT,
    child_exit_code: exitCode,
    expected_final_rest_state: "0/0",
    management_worker_gpu_capture: true,
    management_worker_datacenter_capture: true,
    provider_jobs_planned: 1,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=${exitCode === 0 ? "PASS" : "FAIL"}`);
  process.exitCode = exitCode;
} finally {
  if (existsSync(tempPath)) unlinkSync(tempPath);
}
