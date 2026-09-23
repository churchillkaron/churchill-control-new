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

test("recovered story audience/review-only failures use dedicated lineage reviewer", () => {
  assert.match(master, /function recoveredDecisionReviewOnlyFailure/);
  assert.match(master, /CREATIVE_LINEAGE_DECISION_REVIEW_V1/);
  assert.match(master, /useRecoveredDecisionReview/);
  assert.match(master, /isAuthorizedRecoveredStory\(project, plan\)/);
  assert.match(master, /recoveredDecisionReviewOnlyFailure\(validationError\)/);
});

test("dedicated lineage reviewer is story-hash bound and has no mutation authority", () => {
  assert.match(master, /creative_direction_request_hash/);
  assert.match(master, /creative_story_lineage_hash/);
  assert.match(master, /recovered_story_locked: true/);
  assert.match(master, /story_mutation_authority: false/);
});

test("hierarchical local deep child timeout accommodates multi-stage local reviews", () => {
  assert.match(hierarchical, /DEFAULT_TIMEOUT_MS = 300000/);
});
