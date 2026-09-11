import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source=fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",import.meta.url),"utf8");
test("Tribunal strips transport mirror from reviewer evidence",()=>{
  assert.match(source,/delete canonical\.common_plan_contract/);
  assert.match(source,/plan: canonicalReviewPlan\(plan\)/);
});
test("Tribunal resumes passed reviewers and reruns only failed ones",()=>{
  assert.match(source,/settled\?\.review\?\.passed === true/);
  assert.match(source,/reused: true/);
  assert.match(source,/reused: false/);
});
test("settled reviewer reuse is bound to canonical plan hash",()=>{
  assert.match(source,/CREATIVE_TRIBUNAL_SETTLED_REVIEW_PLAN_MISMATCH/);
  assert.match(source,/reviewPlanHash\(plan = \{\}\)/);
});
