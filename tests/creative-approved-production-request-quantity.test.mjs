import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('approved production cost guard uses approved quote quantity for request-priced tasks', () => {
  const source=fs.readFileSync('lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime.js','utf8');
  assert.match(source,/task\.metadata\?\.pricing_quote\?\.quantity/);
});
