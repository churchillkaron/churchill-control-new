import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const route = await readFile("app/api/creative/music/sfx/route.js", "utf8");
const panel = await readFile("components/creative/ProductionStudio/workspaces/MusicSfxStudioPanel.jsx", "utf8");
const workspace = await readFile("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
test("SFX API settles async jobs and exposes private playback", () => {
  assert.match(route, /settlePendingService/);
  assert.match(route, /action === "status"/);
  assert.match(route, /resolveCreativeProviderAssetUrl/);
  assert.match(route, /playback_url/);
});
test("Music Studio exposes a governed SFX and Foley customer surface", () => {
  assert.match(workspace, /id: "sfx", label: "SFX & Foley"/);
  assert.match(workspace, /MusicSfxStudioPanel/);
  assert.match(panel, /action: "plan"/);
  assert.match(panel, /action: "execute"/);
  assert.match(panel, /action: "status"/);
  assert.match(panel, /setInterval\(poll, 3000\)/);
  assert.match(panel, /session\.playback_url/);
});
