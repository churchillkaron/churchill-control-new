import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx","utf8");
const route=fs.readFileSync("app/api/creative/music/auto-studio/route.js","utf8");

test("positive latency compensation at timeline zero is preserved as source offset",()=>{
  assert.match(panel,/requestedCompensatedStart = startSeconds - latencyCompensationSeconds/);
  assert.match(panel,/compensatedStart = Math.max\(0, requestedCompensatedStart\)/);
  assert.match(panel,/compensationSourceOffsetSeconds = Math.max\(0, -requestedCompensatedStart\)/);
  assert.match(panel,/timeline_source_offset_seconds: compensationSourceOffsetSeconds/);
});

test("server applies boundary compensation non-destructively to clip source offset",()=>{
  assert.match(route,/sourceOffsetSeconds = Math.max\(0, finite\(body.timeline_source_offset_seconds, 0\)\)/);
  assert.match(route,/playableDurationSeconds = Math.max\(0.001, durationSeconds - sourceOffsetSeconds\)/);
  assert.match(route,/source_offset_seconds: sourceOffsetSeconds/);
  assert.match(route,/original_take_duration_seconds: durationSeconds/);
  assert.match(route,/CREATIVE_MUSIC_RECORDED_TAKE_COMPENSATION_EXCEEDS_DURATION/);
});
