import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Video master version history is governed and stale approvals fail closed", () => {
  const history = read("lib/creative/release/runtime/CreativeMasterVersionRuntime.js");
  const packageRuntime = read("lib/creative/release/runtime/CreativeReleasePackageRuntime.js");
  const command = read("lib/creative/release/runtime/CreativePublishCommandRuntime.js");
  const execution = read("lib/creative/release/runtime/CreativePublishExecutionRuntimeV2.js");
  const inspect = read("lib/creative/release/runtime/CreativePublishingInspectionRuntimeV2.js");
  const route = read("app/api/creative/mastering/versions/route.js");
  const ui = read("components/creative/ProductionStudio/workspaces/RenderWorkspaceV4.jsx");
  const router = read("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");

  assert.match(history, /CREATIVE_MASTER_VERSION_HISTORY_V1/);
  assert.match(history, /creativePrimaryMasters/);
  assert.match(history, /creativeDeliveryDerivativeIds/);
  assert.match(history, /currentCreativePrimaryMaster/);
  assert.match(history, /release_package/);
  assert.match(history, /publish_approval/);
  assert.match(history, /publication_count/);
  assert.match(history, /changed_fields/);
  assert.match(history, /preview_url/);

  assert.match(packageRuntime, /CREATIVE_RELEASE_PACKAGE_V2/);
  assert.match(packageRuntime, /CURRENT_MASTER_RELEASE_READINESS_REQUIRED/);
  assert.match(packageRuntime, /currentCreativePrimaryMaster/);

  assert.match(command, /STALE_RELEASE_READINESS_MASTER_VERSION/);
  assert.match(command, /release_master_checksum/);
  assert.match(command, /CURRENT_CERTIFIED_RELEASE_PACKAGE_REQUIRED/);

  assert.match(execution, /STALE_PUBLISH_COMMAND_MASTER_VERSION/);
  assert.match(execution, /STALE_PUBLISH_COMMAND_MASTER_CHECKSUM/);
  assert.match(execution, /STALE_RELEASE_PACKAGE_MASTER_VERSION/);
  assert.match(execution, /PUBLISH_COMMAND_RELEASE_PACKAGE_IDENTITY_MISMATCH/);

  assert.match(inspect, /stale_readiness_blocked/);
  assert.match(inspect, /current_package_certified/);
  assert.match(inspect, /current_master_readiness/);

  assert.match(route, /creative\.quality\.evaluate/);
  assert.match(ui, /Master versions/);
  assert.match(ui, /Immutable release history/);
  assert.match(ui, /Exact changes/);
  assert.match(ui, /old approval remains in history and cannot authorize this master/);
  assert.match(router, /RenderWorkspaceV4/);
});

console.log("AVANTIQO_VIDEO_MASTER_VERSION_HISTORY_CONTRACT=PASS");
