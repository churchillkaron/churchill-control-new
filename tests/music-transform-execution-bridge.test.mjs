import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/creative/music/remix/route.js", import.meta.url), "utf8");
const workspace = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicRemixPanel.jsx", import.meta.url), "utf8");
const provider = fs.readFileSync(new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url), "utf8");

test("Music transformations have a fingerprint-bound governed execute bridge", () => {
  assert.match(route, /createHash/);
  assert.match(route, /expected_plan_fingerprint/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_PLAN_CHANGED/);
  assert.match(route, /CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED/);
  assert.match(route, /executeService\(/);
  assert.match(route, /preferred_providers:\s*\["avantiqo-audio"\]/);
  assert.match(route, /publication_authorized:\s*false/);
});

test("Remix edit and extend share the owned Modal lane and remain certification-gated", () => {
  assert.match(provider, /"ai\.audio\.remix"/);
  assert.match(provider, /"ai\.audio\.edit"/);
  assert.match(provider, /"ai\.audio\.extend"/);
  assert.match(provider, /isCertifiedMainCapability/);
  assert.match(provider, /AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED/);
});

test("Music Studio exposes transformation planners and enables execution only from readiness", () => {
  assert.doesNotMatch(workspace, /id: "remix"[^\n]+planningOnly:\s*true/);
  assert.doesNotMatch(workspace, /id: "edit"[^\n]+planningOnly:\s*true/);
  assert.doesNotMatch(workspace, /id: "extend"[^\n]+planningOnly:\s*true/);
  assert.match(workspace, /readiness\?\.capabilities\?\.\[item\.id\]/);
  assert.match(panel, /action:\s*"execute"/);
  assert.match(panel, /expected_plan_fingerprint:\s*plan\.plan_fingerprint/);
  assert.match(panel, /onClick=\{executePlan\}/);
  assert.match(panel, /disabled=\{!executionReady \|\| busy\}/);
});
