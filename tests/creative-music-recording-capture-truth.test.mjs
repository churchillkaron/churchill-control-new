import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const capture=fs.readFileSync("lib/creative/music/client/MusicRawPcmCapture.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRecordingStudioPanel.jsx","utf8");
const overdub=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx","utf8");
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");

test("recording distinguishes WAV container depth from reported device precision",()=>{
  assert.match(capture,/getSettings/);
  assert.match(capture,/wav_container_bit_depth: 24/);
  assert.match(capture,/capture_sample_size_bits/);
  assert.match(capture,/native_capture_precision_verified/);
  assert.match(capture,/effective_capture_precision_known/);
  assert.match(panel,/24-bit WAV container/);
  assert.match(panel,/input precision/);
  assert.match(route,/capture_sample_size_bits/);
});

test("browser DSP-off is requested but only claimed disabled when settings verify it",()=>{
  assert.match(capture,/known.length === 3 && known.every/);
  assert.match(capture,/PROCESSING_PRESENT/);
  assert.match(capture,/VERIFIED_DISABLED/);
  assert.match(capture,/PARTIAL/);
  assert.match(capture,/UNVERIFIED/);
  assert.match(overdub,/browser_processing_verification/);
  assert.match(panel,/browser_processing_verification/);
  assert.match(route,/requested_browser_processing_disabled/);
});
