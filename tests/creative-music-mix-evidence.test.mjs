import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyzeMusicMixEngineer } from "../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js";

const route=fs.readFileSync("app/api/creative/music/mix-engineer/route.js","utf8");
const panel=fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx","utf8");
const evidence=fs.readFileSync("lib/creative/music/runtime/CreativeMusicMixEvidenceRuntime.js","utf8");

test("Mix Engineer route measures real project sources before planning and apply",()=>{
  assert.match(route,/analyzeMusicMixEvidence/);
  assert.match(route,/resolveCreativeProviderAssetUrl/);
  assert.match(route,/analyzeMusicMixEngineer\(session,mixEvidence,arrangement,base\)/);
});

test("Mix evidence is local signal analysis and non-mutating",()=>{
  assert.match(evidence,/materializeMedia/);
  assert.match(evidence,/volumedetect/);
  assert.match(evidence,/sub_vs_lowmid_db/);
  assert.match(evidence,/presence_vs_lowmid_db/);
  assert.match(evidence,/mutation_authorized:false/);
});

test("measured evidence changes vocal and bass decisions conservatively",()=>{
  const session={tracks:[
    {id:"v",type:"vocal",name:"Lead Vocal",mute:false,pan:0,gain_db:0,channel_strip:{high_pass_hz:20,presence_db:0,high_shelf_db:0,compressor:{}}},
    {id:"b",type:"bass",name:"Bass",mute:false,pan:0,gain_db:0,channel_strip:{high_pass_hz:20,low_shelf_db:0,presence_db:0,compressor:{}}},
  ]};
  const plan=analyzeMusicMixEngineer(session,{contract:"X",tracks:[
    {track_id:"v",measured:true,crest_proxy_db:6,presence_vs_lowmid_db:4,air_vs_presence_db:1},
    {track_id:"b",measured:true,sub_vs_lowmid_db:5},
  ]});
  const vocal=plan.track_decisions.find(x=>x.track_id==="v");
  const bass=plan.track_decisions.find(x=>x.track_id==="b");
  assert.equal(vocal.channel_strip.compressor.ratio,2);
  assert.equal(vocal.channel_strip.presence_db,0.5);
  assert.equal(vocal.channel_strip.high_shelf_db,0.25);
  assert.equal(bass.channel_strip.low_shelf_db,0);
  assert.equal(plan.measured_track_count,2);
});

test("Workstation shows measured evidence with each mix decision",()=>{
  assert.match(panel,/Measured audio evidence:/);
  assert.match(panel,/crest/);
  assert.match(panel,/sub\/low-mid/);
  assert.match(panel,/presence\/low-mid/);
});


test("mix evidence fails closed instead of attributing one source to a multi-source edited track",()=>{
  assert.match(evidence,/new Set\(\(track\.clips\|\|\[\]\)\.filter\(c=>c\?\.muted!==true&&c\?\.source_asset_id\)\.map\(c=>c\.source_asset_id\)\)/);
  assert.match(evidence,/sourceIds\.length>1/);
  assert.match(evidence,/MULTIPLE_SOURCE_ASSETS_REQUIRE_TRACK_RENDER/);
  assert.match(evidence,/timeline_evidence_safe:false/);
  assert.match(evidence,/ambiguous_source_track_count/);
  assert.match(evidence,/all_timeline_evidence_safe/);
});

test("muted alternate clips are excluded from source ambiguity detection",()=>{
  assert.match(evidence,/filter\(c=>c\?\.muted!==true&&c\?\.source_asset_id\)/);
  assert.match(evidence,/source_asset_count:sourceIds\.length/);
});


test("Mix Engineer reports when multi-source edited tracks need rendered evidence",()=>{
  const session={tracks:[{id:"v",type:"vocal",name:"Lead Vocal",mute:false,pan:0,gain_db:0,channel_strip:{high_pass_hz:20,presence_db:0,high_shelf_db:0,compressor:{}}}]};
  const plan=analyzeMusicMixEngineer(session,{contract:"AVANTIQO_MUSIC_MIX_EVIDENCE_V10",tracks:[{track_id:"v",measured:false,reason:"MULTIPLE_SOURCE_ASSETS_REQUIRE_TRACK_RENDER"}],ambiguous_source_track_count:1,all_timeline_evidence_safe:false});
  const issue=plan.issues.find(row=>row.code==="TRACK_RENDER_REQUIRED_FOR_EVIDENCE");
  assert.ok(issue);
  assert.match(issue.message,/1 edited track/);
  assert.match(issue.message,/track render/i);
});


test("Mix Engineer reuses only current lineage-matched neutral evidence renders",()=>{
  assert.match(route,/music_asset_kind\)!=="TRACK_EVIDENCE_RENDER"/);
  assert.match(route,/render_kind\)!=="TRACK_EVIDENCE"/);
  assert.match(route,/stem_stage\)!=="post-source-cleanup-pre-track-processing"/);
  assert.match(route,/track_processing_applied===true/);
  assert.match(route,/project_revision/);
  assert.match(route,/JSON\.stringify\(lineage\)!==JSON\.stringify\(expected\)/);
  assert.match(route,/track_render_urls\[trackId\]=await resolveCreativeProviderAssetUrl/);
  assert.match(evidence,/track_render_urls/);
  assert.match(evidence,/evidence_source:useTrackRender\?"TRACK_EVIDENCE_RENDER":"SOURCE_ASSET"/);
  assert.match(evidence,/const basis=useTrackRender\?"TRACK_RENDER":"SOURCE_MEDIA"/);
});

test("track-render temporal evidence is read in project timeline coordinates",()=>{
  assert.match(evidence,/evidence_timeline_basis==="TRACK_RENDER"\?time:/);
});


test("single-source edits also require rendered timeline evidence",()=>{
  assert.match(evidence,/sourceMediaEvidenceExact/);
  assert.match(evidence,/clips\.length!==1/);
  assert.match(evidence,/source_offset_seconds/);
  assert.match(evidence,/EDITED_SOURCE_RANGE_REQUIRE_TRACK_RENDER/);
  assert.match(route,/if\(!trackId\|\|!expected\|\|!expected\.length\)continue/);
});


test("audible clip transforms cannot reuse raw-source evidence",()=>{
  assert.match(evidence,/gain_db/);
  assert.match(evidence,/fade_in_seconds/);
  assert.match(evidence,/fade_out_seconds/);
  assert.match(evidence,/loop_enabled/);
  assert.match(evidence,/reversed/);
  assert.match(evidence,/warp_mode/);
  assert.match(evidence,/sourceMediaEvidenceExact/);
});
