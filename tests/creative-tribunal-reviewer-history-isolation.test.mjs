import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('active Tribunal reviewer authority excludes historical failure modes',()=>{
  assert.match(source,/function activeReviewerAuthority/);
  const fn=source.slice(source.indexOf('function activeReviewerAuthority'),source.indexOf('function reviewerEvidenceHash'));
  assert.doesNotMatch(fn,/failure_modes:/);
  assert.match(source,/reviewer: activeReviewerAuthority\(reviewer, plan\)/);
  assert.match(source,/reviewer: activeReviewer,/);
});
test('Tribunal explicitly forbids treating historical panel failures as current evidence',()=>{
  assert.match(source,/historical risk-selection context, never proof/);
  assert.match(source,/absent from reviewer_scoped_evidence and the current canonical plan/);
});


test("review payload does not duplicate full canonical plan beside scoped evidence", () => {
  const source = fs.readFileSync("lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", "utf8");
  const start = source.indexOf("function reviewPayload");
  const end = source.indexOf("function assertReviewAuthority", start);
  const body = source.slice(start, end);
  assert.ok(body.includes("reviewer_scoped_evidence"));
  assert.equal(body.includes("plan: canonicalReviewPlan(plan)"), false);
  assert.equal(body.includes("reviewer_scoped_evidence and the full plan"), false);
});
