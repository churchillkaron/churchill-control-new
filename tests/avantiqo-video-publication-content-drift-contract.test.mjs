import fs from "node:fs";
import assert from "node:assert/strict";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const binding = source("lib/creative/release/runtime/CreativePublicationContentBindingRuntime.js");
const command = source("lib/creative/release/runtime/CreativePublishCommandRuntime.js");
const lifecycle = source("lib/creative/release/runtime/CreativePublicationLifecycleRuntime.js");
const integrity = source("lib/creative/release/runtime/CreativePublicationContentIntegrityRuntime.js");
const inspection = source("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV3.js");
const route = source("app/api/creative/release/content-integrity/route.js");
const workspace = source("components/creative/ProductionStudio/workspaces/PublishingWorkspaceV3.jsx");
const router = source("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");

assert.match(binding, /CREATIVE_PUBLICATION_CONTENT_BINDING_V1/);
assert.match(binding, /approved_text_digest/);
assert.match(binding, /derivative_checksum/);
assert.match(binding, /media_reference_identity/);
assert.match(binding, /slice\(0, 1500\)/);
assert.match(binding, /publicationTextDigest/);

assert.match(command, /publication_content_binding_identity/);
assert.match(command, /approved_publication_text_digest/);
assert.match(command, /approved_publication_text_length/);
assert.match(command, /generation_version: 5/);
assert.match(command, /contentBinding\.identity/);

assert.match(lifecycle, /caption_digest/);
assert.match(lifecycle, /message_digest/);
assert.match(lifecycle, /commentary_digest/);
assert.match(lifecycle, /summary_digest/);
assert.match(lifecycle, /PUBLISHED_EDITED/);

assert.match(integrity, /CREATIVE_PUBLICATION_CONTENT_INTEGRITY_V1/);
assert.match(integrity, /PUBLICATION_CONTENT_INTEGRITY/);
assert.match(integrity, /MATCHED/);
assert.match(integrity, /DRIFTED/);
assert.match(integrity, /PARTIAL/);
assert.match(integrity, /UNVERIFIABLE_BASELINE/);
assert.match(integrity, /REMOTE_MEDIA_BYTE_CHECKSUM_NOT_EXPOSED_BY_PROVIDER/);
assert.match(integrity, /byte_identity_verified: false/);
assert.match(integrity, /approved_publication_text_digest/);
assert.match(integrity, /remote_text_digest/);
assert.match(integrity, /publication_content_drift_detected/);
assert.match(integrity, /first_content_drift_observed_at/);
assert.match(integrity, /AssetGraphRepository\.create\(evidence\)/);
assert.match(integrity, /CreativePublicationLifecycleRuntime\.revalidate/);
assert.match(integrity, /Historical publication evidence remains immutable/);

assert.match(inspection, /CREATIVE_PUBLISHING_INSPECTION_V5/);
assert.match(inspection, /PUBLISHED_CONTENT_DRIFT/);
assert.match(inspection, /content_drift_count/);
assert.match(inspection, /content_partial_count/);
assert.match(inspection, /content_matched_count/);
assert.match(inspection, /content_unverifiable_count/);
assert.match(inspection, /can_recheck_content_integrity/);

assert.match(route, /creative\.release\.publish/);
assert.match(route, /action === "recheck"/);
assert.match(route, /CreativePublicationContentIntegrityRuntime\.recheck/);
assert.match(route, /CreativePublicationContentIntegrityRuntime\.inspect/);

assert.match(workspace, /Live content integrity/);
assert.match(workspace, /Exact/);
assert.match(workspace, /Drift/);
assert.match(workspace, /Partial proof/);
assert.match(workspace, /Remote byte checksum/);
assert.match(workspace, /Recheck content/);
assert.match(workspace, /\/api\/creative\/release\/content-integrity/);
assert.match(workspace, /action: "recheck"/);
assert.match(router, /PublishingWorkspaceV3/);

console.log("AVANTIQO_VIDEO_PUBLICATION_CONTENT_DRIFT_CONTRACT=PASS");
