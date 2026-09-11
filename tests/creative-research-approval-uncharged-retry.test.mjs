import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of [
  'lib/creative/research/runtime/AutonomousResearchDirectorRuntime.js',
  'lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js',
]) {
  test(`${file} preserves approval after uncharged failure`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /approval_reusable_after_uncharged_failure/);
    assert.match(source, /unchargedFailure/);
    assert.match(source, /approved:\s*unchargedFailure\s*\?\s*true\s*:\s*false/);
  });
}
