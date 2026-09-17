import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicAudioCleanupPanel.jsx", "utf8");
const route = fs.readFileSync("app/api/creative/music/studio/route.js", "utf8");

test("Music Studio exposes owned local Clean & Repair Audio workflow", () => {
  assert.match(workspace, /Clean & Repair Audio/);
  assert.match(workspace, /MusicAudioCleanupPanel/);
  assert.match(panel, /action: "audio_cleanup"/);
  assert.match(panel, /Original preserved/);
  assert.match(panel, /24-bit \/ 48 kHz WAV/);
  assert.match(route, /processMusicVocalEngineeringLocal/);
  assert.match(route, /MUSIC_RESTORED_AUDIO/);
  assert.match(route, /source_preserved: true/);
  assert.match(route, /action === "audio_cleanup"/);
});

test("Studio route imports world-class execution used by professional compose", () => {
  assert.match(route, /import \{\n  executeWorldClassMusicStudio,/);
});
