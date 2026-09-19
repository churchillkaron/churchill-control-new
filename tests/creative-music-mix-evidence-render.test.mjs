import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const stemRuntime=fs.readFileSync("lib/creative/music/client/MusicOfflineStemRenderRuntime.js","utf8");
const offline=fs.readFileSync("lib/creative/music/client/MusicOfflineMixRenderRuntime.js","utf8");
const stemRoute=fs.readFileSync("app/api/creative/music/stem-render/route.js","utf8");
const mixRoute=fs.readFileSync("app/api/creative/music/mix-engineer/route.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStemExportPanel.jsx","utf8");

test("neutral track evidence render bypasses mix processing but preserves source cleanup and clip assembly",()=>{
  assert.match(stemRuntime,/buildMusicTrackEvidenceSession/);
  assert.match(stemRuntime,/evidence_render_bypass_processing = true/);
  assert.match(stemRuntime,/evidenceTrack\.gain_db = 0/);
  assert.match(stemRuntime,/evidenceTrack\.pan = 0/);
  assert.match(stemRuntime,/evidenceTrack\.sends = \[\]/);
  assert.match(stemRuntime,/evidenceTrack\.inserts = \[\]/);
  assert.match(stemRuntime,/session\.automation_lanes = \[\]/);
  assert.match(offline,/connectSourceCleanup\(context, clipBus, track\)/);
  assert.match(offline,/evidence_render_bypass_processing === true/);
  assert.match(offline,/fader\.gain\.value = 1/);
  assert.match(offline,/pan\.pan\.value = 0/);
});

test("evidence render has a distinct persisted contract and pre-track-processing stage",()=>{
  assert.match(stemRuntime,/AVANTIQO_MUSIC_TRACK_EVIDENCE_RENDER_V1/);
  assert.match(stemRuntime,/render_kind: "TRACK_EVIDENCE"/);
  assert.match(stemRuntime,/post-source-cleanup-pre-track-processing/);
  assert.match(stemRuntime,/track_processing_applied: false/);
  assert.match(stemRoute,/"TRACK_EVIDENCE"/);
  assert.match(stemRoute,/TRACK_EVIDENCE_RENDER/);
  assert.match(stemRoute,/track_processing_applied/);
});

test("Mix Engineer rejects normal post-processing stems as evidence",()=>{
  assert.match(mixRoute,/music_asset_kind\)!=="TRACK_EVIDENCE_RENDER"/);
  assert.match(mixRoute,/render_kind\)!=="TRACK_EVIDENCE"/);
  assert.match(mixRoute,/stem_stage\)!=="post-source-cleanup-pre-track-processing"/);
  assert.match(mixRoute,/meta\.track_processing_applied===true/);
  assert.doesNotMatch(mixRoute,/music_asset_kind\)!=="TRACK_STEM_RENDER"/);
});

test("customer workstation exposes explicit evidence render next to delivery stem",()=>{
  assert.match(panel,/renderMusicTrackEvidenceOffline/);
  assert.match(panel,/exportStem\("TRACK_EVIDENCE"/);
  assert.match(panel,/>Evidence render</);
  assert.match(panel,/>Track stem</);
});
