import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('lib/creative/research/runtime/ResearchEvidenceContractRuntime.js','utf8');
test('research normalization accepts equivalent owned-intelligence shapes without weakening evidence gates',()=>{
  assert.match(source,/function listOrOne/);
  assert.match(source,/rawResolutionStatus === "VERIFIED" \? "RESOLVED"/);
  assert.match(source,/object\(payload\.confidence\)\.overall/);
  assert.match(source,/listOrOne\(item\.human_truths/);
  assert.match(source,/listOrOne\(item\.category_conventions/);
  assert.match(source,/must_not_do: listOrOne/);
  assert.match(source,/STRATEGIC_SYNTHESIS_EVIDENCE_REQUIRED/);
  assert.match(source,/VERIFIED_CLAIM_COVERAGE_INSUFFICIENT/);
});
