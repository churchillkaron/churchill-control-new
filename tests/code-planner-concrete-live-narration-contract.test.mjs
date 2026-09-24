import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const planner = await readFile(new URL("../lib/code/runtime/CodeAIPlannerExecutionRuntime.js", import.meta.url), "utf8");
const work = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("planner live narration carries real mission and target context", () => {
  assert.match(work, /code_ai_objective: text\(objective, 900\)/);
  assert.match(work, /code_ai_focused_target_path: focusedRepairTargetPath \|\| null/);
  assert.match(work, /code_ai_allowed_edit_paths:/);
  assert.match(planner, /function plannerProgressDescription/);
  assert.match(planner, /Mission: \$\{objective\.slice/);
  assert.match(planner, /Target: \$\{target\}/);
});

test("planner polling no longer emits generic job-check filler", () => {
  assert.doesNotMatch(planner, /checking whether the local Code job has finished/);
  assert.doesNotMatch(planner, /checking the local Code job for its first result/);
  assert.doesNotMatch(planner, /local Code job is still running\. I’m checking again/);
  assert.match(planner, /same local Code job is still running; I’m checking its result without restarting it/);
});
