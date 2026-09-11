import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const v3=fs.readFileSync('lib/creative/research/runtime/AutonomousResearchDirectorRuntime.js','utf8');
const v4=fs.readFileSync('lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js','utf8');
test('V3 preserves approval after an uncharged failure',()=>{
  assert.match(v3,/unchargedFailure/);
  assert.match(v3,/approval_reusable_after_uncharged_failure/);
});
test('V4 preserves approval while approved budget remains',()=>{
  assert.match(v4,/approvalHasRemainingBudget/);
  assert.match(v4,/approval_reusable_after_failure_with_remaining_budget/);
});
