import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tribunal = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);
const workflow = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("legacy settled reviews require an exact reviewed source plan hash", () => {
  assert.match(tribunal, /settled_review_source_plan = null/);
  assert.match(tribunal, /legacySourcePlanHash/);
  assert.match(tribunal, /text\(settled_review_plan_hash\) === legacySourcePlanHash/);
  assert.match(tribunal, /CREATIVE_TRIBUNAL_SETTLED_REVIEW_PLAN_MISMATCH/);
});

test("legacy rows derive reviewer evidence hashes from their exact source plan", () => {
  assert.match(tribunal, /legacy_settled_review_source_plan/);
  assert.match(tribunal, /plan: legacy_settled_review_source_plan/);
  assert.match(tribunal, /legacyEvidenceHash === evidenceHash/);
});
test("accepted Tribunal repairs reuse unchanged immediately prior reviewer rows", () => {
  assert.match(tribunal, /const priorReviews = tribunal\.reviews/);
  assert.match(tribunal, /settled_reviews: priorReviews/);
});

test("workflow resume forwards the exact legacy reviewed source plan explicitly", () => {
  assert.match(workflow, /settled_review_source_plan: input\.settled_review_source_plan \|\| null/);
});
