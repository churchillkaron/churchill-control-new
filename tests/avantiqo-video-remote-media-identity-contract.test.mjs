import fs from "node:fs";
import assert from "node:assert/strict";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const mediaIdentity = source("lib/creative/release/runtime/CreativePublicationRemoteMediaIdentityRuntime.js");
const inspection = source("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV4.js");
const route = source("app/api/creative/release/media-identity/route.js");
const workspace = source("components/creative/ProductionStudio/workspaces/PublishingWorkspaceV4.jsx");
const router = source("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");

assert.match(mediaIdentity, /CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_V1/);
assert.match(mediaIdentity, /FFMPEG_MPEG7_VIDEO_SIGNATURE/);
assert.match(mediaIdentity, /signature=nb_inputs=2:detectmode=full/);
assert.match(mediaIdentity, /MATCHED_BYTES/);
assert.match(mediaIdentity, /MATCHED_FULL/);
assert.match(mediaIdentity, /MATCHED_PARTIAL/);
assert.match(mediaIdentity, /MISMATCHED/);
assert.match(mediaIdentity, /REMOTE_MEDIA_REFERENCE_ONLY/);
assert.match(mediaIdentity, /UNSUPPORTED_MEDIA_KIND_V1/);
assert.match(mediaIdentity, /APPROVED_DERIVATIVE_CHECKSUM_MISMATCH_AT_MEDIA_IDENTITY/);
assert.match(mediaIdentity, /byte_identity_verified/);
assert.match(mediaIdentity, /perceptual_identity_verified/);
assert.match(mediaIdentity, /perceptual_match_detected/);
assert.match(mediaIdentity, /audio_identity_status: "NOT_EVALUATED_V1"/);
assert.match(mediaIdentity, /analysis_capped/);
assert.match(mediaIdentity, /REMOTE_PUBLICATION_MUST_BE_CONFIRMED_LIVE_BEFORE_MEDIA_IDENTITY_ANALYSIS/);
assert.match(mediaIdentity, /post_publication_remote_media_identity/);
assert.match(mediaIdentity, /not_release_approval: true/);
assert.match(mediaIdentity, /CreativePublicationLifecycleRuntime\.revalidate/);
assert.match(mediaIdentity, /instagram/);
assert.match(mediaIdentity, /facebook/);
assert.match(mediaIdentity, /linkedin/);
assert.match(mediaIdentity, /google-business/);

assert.match(inspection, /CREATIVE_PUBLISHING_INSPECTION_V6/);
assert.match(inspection, /PUBLISHED_MEDIA_MISMATCH/);
assert.match(inspection, /remote_media_matched_count/);
assert.match(inspection, /remote_media_partial_count/);
assert.match(inspection, /remote_media_mismatch_count/);
assert.match(inspection, /remote_media_reference_only_count/);
assert.match(inspection, /remote_media_unverifiable_count/);
assert.match(inspection, /can_recheck_remote_media_identity/);

assert.match(route, /creative\.release\.publish/);
assert.match(route, /action === "recheck"/);
assert.match(route, /CreativePublicationRemoteMediaIdentityRuntime\.recheck/);
assert.match(route, /CreativePublicationRemoteMediaIdentityRuntime\.inspect/);

assert.match(workspace, /Remote media identity/);
assert.match(workspace, /Byte identity/);
assert.match(workspace, /Perceptual identity/);
assert.match(workspace, /Recheck media/);
assert.match(workspace, /\/api\/creative\/release\/media-identity/);
assert.match(workspace, /audio identity is not yet certified in V1/i);
assert.match(router, /PublishingWorkspaceV4/);

console.log("AVANTIQO_VIDEO_REMOTE_MEDIA_IDENTITY_CONTRACT=PASS");
