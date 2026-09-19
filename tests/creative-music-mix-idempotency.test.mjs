import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeMusicMixEngineer, applyMusicMixEngineerPlan, createMusicMixEngineerBaseline, sessionMusicMixFingerprint } from "../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js";

function session(){return {revision:7,bpm:120,time_signature:"4/4",tracks:[{id:"vox",type:"vocal",name:"Lead Vocal",gain_db:-3,pan:0,channel_strip:{high_pass_hz:20,presence_db:0,high_shelf_db:0,compressor:{}},inserts:[],sends:[],clips:[]},{id:"bass",type:"bass",name:"Bass",gain_db:-4,pan:0,channel_strip:{high_pass_hz:20,low_shelf_db:0,presence_db:0,compressor:{}},inserts:[],sends:[],clips:[]}],automation_lanes:[]};}
const evidence={contract:"AVANTIQO_MUSIC_MIX_EVIDENCE_V4",tracks:[{track_id:"vox",measured:true,crest_proxy_db:10,presence_vs_lowmid_db:0,air_vs_presence_db:-2,sibilance_vs_presence_db:-5},{track_id:"bass",measured:true,sub_vs_lowmid_db:0}],relationships:[]};

test("reanalysis from durable baseline does not stack EQ or gain",()=>{const source=session(),baseline=createMusicMixEngineerBaseline(source),first=analyzeMusicMixEngineer(source,evidence,{},baseline),applied=applyMusicMixEngineerPlan(source,first),second=analyzeMusicMixEngineer(applied,evidence,{},baseline);const a=first.track_decisions.find(x=>x.track_id==="vox"),b=second.track_decisions.find(x=>x.track_id==="vox");assert.equal(b.channel_strip.presence_db,a.channel_strip.presence_db);assert.equal(b.channel_strip.high_shelf_db,a.channel_strip.high_shelf_db);assert.equal(b.gain_db,a.gain_db);assert.equal(second.plan_fingerprint,first.plan_fingerprint);});

test("session fingerprint detects human edits after an AI apply",()=>{const source=session(),baseline=createMusicMixEngineerBaseline(source),plan=analyzeMusicMixEngineer(source,evidence,{},baseline),applied=applyMusicMixEngineerPlan(source,plan),fingerprint=sessionMusicMixFingerprint(applied),edited=structuredClone(applied);edited.tracks[0].gain_db+=0.7;assert.equal(sessionMusicMixFingerprint(applied),fingerprint);assert.notEqual(sessionMusicMixFingerprint(edited),fingerprint);});

test("route exposes no-op, rebase, durable baseline and real undo availability",()=>{const route=fs.readFileSync(new URL("../app/api/creative/music/mix-engineer/route.js",import.meta.url),"utf8"),panel=fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicMixEngineerPanel.jsx",import.meta.url),"utf8");assert.match(route,/music_mix_engineer_baseline/);assert.match(route,/NO_NEW_MIX_CHANGES/);assert.match(route,/REBASE_REQUIRED/);assert.match(route,/action===\"rebase\"/);assert.match(route,/sessionMusicMixFingerprint/);assert.match(panel,/Use current mix as new baseline/);assert.match(panel,/disabled=\{busy\|\|!undoAvailable\}/);assert.match(panel,/Mix plan already applied/);});


test("session fingerprint detects clip-level playback edits",()=>{
  const source=session();
  source.tracks[0].clips=[{id:"clip-v",source_asset_id:"asset-v",source_version:1,start_seconds:0,duration_seconds:20,source_offset_seconds:0,gain_db:0,fade_in_seconds:0,fade_out_seconds:0,muted:false,loop_enabled:false,loop_length_seconds:null,reversed:false,warp_mode:"off"}];
  const fingerprint=sessionMusicMixFingerprint(source);
  for(const mutate of [
    clip=>{clip.gain_db=-1.5;},
    clip=>{clip.fade_in_seconds=.4;},
    clip=>{clip.fade_out_seconds=.6;},
    clip=>{clip.loop_enabled=true;clip.loop_length_seconds=4;},
    clip=>{clip.reversed=true;},
    clip=>{clip.warp_mode="stretch";},
    clip=>{clip.source_version=2;},
  ]){
    const edited=structuredClone(source);mutate(edited.tracks[0].clips[0]);assert.notEqual(sessionMusicMixFingerprint(edited),fingerprint);
  }
});
