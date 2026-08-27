import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile("lib/creative/music/runtime/CreativeMusicRecordingRuntime.js", "utf8");
const worklet = await readFile("public/audio/avantiqo-pcm-recorder-worklet.js", "utf8");
const panel = await readFile("components/creative/ProductionStudio/workspaces/MusicRecordingStudioPanel.jsx", "utf8");
const workspace = await readFile("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const route = await readFile("app/api/creative/music/auto-studio/route.js", "utf8");

test("Music recording captures raw PCM without destructive browser DSP", () => {
  assert.match(runtime, /AVANTIQO_MUSIC_RECORDING_STUDIO_V1/);
  assert.match(runtime, /echoCancellation:\s*false/);
  assert.match(runtime, /noiseSuppression:\s*false/);
  assert.match(runtime, /autoGainControl:\s*false/);
  assert.match(runtime, /export_bit_depth:\s*24/);
  assert.match(runtime, /immutable_original_take:\s*true/);
  assert.match(panel, /AudioWorkletNode/);
  assert.match(panel, /echoCancellation:\s*false/);
  assert.match(panel, /noiseSuppression:\s*false/);
  assert.match(panel, /autoGainControl:\s*false/);
  assert.match(panel, /encodeWav24/);
});

test("Music recording provides real engineering metering and clipping QC", () => {
  assert.match(runtime, /preferred_max_peak_dbfs:\s*-6/);
  assert.match(runtime, /preferred_min_peak_dbfs:\s*-24/);
  assert.match(runtime, /preferred_rms_min_dbfs:\s*-36/);
  assert.match(runtime, /clipping_detection:\s*true/);
  assert.match(panel, /getFloatTimeDomainData/);
  assert.match(panel, /peak_dbfs/);
  assert.match(panel, /rms_dbfs/);
  assert.match(panel, /clipping_detected/);
  assert.match(panel, /Reduce input gain/);
});

test("Music recording preserves raw takes as project assets before processing", () => {
  assert.match(route, /registerRecordedTake/);
  assert.match(route, /music_asset_kind:\s*"RECORDED_TAKE"/);
  assert.match(route, /immutable_original_take:\s*true/);
  assert.match(route, /source_version:\s*0/);
  assert.match(route, /provider_job_submitted:\s*false/);
  assert.match(panel, /register_recorded_take/);
  assert.match(workspace, /id:\s*"record"/);
  assert.match(workspace, /MusicRecordingStudioPanel/);
});

test("PCM worklet manually flushes final partial recording frames", () => {
  assert.match(worklet, /flush\("manual"\)/);
  assert.match(worklet, /reason === "manual"/);
  assert.match(panel, /port\.postMessage\(\{ type: "flush" \}\)/);
  assert.match(panel, /event\.data\?\.reason === "manual"/);
});
