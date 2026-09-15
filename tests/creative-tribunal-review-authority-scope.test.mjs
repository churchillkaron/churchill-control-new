import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('reviewers cannot invent external research or cross discipline exact brand demands',()=>{
  assert.match(source,/UNSUPPORTED_EXTERNAL_RESEARCH_CLAIM/);
  assert.match(source,/CROSS_DISCIPLINE_EXACT_BRAND_DEMAND/);
  assert.match(source,/Do not cite market studies, industry analyses, campaign counts/);
  assert.match(source,/Do not require exact brand colors, fonts, spacing values/);
});
test('brand production evidence preserves deliverable scope for responsive variants',()=>{
  assert.match(source,/deliverable_id: deliverable\.id \|\| null/);
  assert.match(source,/Repeated local production-step ids across different deliverables are not duplicates/);
});

test('review policy version invalidates settled reviews when authority rules change',()=>{
  assert.match(source,/CREATIVE_TRIBUNAL_REVIEW_POLICY_V2/);
  assert.match(source,/review_policy_version: REVIEW_POLICY_VERSION/);
});


test('quoted evidence matching tolerates omitted parenthetical qualifiers only',()=>{
  assert.match(source,/function comparableEvidenceText/);
  assert.ok(source.includes('.replace(/\\([^)]*\\)/g, \" \")'));
  assert.match(source,/evidenceFragmentSupported\(fragment, scopedEvidenceText, planText\)/);
  assert.match(source,/UNSUPPORTED_QUOTED_EVIDENCE/);
});


test('non-brand reviewers cannot demand approved brand color truth', () => {
  const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /approved brand color value/);
  assert.match(source, /add evidence of brand color authorization/);
  assert.match(source, /exact hex values/);
});
