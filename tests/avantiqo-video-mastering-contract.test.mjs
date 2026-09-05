import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const inspection = read("lib/creative/post-production/runtime/CreativeMasteringInspectionRuntime.js");
const inspectRoute = read("app/api/creative/mastering/inspect/route.js");
const workspace = read("components/creative/ProductionStudio/workspaces/RenderWorkspace.jsx");
const postProduction = read("lib/creative/post-production/runtime/CreativePostProductionRuntime.js");
const exportProfiles = read("lib/creative/post-production/runtime/CreativeExportProfileResolver.js");
const releaseReadiness = read("lib/creative/release/runtime/CreativeReleaseReadinessRuntime.js");
const approvalRoute = read("app/api/creative/release/approve/route.js");

test("mastering inspection is a read-only evidence projection with private preview signing", () => {
  assert.match(inspection, /CREATIVE_MASTERING_INSPECTION_V1/);
  assert.match(inspection, /AssetGraphRepository\.listByProject/);
  assert.match(inspection, /ProductionTaskRuntime\.list/);
  assert.match(inspection, /signCreativeStorageReference/);
  assert.match(inspection, /FINAL_RENDER/);
  assert.match(inspection, /RELEASE_READINESS_REPORT/);
  assert.match(inspection, /APPROVAL_RECORD/);
  assert.doesNotMatch(inspection, /AssetGraphRepository\.(create|update|remove)\s*\(/);
  assert.doesNotMatch(inspection, /CreativePostProductionRuntime\.run/);
});

test("mastering inspection API requires organization-scoped quality access", () => {
  assert.match(inspectRoute, /requireOrganizationAccess/);
  assert.match(inspectRoute, /requiredPermission:\s*"creative\.quality\.evaluate"/);
  assert.match(inspectRoute, /CreativeMasteringInspectionRuntime\.inspect/);
  assert.match(inspectRoute, /organization_id/);
  assert.match(inspectRoute, /creative_project_id/);
});

test("mastering workspace inspects on load but never starts render work automatically", () => {
  assert.match(workspace, /\/api\/creative\/mastering\/inspect/);
  assert.match(workspace, /\/api\/creative\/post-production\/run/);
  assert.match(workspace, /async function runMastering/);

  const effect = workspace.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[inspect\]\);/);
  assert.ok(effect, "mastering inspection effect required");
  assert.match(effect[1], /inspect\(\)/);
  assert.doesNotMatch(effect[1], /runMastering|post-production\/run/);
});

test("mastering remains project-profile governed and fail closed", () => {
  assert.match(postProduction, /CreativeExportProfileResolver\.resolve/);
  assert.match(postProduction, /CreativeEdlRenderRuntime\.render/);
  assert.match(postProduction, /CreativeReleaseReadinessRuntime\.evaluate/);
  assert.match(exportProfiles, /PROJECT_EXPORT_PROFILES_REQUIRED/);
  assert.match(exportProfiles, /EXPORT_PROFILE_SELECTION_REQUIRED/);
  assert.match(workspace, /No project export profiles are configured/);
  assert.match(workspace, /fail closed rather than invent delivery settings/);
});

test("final render approval is authenticated and publishing remains separately gated", () => {
  assert.match(workspace, /\/api\/creative\/release\/approve/);
  assert.match(workspace, /scope:\s*"FINAL_RENDER"/);
  assert.match(approvalRoute, /requiredPermission:[\s\S]*creative\.release\.approve/);
  assert.match(approvalRoute, /approver:[\s\S]*user_id:[\s\S]*staff_account_id:/);

  assert.match(inspection, /can_open_publishing:\s*Boolean\([\s\S]*releasePassed[\s\S]*renderApproval/);
  assert.match(workspace, /disabled=\{!mastering\?\.can_open_publishing\}/);
  assert.match(workspace, /Open publishing/);
});

test("release audit binds technical, semantic, rights, repair and human approval evidence", () => {
  for (const check of [
    "timeline_requirements_complete",
    "final_render_not_rejected",
    "technical_qc_passed",
    "semantic_quality_passed",
    "release_gate_passed",
    "final_render_human_approved",
    "no_open_repair_plan",
  ]) {
    assert.match(releaseReadiness, new RegExp(check));
  }
  assert.match(releaseReadiness, /final_master_soundtrack_integrity_passed/);
  assert.match(releaseReadiness, /RELEASE_READINESS_REPORT/);
});
