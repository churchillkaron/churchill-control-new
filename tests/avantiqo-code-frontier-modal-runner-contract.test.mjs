import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runner = fs.readFileSync("scripts/run-avantiqo-code-frontier-modal.py", "utf8");

test("frontier runner uses owned Modal Code without RunPod or persistent storage", () => {
  assert.match(runner, /modal\.Cls\.from_name\(APP_NAME, CLS_NAME\)/);
  assert.match(runner, /invoke_batch\.remote/);
  assert.match(runner, /MODAL_GPU_SNAPSHOT/);
  assert.match(runner, /"infrastructure": "MODAL_GPU_SNAPSHOT"/);
  assert.match(runner, /"runpod_used": False/);
  assert.match(runner, /"persistent_storage_created": False/);
});

test("frontier runner defaults to bounded smoke execution and requires explicit full suite", () => {
  assert.match(runner, /--limit/);
  assert.match(runner, /default=3/);
  assert.match(runner, /--full/);
  assert.match(runner, /if not args\.full/);
});

test("frontier runner binds owned evidence to current clean main and shared prompt contract", () => {
  assert.match(runner, /current_clean_main_provenance/);
  assert.match(runner, /CURRENT_MAIN_REQUIRED/);
  assert.match(runner, /CLEAN_REPOSITORY_REQUIRED/);
  assert.match(runner, /runner_source_commit/);
  assert.match(runner, /prompt_contract_sha256/);
});

test("frontier runner grades strict evidence and blocks fake completion claims", () => {
  assert.match(runner, /EXACT_EVIDENCE_KEYS_REQUIRED/);
  assert.match(runner, /UNOBSERVED_COMPLETION_CLAIM/);
  assert.match(runner, /STRICT_JSON_REQUIRED/);
  assert.match(runner, /complete_suite/);
});
