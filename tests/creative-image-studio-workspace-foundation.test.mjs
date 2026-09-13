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
