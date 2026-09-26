import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = "scripts/run-avantiqo-code-competitive-full-live.mjs";
const source = await readFile(SCRIPT, "utf8");

function dryRun(extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AVANTIQO_CODE_COMPETITIVE_REQUIRED_REFERENCE_MODELS: JSON.stringify({ openai: "model-a", google: "model-b" }),
      ...extraEnv,
    },
  });
}

test("full competitive orchestrator dry-run plans evidence without execution", () => {
  const run = dryRun({ OPENAI_API_KEY: "", GEMINI_API_KEY: "", GOOGLE_API_KEY: "" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.contract, "AVANTIQO_CODE_COMPETITIVE_FULL_LIVE_ORCHESTRATOR_V1");
  assert.equal(report.external_provider_execution_performed, false);
  assert.equal(report.production_deploy_performed, false);
  assert.deepEqual(report.providers, ["google", "openai"]);
  assert.match(report.paths.owned_repository, /executable-repository-owned\.json$/);
  assert.match(report.paths.references.openai.repository, /repository-reference-openai\.json$/);
});

test("full competitive orchestrator requires an exact model binding for every provider", () => {
  const run = dryRun({
    AVANTIQO_CODE_COMPETITIVE_REQUIRED_PROVIDERS: "openai,google,anthropic",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /MODEL_REQUIRED:anthropic/);
});

test("full orchestrator wires frontier and executable evidence into competitive certification", () => {
  assert.match(source, /run-avantiqo-code-frontier-local\.mjs/);
  assert.match(source, /run-avantiqo-code-competitive-reference-live\.mjs/);
  assert.match(source, /run-avantiqo-code-executable-repository-local\.mjs/);
  assert.match(source, /benchmark-avantiqo-code-competitive\.mjs/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_OWNED_REPOSITORY_EVIDENCE/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_REFERENCE_REPOSITORY_EVIDENCE/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_FULL_BENCHMARK_APPROVED/);
  assert.match(source, /runtime_provider_effect: "NONE"/);
  assert.match(source, /production_deploy_performed: false/);
});
