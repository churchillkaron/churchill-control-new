import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const inspection = read("lib/creative/release/runtime/CreativePublishingInspectionRuntime.js");
const inspectRoute = read("app/api/creative/release/inspect/route.js");
const commandRoute = read("app/api/creative/release/publish/route.js");
const executeRoute = read("app/api/creative/release/execute/route.js");
const commandRuntime = read("lib/creative/release/runtime/CreativePublishCommandRuntime.js");
const executionRuntime = read("lib/creative/release/runtime/CreativePublishExecutionRuntime.js");
const workspace = read("components/creative/ProductionStudio/workspaces/PublishingWorkspace.jsx");

test("publishing inspection is read-only and exposes evidence without secrets", () => {
  assert.match(inspection, /CREATIVE_PUBLISHING_INSPECTION_V1/);
  assert.match(inspection, /AssetGraphRepository\.listByProject/);
  assert.match(inspection, /CreativeApprovalRuntime\.findCurrentApproval/);
  assert.match(inspection, /signCreativeStorageReference/);
  assert.match(inspection, /PUBLISH_COMMAND/);
  assert.match(inspection, /PUBLISH_EXECUTION/);
  assert.doesNotMatch(inspection, /AssetGraphRepository\.(create|update|remove)\s*\(/);
  assert.doesNotMatch(inspection, /(token|password|api_key|private_key)\s*:/i);
});

test("publishing inspection and execution APIs require explicit publish permission", () => {
  for (const route of [inspectRoute, commandRoute, executeRoute]) {
    assert.match(route, /requireOrganizationAccess/);
    assert.match(route, /creative\.release\.publish/);
  }
  assert.match(executeRoute, /CreativePublishExecutionRuntime\.execute/);
  assert.match(executeRoute, /user_id:\s*access\.userId/);
  assert.match(executeRoute, /staff_account_id:\s*access\.staff\?\.id/);
});

test("publish command is impossible without passed readiness and publish-release approval", () => {
  assert.match(commandRuntime, /CURRENT_PASSED_RELEASE_READINESS_REQUIRED/);
  assert.match(commandRuntime, /scope:\s*"PUBLISH_RELEASE"/);
  assert.match(commandRuntime, /CURRENT_PUBLISH_RELEASE_APPROVAL_REQUIRED/);
  assert.match(commandRuntime, /CONFIGURED_PUBLISH_TARGET_REQUIRED/);
  assert.match(commandRuntime, /PUBLISH_TARGET_DISABLED/);
  assert.match(commandRuntime, /execution_status:\s*"PENDING_CONNECTOR"/);
  assert.match(commandRuntime, /createOrFindByMetadataIdentity/);
});

test("provider execution is separate, authenticated, idempotent and evidence based", () => {
  assert.match(executionRuntime, /AUTHENTICATED_PUBLISH_EXECUTOR_REQUIRED/);
  assert.match(executionRuntime, /PENDING_PUBLISH_COMMAND_REQUIRED/);
  assert.match(executionRuntime, /publish_execution_identity/);
  assert.match(executionRuntime, /createOrFindByMetadataIdentity/);
  assert.match(executionRuntime, /PENDING_PROVIDER/);
  assert.match(executionRuntime, /ServiceExecutionRuntime\.settle/);
  assert.match(executionRuntime, /external_publication_id/);
  assert.match(executionRuntime, /external_publication_url/);
  assert.match(executionRuntime, /EVIDENCE_REQUIRED/);
  assert.match(executionRuntime, /hasDeliveryEvidence/);
});

test("release desk keeps approval, authorization and external execution distinct", () => {
  assert.match(workspace, /Approve publication release/);
  assert.match(workspace, /Authorize target/);
  assert.match(workspace, /Execute delivery/);
  assert.match(workspace, /Check provider/);
  assert.match(workspace, /Open external publication/);
  assert.match(workspace, /Creates an immutable publish command only/);
  assert.match(workspace, /External execution requires explicit action/);
  assert.match(workspace, /Nothing is published automatically/);
});

test("release desk only polls existing commands and never publishes on mount", () => {
  const effect = workspace.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[inspect\]\);/);
  assert.ok(effect, "release inspection effect required");
  assert.match(effect[1], /inspect\(\)/);
  assert.doesNotMatch(effect[1], /approvePublication|authorizeTarget|executeTarget/);

  assert.match(workspace, /publish_command_asset_node_id:\s*commandId/);
  assert.match(workspace, /target\.can_poll \? "Check provider"/);
  assert.doesNotMatch(workspace, /\/api\/creative\/publish["']/);
});
