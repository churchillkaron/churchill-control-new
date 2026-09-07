import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js','utf8');

test('premium temporal planning requires contrast-driven trailer grammar', () => {
  for (const phrase of [
    'Premium trailer grammar is built on contrast, not constant speed',
    'Withhold the hero reveal',
    'audio lead-ins and J-cuts',
    'designed near-silence or major density drop',
    'may not behave as one constant background bed',
  ]) assert.ok(source.includes(phrase), phrase);
});
