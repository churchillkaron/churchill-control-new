import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of [
  'lib/creative/research/runtime/AutonomousResearchDirectorRuntime.js',
  'lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js',
]) {
  test(`${file} ignores generic platform descriptor for organization identity`, () => {
    const source = fs.readFileSync(file, 'utf8');
    const stopWords = source.match(/const NAME_STOP_WORDS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
    assert.match(stopWords, /["']platform["']/);
    assert.doesNotMatch(stopWords, /["']avantiqo["']/);
  });
}
