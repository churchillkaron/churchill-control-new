import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CreativeImageStudioWorkspaceRuntime, buildImageStudioWorkspaceState, validateImageStudioCommand } from "../lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js";
import { captureImageStudioHistoryState, pushImageStudioHistory, restoreImageStudioHistoryState } from "../lib/creative/stills/runtime/CreativeImageStudioHistoryRuntime.js";

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
  for (const type of ["add_reference", "create_comment", "update_comment", "resolve_comment", "snapshot_version", "export_artboard"]) {
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
  assert.match(canvas, /snapLayerBounds/);
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

test("Image Studio saves use optimistic concurrency and snapshots allocate versions atomically", () => {
  const repository = fs.readFileSync(new URL("../lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js", import.meta.url), "utf8");
  const persistence = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspacePersistence.js", import.meta.url), "utf8");
  const route = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/route.js", import.meta.url), "utf8");
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260914094000_image_studio_concurrency_guards.sql", import.meta.url), "utf8");
  assert.match(repository, /expected_updated_at/);
  assert.match(repository, /IMAGE_STUDIO_ARTBOARD_CONFLICT/);
  assert.match(repository, /IMAGE_STUDIO_LAYER_CONFLICT/);
  assert.match(persistence, /expected_updated_at/);
  assert.doesNotMatch(persistence, /version_number:\s*Math\.max/);
  assert.match(repository, /create_image_studio_snapshot_atomic/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /max\(version_number\)/);
  assert.match(route, /status = \/IMAGE_STUDIO_\(\?:ARTBOARD\|LAYER\)_CONFLICT\/\.test\(message\) \? 409/);
});

test("Image Studio history snapshots are bounded and restorable", () => {
  const base = { artboards: [{ id: "a" }], layers: [{ id: "l", bounds: { x: 1 } }], selection: { artboard_id: "a", layer_ids: ["l"] }, dirty: false };
  const snapshot = captureImageStudioHistoryState(base);
  base.layers[0].bounds.x = 99;
  assert.equal(snapshot.layers[0].bounds.x, 1);
  let past = [];
  for (let index = 0; index < 75; index += 1) past = pushImageStudioHistory(past, { ...snapshot, dirty: index % 2 === 0 });
  assert.equal(past.length, 60);
  const restored = restoreImageStudioHistoryState({ extra: true }, snapshot);
  assert.equal(restored.layers[0].bounds.x, 1);
  assert.equal(restored.extra, true);
});

test("Image Studio wires transaction-aware undo redo and clipboard shortcuts", () => {
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const shortcuts = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioKeyboardShortcuts.jsx", import.meta.url), "utf8");
  assert.match(store, /historyPast: \[\]/);
  assert.match(store, /historyFuture: \[\]/);
  assert.match(store, /historyTransaction: null/);
  assert.match(store, /clipboardLayers: \[\]/);
  assert.match(store, /undo:/);
  assert.match(store, /redo:/);
  assert.match(store, /copySelected:/);
  assert.match(store, /pasteClipboard:/);
  assert.match(store, /crypto\.randomUUID\(\)/);
  assert.match(canvas, /workspace\.beginHistoryTransaction\(\)/);
  assert.match(canvas, /workspace\.endHistoryTransaction\(\)/);
  assert.match(shortcuts, /workspace\.undo\(\)/);
  assert.match(shortcuts, /workspace\.redo\(\)/);
  assert.match(shortcuts, /workspace\.copySelected\(\)/);
  assert.match(shortcuts, /workspace\.pasteClipboard\(\)/);
  assert.match(shortcuts, /event\.shiftKey/);
});

test("Image Studio durable hydrate resets local history and clipboard", () => {
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  assert.match(store, /hydrate: \(input\) => set\(\{ \.\.\.buildImageStudioWorkspaceState\(input\), historyPast: \[\], historyFuture: \[\], historyTransaction: null, clipboardLayers: \[\] \}\)/);
});


test("Image Studio comments support focused durable review workflow", () => {
  const runtime = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js", import.meta.url), "utf8");
  const actions = fs.readFileSync(new URL("../lib/creative/stills/actions/CreativeImageStudioWorkspaceActions.js", import.meta.url), "utf8");
  const repository = fs.readFileSync(new URL("../lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js", import.meta.url), "utf8");
  const panel = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCommentsPanel.jsx", import.meta.url), "utf8");
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  assert.match(runtime, /update_comment/);
  assert.match(actions, /updateImageStudioComment/);
  assert.match(repository, /assigned_to/);
  assert.match(repository, /resolved_at/);
  assert.match(repository, /eq\("organization_id", record.organization_id\)/);
  assert.match(repository, /eq\("creative_project_id", record.creative_project_id\)/);
  assert.match(panel, /Show resolved/);
  assert.match(panel, /resolve_comment/);
  assert.match(panel, /status: "OPEN"/);
  assert.match(panel, /Assignee user ID/);
  assert.match(canvas, /workspace\.focusComment\(comment\)/);
  assert.match(store, /comment_focus_id/);
  assert.match(store, /layer_ids: comment.layer_id/);
});

test("Image Studio collaboration conflicts preserve local drafts and recover safely", () => {
  const persistence = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspacePersistence.js", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  const banner = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioConflictBanner.jsx", import.meta.url), "utf8");
  const workspace = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioWorkspace.jsx", import.meta.url), "utf8");

  assert.match(persistence, /error\.status = response\.status/);
  assert.match(persistence, /IMAGE_STUDIO_CONFLICT_REQUIRES_RESOLUTION/);
  assert.match(persistence, /local_snapshot: localSnapshot/);
  assert.match(persistence, /reloadLatestAfterConflict/);
  assert.match(persistence, /restoreConflictDraftAsCopy/);
  assert.match(store, /local-conflict-/);
  assert.match(store, /Recovered local draft/);
  assert.match(banner, /will not overwrite the newer server version/);
  assert.match(banner, /Reload latest/);
  assert.match(banner, /Restore local as copy/);
  assert.match(workspace, /ImageStudioConflictBanner/);
});

test("Image Studio version history restores immutable snapshots only as new drafts", () => {
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  const panel = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioVersionHistoryPanel.jsx", import.meta.url), "utf8");
  const persistence = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspacePersistence.js", import.meta.url), "utf8");
  assert.match(store, /restoreVersionAsDraft/);
  assert.match(store, /local-version-/);
  assert.match(store, /restored_from_version_id/);
  assert.match(store, /Restored from v/);
  assert.match(panel, /Immutable/);
  assert.match(panel, /Restore copy/);
  assert.match(panel, /setCompareVersion/);
  assert.match(persistence, /based_on_version_id: artboard\.metadata\?\.restored_from_version_id/);
});

test("Image Studio historical versions remain append-only durable records", () => {
  const repository = fs.readFileSync(new URL("../lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js", import.meta.url), "utf8");
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260913094645_image_studio_workspace_foundation.sql", import.meta.url), "utf8");
  assert.match(repository, /create_image_studio_snapshot_atomic/);
  assert.doesNotMatch(repository, /from\(TABLES\.versions\)\.update/);
  assert.match(migration, /Immutable artboard snapshots/);
  assert.match(migration, /based_on_version_id uuid references public\.creative_image_versions/);
});
