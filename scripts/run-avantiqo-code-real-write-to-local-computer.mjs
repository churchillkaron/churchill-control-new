import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_TO_LOCAL_COMPUTER_V1";
const APPROVAL = "AVANTIQO_CODE_LOCAL_WRITE_APPROVED";
const SOURCE_BEGIN = "AVANTIQO_CODE_GENERATED_SOURCE_BEGIN";
const SOURCE_END = "AVANTIQO_CODE_GENERATED_SOURCE_END";
const OUTPUT_ROOT = "local-audit-output/avantiqo-code-real-generation";
const OUTPUT_FILE = `${OUTPUT_ROOT}/invoice-total.mjs`;
const TEST_FILE = `${OUTPUT_ROOT}/invoice-total.test.mjs`;
const PRIMARY_GENERATION_SCRIPT = "scripts/run-avantiqo-code-real-write-e2e-proof-v5-local.mjs";
const PRIMARY_GENERATION_PASS = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V5_LAUNCHER=PASS";
const FALLBACK_GENERATION_SCRIPT = "scripts/run-avantiqo-code-real-write-serverless-e2e-proof-v1-local.mjs";
const FALLBACK_GENERATION_PASS = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V1=PASS";
const EXACT_POD_CAPACITY_MISS = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V1_RUNPOD_HTTP_500:create pod: There are no instances currently available";

function text(value, maximum = 8000) {
  return String(value ?? "").trim().slice(0, maximum);
}

async function run(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const value = chunk.toString("utf8");
      stdout += value;
      if (options.stream) process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString("utf8");
      stderr += value;
      if (options.stream) process.stderr.write(value);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({
      exit_code: Number.isInteger(code) ? code : 1,
      stdout,
      stderr,
    }));
  });
}

async function required(command, args, cwd, label, options = {}) {
  const result = await run(command, args, cwd, options);
  if (result.exit_code !== 0) {
    const error = new Error(`${label}:${command}:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  return result;
}

function extractGeneratedSource(stdout) {
  const begin = stdout.indexOf(SOURCE_BEGIN);
  const end = stdout.indexOf(SOURCE_END, begin + SOURCE_BEGIN.length);
  if (begin < 0 || end < 0 || end <= begin) {
    throw new Error(`${CONTRACT}_GENERATED_SOURCE_MARKERS_REQUIRED`);
  }
  const source = stdout
    .slice(begin + SOURCE_BEGIN.length, end)
    .replace(/^\s*\n/, "")
    .replace(/\n\s*$/, "\n");
  if (!source.trim()) throw new Error(`${CONTRACT}_GENERATED_SOURCE_EMPTY`);
  return source;
}

function exactPodCapacityMiss(result) {
  return `${result.stdout}\n${result.stderr}`.includes(EXACT_POD_CAPACITY_MISS);
}

async function runGenerationScript(script, repositoryRoot) {
  return run(
    process.execPath,
    [script],
    repositoryRoot,
    {
      stream: true,
      env: {
        ...process.env,
        NODE_ENV: "development",
        AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_APPROVED: "YES",
      },
    },
  );
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
}
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL}=YES`);
}

const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
const top = text((await required("git", ["rev-parse", "--show-toplevel"], repositoryRoot, `${CONTRACT}_REPOSITORY_REQUIRED`)).stdout, 3000);
if (path.resolve(top) !== repositoryRoot) throw new Error(`${CONTRACT}_REPOSITORY_ROOT_MISMATCH`);

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  repository_root: repositoryRoot,
  output_file: OUTPUT_FILE,
  primary_generation_script: PRIMARY_GENERATION_SCRIPT,
  exact_capacity_fallback_script: FALLBACK_GENERATION_SCRIPT,
  canonical_endpoint_storage_discovery_required: true,
  bounded_low_stock_retry_required: true,
  canonical_serverless_zero_idle_fallback_required_on_exact_capacity_miss: true,
  real_owned_model_generation_required: true,
  write_to_local_computer_required: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let generation = await runGenerationScript(PRIMARY_GENERATION_SCRIPT, repositoryRoot);
let generationPass = PRIMARY_GENERATION_PASS;
let generationTransport = "RUNPOD_POD";

if (generation.exit_code !== 0 && exactPodCapacityMiss(generation)) {
  console.log(JSON.stringify({
    event: `${CONTRACT}_CAPACITY_FALLBACK`,
    reason: "EXACT_POD_CAPACITY_MISS_AFTER_BOUNDED_RETRY",
    fallback_transport: "RUNPOD_SERVERLESS_ZERO_IDLE",
    same_canonical_endpoint_storage_required: true,
    new_storage_created: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  generation = await runGenerationScript(FALLBACK_GENERATION_SCRIPT, repositoryRoot);
  generationPass = FALLBACK_GENERATION_PASS;
  generationTransport = "RUNPOD_SERVERLESS_ZERO_IDLE";
}

if (generation.exit_code !== 0) {
  throw new Error(`${CONTRACT}_OWNED_GENERATION_FAILED:${generation.exit_code}`);
}
if (!generation.stdout.includes(generationPass)) {
  throw new Error(`${CONTRACT}_GENERATION_PASS_MARKER_REQUIRED:${generationPass}`);
}

const generatedSource = extractGeneratedSource(generation.stdout);
const generatedSha256 = crypto.createHash("sha256").update(generatedSource, "utf8").digest("hex");
const outputRoot = path.join(repositoryRoot, OUTPUT_ROOT);
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(repositoryRoot, OUTPUT_FILE), generatedSource, "utf8");
await writeFile(path.join(repositoryRoot, TEST_FILE), `import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\n\nassert.equal(invoiceTotal(100, 0.07), 107);\nassert.equal(invoiceTotal(19.99, 0.075), 21.49);\nassert.equal(invoiceTotal(0, 0.2), 0);\nassert.throws(() => invoiceTotal(Number.NaN, 0.07), TypeError);\nassert.throws(() => invoiceTotal(100, Number.POSITIVE_INFINITY), TypeError);\nconsole.log("AVANTIQO_CODE_LOCAL_PERSISTED_TEST_PASS");\n`, "utf8");

const persistedTest = await required(process.execPath, [TEST_FILE], repositoryRoot, `${CONTRACT}_PERSISTED_TEST_FAILED`, { stream: true });
if (!persistedTest.stdout.includes("AVANTIQO_CODE_LOCAL_PERSISTED_TEST_PASS")) {
  throw new Error(`${CONTRACT}_PERSISTED_TEST_MARKER_REQUIRED`);
}

console.log(SOURCE_BEGIN);
process.stdout.write(generatedSource.endsWith("\n") ? generatedSource : `${generatedSource}\n`);
console.log(SOURCE_END);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  generation_transport: generationTransport,
  exact_pod_capacity_fallback_used: generationTransport === "RUNPOD_SERVERLESS_ZERO_IDLE",
  local_computer_write_verified: true,
  generated_file: OUTPUT_FILE,
  generated_test_file: TEST_FILE,
  generated_source_sha256: generatedSha256,
  generated_tests_passed: true,
  persistent_repo_worktree_mutation: true,
  github_push_performed: false,
  vercel_deploy_performed: false,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
