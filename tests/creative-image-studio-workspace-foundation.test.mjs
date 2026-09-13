import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CreativeImageStudioWorkspaceRuntime, buildImageStudioWorkspaceState, validateImageStudioCommand } from "../lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js";

test("Image Studio workspace exposes professional editor surfaces", () => {
  assert.deepEqual(CreativeImageStudioWorkspaceRuntime.panels, ["brief", "artboards", "assets", "references", "moodboard", "layers", "comments", "versions", "output"]);
  assert.ok(CreativeImageStudioWorkspaceRuntime.commands.includes("edit_region"));
  assert.ok(CreativeImageStudioWorkspaceRuntime.commands.includes("export_artboard"));
});

test("workspace normalizes artboards and keeps editor state local", () => {
  const state = buildImageStudioWorkspaceState({ organization_id: "org", project_id: "project", artboards: [{ id: "a", name: "Feed", width: 1080, height: 1350 }] });
  assert.equal(state.selection.artboard_id, "a");
  assert.equal(state.artboards[0].width, 1080);
  assert.equal(state.ui.tool, "select");
  assert.equal(state.dirty, false);
});

test("Business Partner Image Studio commands require exact scope", () => {
  assert.throws(() => validateImageStudioCommand({ type: "edit_region", project_id: "p" }), /organization_id required/);
  assert.throws(() => validateImageStudioCommand({ type: "edit_region", organization_id: "o" }), /project_id required/);
  assert.equal(validateImageStudioCommand({ type: "edit_region", organization_id: "o", project_id: "p" }).type, "edit_region");
});

test("migration creates durable editor-specific tables without duplicating canonical project/job tables", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260913094645_image_studio_workspace_foundation.sql", import.meta.url), "utf8");
  for (const table of ["creative_image_artboards", "creative_image_layers", "creative_image_references", "creative_image_comments", "creative_image_versions", "creative_image_exports"]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.doesNotMatch(sql, /create table if not exists public\.studio_projects/);
  assert.doesNotMatch(sql, /create table if not exists public\.studio_jobs/);
  assert.match(sql, /enable row level security/g);
});
test("workspace persistence commands cover references comments snapshots and exports", () => {
  for (const type of ["add_reference", "create_comment", "resolve_comment", "snapshot_version", "export_artboard"]) {
    assert.equal(validateImageStudioCommand({ type, organization_id: "o", project_id: "p" }).type, type);
  }
});

test("Image Studio workspace API enforces organization access and project scope", () => {
  const route = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/route.js", import.meta.url), "utf8");
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /creative_projects/);
  assert.match(route, /eq\("organization_id", organizationId\)/);
  assert.match(route, /executeImageStudioWorkspaceAction/);
});

test("workspace repository scopes durable reads to organization and project", () => {
  const source = fs.readFileSync(new URL("../lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js", import.meta.url), "utf8");
  assert.match(source, /eq\("organization_id", organization_id\)/);
  assert.match(source, /eq\("creative_project_id", creative_project_id\)/);
  assert.match(source, /createImageStudioComment/);
  assert.match(source, /createImageStudioExport/);
});

test("Image Studio canvas is a structured composition editor, not a flat preview", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const layers = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerPanel.jsx", import.meta.url), "utf8");
  assert.match(canvas, /workspace\.updateLayerLocal/);
  assert.match(canvas, /Resize layer/);
  assert.match(canvas, /workspace\.setRegion/);
  assert.match(canvas, /snapX/);
  assert.match(inspector, /Font size/);
  assert.match(inspector, /Rotate/);
  assert.match(layers, /Visibility/);
  assert.match(layers, /reorderLayer/);
});

test("Image Studio workspace bootstraps generated assets as editable source layers", () => {
  const workspace = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioWorkspace.jsx", import.meta.url), "utf8");
  const persistence = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspacePersistence.js", import.meta.url), "utf8");
  assert.match(workspace, /source_asset_id: asset\.id/);
  assert.match(workspace, /bootstrap_source: true/);
  assert.match(persistence, /action\("update_layer"/);
  assert.match(persistence, /await load\(\)/);
});

test("Image Studio professional design intelligence exposes responsive formats collaboration compare and deterministic export", () => {
  const design = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js", import.meta.url), "utf8");
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const workspace = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioWorkspace.jsx", import.meta.url), "utf8");
  const exportRoute = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/export/route.js", import.meta.url), "utf8");
  assert.match(design, /instagram_portrait/);
  assert.match(design, /adaptBoundsToArtboard/);
  assert.match(workspace, /ImageStudioVersionCompare/);
  assert.match(canvas, /application\/x-avantiqo-asset/);
  assert.match(canvas, /setCommentPoint/);
  assert.match(workspace, /ImageStudioFormatBar/);
  assert.match(workspace, /ImageStudioExportPanel/);
  assert.match(exportRoute, /renderImageStudioMaster/);
  assert.match(exportRoute, /createImageStudioExport/);
});
