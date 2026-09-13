import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL(
  '../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js',
  import.meta.url,
);

test('selected concept revision preserves governed structure and synthetic production path', async () => {
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /const structureLock = list\(plan\.scenes\)/);
  assert.match(source, /Return each locked scene id exactly once/);
  assert.match(source, /combine beats creatively inside existing scenes/);
  assert.match(source, /EXACT STRUCTURE LOCK/);
  assert.match(source, /visual-truth and physical-plausibility targets/);
  assert.match(source, /Never replace the approved AI video generation path with a physical shoot/);
});
