import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("background continuation counts repository evidence rather than reasoning churn", () => {
  assert.match(route, /completed_operation_count: completedCount/);
  assert.match(route, /source_change_count:/);
  assert.match(route, /files_changed:/);
  assert.match(route, /verification_count:/);
  const fingerprint = route.slice(route.indexOf("const resumeFingerprint"), route.indexOf("if (resumeFingerprint"));
  assert.doesNotMatch(fingerprint, /reasoning_calls_used|planner_pending_id/);
});

test("background continuation forces one replan before blocking repeated no-progress resumes", () => {
  assert.match(route, /stagnationReplanUsed/);
  assert.match(route, /stagnantResumePasses >= 3/);
  assert.match(route, /LOCAL_BACKGROUND_NO_PROGRESS_REPLAN/);
  assert.match(route, /background_no_progress_replan: true/);
  assert.match(route, /CODE_STUDIO_BACKGROUND_NO_PROGRESS_AFTER_REPLAN/);
});
