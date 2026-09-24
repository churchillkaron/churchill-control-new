import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js', import.meta.url), 'utf8');
test('temporal production helpers invoked by create are defined', () => {
  assert.match(source, /async function developVisualWorld\(/);
  assert.match(source, /function shotInventionPrompt\(/);
  assert.match(source, /REQUIRED SCENE IDS/);
  assert.match(source, /function canonicalShotInventionSceneId\(/);
  assert.match(source, /candidate\.replace\(\/_\/g, "-"\)/);
  assert.match(source, /async function createShotInventionMap\(/);
  assert.match(source, /function sceneInvention\(/);
  assert.match(source, /await developVisualWorld\(/);
  assert.match(source, /await createShotInventionMap\(/);
  assert.match(source, /sceneInvention\(shotInventionMap, scene\.id\)/);
});
