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
test("background continuation preserves the exact pending planner job instead of duplicating inference", () => {
  assert.match(route, /deriveCodeAIWatchdog/);
  assert.match(route, /pendingSince: nextState\?\.planner_pending\?\.created_at/);
  assert.match(route, /const plannerPendingActive = Boolean\(nextState\?\.planner_pending\)/);
  assert.match(route, /LOCAL_BACKGROUND_PLANNER_PENDING_RECOVERY/);
  assert.match(route, /preserving and polling that exact job instead of submitting duplicate inference/);
  assert.match(route, /hardPendingDeadlineMs = 300000/);
  assert.match(route, /CODE_STUDIO_PLANNER_PENDING_HARD_DEADLINE_EXCEEDED/);
  const pendingBranch = route.slice(route.indexOf("if (plannerPendingActive)"), route.indexOf("if (stagnantResumePasses >= 3)"));
  assert.doesNotMatch(pendingBranch, /planner_pending:\s*null/);
});
