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
  assert.match(route,/analyzeMusicMixEngineer\(session,mixEvidence\)/);
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
  assert.equal(vocal.channel_strip.compressor.ratio,2.2);
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
