import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const reviewRuntime = read("lib/creative/review/runtime/CreativeEditReviewRuntime.js");
const reviewRoute = read("app/api/creative/review/edit/route.js");
const mastering = read("lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime.js");
const postProductionRoute = read("app/api/creative/post-production/run/route.js");
const finalisation = read("lib/creative/finalisation/runtime/CreativeFinalisationRouter.js");
const orchestration = read("lib/creative/studio/runtime/CreativeVideoStudioReviewOrchestrationRuntime.js");
const orchestrationRoute = read("app/api/creative/studio/orchestration/route.js");
const reviewWorkspace = read("components/creative/ProductionStudio/workspaces/ReviewWorkspace.jsx");
const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");
const sidebar = read("components/creative/ProductionStudio/layout/Sidebar.jsx");
const canvas = read("components/creative/ProductionStudio/layout/Canvas.jsx");
const registry = read("lib/creative/registry/applyCreativeWorkspaceRegistry.js");

assert.match(reviewRuntime, /CREATIVE_EDIT_REVIEW_V1/);
assert.match(reviewRuntime, /REVIEW_COMMENT/);
assert.match(reviewRuntime, /EDIT_CUT/);
assert.match(reviewRuntime, /timecode_seconds/);
assert.match(reviewRuntime, /timeline_identity/);
assert.match(reviewRuntime, /latestFeedbackAt/);
assert.match(reviewRuntime, /ready_for_master/);
assert.match(reviewRuntime, /CreativeTimelineRuntime\.compose/);
assert.match(reviewRuntime, /AUTHENTICATED_REVIEWER_REQUIRED/);
assert.match(reviewRuntime, /EDIT_REVIEW_BLOCKERS_REMAIN/);

assert.match(reviewRoute, /creative\.quality\.evaluate/);
assert.match(reviewRoute, /creative\.release\.approve/);
assert.match(reviewRoute, /CreativeEditReviewRuntime\.comment/);
assert.match(reviewRoute, /CreativeEditReviewRuntime\.resolve/);
assert.match(reviewRoute, /CreativeEditReviewRuntime\.approve/);

assert.match(mastering, /CreativeEditReviewRuntime\.gate/);
assert.match(mastering, /AWAITING_EDIT_REVIEW/);
assert.match(mastering, /mastering_started:\s*false/);
assert.match(mastering, /render_started:\s*false/);
const gateIndex = mastering.indexOf("CreativeEditReviewRuntime.gate");
const renderIndex = mastering.indexOf("CreativePostProductionRuntime.run");
assert.ok(gateIndex >= 0 && renderIndex > gateIndex);

assert.match(postProductionRoute, /CreativeGovernedVideoMasteringRuntime\.run/);
assert.match(finalisation, /CreativeGovernedVideoMasteringRuntime\.run/);
assert.equal(finalisation.includes("CreativePostProductionRuntime.run"), false);

assert.match(orchestration, /CREATIVE_VIDEO_STUDIO_REVIEW_ORCHESTRATION_V1/);
assert.match(orchestration, /id:\s*"review"/);
assert.match(orchestration, /workspace:\s*"review"/);
assert.match(orchestration, /Mastering is locked until the current edit passes governed Review/);
assert.match(orchestration, /Resolve review notes/);
assert.match(orchestration, /Approve edit cut/);
assert.match(orchestrationRoute, /CreativeVideoStudioReviewOrchestrationRuntime\.inspect/);

assert.match(reviewWorkspace, /Review room/);
assert.match(reviewWorkspace, /Timecoded review/);
assert.match(reviewWorkspace, /timecode_seconds/);
assert.match(reviewWorkspace, /Add review note/);
assert.match(reviewWorkspace, /Approve cut/);
assert.match(reviewWorkspace, /ready_for_master/);
assert.match(reviewWorkspace, /Version change evidence/);

assert.match(router, /review:\s*ReviewWorkspace/);
assert.match(sidebar, /review:\s*\{ label: "Review"/);
assert.match(sidebar, /review:\s*"review"/);
assert.match(canvas, /review:\s*"Review"/);
assert.match(registry, /REVIEW_WORKSPACE/);
assert.match(registry, /id:\s*"review"/);
assert.match(registry, /ensureReviewWorkspace/);

console.log("AVANTIQO_VIDEO_STUDIO_REVIEW_CONTRACT=PASS");
