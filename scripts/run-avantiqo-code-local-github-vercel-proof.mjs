import { spawn } from "node:child_process";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_LOCAL_GITHUB_VERCEL_PROOF_V1";
const APPROVAL = "AVANTIQO_CODE_LOCAL_GITHUB_VERCEL_APPROVED";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

async function runScript(script, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
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
    child.on("close", (code) => resolve({
      exit_code: Number.isInteger(code) ? code : 1,
      stdout,
      stderr,
    }));
  });
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
}
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL}=YES`);
}

const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
const commonEnv = {
  ...process.env,
  NODE_ENV: "development",
  AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT: repositoryRoot,
};

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  repository_root: repositoryRoot,
  stages: [
    "OWNED_MODEL_GENERATION",
    "LOCAL_COMPUTER_WRITE",
    "IMMUTABLE_LOCAL_TEST",
    "GITHUB_BRANCH_PUSH",
    "VERCEL_PREVIEW_EXECUTION",
  ],
  production_deploy_performed: false,
  production_alias_modified: false,
  secrets_printed: false,
}));

const localWrite = await runScript(
  "scripts/run-avantiqo-code-real-write-to-local-computer.mjs",
  repositoryRoot,
  {
    ...commonEnv,
    AVANTIQO_CODE_LOCAL_WRITE_APPROVED: "YES",
  },
);
if (localWrite.exit_code !== 0) throw new Error(`${CONTRACT}_LOCAL_WRITE_FAILED:${localWrite.exit_code}`);
if (!localWrite.stdout.includes("AVANTIQO_CODE_REAL_WRITE_TO_LOCAL_COMPUTER_V1=PASS")) {
  throw new Error(`${CONTRACT}_LOCAL_WRITE_PASS_MARKER_REQUIRED`);
}

const preview = await runScript(
  "scripts/certify-code-ai-github-vercel-preview-local.mjs",
  repositoryRoot,
  {
    ...commonEnv,
    AVANTIQO_CODE_GITHUB_VERCEL_PREVIEW_CERT_APPROVED: "YES",
    AVANTIQO_CODE_PREVIEW_USE_REAL_GENERATED: "YES",
    AVANTIQO_CODE_PREVIEW_KEEP_GITHUB_BRANCH: "YES",
  },
);
if (preview.exit_code !== 0) throw new Error(`${CONTRACT}_GITHUB_VERCEL_PREVIEW_FAILED:${preview.exit_code}`);
if (!preview.stdout.includes('"github_push_verified": true')) {
  throw new Error(`${CONTRACT}_GITHUB_PUSH_PROOF_REQUIRED`);
}
if (!preview.stdout.includes('"generated_code_executed_in_preview": true')) {
  throw new Error(`${CONTRACT}_VERCEL_GENERATED_EXECUTION_PROOF_REQUIRED`);
}
if (!preview.stdout.includes('"production_deployment_executed": false')) {
  throw new Error(`${CONTRACT}_NO_PRODUCTION_PROOF_REQUIRED`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  owned_model_generation_verified: true,
  local_computer_write_verified: true,
  generated_tests_passed: true,
  github_push_verified: true,
  vercel_preview_verified: true,
  same_generated_source_carried_end_to_end: true,
  production_deploy_performed: false,
  production_alias_modified: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
