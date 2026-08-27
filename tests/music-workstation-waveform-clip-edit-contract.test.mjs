import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicClipEditRuntime.js", import.meta.url), "utf8");
const waveform = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicWaveformClip.jsx", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicClipEditorPanel.jsx", import.meta.url), "utf8");
const workstation = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx", import.meta.url), "utf8");

test("clip operations preserve the original source asset", () => {
  assert.match(runtime, /preserve_source_asset !== true/);
  assert.match(runtime, /destructive_edit === true/);
  assert.match(runtime, /source_offset_seconds = Math\.max\(0, finite\(next\.source_offset_seconds, 0\) \+ delta\)/);
  assert.match(runtime, /splitMusicClip/);
  assert.match(runtime, /duplicateMusicClip/);
  assert.match(runtime, /destructive_edit:\s*false/);
});

test("waveform reflects source offset and trimmed duration", () => {
  assert.match(waveform, /sourceOffsetSeconds/);
  assert.match(waveform, /durationSeconds/);
  assert.match(waveform, /offsetFrames/);
  assert.match(waveform, /samplePeaks/);
  assert.match(waveform, /decodeAudioData/);
});

test("clip editor exposes musician editing operations", () => {
  assert.match(editor, /Trim left → playhead/);
  assert.match(editor, /Trim right ← playhead/);
  assert.match(editor, /Split at playhead/);
  assert.match(editor, /Duplicate after/);
  assert.match(editor, /Clip gain/);
  assert.match(editor, /Fade in/);
  assert.match(editor, /Fade out/);
});

test("Workstation uses audible preview semantics for waveform timeline and edits locally", () => {
  assert.match(workstation, /resolveMusicTrackPreviewClips/);
  assert.match(workstation, /MusicWaveformClip/);
  assert.match(workstation, /MusicClipEditorPanel/);
  assert.match(workstation, /setSelectedClipId/);
  assert.match(workstation, /onChange=\{replaceTrack\}/);
  assert.match(workstation, /setDirty\(true\)/);
});
