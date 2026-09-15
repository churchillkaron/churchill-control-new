import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('Tribunal resume persists failed reviews as durable blockers',()=>{
  const start=source.indexOf('function tribunalResumePackage');
  const end=source.indexOf('function reviewerDiscipline', start);
  const block=source.slice(start,end);
  assert.match(block,/Persist every settled scoped judgment/);
  assert.doesNotMatch(block,/review\.passed === true/);
});
test('canonical review plans are deep cloned before hashing and persistence',()=>{
  const start=source.indexOf('function canonicalReviewPlan');
  const end=source.indexOf('function tribunalResumePackage', start);
  const block=source.slice(start,end);
  assert.match(block,/structuredClone\(object\(plan\)\)/);
});
