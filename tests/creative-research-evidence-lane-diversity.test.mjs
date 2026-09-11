import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js','utf8');
test('company research includes distinct evidence lanes',()=>{
  assert.match(source,/planObjective\("company_truth"\)/);
  assert.match(source,/planObjective\("market_competition"\)/);
  assert.match(source,/planObjective\("audience_context"\)/);
  assert.match(source,/planObjective\("creative_precedent"\)/);
});
test('public discovery caps each query so one lane cannot monopolize evidence',()=>{
  assert.match(source,/acceptedForQuery \+= 1/);
  assert.match(source,/acceptedForQuery >= 2/);
});
