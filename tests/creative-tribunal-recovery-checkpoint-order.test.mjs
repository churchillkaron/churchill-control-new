import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js','utf8');

test('resume checkpoints settled Tribunal replay instead of stale Council master', () => {
  const resume = source.slice(source.indexOf('async resumeApprovedCouncil'));
  const recover = resume.indexOf('const recoveredTribunalResume = await recoverSettledTribunalResume');
  const tribunalRaw = resume.indexOf('const tribunalMasterRaw = recoveredTribunalResume?.replayed_plan');
  const grounded = resume.indexOf('CreativeExactClaimAuthorityRuntime.ground');
  const persist = resume.indexOf('await persistPostRepairMasterCheckpoint(context, tribunalMaster)');
  assert.ok(recover >= 0 && tribunalRaw > recover && grounded > tribunalRaw && persist > grounded);
  assert.equal(resume.slice(0, recover).includes('persistPostRepairMasterCheckpoint(context, councilMaster)'), false);
});

test('recovered Tribunal resume is durably persisted before review', () => {
  const resume = source.slice(source.indexOf('async resumeApprovedCouncil'));
  const persistResume = resume.indexOf('await persistTribunalResume(context, recoveredTribunalResume)');
  const review = resume.indexOf('const master = await reviewWithDurableResume');
  assert.ok(persistResume >= 0 && review > persistResume);
});
