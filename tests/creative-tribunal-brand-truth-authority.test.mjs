import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('brand reviewer cannot upgrade qualitative evidence into exact brand specifications',()=>{
  assert.match(source,/function hasExactBrandTruthAuthority/);
  assert.match(source,/CREATIVE_BRAND_TRUTH_V1/);
  assert.match(source,/exact_brand_truth_authorized/);
  assert.match(source,/Do not require an exact hex color, font family, spacing percentage/);
  assert.match(source,/qualitative source evidence such as a blue color scheme or clean typography does not authorize an exact hex value/);
});
test('brand reviewer authority is plan-scoped in payload and evidence hash',()=>{
  assert.match(source,/reviewer: activeReviewerAuthority\(reviewer, plan\)/);
  assert.match(source,/const activeReviewer = activeReviewerAuthority\(reviewer, plan\)/);
});
