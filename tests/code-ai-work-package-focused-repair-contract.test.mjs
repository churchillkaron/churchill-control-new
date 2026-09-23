import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("repair planner narrows multi-file work to one remaining target", () => {
  assert.match(source, /remainingAllowedEditPaths/);
  assert.match(source, /focusedRepairTargetPath/);
  assert.match(source, /Edit exactly one file in this repair pass/);
  assert.match(source, /FOCUSED REPAIR: Verification failed after prior source mutation/);
  assert.match(source, /allowed_edit_paths: focusedRepairTargetPath \? \[focusedRepairTargetPath\]/);
  assert.match(source, /CODE_AI_WORK_PACKAGE_FOCUSED_REPAIR_PATH_SCOPE_INVALID/);
});
