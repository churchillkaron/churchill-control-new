import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js','utf8');

test('Tribunal rejects unsupported physical-production reviewer claims', () => {
  assert.match(source, /UNSUPPORTED_PHYSICAL_PRODUCTION_CLAIM/);
  assert.match(source, /reviewerPlanEvidence\(reviewer, plan\)/);
  assert.match(source, /evidenceContainsPhysicalProduction/);
});

test('Tribunal rejects exact brand claims without authoritative brand truth', () => {
  assert.match(source, /UNVERIFIED_EXACT_BRAND_CLAIM/);
  assert.match(source, /!hasExactBrandTruthAuthority\(plan\)/);
});

test('Tribunal rejects quoted reviewer evidence absent from current scoped evidence', () => {
  assert.match(source, /UNSUPPORTED_QUOTED_EVIDENCE/);
  assert.match(source, /review\.evidence_used/);
  assert.match(source, /evidenceFragmentSupported\(fragment, scopedEvidenceText, planText, reviewerAuthorityText, reviewPolicyText\)/);
});

test('Production Workflow reviewers receive production-specific evidence authority', () => {
  assert.match(source, /production\|feasibility\|workflow/);
  assert.match(source, /return \"PRODUCTION_FEASIBILITY\"/);
  assert.match(source, /case \"PRODUCTION_FEASIBILITY\"/);
});


test('canonical plan may ground quoted evidence outside narrow reviewer scope',()=>{
  assert.match(source,/evidenceFragmentSupported\(fragment, scopedEvidenceText, planText, reviewerAuthorityText, reviewPolicyText\)/);
});


test('brand reviewer may reject invented precision without authorizing it',()=>{
  assert.match(source,/explicitlyTreatsPrecisionAsUnverified/);
  assert.match(source,/exactBrandMention && !explicitlyTreatsPrecisionAsUnverified/);
});


test('brand reviewer is explicitly told plan presence is not authorization',()=>{
  assert.match(source,/merely appearing in the current plan is evidence of a proposed or potentially unsupported value, never proof that it is authorized/);
});
