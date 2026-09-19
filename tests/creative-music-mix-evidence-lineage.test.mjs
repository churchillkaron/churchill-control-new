import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { musicTrackEvidenceInputFingerprint } from "../lib/creative/music/runtime/CreativeMusicEvidenceLineageRuntime.js";

function track(){return {id:"vox",source_cleanup:{enabled:true,dc_blocker:{enabled:true,cutoff_hz:15}},clips:[{id:"c1",source_asset_id:"a1",source_version:1,start_seconds:0,duration_seconds:20,source_offset_seconds:0,gain_db:0,fade_in_seconds:0,fade_out_seconds:0,muted:false,loop_enabled:false,reversed:false,warp_mode:"off"}]};}

test("evidence input fingerprint changes for every audible timeline/source-cleanup mutation",()=>{
  const source=track(),base=musicTrackEvidenceInputFingerprint(source);
  for(const mutate of [
    t=>{t.clips[0].source_version=2;},t=>{t.clips[0].start_seconds=.25;},t=>{t.clips[0].duration_seconds=19;},t=>{t.clips[0].source_offset_seconds=.5;},
    t=>{t.clips[0].gain_db=-2;},t=>{t.clips[0].fade_in_seconds=.2;},t=>{t.clips[0].fade_out_seconds=.3;},t=>{t.clips[0].loop_enabled=true;t.clips[0].loop_length_seconds=4;},
    t=>{t.clips[0].reversed=true;},t=>{t.clips[0].warp_mode="stretch";},t=>{t.source_cleanup.dc_blocker.cutoff_hz=20;},
  ]){const next=structuredClone(source);mutate(next);assert.notEqual(musicTrackEvidenceInputFingerprint(next),base);}
});

test("muted clip does not affect audible evidence fingerprint until unmuted",()=>{
  const source=track();source.clips.push({id:"muted",source_asset_id:"a2",source_version:1,start_seconds:20,duration_seconds:5,source_offset_seconds:0,gain_db:0,fade_in_seconds:0,fade_out_seconds:0,muted:true,loop_enabled:false,reversed:false,warp_mode:"off"});
  const withMuted=musicTrackEvidenceInputFingerprint(source);source.clips.pop();assert.equal(musicTrackEvidenceInputFingerprint(source),withMuted);
});

test("stem registration persists fingerprint and Mix Engineer requires exact current match",()=>{
  const stem=fs.readFileSync("app/api/creative/music/stem-render/route.js","utf8");
  const mix=fs.readFileSync("app/api/creative/music/mix-engineer/route.js","utf8");
  assert.match(stem,/musicTrackEvidenceInputFingerprint/);
  assert.match(stem,/evidence_input_fingerprint/);
  assert.match(mix,/musicTrackEvidenceInputFingerprint\(track\)/);
  assert.match(mix,/meta\.evidence_input_fingerprint/);
});
