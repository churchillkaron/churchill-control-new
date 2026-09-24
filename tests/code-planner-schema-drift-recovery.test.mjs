import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");

test("record_reproduction derives status from an observed test when planner omits status", () => {
  assert.match(source, /const testFile = text\(operation\.input\?\.test_file/);
  assert.match(source, /command: "node"/);
  assert.match(source, /args: \["--test", testFile\]/);
  assert.match(source, /status = Number\(observedRun\?\.exit_code\) === 0 \? "PASSED" : "FAILED"/);
  assert.match(source, /operation_id: evidenceOperationId/);
});

test("record_hypotheses accepts the planner causal_path alias without guessing a conclusion", () => {
  assert.match(source, /source\.hypothesis \|\| source\.causal_path/);
  assert.match(source, /status: text\(source\.status\)\.toUpperCase\(\) \|\| "PLAUSIBLE"/);
});


test("record_reproduction binds declared pass/fail status to observed evidence", () => {
  assert.match(source, /CODE_AI_REPRODUCTION_STATUS_EVIDENCE_MISMATCH/);
  assert.match(source, /CODE_AI_REPRODUCTION_EVIDENCE_NOT_VERIFIABLE/);
  assert.match(source, /CODE_AI_REPRODUCTION_EVIDENCE_REQUIRED/);
  assert.match(source, /deriveReproductionStatusFromEvidence\(state, evidenceOperationIds\)/);
});
