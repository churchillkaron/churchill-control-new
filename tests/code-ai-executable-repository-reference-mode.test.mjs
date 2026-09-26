import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = "scripts/run-avantiqo-code-executable-repository-local.mjs";
const source = await readFile(SCRIPT, "utf8");

function runDry(extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

test("executable repository runner preserves local mode by default", () => {
  const run = runDry();
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.contract, "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_LOCAL_RUNNER_V1");
  assert.equal(report.execution_mode, "AVANTIQO_LOCAL_CODE");
  assert.equal(report.local_compute_only, true);
  assert.equal(report.provider_execution_performed, false);
});

test("reference mode is benchmark-only and dry-run performs no provider call", () => {
  const run = runDry({
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_PROVIDER: "openai",
    AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_MODEL: "benchmark-model",
    OPENAI_API_KEY: "",
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.contract, "AVANTIQO_CODE_EXECUTABLE_REPOSITORY_REFERENCE_RUNNER_V1");
  assert.equal(report.execution_mode, "REFERENCE_PROVIDER_PATCH");
  assert.equal(report.provider_execution_performed, false);
  assert.equal(report.normal_avantiqo_code_execution_uses_reference_provider, false);
  assert.equal(report.runtime_provider_effect, "NONE");
  assert.equal(report.production_deploy_performed, false);
});

test("reference patch generation supports OpenAI Anthropic and Gemini without exposing hidden tests", () => {
  assert.match(source, /new Set\(\["openai", "anthropic", "google"\]\)/);
  assert.match(source, /client\.responses\.create/);
  assert.match(source, /api\.anthropic\.com\/v1\/messages/);
  assert.match(source, /generativelanguage\.googleapis\.com\/v1beta\/models\//);
  assert.match(source, /Return ONLY a unified git diff/);
  assert.match(source, /Hidden acceptance tests are intentionally unavailable/);
  assert.match(source, /raw_provider_output_persisted: false/);
});
