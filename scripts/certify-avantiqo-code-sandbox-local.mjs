import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_SANDBOX_CERTIFICATION_EVIDENCE_V1";
const EXPECTED_SMOKE_CONTRACT = "AVANTIQO_CODE_SANDBOX_LIVE_SMOKE_V1";
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_SANDBOX_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-code-sandbox-certification.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function runSmoke() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["scripts/code-ai-sandbox-live-smoke.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const value = String(chunk);
      stdout += value;
      process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = String(chunk);
      stderr += value;
      process.stderr.write(value);
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      resolveRun({
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        stdout,
        stderr,
      });
    });
  });
}

function parseLastJsonObject(output) {
  const source = String(output || "");
  const starts = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "{") starts.push(index);
  }
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const candidate = source.slice(starts[index]).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Continue to an earlier opening brace until the complete final object is found.
    }
  }
  return null;
}

const run = await runSmoke();
if (run.signal) throw new Error(`AVANTIQO_CODE_SANDBOX_SMOKE_SIGNAL:${run.signal}`);
if (run.code !== 0) {
  throw new Error(
    `AVANTIQO_CODE_SANDBOX_SMOKE_FAILED:${run.code}:${text(run.stderr).slice(0, 500)}`,
  );
}

const smoke = parseLastJsonObject(run.stdout);
if (!smoke) throw new Error("AVANTIQO_CODE_SANDBOX_SMOKE_RESULT_JSON_REQUIRED");

const checks = {
  smoke_contract: text(smoke.contract) === EXPECTED_SMOKE_CONTRACT,
  success: smoke.success === true,
  sandbox_execution_certified: smoke.sandbox_execution_certified === true,
  base_commit_present: Boolean(text(smoke.base_commit)),
  search_verified: smoke.search_verified === true,
  read_verified: smoke.read_verified === true,
  isolated_edit_verified: smoke.isolated_edit_verified === true,
  command_execution_verified: smoke.command_execution_verified === true,
  diff_verified: smoke.diff_verified === true,
  direct_push_blocked: smoke.direct_push_blocked === true,
  production_side_effects_absent: smoke.production_side_effects_executed === false,
  provider_calls_absent: smoke.provider_calls_executed === false,
  provider_spend_not_approved: smoke.provider_spend_approved === false,
};
const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
if (failedChecks.length) {
  throw new Error(`AVANTIQO_CODE_SANDBOX_CERTIFICATION_CHECKS_FAILED:${failedChecks.join(",")}`);
}

const evidence = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  source_contract: smoke.contract,
  repository_url: smoke.repository_url,
  ref: smoke.ref,
  base_commit: smoke.base_commit,
  checks,
  sandbox_execution_certified: true,
  direct_push_blocked: true,
  governed_commit_runtime_required: true,
  production_side_effects_executed: false,
  provider_calls_executed: false,
  provider_spend_approved: false,
  live_github_commit_performed: false,
  production_deploy_performed: false,
};

await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  output_path: OUTPUT,
  base_commit: evidence.base_commit,
  sandbox_execution_certified: true,
  direct_push_blocked: true,
  live_github_commit_performed: false,
  production_deploy_performed: false,
}, null, 2));
