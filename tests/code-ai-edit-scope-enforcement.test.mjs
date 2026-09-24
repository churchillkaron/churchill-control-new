import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");
const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("mission mutations fail closed outside explicit allowed_edit_paths", () => {
  assert.match(mission, /function assertMutationPathsWithinAllowedEditScope/);
  assert.match(mission, /CODE_AI_MUTATION_PATH_OUTSIDE_ALLOWED_SCOPE/);
  assert.match(mission, /assertMutationPathsWithinAllowedEditScope\(state, classified\.touched\)/);
  assert.match(mission, /assertMutationPathsWithinAllowedEditScope\(state, \[filePath\]\)/);
});

test("planner package scope violations trigger bounded repair before mutation", () => {
  assert.match(live, /CODE_AI_WORK_PACKAGE_EDIT_SCOPE_VIOLATION/);
  assert.match(live, /repair_category: repairCategory/);
  assert.match(live, /\? "EDIT_SCOPE"/);
  assert.match(live, /edit_scope_violation_path: editScopeViolationPath/);
  assert.match(live, /allowed_edit_paths:/);
});
