import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Video publication is not complete until exact remote read-back proves it", () => {
  const assetNode = read("lib/creative/assets/graph/documents/CreativeAssetNode.js");
  const execution = read("lib/creative/release/runtime/CreativePublishExecutionRuntime.js");
  const verify = read("lib/creative/release/runtime/CreativePublicationVerificationRuntime.js");
  const inspection = read("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV3.js");
  const inspectRoute = read("app/api/creative/release/inspect/route.js");
  const verifyRoute = read("app/api/creative/release/verify/route.js");
  const ui = read("components/creative/ProductionStudio/workspaces/PublishingWorkspace.jsx");

  assert.match(assetNode, /PUBLICATION_EVIDENCE/);

  assert.match(execution, /REMOTE_ACKNOWLEDGED/);
  assert.match(execution, /legacy_completed_normalized/);
  assert.match(execution, /remote_verified: false/);
  assert.match(execution, /output\.name/);
  assert.doesNotMatch(execution, /execution_status: completed \? "COMPLETED"/);

  assert.match(verify, /CREATIVE_PUBLICATION_VERIFICATION_V1/);
  assert.match(verify, /resolveProviderCredential/);
  assert.match(verify, /remote_publication_verification/);
  assert.match(verify, /publication_evidence_identity/);
  assert.match(verify, /remote_snapshot_digest/);
  assert.match(verify, /REMOTE_PUBLICATION_IDENTITY_MISMATCH/);
  assert.match(verify, /PUBLICATION_REMOTE_VERIFICATION_UNSUPPORTED/);
  assert.match(verify, /REMOTE_PUBLICATION_NOT_OBSERVED_YET/);
  assert.match(verify, /STALE_PUBLISH_COMMAND_RELEASE_READINESS/);
  assert.match(verify, /STALE_PUBLISH_COMMAND_APPROVAL/);
  assert.match(verify, /execution_status: "PUBLISHED"/);
  assert.match(verify, /lifecycleState/);
  assert.match(verify, /is_published/);
  assert.match(verify, /remoteState === "LIVE"/);
  assert.doesNotMatch(verify, /ServiceExecutionRuntime\.execute/);

  assert.match(inspection, /CREATIVE_PUBLISHING_INSPECTION_V3/);
  assert.match(inspection, /REMOTE_ACKNOWLEDGED_LEGACY/);
  assert.match(inspection, /PUBLICATION_EVIDENCE/);
  assert.match(inspection, /remote_verified === true/);
  assert.match(inspection, /published === true/);
  assert.match(inspection, /published_count/);
  assert.match(inspection, /verification_required_count/);

  assert.match(inspectRoute, /CreativePublishingInspectionRuntimeV3/);
  assert.match(verifyRoute, /CreativePublicationVerificationRuntime/);
  assert.match(verifyRoute, /creative\.release\.publish/);

  assert.match(ui, /Verified published/);
  assert.match(ui, /Awaiting verification/);
  assert.match(ui, /Verify publication/);
  assert.match(ui, /Remote acknowledgement/);
  assert.match(ui, /Verified publication/);
  assert.match(ui, /Read-only provider check\. It never resends the publication\./);
  assert.match(ui, /No published claim without provider proof\./);
  assert.doesNotMatch(ui, /External receipt .*verified/);
});

console.log("AVANTIQO_VIDEO_PUBLICATION_TRUTH_CONTRACT=PASS");
