import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicMixAutomationPlan } from "../lib/creative/music/runtime/CreativeMusicMixAutomationRuntime.js";

function env(values){return values.map((r,i)=>({time_seconds:i*.5+.5,rms_dbfs:r}));}
function session(manual=false){return {bpm:120,time_signature:"4/4",tempo_map:{contract:"AVANTIQO_MUSIC_TEMPO_MAP_V2",tempo_events:[{id:"t",beat:0,bpm:120,curve:"step"}],meter_events:[{id:"m",beat:0,time_signature:"4/4"}]},tracks:[
{id:"vox",type:"vocal",name:"Lead Vocal",gain_db:0,mute:false,clips:[{source_asset_id:"v",start_seconds:0,duration_seconds:20,source_offset_seconds:0}]},
{id:"music",type:"backing",name:"Backing",gain_db:0,mute:false,clips:[{source_asset_id:"b",start_seconds:0,duration_seconds:20,source_offset_seconds:0}]},
{id:"drums",type:"drums",name:"Drums",gain_db:0,mute:false,clips:[{source_asset_id:"d",start_seconds:0,duration_seconds:20,source_offset_seconds:0}]}
],automation_lanes:manual?[{id:"human-vox",target_type:"track",target_id:"vox",parameter:"gain_db",interpolation:"linear",points:[{time_seconds:0,value:0}]}]:[]};}
const arrangement={sections:[{type:"verse",start_beat:0,end_beat:16,intensity:.5},{type:"chorus",start_beat:16,end_beat:32,intensity:.9}]};
const evidence={tracks:[
{track_id:"vox",measured:true,dynamics_envelope:env([-18,-18,-22,-22,-18,-18,-15,-15,-18,-18,-18,-18])},
{track_id:"music",measured:true,dynamics_envelope:env([-20,-20,-20,-20,-20,-20,-20,-20,-20,-20,-20,-20])},
{track_id:"drums",measured:true,dynamics_envelope:env([-24,-24,-24,-24,-24,-24,-24,-24,-24,-24,-24,-24])}
]};

test("measured vocal micro-rides follow real relative envelope and stay bounded",()=>{const plan=buildMusicMixAutomationPlan(session(),arrangement,evidence);const lane=plan.lanes.find(x=>x.target_id==="vox");assert.equal(lane.micro_dynamics.measured,true);assert.ok(lane.micro_dynamics.observation_count>=6);assert.match(lane.decision,/measured vocal ride/);assert.ok(lane.points.some(p=>Number.isFinite(p.micro_ride_delta_db)));assert.ok(lane.points.every(p=>Math.abs(p.value)<=1.2));assert.equal(lane.micro_dynamics.method,"VOCAL_TO_ACTIVE_ACCOMPANIMENT_ENVELOPE");});

test("manual vocal automation remains protected even when dynamics evidence exists",()=>{const plan=buildMusicMixAutomationPlan(session(true),arrangement,evidence);const lane=plan.lanes.find(x=>x.target_id==="vox");assert.equal(lane.blocked_by_existing_manual_lane,true);assert.equal(plan.manual_automation_preserved,true);});
