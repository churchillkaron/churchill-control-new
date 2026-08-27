import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const previewPath = new URL("../lib/creative/music/client/MusicMultitrackPreviewEngine.js", import.meta.url);
const compPanelPath = new URL("../components/creative/ProductionStudio/workspaces/MusicTakeLaneCompPanel.jsx", import.meta.url);
const overdubPanelPath = new URL("../components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx", import.meta.url);

const preview = fs.readFileSync(previewPath, "utf8");
const compPanel = fs.readFileSync(compPanelPath, "utf8");
const overdubPanel = fs.readFileSync(overdubPanelPath, "utf8");

test("multi-take tracks do not stack all recorded passes in browser preview", () => {
  assert.match(preview, /takes\.length <= 1/);
  assert.match(preview, /selected_for_comp === true/);
  assert.match(preview, /clips\.filter\(\(clip\) => clip\.source_asset_id === selectedTake\.source_asset_id\)/);
  assert.match(preview, /take_lane_aware:\s*true/);
});

test("a derived comp replaces raw take-lane playback without modifying sources", () => {
  assert.match(preview, /compPlaybackClips/);
  assert.match(preview, /track\?\.comp\?\.regions/);
  assert.match(preview, /derived_comp_preview:\s*true/);
  assert.match(preview, /comp_aware:\s*true/);
  assert.match(preview, /destructive_edit:\s*false/);
});

test("take lane UI supports audition rating exact regions and non-destructive comp build", () => {
  assert.match(compPanel, /audition\(take\)/);
  assert.match(compPanel, /rateTake/);
  assert.match(compPanel, /Add selected region/);
  assert.match(compPanel, /buildMusicComp/);
  assert.match(compPanel, /applyMusicCompToTrack/);
  assert.match(compPanel, /Release output must be rendered to a new derived asset/);
});

test("Workstation persists comp changes through revision-safe multitrack save", () => {
  assert.match(overdubPanel, /MusicTakeLaneCompPanel/);
  assert.match(overdubPanel, /persistCompTrack/);
  assert.match(overdubPanel, /action:\s*"save"/);
  assert.match(overdubPanel, /CREATIVE_MUSIC_COMP_SAVE_FAILED/);
});
