import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMusicMixEngineer } from "../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js";

function make(name,mean,crest){const session={tracks:[{id:"t",type:"audio",name,gain_db:0,pan:0,mute:false,channel_strip:{compressor:{}}}]};return analyzeMusicMixEngineer(session,{contract:"TEST",tracks:[{track_id:"t",measured:true,mean_db:mean,peak_dbfs:mean+crest,crest_proxy_db:crest,sub_vs_lowmid_db:0,presence_vs_lowmid_db:0,air_vs_presence_db:-2,sibilance_vs_presence_db:-6,boxiness_vs_warmth_db:-2,boxiness_vs_presence_db:-2}],relationships:[]},{sections:[]}).track_decisions[0];}

test("quiet and hot vocals receive different measured thresholds",()=>{const quiet=make("Lead Vocal",-27,10),hot=make("Lead Vocal",-13,10);assert.ok(quiet.channel_strip.compressor.threshold_db<hot.channel_strip.compressor.threshold_db);assert.equal(quiet.channel_strip.compressor.threshold_db,-23);assert.equal(hot.channel_strip.compressor.threshold_db,-10);});

test("low-crest material raises threshold relative to its mean to avoid over-compression",()=>{const row=make("Drums",-18,6);assert.equal(row.channel_strip.compressor.threshold_db,-14);assert.equal(row.channel_strip.compressor.ratio,1.8);assert.equal(row.channel_strip.compressor.attack_ms,42);});

test("thresholds remain role-bounded",()=>{assert.equal(make("Bass",-50,10).channel_strip.compressor.threshold_db,-28);assert.equal(make("Drums",-2,18).channel_strip.compressor.threshold_db,-6);});

test("unmeasured sources retain deterministic role fallback",()=>{const session={tracks:[{id:"v",type:"vocal",name:"Lead Vocal",gain_db:0,pan:0,mute:false,channel_strip:{compressor:{}}}]};const row=analyzeMusicMixEngineer(session,{contract:"TEST",tracks:[],relationships:[]},{sections:[]}).track_decisions[0];assert.equal(row.channel_strip.compressor.threshold_db,-20);});
