import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/creative/music/multitrack/route.js", "utf8");
const preview = fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js", "utf8");
const workstation = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx", "utf8");
const shell = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx", "utf8");
const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const overdub = fs.readFileSync("lib/creative/music/runtime/CreativeMusicOverdubRuntime.js", "utf8");
const comping = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCompingRuntime.js", "utf8");

test("Music multitrack API resolves private clip assets for synchronized playback", () => {
  assert.match(route, /asset_urls/);
  assert.match(route, /resolveCreativeProviderAssetUrl/);
  assert.match(route, /preview_transport_ready:\s*true/);
  assert.match(route, /provider_job_submitted:\s*false/);
});

test("Music preview transport exposes exact position and bounded playback", () => {
  assert.match(preview, /AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V16/);
  assert.match(preview, /currentPosition:\s*position/);
  assert.match(preview, /stopAtSeconds/);
  assert.match(preview, /release_master:\s*false/);
});

test("Music Workstation V2 has synchronized transport, scrub and loop boundaries", () => {
  assert.match(workstation, /startMusicMultitrackPreview/);
  assert.match(workstation, /timelineSeek/);
  assert.match(workstation, /setPlayhead/);
  assert.match(workstation, /loopStart/);
  assert.match(workstation, /loopEnd/);
  assert.match(workstation, /6 dB headroom/);
});

test("Music overdub and comping stay non-destructive", () => {
  assert.match(overdub, /preserve_each_pass_as_immutable_take:\s*true/);
  assert.match(overdub, /replace_previous_take_allowed:\s*false/);
  assert.match(comping, /preserve_all_source_takes:\s*true/);
  assert.match(comping, /destructive_edit:\s*false/);
});

test("Music Studio routes Workstation through the unified shell to V2", () => {
  assert.match(workspace, /MusicUnifiedWorkstationShell/);
  assert.match(workspace, /id: "workstation"/);
  assert.match(shell, /MusicMultitrackStudioPanelV2/);
});
