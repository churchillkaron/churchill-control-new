import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const master = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);
const hierarchical = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js", import.meta.url),
  "utf8",
);

test("recovered lineage review-only failures use specialized reviewer", () => {
  assert.match(master, /recoveredDecisionReviewOnlyFailure/);
  assert.match(master, /isAuthorizedRecoveredStory\(project, plan\)/);
  assert.match(master, /repairRecoveredDecisionReview/);
  assert.match(master, /CREATIVE_LINEAGE_DECISION_REVIEW_V1/);
});

test("specialized reviewer is story-hash bound and mutation forbidden", () => {
  assert.match(master, /creative_direction_request_hash/);
  assert.match(master, /creative_story_lineage_hash/);
  assert.match(master, /story_mutation_authority: false/);
  assert.match(master, /preserveAuthorizedRecoveredStory\(project, repair\.plan\)/);
});

test("hierarchical local child timeout allows long owned deep reviews", () => {
  assert.match(hierarchical, /DEFAULT_TIMEOUT_MS = 300000/);
});
