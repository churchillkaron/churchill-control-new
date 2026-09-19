import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js', import.meta.url), 'utf8');

test('settled authorized next usage is reconciled before new-call approval expiry checks', () => {
  assert.match(source, /const recoveryChannel = approvalChannel\(operation\)/);
  assert.match(source, /const recoveredUsage = recoveryApproval\.contract === recoveryChannel\.contract/);
  const recovery = source.indexOf('const recoveredUsage = recoveryApproval.contract');
  const newCallGate = source.indexOf('const state = approvalState(project, operation)', recovery);
  assert.ok(recovery >= 0 && newCallGate > recovery, 'settled recovery must run before active new-call gate');
  assert.match(source, /expectedReference = `\$\{approval\.id\}:\$\{expectedSequence\}:\$\{operation\}`/);
  assert.match(source, /direction_approval_id/);
  assert.match(source, /service_cost_guard_reference/);
  assert.match(source, /RECOVERED_SETTLEMENT_MISMATCH/);
  assert.match(source, /recovered_after_async_settlement: true/);
  assert.match(source, /recovered_settled_usage_at/);
});
