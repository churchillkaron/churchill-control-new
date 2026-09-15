import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js'), 'utf8');

test('explicit creative rejection can bypass settled master-plan recovery without resetting mission economics', () => {
  assert.match(source, /force_direction_restart/);
  assert.match(source, /forceDirectionRestart/);
  assert.match(source, /forceDirectionRestart\s*\?\s*null/);
  assert.match(source, /preserves the same mission, research evidence, spend/);
});
