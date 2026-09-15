import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('Tribunal reasoning settles exact pending provider job before parsing JSON',()=>{
  const start=source.indexOf('async function reason');
  const end=source.indexOf('function qualityFloor',start);
  const block=source.slice(start,end);
  assert.match(block,/if \(completed\?\.pending === true\)/);
  assert.match(block,/provider_job_id: providerJobId/);
  assert.match(block,/usage_id: usageId/);
  assert.match(block,/provider_job_reused: true/);
  assert.match(block,/duplicate_provider_job_submitted: false/);
  assert.match(block,/ServiceExecutionRuntime\.settle/);
  assert.match(block,/ServiceExecutionRuntime\.cancelPending/);
  assert.match(block,/normalizedOutput\(completed, expects\)/);
});
