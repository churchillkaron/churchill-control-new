import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Music multitrack runtime is non-destructive and engineer-grade", async () => {
  const source = await read("lib/creative/music/runtime/CreativeMusicMultitrackRuntime.js");
  assert.match(source, /AVANTIQO_MUSIC_MULTITRACK_PROJECT_V1/);
  assert.match(source, /non_destructive_editing:\s*true/);
  assert.match(source, /preserve_original_sources:\s*true/);
  assert.match(source, /headroom_target_db:\s*6/);
  assert.match(source, /master_limiter_only_at_release_stage:\s*true/);
  assert.match(source, /AVANTIQO_MUSIC_ENGINEER_CHANNEL_STRIP_V1/);
  assert.match(source, /input_trim_db/);
  assert.match(source, /polarity_invert/);
  assert.match(source, /high_pass_hz/);
  assert.match(source, /low_shelf_db/);
  assert.match(source, /presence_db/);
  assert.match(source, /high_shelf_db/);
  assert.match(source, /compressor/);
  assert.match(source, /mute_solo_arm:\s*true/);
  assert.match(source, /buses_sends:\s*true/);
  assert.match(source, /automation:\s*true/);
});

test("Music multitrack state persists with revision conflict protection", async () => {
  const route = await read("app/api/creative/music/multitrack/route.js");
  assert.match(route, /music_multitrack_project/);
  assert.match(route, /CREATIVE_MUSIC_MULTITRACK_REVISION_CONFLICT/);
  assert.match(route, /validateMusicMultitrackProject/);
  assert.match(route, /provider_job_submitted:\s*false/);
  assert.match(route, /endpoint_mutation_performed:\s*false/);
});

test("Recorded takes are preserved then linked into the workstation", async () => {
  const route = await read("app/api/creative/music/auto-studio/route.js");
  assert.match(route, /immutable_original_take:\s*true/);
  assert.match(route, /appendRecordedTakeToMultitrack/);
  assert.match(route, /createMusicTake/);
  assert.match(route, /createMusicClip/);
  assert.match(route, /added_to_multitrack:\s*true/);
  assert.match(route, /destructive_edit:\s*false/);
});

test("Workstation surface exposes track and engineering controls", async () => {
  const studio = await read("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx");
  const workstation = await read("components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanel.jsx");
  assert.match(studio, /id:\s*"workstation"/);
  assert.match(studio, /MusicMultitrackStudioPanel/);
  assert.match(workstation, /Add track/);
  assert.match(workstation, /Record arm/);
  assert.match(workstation, /Input trim/);
  assert.match(workstation, /High-pass/);
  assert.match(workstation, /Polarity invert/);
  assert.match(workstation, /Compressor/);
  assert.match(workstation, /Track fader/);
  assert.match(workstation, /Pan/);
  assert.match(workstation, /6 dB pre-master headroom/);
});

test("Browser multitrack preview uses the real engineer signal order without release mastering", async () => {
  const preview = await read("lib/creative/music/client/MusicMultitrackPreviewEngine.js");
  assert.match(preview, /clipGain\.connect\(trackBus\)/);
  assert.match(preview, /clipBus\.connect\(trim\)/);
  assert.match(preview, /trim\.connect\(polarity\)/);
  assert.match(preview, /polarity\.connect\(highPass\)/);
  assert.match(preview, /highPass\.connect\(lowShelf\)/);
  assert.match(preview, /lowShelf\.connect\(presence\)/);
  assert.match(preview, /presence\.connect\(highShelf\)/);
  assert.match(preview, /compressor/);
  assert.match(preview, /fader\.connect\(pan\)/);
  assert.match(preview, /release_master:\s*false/);
});
