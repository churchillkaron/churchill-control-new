import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIStrategicReasoningRuntime.js", import.meta.url), "utf8");

test("pre-existing dirty workspace state is not treated as current-mission implementation", () => {
  assert.match(source, /const missionOwnedMutation = list\(source\.evidence\)\.some/);
  assert.match(source, /\["apply_files", "replace_range", "delete_files", "rename_files"\]\.includes/);
  assert.match(source, /if \(!missionOwnedMutation\) return false/);
});

test("post-implementation specialist review still activates after a mission-owned mutation", () => {
  assert.match(source, /const implementationAlreadyPresent = implementationPresent\(plannedResumeState\)/);
  assert.match(source, /const hasConcreteRepositoryEvidence =/);
  assert.match(source, /implementationAlreadyPresent;/);
  assert.match(source, /const specialistReviewRequired =/);
  assert.match(source, /hasConcreteRepositoryEvidence &&/);
  assert.match(source, /implementationAlreadyPresent \|\| preImplementationSpecialistReviewRequired/);
  assert.match(source, /const specialistReview = specialistReviewRequired/);
});
