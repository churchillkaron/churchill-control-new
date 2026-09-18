import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const temporal = fs.readFileSync('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js','utf8');
const casting = fs.readFileSync('lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime.js','utf8');
const perceptual = fs.readFileSync('lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js','utf8');

test('source-conditioned premium shots author a cinematic reinterpretation contract', () => {
  assert.match(temporal, /"source_reinterpretation"/);
  assert.match(temporal, /CINEMATIC_REINTERPRETATION\|EXACT_ARCHIVAL\|SOURCE_FREE/);
  assert.match(temporal, /production_value_transformation/);
  assert.match(temporal, /new_viewpoint_logic/);
  assert.match(temporal, /vfx_cgi_integration/);
  assert.match(temporal, /consumer_ai_failure_test/);
  assert.match(temporal, /source_frame_is_not_final_frame/);
});

test('premium reinterpretation rejects ordinary image-to-video treatment', () => {
  assert.match(temporal, /Merely animating the supplied frame with a zoom, parallax, face motion, generic camera drift or stock particles is invalid/);
  assert.match(temporal, /SHOT_SOURCE_REINTERPRETATION_CONSUMER_AI_LEVEL/);
  assert.match(temporal, /SOURCE REINTERPRETATION IS A PREMIUM FILM RULE/);
});

test('reference fidelity preserves venue truth while permitting world-class production-value transformation', () => {
  assert.match(casting, /REFERENCE MEDIA DEFINES IDENTITY AND WORLD TRUTH, NOT FINAL PRODUCTION VALUE/);
  assert.match(casting, /re-photographing\/reconstructing it cinematically/);
  assert.match(casting, /Do not simply animate the uploaded still/);
  assert.match(casting, /new viewpoint may be invented only when the available source\/world evidence supports the geometry/);
});

test('perceptual review fails consumer-AI-equivalent source animation', () => {
  assert.match(perceptual, /CONSUMER-AI DIFFERENTIATION TEST/);
  assert.match(perceptual, /ordinary one-click image-to-video generator/);
  assert.match(perceptual, /generic parallax, slow zoom, camera drift, face animation, stock fog\/particles/);
  assert.match(perceptual, /source_reinterpretation/);
});
