import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const release=fs.readFileSync('lib/creative/post-production/runtime/CreativeShotEditReleaseRuntime.js','utf8');
const directed=fs.readFileSync('lib/creative/post-production/runtime/CreativeDirectedEditTimelineRuntime.js','utf8');
const editReview=fs.readFileSync('lib/creative/review/runtime/CreativeEditReviewRuntime.js','utf8');
const prep=fs.readFileSync('lib/creative/post-production/runtime/CreativeEditPreparationRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const mastering=fs.readFileSync('lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime.js','utf8');

test('released optical master becomes the only canonical edit source for its shot',()=>{
  assert.match(release,/final_edit_source:canonical/);
  assert.match(release,/include_in_master:canonical/);
  assert.match(release,/selected_for_master:canonical/);
  assert.match(release,/superseded_by_final_edit_asset_node_id/);
});

test('finished directed shots build a locked timeline directly without semantic reselection',()=>{
  assert.match(directed,/CREATIVE_DIRECTED_EDIT_TIMELINE_V1/);
  assert.match(directed,/DIRECTOR_LOCKED_RELEASED_SHOT/);
  assert.match(directed,/directed_shot_order_locked:true/);
  assert.match(directed,/semantic_reselection_forbidden:true/);
  assert.match(directed,/fallback_source_selection_forbidden:true/);
  assert.match(directed,/final_edit_sources_only:true/);
  assert.match(directed,/human_picture_lock_required:true/);
});

test('edit preparation waits on shot release rather than unrelated helper tasks',()=>{
  assert.match(editReview,/AWAITING_SHOT_RELEASE/);
  assert.match(editReview,/CreativeDirectedEditTimelineRuntime\.build/);
  assert.match(editReview,/directed_shot_order_locked: true/);
  assert.match(editReview,/semantic_reselection_forbidden: true/);
});

test('review cut renders at 1080p and is explicitly review-only',()=>{
  assert.match(prep,/avantiqo-edit-review-1080p/);
  assert.match(prep,/width:1920/);
  assert.match(prep,/height:1080/);
  assert.match(prep,/video_codec:"libx264"/);
  assert.match(prep,/editorial_review_cut:true/);
  assert.match(prep,/include_in_master:false/);
  assert.match(prep,/mastering_forbidden_before_picture_lock:true/);
  assert.match(prep,/final_color_di_forbidden_before_picture_lock:true/);
});

test('review-cut preparation is idempotent and queue progresses only on actual change',()=>{
  assert.match(prep,/const alreadyPrepared/);
  assert.match(prep,/result\.reused !== true/);
  assert.match(prep,/changed: prepared\.preparation\?\.reused !== true/);
  assert.match(queue,/CreativeEditPreparationRuntime\.ensure/);
  assert.match(queue,/if \(editPreparation\.changed === true\) progressed = true/);
});

test('human picture lock remains mandatory and cannot be automated by edit preparation',()=>{
  assert.match(prep,/human_approval_automated:false/);
  assert.match(prep,/AWAITING_HUMAN_PICTURE_LOCK/);
  assert.match(editReview,/AUTHENTICATED_REVIEWER_REQUIRED/);
  assert.match(editReview,/scope: EDIT_APPROVAL_SCOPE/);
  assert.match(mastering,/if \(editReview\.ready !== true\)/);
  assert.match(mastering,/AWAITING_EDIT_REVIEW/);
  assert.match(mastering,/mastering_started: false/);
});
