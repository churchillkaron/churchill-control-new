import assert from 'node:assert/strict';
import test from 'node:test';
import { unlockStudioVisualGenerationCertification } from '../lib/creative/quality/runtime/CreativeStudioVisualReadinessCertificationRuntime.js';

const certified = Object.freeze({
  contract:'AVANTIQO_STUDIO_VISUAL_GENERATION_CERTIFICATION_V1',
  passed:true,
  score:100,
  required_score:100,
  zero_paid_media_generation:true,
  known_failure_suite_passed:true,
  generation_unlocked:false,
  benchmark_suite_digest:'3e100b503a52bd16c7004133bfb7cf61d57ee916ced7f4bd6dd2b26733685705',
});

test('explicit human approval unlocks only a valid perfect certification',()=>{
  const out=unlockStudioVisualGenerationCertification(certified,{source:'USER_EXPLICIT_APPROVAL',scoped_project_id:'project-1'});
  assert.equal(out.generation_unlocked,true);
  assert.equal(out.scoped_project_id,'project-1');
  assert.equal(out.unlock_source,'USER_EXPLICIT_APPROVAL');
  assert.equal(out.score,100);
  assert.equal(out.passed,true);
});

test('unlock rejects uncertified evidence',()=>{
  assert.throws(()=>unlockStudioVisualGenerationCertification({...certified,score:99},{source:'USER_EXPLICIT_APPROVAL'}),/STUDIO_VISUAL_CERTIFICATION_REQUIRED_FOR_UNLOCK/);
});
