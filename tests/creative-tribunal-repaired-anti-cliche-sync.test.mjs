import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('Tribunal repair synchronizes final anti-cliche rules with repaired concept refused devices',()=>{
  assert.match(source,/repairedRefusedDevices/);
  assert.match(source,/patch\.anti_cliche_rules = repairedRefusedDevices/);
});
test('concept selection rationale is audit history, not final review evidence',()=>{
  const canonical=source.slice(source.indexOf('function canonicalReviewPlan'),source.indexOf('function tribunalResumePackage'));
  assert.match(canonical,/delete canonical\.concept_selection_reason/);
});
