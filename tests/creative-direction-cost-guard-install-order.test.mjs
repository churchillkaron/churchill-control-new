import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js', import.meta.url);

test('creative direction installs service cost guard before capturing execution runtime', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const guardImport = source.indexOf('ServiceExecutionCostGuardRuntime');
  const executionImport = source.indexOf('ServiceExecutionRuntime');
  const capture = source.indexOf('const executeWithoutDirectionGate = ServiceExecutionRuntime.execute.bind');

  assert.ok(guardImport >= 0, 'service cost guard import is required');
  assert.ok(executionImport >= 0, 'service execution runtime import is required');
  assert.ok(capture >= 0, 'direction gate must capture service execution runtime');
  assert.ok(guardImport < capture, 'cost guard must install before direction captures execution');
});
