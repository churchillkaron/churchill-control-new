import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/creative/music/remix/route.js", "utf8");
const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRemixPanel.jsx", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const engine = fs.readFileSync("lib/creative/runtime/engines/MusicEngine.js", "utf8");

test("Music transformations retain fingerprint-bound governed execute bridge", () => {
  assert.match(route, /expected_plan_fingerprint/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_PLAN_CHANGED/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED/);
  assert.match(route, /publication_authorized:\s*false/);
});

test("Remix edit and extend are research planners, not active production capabilities", () => {
  assert.match(engine, /capability: "ai\.audio\.remix"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(engine, /capability: "ai\.audio\.edit"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.match(engine, /capability: "ai\.audio\.extend"[\s\S]*implementation: "RESEARCH_ONLY"/);
  assert.doesNotMatch(provider, /capability === "ai\.audio\.(remix|edit|extend)"/);
});

test("Music Studio shows planners while execution is readiness gated", () => {
  assert.match(workspace, /readiness\?\.capabilities\?\.\[item\.id\]/);
  assert.match(panel, /action:\s*"execute"/);
  assert.match(panel, /expected_plan_fingerprint:\s*plan\.plan_fingerprint/);
  assert.match(panel, /disabled=\{!executionReady \|\| busy\}/);
});
