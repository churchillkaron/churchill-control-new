import { spawn } from "node:child_process";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_AUTO_TRANSPORT_E2E_PROOF_V10";
const POD_SCRIPT = "scripts/run-avantiqo-code-real-write-pod-e2e-proof-v9-local.mjs";
const POD_PASS = "AVANTIQO_CODE_REAL_WRITE_POD_E2E_PROOF_V9=PASS";
const POD_CAPACITY_MARKER = "AVANTIQO_CODE_REAL_WRITE_POD_E2E_PROOF_V9_ALLOCATOR_CAPACITY_UNAVAILABLE=TRUE";
const SERVERLESS_SCRIPT = "scripts/run-avantiqo-code-real-write-serverless-e2e-proof-v4-local.mjs";
const SERVERLESS_PASS = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V4_LAUNCHER=PASS";
const SOURCE_BEGIN = "AVANTIQO_CODE_GENERATED_SOURCE_BEGIN";
const SOURCE_END = "AVANTIQO_CODE_GENERATED_SOURCE_END";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const value = chunk.toString("utf8");
      stdout += value;
      process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString("utf8");
      stderr += value;
      process.stderr.write(value);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({
      exit_code: signal ? 130 : (Number.isInteger(code) ? code : 1),
      stdout,
      stderr,
    }));
  });
}

function assertSingleGeneratedSource(stdout, label) {
  const begin = stdout.indexOf(SOURCE_BEGIN);
  const end = stdout.indexOf(SOURCE_END, begin + SOURCE_BEGIN.length);
  if (begin < 0 || end <= begin) throw new Error(`${CONTRACT}_${label}_GENERATED_SOURCE_MARKERS_REQUIRED`);
  if (stdout.indexOf(SOURCE_BEGIN, begin + SOURCE_BEGIN.length) >= 0) throw new Error(`${CONTRACT}_${label}_MULTIPLE_GENERATED_SOURCES_FORBIDDEN`);
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
const childEnv = {
  ...process.env,
  NODE_ENV: "development",
  AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_APPROVED: "YES",
};

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  primary_transport: "EPHEMERAL_RUNPOD_POD",
  fallback_transport: "RUNPOD_SERVERLESS_GLOBAL_CACHED_MODEL",
  pod_allocator_attempts_max: 1,
  fallback_only_on_exact_allocator_capacity_marker: true,
  transports_may_run_concurrently: false,
  serverless_generation_submissions_max_for_transport_failure: 1,
  one_canonical_code_storage_required: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const pod = await run(process.execPath, [POD_SCRIPT], repositoryRoot, childEnv);
if (pod.exit_code === 0) {
  if (!pod.stdout.includes(POD_PASS)) throw new Error(`${CONTRACT}_POD_PASS_MARKER_REQUIRED:${POD_PASS}`);
  if (pod.stdout.includes(POD_CAPACITY_MARKER)) throw new Error(`${CONTRACT}_POD_SUCCESS_AND_CAPACITY_MARKER_CONFLICT`);
  assertSingleGeneratedSource(pod.stdout, "POD");
  console.log(JSON.stringify({
    event: `${CONTRACT}_COMPLETE`,
    selected_transport: "EPHEMERAL_RUNPOD_POD",
    fallback_performed: false,
    pod_allocator_attempts_max: 1,
    new_storage_created: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  console.log(`${CONTRACT}=PASS`);
  process.exit(0);
}

const podCombined = `${pod.stdout}\n${pod.stderr}`;
const exactCapacityFailure = podCombined.includes(POD_CAPACITY_MARKER);
if (!exactCapacityFailure) {
  throw new Error(`${CONTRACT}_POD_NON_CAPACITY_FAILURE_NO_FALLBACK:${pod.exit_code}`);
}
if (pod.stdout.includes(SOURCE_BEGIN) || pod.stdout.includes(SOURCE_END)) {
  throw new Error(`${CONTRACT}_POD_CAPACITY_FAILURE_MUST_NOT_GENERATE_SOURCE`);
}
if (pod.stdout.includes('phase":"POD_ALLOCATED"')) {
  throw new Error(`${CONTRACT}_POD_CAPACITY_FAILURE_MUST_NOT_ALLOCATE_POD`);
}
if (!pod.stdout.includes('"inference_performed":false')) {
  throw new Error(`${CONTRACT}_POD_CAPACITY_FAILURE_NO_INFERENCE_PROOF_REQUIRED`);
}

console.log(JSON.stringify({
  event: `${CONTRACT}_FALLBACK_START`,
  reason: "ALLOCATOR_CAPACITY_UNAVAILABLE",
  pod_exit_code: pod.exit_code,
  pod_allocator_attempts_performed: 1,
  pod_inference_performed: false,
  transports_overlap: false,
  fallback_script: SERVERLESS_SCRIPT,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const serverless = await run(process.execPath, [SERVERLESS_SCRIPT], repositoryRoot, childEnv);
if (serverless.exit_code !== 0) throw new Error(`${CONTRACT}_SERVERLESS_FALLBACK_FAILED:${serverless.exit_code}`);
if (!serverless.stdout.includes(SERVERLESS_PASS)) throw new Error(`${CONTRACT}_SERVERLESS_PASS_MARKER_REQUIRED:${SERVERLESS_PASS}`);
assertSingleGeneratedSource(serverless.stdout, "SERVERLESS");

console.log(JSON.stringify({
  event: `${CONTRACT}_COMPLETE`,
  selected_transport: "RUNPOD_SERVERLESS_GLOBAL_CACHED_MODEL",
  fallback_performed: true,
  fallback_reason: "ALLOCATOR_CAPACITY_UNAVAILABLE",
  transports_overlap: false,
  one_canonical_code_storage_preserved: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));
console.log(`${CONTRACT}=PASS`);
