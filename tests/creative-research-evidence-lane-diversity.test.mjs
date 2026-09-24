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
test('public discovery interleaves query lanes so one lane cannot monopolize evidence',()=>{
  assert.match(source,/for \(let rank = 0; rank < 12; rank \+= 1\)/);
  assert.match(source,/for \(const \{ query, found \} of queryResults\)/);
  assert.match(source,/const item = found\[rank\]/);
  assert.match(source,/candidates\.push\(\{ \.\.\.item, query, discovery_rank: rank \+ 1 \}\)/);
});
