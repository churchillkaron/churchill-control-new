import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const post=fs.readFileSync('lib/creative/post-production/runtime/CreativePostProductionRuntime.js','utf8');
const governed=fs.readFileSync('lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime.js','utf8');
const color=fs.readFileSync('lib/creative/color/runtime/CreativeColorFinishingBootstrap.js','utf8');
const pro=fs.readFileSync('lib/creative/post-production/runtime/CreativeProfessionalFinishingBootstrap.js','utf8');

test('post production can consume exact authenticated picture-lock timeline',()=>{
  assert.match(post,/approved_timeline_asset_node_id = null/);
  assert.match(post,/APPROVED_TIMELINE_NOT_FOUND/);
  assert.match(post,/APPROVED_TIMELINE_PROJECT_MISMATCH/);
  assert.match(post,/DIRECTED_PICTURE_LOCK_TIMELINE_REQUIRED/);
  assert.match(post,/timeline = allNodes\.find/);
  assert.match(post,/requirements = list\(timeline\.metadata\?\.requirements\)/);
});

test('locked-timeline path skips production waiting and semantic recomposition',()=>{
  assert.match(post,/if \(!approved_timeline_asset_node_id\) \{/);
  assert.match(post,/prepared = \{ status: "LOCKED_TIMELINE", videos: \[\], clips: \[\], moments: \[\] \}/);
  assert.match(post,/approved_timeline_consumed: Boolean\(approved_timeline_asset_node_id\)/);
  assert.match(post,/semantic_recomposition_performed: !approved_timeline_asset_node_id/);
});

test('governed mastering passes authenticated edit timeline into post production',()=>{
  assert.match(governed,/if \(editReview\.ready !== true\)/);
  assert.match(governed,/AWAITING_EDIT_REVIEW/);
  assert.match(governed,/approved_timeline_asset_node_id: editReview\.timeline\.id/);
  assert.match(governed,/picture_lock_preserved: true/);
  assert.match(governed,/semantic_recomposition_forbidden: true/);
});

test('governed EDL renderer retains editorial assembly, professional finishing and global Color DI wrappers',()=>{
  assert.match(post,/CreativeEditorialAssemblyRenderBootstrap/);
  assert.match(post,/CreativeProfessionalFinishingBootstrap/);
  assert.match(post,/CreativeColorFinishingBootstrap/);
  assert.match(color,/CreativeColorFinishingRuntime\.finish/);
  assert.match(color,/qc_seal_contract/);
  assert.match(pro,/CreativeProfessionalFinishingRuntime\.finish/);
});

test('global Color DI remains after edit rather than per-shot',()=>{
  assert.match(color,/renderWithColorFinishing/);
  assert.match(color,/timeline_asset_node_id: input\.timeline_asset_node_id/);
  assert.match(color,/runs_after_professional_finishing: true/);
});
