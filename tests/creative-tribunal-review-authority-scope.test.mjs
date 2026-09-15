import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { quotedEvidenceFragments } from '../lib/creative/director/runtime/CreativeQuotedEvidenceRuntime.js';
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
  assert.match(source,/evidenceFragmentSupported\(fragment, scopedEvidenceText, planText, reviewerAuthorityText, reviewPolicyText\)/);
  assert.match(source,/UNSUPPORTED_QUOTED_EVIDENCE/);
});


test('non-brand reviewers cannot demand approved brand color truth', () => {
  const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /approved brand color value/);
  assert.match(source, /add evidence of brand color authorization/);
  assert.match(source, /exact hex values/);
});


test('quoted evidence parser ignores possessive apostrophes', () => {
  const evidence = "Creative system's explicit disclaimer ('creative palette blue (not claimed as an official brand color)') and asset manifest's 'preserve_exact_brand_mark' restriction.";
  const fragments = quotedEvidenceFragments(evidence);
  assert.deepEqual(fragments, [
    'creative palette blue (not claimed as an official brand color)',
    'preserve_exact_brand_mark',
  ]);
});

test('brand reviewers distinguish non-official creative palette from brand truth', () => {
  assert.match(source, /creative art-direction choices from official brand truth/);
  assert.match(source, /CREATIVE_PALETTE_MISCLASSIFIED_AS_BRAND_TRUTH/);
  assert.match(source, /not official brand truth is art direction/);
});


test('fatal concept blockers require genuine concept replacement', () => {
  assert.match(source, /function fatalConceptReplacementRequired/);
  assert.match(source, /Perform a true concept replacement/);
  assert.match(source, /do not merely rename\/reskin the same metaphor/);
  assert.match(source, /MAXIMUM_REPAIR_ATTEMPTS = 3/);
});


test('anti-cliche reviewers only see current creative evidence, not historical director repair notes', () => {
  assert.match(source, /return "ANTI_CLICHE"/);
  assert.match(source, /case "ANTI_CLICHE"/);
  assert.match(source, /anti_cliche_rules: canonical\.anti_cliche_rules/);
});


test('reviewers may cite their active mandate and active review policy as trusted authority', () => {
  assert.match(source, /reviewerAuthorityText = JSON\.stringify\(activeReviewerAuthority/);
  assert.match(source, /reviewPolicyText = JSON\.stringify/);
  assert.match(source, /reviewPayload\(\{ reviewer, context: \{\}, plan, floor: qualityFloor\(plan\) \}\)\.rules/);
  assert.match(source, /evidenceFragmentSupported\(fragment, scopedEvidenceText, planText, reviewerAuthorityText, reviewPolicyText\)/);
});


test('tribunal repair payload is compact and blocker focused', () => {
  assert.match(source, /function compactRepairContext/);
  assert.match(source, /function compactRepairPlan/);
  assert.match(source, /context: compactRepairContext\(context\)/);
  assert.match(source, /plan: compactRepairPlan\(plan\)/);
  assert.doesNotMatch(source, /tribunal: blockingTribunal/);
});

test('generic anti-cliche device replacement triggers concept replacement authority', () => {
  assert.match(source, /unique,\? non-generic/);
  assert.match(source, /replace\[\^\.\]\{0,120\}\(\?:clich/);
});
