import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source=fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",import.meta.url),"utf8");
test("Tribunal strips transport and historical audit mirrors from active reviewer evidence",()=>{
  assert.match(source,/delete canonical\.common_plan_contract/);
  assert.match(source,/delete canonical\.context/);
  assert.match(source,/delete canonical\.concept_candidates/);
  assert.match(source,/delete canonical\.concept_council/);
  assert.match(source,/delete canonical\.validation_summary/);
  assert.match(source,/plan: reviewerPlanEvidence\(reviewer, plan\)/);
});
test("Tribunal resumes any settled reviewer result for the exact same evidence",()=>{
  assert.match(source,/const exactScopedEvidenceMatch/);
  assert.match(source,/exactScopedEvidenceMatch \|\| legacyScopedMigrationMatch \|\| verifiedLegacyPass/);
  assert.match(source,/reused: true/);
  assert.match(source,/reused: false/);
});
test("settled reviewer reuse is bound to canonical plan hash",()=>{
  assert.match(source,/CREATIVE_TRIBUNAL_SETTLED_REVIEW_PLAN_MISMATCH/);
  assert.match(source,/reviewPlanHash\(plan = \{\}\)/);
});
