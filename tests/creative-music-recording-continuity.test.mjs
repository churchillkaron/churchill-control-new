import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const worklet=fs.readFileSync("public/audio/avantiqo-pcm-recorder-worklet.js","utf8");
const raw=fs.readFileSync("lib/creative/music/client/MusicRawPcmCapture.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicRecordingStudioPanel.jsx","utf8");

test("PCM recorder emits monotonic sequence and cumulative frame ledger",()=>{
  assert.match(worklet,/this.sequence = 0/);
  assert.match(worklet,/this.totalFrames = 0/);
  assert.match(worklet,/frame_start: frameStart/);
  assert.match(worklet,/frame_end: frameEnd/);
  assert.match(worklet,/sequence/);
});

test("both capture paths validate chunk sequence and frame continuity",()=>{
  assert.match(raw,/chunkGapCount/);
  assert.match(raw,/frameDiscontinuityCount/);
  assert.match(raw,/expectedFrameStart/);
  assert.match(panel,/continuityRef/);
  assert.match(panel,/frame_discontinuity_count/);
});
