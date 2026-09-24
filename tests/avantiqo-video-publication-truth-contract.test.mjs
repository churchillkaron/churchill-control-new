import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read=(file)=>fs.readFileSync(file,"utf8");

test("Video publication is not complete until exact provider read-back proves it",()=>{
  const assetNode=read("lib/creative/assets/graph/documents/CreativeAssetNode.js");
  const execution=read("lib/creative/release/runtime/CreativePublishExecutionRuntime.js");
  const verify=read("lib/creative/release/runtime/CreativePublicationVerificationRuntime.js");
  const inspectionV3=read("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV3.js");
  const inspectionV4=read("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV4.js");
  const inspectRoute=read("app/api/creative/release/inspect/route.js");
  const verifyRoute=read("app/api/creative/release/verify/route.js");
  const ui=read("components/creative/ProductionStudio/workspaces/PublishingWorkspace.jsx");

  assert.match(assetNode,/PUBLICATION_EVIDENCE/);
  assert.match(execution,/REMOTE_ACKNOWLEDGED/);
  assert.match(execution,/remote_verified: false/);
  assert.match(verify,/CREATIVE_PUBLICATION_VERIFICATION_V1/);
  assert.match(verify,/execution_status: "PUBLISHED"/);
  assert.match(verify,/remote_verified: true/);
  assert.match(verify,/REMOTE_PUBLICATION_NOT_OBSERVED_YET/);
  assert.match(inspectionV3,/PUBLICATION_EVIDENCE/);
  assert.match(inspectionV3,/remote_verified === true/);
  assert.match(inspectionV3,/published_count/);
  assert.match(inspectionV3,/verification_required_count/);
  assert.match(inspectionV4,/CREATIVE_PUBLISHING_INSPECTION_V6/);
  assert.match(inspectionV4,/CREATIVE_PUBLICATION_REMOTE_MEDIA_IDENTITY_V1/);
  assert.match(inspectionV4,/byte_identity_verified/);
  assert.match(inspectionV4,/perceptual_identity_verified/);
  assert.match(inspectRoute,/CreativePublishingInspectionRuntimeV4/);
  assert.match(verifyRoute,/CreativePublicationVerificationRuntime/);
  assert.match(verifyRoute,/creative\.release\.publish/);
  assert.match(ui,/Verified published/);
  assert.match(ui,/Awaiting verification/);
  assert.match(ui,/Verify publication/);
  assert.match(ui,/Remote acknowledgement/);
  assert.match(ui,/Verified publication/);
  assert.match(ui,/Read-only provider check\. It never resends the publication\./);
  assert.match(ui,/No published claim without provider proof\./);
  assert.match(ui,/Only provider read-back proves publication/);
});
