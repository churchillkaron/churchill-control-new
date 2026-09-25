import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile("scripts/run-avantiqo-code-frontier-local.mjs", "utf8");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

test("frontier local runner is owned-only and fails closed for real evidence", () => {
  assert.match(source, /AVANTIQO_CODE_FRONTIER_LOCAL_RUNNER_V1/);
  assert.match(source, /AvantiqoCodeLocalQueueProvider/);
  assert.match(source, /ai\.code\.review/);
  assert.match(source, /AVANTIQO_LOCAL_NODE_V1/);
  assert.match(source, /external_fallback_allowed: false/);
  assert.match(source, /external_provider_execution_performed: false/);
  assert.match(source, /CURRENT_MAIN_REQUIRED/);
  assert.match(source, /CLEAN_REPOSITORY_REQUIRED/);
  assert.match(source, /AVANTIQO_CODE_FRONTIER_LOCAL_APPROVED=YES_REQUIRED/);
});

test("frontier local dry-run renders the canonical 30-case suite without submitting jobs", () => {
  assert.match(source, /if \(dryRun\)/);
  assert.match(source, /local_compute_job_submitted: false/);
  assert.match(source, /prompt_render_verified: true/);
  assert.match(source, /full_suite_case_count: allCases\.length/);
  assert.equal(pkg.scripts["benchmark:code:frontier-local:dry"], "node scripts/run-avantiqo-code-frontier-local.mjs --dry-run");
  assert.equal(pkg.scripts["benchmark:code:frontier-local"], "node scripts/run-avantiqo-code-frontier-local.mjs");
});

test("frontier local runner grades with the same canonical case grader used for reference providers", () => {
  assert.match(source, /gradeCodeAICompetitiveReferenceCase/);
  assert.match(source, /prompt_contract_sha256/);
  assert.match(source, /suite_sha256/);
  assert.match(source, /runner_repository_clean/);
  assert.match(source, /raw_reasoning_persisted: false/);
  assert.match(source, /raw_model_output_persisted: false/);
  assert.match(source, /inference_elapsed_ms/);
  assert.match(source, /model_total_duration_ms/);
  assert.match(source, /model_load_duration_ms/);
  assert.match(source, /code_gpu_wait_ms/);
  assert.match(source, /code_cpu_fallback/);
  assert.match(source, /code_runtime_model_already_gpu_resident/);
});
