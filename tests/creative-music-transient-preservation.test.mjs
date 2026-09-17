import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMusicMixEngineer } from "../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js";

function session(name,type="audio"){return {revision:1,tracks:[{id:"t1",name,type,gain_db:0,pan:0,mute:false,channel_strip:{compressor:{}},clips:[],inserts:[],sends:[]}],automation_lanes:[]};}
function decision(name,crest){return analyzeMusicMixEngineer(session(name),{contract:"TEST",tracks:[{track_id:"t1",measured:true,crest_proxy_db:crest,sub_vs_lowmid_db:0,presence_vs_lowmid_db:0,air_vs_presence_db:-2,sibilance_vs_presence_db:-6,boxiness_vs_warmth_db:-2,boxiness_vs_presence_db:-2}],relationships:[]},{sections:[]}).track_decisions[0];}

test("low-crest drums use slower gentler compression to preserve transient space",()=>{const d=decision("Drums",7);assert.equal(d.channel_strip.compressor.ratio,1.8);assert.equal(d.channel_strip.compressor.attack_ms,42);assert.equal(d.channel_strip.compressor.makeup_db,0);assert.ok(d.decisions.includes("restore measured drum transient space"));});

test("healthy transient drums keep bounded moderate compression",()=>{const d=decision("Drums",15);assert.equal(d.channel_strip.compressor.ratio,2.4);assert.equal(d.channel_strip.compressor.attack_ms,30);assert.ok(d.channel_strip.compressor.makeup_db<=0.25);});

test("low-crest vocal is not squeezed harder",()=>{const d=decision("Lead Vocal",6.5);assert.equal(d.channel_strip.compressor.ratio,2);assert.equal(d.channel_strip.compressor.attack_ms,28);assert.equal(d.channel_strip.compressor.makeup_db,.5);assert.ok(d.decisions.includes("preserve measured vocal transient life"));});

test("low-crest bass gets gentler ratio and slower attack",()=>{const d=decision("Bass",7);assert.equal(d.channel_strip.compressor.ratio,2.5);assert.equal(d.channel_strip.compressor.attack_ms,34);assert.ok(d.decisions.includes("protect measured bass articulation"));});
