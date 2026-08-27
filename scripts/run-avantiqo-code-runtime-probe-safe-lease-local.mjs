import process from "node:process";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_RUNTIME_PROBE_SAFE_LEASE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SPEND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_RUNTIME_PROBE_SPEND_APPROVED=YES_REQUIRED");
}

const ttlMs = Math.max(
  6 * 60_000,
  Math.min(
    15 * 60_000,
    positiveInteger(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SAFE_LEASE_TTL_MS, 10 * 60_000),
  ),
);

const env = {
  ...process.env,
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
  AVANTIQO_CODE_RUNTIME_PROBE_READY_TIMEOUT_MS:
    text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_READY_TIMEOUT_MS) || "60000",
  AVANTIQO_CODE_RUNTIME_PROBE_SCALE_ZERO_QUEUE_TIMEOUT_MS:
    text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SCALE_ZERO_QUEUE_TIMEOUT_MS) || "180000",
  AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS:
    text(process.env.AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS) || "300000",
};

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_RUNTIME_PROBE_SAFE_LEASE_START",
  contract: CONTRACT,
  lane: "code",
  permanent_rest_state: "0/0",
  active_lease_state: "0/1",
  max_workers: 1,
  provider_jobs_planned: 1,
  metadata_only_probe: true,
  scale_zero_queue_timeout_ms: Number(env.AVANTIQO_CODE_RUNTIME_PROBE_SCALE_ZERO_QUEUE_TIMEOUT_MS),
  job_timeout_ms: Number(env.AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS),
  safe_lease_ttl_ms: ttlMs,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const result = spawnSync(
  process.execPath,
  [
    "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
    "--lane=code",
    `--ttl-ms=${ttlMs}`,
    "--",
    process.execPath,
    "scripts/probe-avantiqo-code-runtime.mjs",
  ],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
const exitCode = Number.isInteger(result.status) ? result.status : 1;
console.log(JSON.stringify({
  success: exitCode === 0,
  contract: CONTRACT,
  child_exit_code: exitCode,
  expected_final_rest_state: "0/0",
  provider_jobs_planned: 1,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=${exitCode === 0 ? "PASS" : "FAIL"}`);
process.exit(exitCode);
