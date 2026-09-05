import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const player = read("components/creative/ProductionStudio/workspaces/review/ReviewCutPlayer.jsx");
const review = read("components/creative/ProductionStudio/workspaces/ReviewWorkspaceV2.jsx");
const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");
const masteringInspect = read("app/api/creative/mastering/inspect/route.js");

assert.match(player, /edit_decision_list/);
assert.match(player, /source_in_seconds/);
assert.match(player, /source_out_seconds/);
assert.match(player, /timeline_in_seconds/);
assert.match(player, /timeline_out_seconds/);
assert.match(player, /segmentIndexAt/);
assert.match(player, /stepFrame/);
assert.match(player, /frameRate/);
assert.match(player, /playbackRate/);
assert.match(player, /markers/);
assert.match(player, /moveToSegment/);
assert.doesNotMatch(player, /controls\s*$/m);

assert.match(review, /ReviewCutPlayer/);
assert.match(review, /markers=\{review\?\.comments \|\| \[\]\}/);
assert.match(review, /setPlayhead\(finite\(comment\.metadata\?\.timecode_seconds/);
assert.match(review, /Current vs previous cut/);
assert.match(review, /added_keys/);
assert.match(review, /removed_keys/);
assert.match(review, /moved_keys/);
assert.match(review, /ready_for_master/);
assert.match(review, /Approve cut/);

assert.match(router, /ReviewWorkspaceV2/);
assert.match(router, /review: ReviewWorkspace/);

assert.match(masteringInspect, /CreativeEditReviewRuntime/);
assert.match(masteringInspect, /editReview\?\.ready_for_master/);
assert.match(masteringInspect, /can_run_mastering: canRunMastering/);
assert.match(masteringInspect, /EDIT_REVIEW_NOT_APPROVED/);
assert.match(masteringInspect, /approval_record_id/);

console.log("AVANTIQO_VIDEO_REVIEW_PRECISION_CONTRACT=PASS");
