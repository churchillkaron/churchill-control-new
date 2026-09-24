import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");

test("Code mission snapshots pre-existing dirty paths before repository work", () => {
  assert.match(source, /workspace_baseline_captured: prior\.workspace_baseline_captured === true/);
  assert.match(source, /workspace_baseline_changed_paths:/);
  assert.match(source, /const baselineSnapshot = await workspace\.diff\(\)/);
  assert.match(source, /kind: "workspace_baseline"/);
});

test("pre-existing dirty paths are excluded unless Code explicitly owns the path", () => {
  assert.match(source, /const baseline = new Set/);
  assert.match(source, /!baseline\.has\(filePath\) \|\| declaredPathSet\.has\(filePath\)/);
  assert.match(source, /scopeDiffToMissionPaths/);
  assert.match(source, /workspace_changed_paths:/);
  assert.match(source, /baseline_changed_paths:/);
});

test("diff-check failures are scoped to mission-owned paths without weakening owned-file checks", () => {
  assert.match(source, /function scopeDiffCheckToMissionPaths/);
  assert.match(source, /ignored_preexisting_diagnostics:/);
  assert.match(source, /mission_scoped_diff_check:/);
  assert.match(source, /CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT/);
});
