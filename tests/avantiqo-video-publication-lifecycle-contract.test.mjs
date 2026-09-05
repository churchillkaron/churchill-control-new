import fs from "node:fs";
import assert from "node:assert/strict";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const lifecycle = source("lib/creative/release/runtime/CreativePublicationLifecycleRuntime.js");
const inspection = source("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV3.js");
const route = source("app/api/creative/release/lifecycle/route.js");
const workspace = source("components/creative/ProductionStudio/workspaces/PublishingWorkspaceV2.jsx");
const router = source("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");

assert.match(lifecycle, /CREATIVE_PUBLICATION_LIFECYCLE_V1/);
assert.match(lifecycle, /VERIFIED_PUBLICATION_HISTORY_REQUIRED/);
assert.match(lifecycle, /POST_PUBLICATION_LIFECYCLE/);
assert.match(lifecycle, /historical_published: true/);
assert.match(lifecycle, /LIVE_NOW/);
assert.match(lifecycle, /NO_LONGER_LIVE/);
assert.match(lifecycle, /UNVERIFIABLE/);
assert.match(lifecycle, /NOT_FOUND_OR_INACCESSIBLE/);
assert.match(lifecycle, /ACCESS_DENIED/);
assert.match(lifecycle, /TEMPORARILY_UNVERIFIABLE/);
assert.match(lifecycle, /publication_current_live/);
assert.match(lifecycle, /first_not_live_observed_at/);
assert.match(lifecycle, /last_confirmed_live_at/);
assert.match(lifecycle, /not_release_approval: true/);
assert.match(lifecycle, /createCreativeAssetNode/);
assert.match(lifecycle, /AssetGraphRepository\.create\(evidenceNode\)/);
assert.match(lifecycle, /Google reports that the exact publication resource no longer exists/);
assert.match(lifecycle, /PUBLISHED_EDITED/);
assert.match(lifecycle, /caption_digest/);
assert.match(lifecycle, /message_digest/);
assert.match(lifecycle, /commentary_digest/);
assert.match(lifecycle, /summary_digest/);

assert.match(inspection, /CREATIVE_PUBLISHING_INSPECTION_V4/);
assert.match(inspection, /was_published/);
assert.match(inspection, /current_live/);
assert.match(inspection, /current_truth/);
assert.match(inspection, /live_now_count/);
assert.match(inspection, /no_longer_live_count/);
assert.match(inspection, /unverifiable_count/);
assert.match(inspection, /can_revalidate_lifecycle/);

assert.match(route, /creative\.release\.publish/);
assert.match(route, /action === "revalidate"/);
assert.match(route, /CreativePublicationLifecycleRuntime\.revalidate/);
assert.match(route, /CreativePublicationLifecycleRuntime\.inspect/);

assert.match(workspace, /Post-publication truth/);
assert.match(workspace, /Historical publication proof is immutable/);
assert.match(workspace, /Live now/);
assert.match(workspace, /No longer live/);
assert.match(workspace, /Unverifiable/);
assert.match(workspace, /Recheck remote/);
assert.match(workspace, /\/api\/creative\/release\/lifecycle/);
assert.match(workspace, /action: "revalidate"/);

assert.match(router, /PublishingWorkspaceV2/);

console.log("AVANTIQO_VIDEO_PUBLICATION_LIFECYCLE_CONTRACT=PASS");
