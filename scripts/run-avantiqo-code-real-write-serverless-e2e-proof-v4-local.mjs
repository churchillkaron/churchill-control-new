import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V4_LAUNCHER";
const V3_SCRIPT = "scripts/run-avantiqo-code-real-write-serverless-e2e-proof-v3-local.mjs";
const FIRST_CACHE_BOOTSTRAP_NO_WORKER_MS = 15 * 60_000;
const TOTAL_GENERATION_TIMEOUT_MS = 20 * 60_000;

function patchOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${label}_MARKER_REQUIRED`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${CONTRACT}_${label}_MARKER_AMBIGUOUS`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), { cwd, env, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve(signal ? 130 : (Number.isInteger(code) ? code : 1)));
  });
}

if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
let source = await readFile(path.join(repositoryRoot, V3_SCRIPT), "utf8");

source = patchOnce(source, "const IN_QUEUE_NO_WORKER_TIMEOUT_MS = 60_000;", `const IN_QUEUE_NO_WORKER_TIMEOUT_MS = ${FIRST_CACHE_BOOTSTRAP_NO_WORKER_MS};`, "NO_WORKER_BOUND");
source = patchOnce(source, "const TOTAL_GENERATION_TIMEOUT_MS = 3 * 60_000;", `const TOTAL_GENERATION_TIMEOUT_MS = ${TOTAL_GENERATION_TIMEOUT_MS};`, "TOTAL_BOUND");
source = source
  .replace('const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V3_LAUNCHER";', `const CONTRACT = "${CONTRACT}";`)
  .replace('phase: "SERVERLESS_NO_WORKER_BOUND_ABORT"', 'phase: "SERVERLESS_FIRST_CACHE_BOOTSTRAP_BOUND_ABORT"')
  .replace('cause_classification: "SCHEDULER_OR_CACHED_MODEL_PROVISIONING_NOT_READY"', 'cause_classification: "FIRST_CACHED_MODEL_PROVISIONING_OR_SCHEDULER_NOT_READY"')
  .replaceAll('SERVERLESS_NO_WORKER_WITHIN_BOUND', 'SERVERLESS_NO_WORKER_WITHIN_BOOTSTRAP_BOUND')
  .replace('no_worker_failure_retryable: false,', 'no_worker_failure_retryable: false,\n  first_cached_model_bootstrap_window: true,\n  endpoint_resave_before_generation_required: false,');

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-serverless-proof-v4-"));
const tempScript = path.join(tempRoot, "proof.mjs");
await writeFile(tempScript, source, "utf8");

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  base_script: V3_SCRIPT,
  scheduling_scope: "GLOBAL_RUNPOD_CACHED_MODEL",
  first_cached_model_bootstrap_no_worker_ms: FIRST_CACHE_BOOTSTRAP_NO_WORKER_MS,
  total_generation_timeout_ms: TOTAL_GENERATION_TIMEOUT_MS,
  generation_submissions_max_for_transport_failure: 1,
  cancel_on_no_worker_bound: true,
  zero_idle_restore_required: true,
  endpoint_configuration_resave_performed: false,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let exitCode = 1;
try {
  exitCode = await run(process.execPath, [tempScript], repositoryRoot, { ...process.env, NODE_ENV: "development" });
} finally {
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
if (exitCode !== 0) process.exit(exitCode);
console.log(`${CONTRACT}=PASS`);
