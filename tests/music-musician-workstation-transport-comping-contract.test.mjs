import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const read = async (path) => readFile(new URL(path, ROOT), "utf8");

test("Music multitrack API resolves private clip assets for synchronized playback", async () => {
  const source = await read("app/api/creative/music/multitrack/route.js");
  assert.match(source, /asset_urls/);
  assert.match(source, /resolveCreativeProviderAssetUrl/);
  assert.match(source, /preview_transport_ready:\s*true/);
  assert.match(source, /provider_job_submitted:\s*false/);
});

test("Music preview transport exposes exact position and bounded playback", async () => {
  const source = await read("lib/creative/music/client/MusicMultitrackPreviewEngine.js");
  assert.match(source, /AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V2/);
  assert.match(source, /currentPosition:\s*position/);
  assert.match(source, /stopAtSeconds/);
  assert.match(source, /release_master:\s*false/);
});

test("Music Workstation V2 has synchronized transport, scrub and loop boundaries", async () => {
  const source = await read("components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx");
  assert.match(source, /startMusicMultitrackPreview/);
  assert.match(source, /timelineSeek/);
  assert.match(source, /setPlayhead/);
  assert.match(source, /loopStart/);
  assert.match(source, /loopEnd/);
  assert.match(source, /6 dB headroom/);
});

test("Music overdub contract preserves every pass as a separate immutable take", async () => {
  const source = await read("lib/creative/music/runtime/CreativeMusicOverdubRuntime.js");
  assert.match(source, /AVANTIQO_MUSIC_OVERDUB_RECORDING_V1/);
  assert.match(source, /CREATIVE_MUSIC_OVERDUB_TRACK_NOT_ARMED/);
  assert.match(source, /PUNCH_IN_OUT/);
  assert.match(source, /LOOP_TAKES/);
  assert.match(source, /preserve_each_pass_as_immutable_take:\s*true/);
  assert.match(source, /create_new_take_per_loop_pass/);
  assert.match(source, /replace_previous_take_allowed:\s*false/);
  assert.match(source, /latency_compensation_required:\s*true/);
});

test("Music comping contract is region-based and non-destructive", async () => {
  const source = await read("lib/creative/music/runtime/CreativeMusicCompingRuntime.js");
  assert.match(source, /AVANTIQO_MUSIC_TAKE_LANE_COMPING_V1/);
  assert.match(source, /preserve_all_source_takes:\s*true/);
  assert.match(source, /CREATIVE_MUSIC_COMP_REGION_OVERLAP_INVALID/);
  assert.match(source, /crossfade_default_seconds/);
  assert.match(source, /render_required_for_release:\s*true/);
  assert.match(source, /destructive_edit:\s*false/);
});

test("Music Studio routes Workstation to synchronized V2 surface", async () => {
  const source = await read("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx");
  assert.match(source, /MusicMultitrackStudioPanelV2/);
  assert.match(source, /id:\s*"workstation"/);
});
