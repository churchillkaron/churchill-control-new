import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const renderer = fs.readFileSync(new URL("../lib/creative/music/client/MusicCompRender.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/creative/music/comp-render/route.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicTakeLaneCompPanel.jsx", import.meta.url), "utf8");
const host = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx", import.meta.url), "utf8");

test("comp render is dry 24-bit and preserves source recordings", () => {
  assert.match(renderer, /bit_depth:\s*24/);
  assert.match(renderer, /channel_strip_applied:\s*false/);
  assert.match(renderer, /dry_comp_render:\s*true/);
  assert.match(renderer, /source_takes_preserved:\s*true/);
  assert.match(renderer, /destructive_edit:\s*false/);
  assert.match(renderer, /OfflineAudioContext/);
});

test("server registration fails closed on revision and lineage mismatch", () => {
  assert.match(route, /CREATIVE_MUSIC_COMP_RENDER_REVISION_CONFLICT/);
  assert.match(route, /CREATIVE_MUSIC_COMP_RENDER_TAKE_LINEAGE_MISMATCH/);
  assert.match(route, /CREATIVE_MUSIC_COMP_RENDER_ASSET_LINEAGE_MISMATCH/);
  assert.match(route, /CREATIVE_MUSIC_COMP_RENDER_COMP_NOT_CURRENT/);
  assert.match(route, /derived\/music-comp/);
});

test("render registration creates a derived asset and never bakes the mixer", () => {
  assert.match(route, /music_asset_kind:\s*"COMP_RENDER"/);
  assert.match(route, /channel_strip_applied:\s*false/);
  assert.match(route, /source_takes_preserved:\s*true/);
  assert.match(route, /rendered_asset_id/);
  assert.match(route, /render_format:\s*"WAV_24BIT_PCM"/);
});

test("Workstation exposes and reloads the comp render lifecycle", () => {
  assert.match(panel, /renderMusicCompToWav24/);
  assert.match(panel, /Render 24-bit comp asset/);
  assert.match(panel, /\/api\/creative\/music\/comp-render/);
  assert.match(panel, /expected_revision:\s*sessionRevision/);
  assert.match(host, /sessionRevision=\{session\?\.revision \|\| 0\}/);
  assert.match(host, /onRendered=\{\(\) => onReload\?\.\(\)\}/);
});
