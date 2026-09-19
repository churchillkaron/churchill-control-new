import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMusicTake } from "../lib/creative/music/runtime/CreativeMusicMultitrackRuntime.js";
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicTakeLaneCompPanel.jsx","utf8");

test("take metadata preserves non-destructive latency source offset",()=>{
  const take=createMusicTake({source_asset_id:"a1",start_seconds:0,duration_seconds:2.975,source_offset_seconds:.025,source_duration_seconds:3});
  assert.equal(take.source_offset_seconds,.025);
  assert.equal(take.source_duration_seconds,3);
  assert.equal(take.duration_seconds,2.975);
  assert.match(route,/source_offset_seconds: sourceOffsetSeconds/);
  assert.match(route,/source_duration_seconds: durationSeconds/);
});

test("comp regions add take base source offset instead of reintroducing recording latency",()=>{
  assert.match(panel,/finite\(selectedTake.source_offset_seconds, 0\) \+ \(start - finite\(selectedTake.start_seconds, 0\)\)/);
  assert.match(panel,/source_offset_seconds: Math.max\(0, finite\(take.source_offset_seconds, 0\)\)/);
  assert.match(panel,/source \+\$\{finite\(take.source_offset_seconds,0\).toFixed\(3\)\}s/);
});


test("take audition and selected-take browser preview honor compensated source offset",()=>{
  const preview=fs.readFileSync("lib/creative/music/client/MusicMultitrackPreviewEngine.js","utf8");
  assert.match(panel,/audio.currentTime = sourceOffset/);
  assert.match(panel,/finite\(take.source_offset_seconds, 0\)/);
  assert.match(panel,/playableDuration/);
  assert.match(preview,/source_offset_seconds: Math.max\(0, finite\(selectedTake.source_offset_seconds, 0\)\)/);
});
