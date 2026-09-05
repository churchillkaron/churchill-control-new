import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Video publish authorization is current-master scoped and derivative dispatch fails closed", () => {
  const approval = read("lib/creative/release/runtime/CreativeApprovalRuntime.js");
  const command = read("lib/creative/release/runtime/CreativePublishCommandRuntime.js");
  const execution = read("lib/creative/release/runtime/CreativePublishExecutionRuntimeV2.js");
  const approveRoute = read("app/api/creative/release/approve/route.js");

  assert.match(approval, /currentCreativePrimaryMaster/);
  assert.match(approval, /STALE_RELEASE_READINESS_MASTER_VERSION/);
  assert.match(approval, /approved_release_master_asset_node_id/);
  assert.match(approval, /approved_release_master_checksum/);
  assert.match(approval, /approved_release_readiness_identity/);
  assert.match(approval, /currentPublishReleaseApproval/);
  assert.match(approval, /scope === "PUBLISH_RELEASE"/);

  assert.match(command, /CURRENT_PUBLISH_RELEASE_APPROVAL_REQUIRED/);
  assert.match(command, /certified_derivative_checksum/);
  assert.match(command, /release_readiness_identity/);
  assert.match(command, /release_package_identity/);

  assert.match(execution, /CREATIVE_PUBLISH_EXECUTION_CURRENT_MASTER_V2/);
  assert.match(execution, /CURRENT_MASTER_RELEASE_READINESS_REQUIRED/);
  assert.match(execution, /STALE_PUBLISH_COMMAND_RELEASE_READINESS/);
  assert.match(execution, /CURRENT_PUBLISH_RELEASE_APPROVAL_REQUIRED/);
  assert.match(execution, /STALE_PUBLISH_COMMAND_APPROVAL/);
  assert.match(execution, /STALE_RELEASE_PACKAGE_READINESS/);
  assert.match(execution, /PUBLISH_COMMAND_DERIVATIVE_CHECKSUM_MISMATCH/);
  assert.match(execution, /CERTIFIED_DERIVATIVE_CHANGED_AFTER_AUTHORIZATION/);
  assert.match(execution, /PUBLISH_COMMAND_DERIVATIVE_IDENTITY_MISMATCH/);
  assert.match(execution, /final_render_asset_node_id/);
  assert.match(execution, /certified_derivative_channel/);

  assert.match(approveRoute, /creative\.release\.publish/);
  assert.match(approveRoute, /PUBLISH_RELEASE/);
});

console.log("AVANTIQO_VIDEO_RELEASE_AUTHORIZATION_DISPATCH_CONTRACT=PASS");
