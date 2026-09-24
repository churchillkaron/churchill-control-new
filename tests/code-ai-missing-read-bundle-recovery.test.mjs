import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");

test("multiple tracked candidates recover as bounded read-only evidence instead of forcing replan", () => {
  assert.match(source, /if \(matches\.length > 1\)/);
  assert.match(source, /const boundedCandidates = matches\.slice\(0, 3\)/);
  assert.match(source, /missing_repository_read_path_recovered_bundle/);
  assert.match(source, /bounded_read_only_bundle: true/);
  assert.match(source, /full_replan_required: false/);
  assert.match(source, /recovered_reads: recoveredReads/);
});

test("zero tracked candidates still fail closed into repository replan", () => {
  assert.match(source, /const recoveryError = new Error\("CODE_AI_MISSING_READ_PATH_REPLAN_REQUIRED"\)/);
  assert.match(source, /candidate_count: 0/);
});
