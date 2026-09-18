import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const worklet=fs.readFileSync("public/audio/avantiqo-pcm-recorder-worklet.js","utf8");
const capture=fs.readFileSync("lib/creative/music/client/MusicRawPcmCapture.js","utf8");
const overdub=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx","utf8");
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");
const preview=fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js","utf8");

test("capture timing ledger binds PCM to exact AudioContext frame range",()=>{
  assert.match(worklet,/pendingContextFrameStart/);
  assert.match(worklet,/context_frame_start: contextFrameStart/);
  assert.match(worklet,/context_frame_end: contextFrameEnd/);
  assert.match(capture,/AVANTIQO_MUSIC_CAPTURE_TIMING_V1/);
  assert.match(capture,/context_duration_seconds/);
  assert.match(capture,/pcm_duration_seconds/);
  assert.match(capture,/clock_drift_ms/);
});

test("timing evidence maps audio clock to monotonic time without automatic shifting",()=>{
  assert.match(capture,/getOutputTimestamp/);
  assert.match(capture,/capture_start_performance_ms/);
  assert.match(capture,/capture_end_performance_ms/);
  assert.match(capture,/automatic_timeline_shift_allowed: false/);
  assert.match(overdub,/capture_timing: take.capture_timing/);
  assert.match(route,/capture_clock_drift_ms/);
  assert.match(capture,/AVANTIQO_MUSIC_RAW_PCM_CAPTURE_V5/);
});


test("overdub binds scheduled backing clock and capture clock on the same monotonic timeline",()=>{
  assert.match(preview,/playbackStartPerformanceMs/);
  assert.match(preview,/playback_start_performance_ms/);
  assert.match(preview,/AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V16/);
  assert.match(overdub,/AVANTIQO_MUSIC_OVERDUB_TIMING_V1/);
  assert.match(overdub,/browser_audio_clock_alignment_ms/);
  assert.match(overdub,/BROWSER_AUDIO_CLOCK_ALIGNMENT_ONLY/);
  assert.match(overdub,/microphone_roundtrip_latency_measured: latencyCalibration\?\.microphone_roundtrip_latency_measured === true/);
  assert.match(overdub,/automatic_latency_compensation_allowed: false/);
  assert.match(route,/overdub_timing/);
  assert.match(route,/browser_audio_clock_alignment_ms/);
});


test("backing playback and calibration share the explicitly selected output sink",()=>{
  assert.match(preview,/outputDeviceId = null/);
  assert.match(preview,/context.setSinkId\(outputDeviceId\)/);
  assert.match(preview,/output_sink_verified/);
  assert.match(overdub,/startMusicMultitrackPreview\(\{ session, assetUrls, startSeconds, stopAtSeconds, outputDeviceId: outputDeviceId \|\| null \}\)/);
});
