import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const council = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js', import.meta.url), 'utf8');
const master = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeMasterPlanRuntime.js', import.meta.url), 'utf8');

test('durable approved Council resume validates without a paid Direction repair', () => {
  const start = council.indexOf('async function resumeApprovedCouncilPlan');
  const end = council.indexOf('async function runCouncil', start);
  const block = council.slice(start, end);
  assert.match(block, /CreativeMasterPlanRuntime\.validateExistingPlan/);
  assert.doesNotMatch(block, /CreativeMasterPlanRuntime\.repairExistingPlan/);
  assert.match(block, /plan:\s*approvedPlan/);
});

test('Master runtime exposes a provider-free validation-only path', () => {
  const start = master.indexOf('async validateExistingPlan');
  const end = master.indexOf('async repairExistingPlan', start);
  const block = master.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /validatePlan/);
  assert.match(block, /validation_only:\s*true/);
  assert.doesNotMatch(block, /ServiceExecutionRuntime\.execute/);
  assert.doesNotMatch(block, /repairInvalidPlan/);
});
