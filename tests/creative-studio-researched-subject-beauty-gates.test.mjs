import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const shot = fs.readFileSync('lib/creative/shots/documents/Shot.js','utf8');
const bible = fs.readFileSync('lib/creative/video/runtime/CreativeShotBibleRuntime.js','utf8');
const review = fs.readFileSync('lib/creative/quality/runtime/CreativeShotCandidateReviewRuntime.js','utf8');
const bridge = fs.readFileSync('lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap.js','utf8');
const select = fs.readFileSync('lib/creative/quality/runtime/CreativeShotCandidateSelectionRuntime.js','utf8');
const temporal = fs.readFileSync('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js','utf8');

test('researched subject truth survives into the Shot Bible and fails closed when required',()=>{
  assert.match(shot,/subject_truth: structured/);
  assert.match(bible,/subject_truth: object\(source\.subject_truth\)/);
  assert.match(bible,/subject_truth\.defining_visual_features/);
  assert.match(bible,/reference_evidence/);
});

test('beauty is an explicit 94-point hard release gate, not only a ranking signal',()=>{
  assert.match(review,/"cinematic_beauty"/);
  assert.match(review,/"researched_subject_fidelity"/);
  assert.match(bridge,/CINEMATIC_MERIT_FLOOR = 94/);
  assert.match(bridge,/shot_candidate_cinematic_beauty_passed/);
  assert.match(select,/shot_candidate_cinematic_beauty_passed === true/);
  assert.match(select,/score\.cinematic >= WORLD_CLASS_FLOOR/);
});

test('temporal direction requires researched identity and authored beauty for fidelity-sensitive real subjects',()=>{
  assert.match(temporal,/subject_truth/);
  assert.match(temporal,/defining_visual_features/);
  assert.match(temporal,/cinematic_beauty_intent/);
  assert.match(temporal,/generic category lookalike/);
});
