import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMusicMixEngineer, applyMusicMixEngineerPlan } from "../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js";

const arrangement={sections:[{type:"verse",start_beat:0,end_beat:16,intensity:.5},{type:"chorus",start_beat:16,end_beat:32,intensity:.8}]};
function baseTrack(extra={}){return {id:"vox",type:"vocal",name:"Lead Vocal",gain_db:0,pan:0,mute:false,channel_strip:{compressor:{}},clips:[],inserts:[],...extra};}
const evidence={contract:"AVANTIQO_MUSIC_MIX_EVIDENCE_V4",tracks:[{track_id:"vox",measured:true,crest_proxy_db:10,presence_vs_lowmid_db:0,air_vs_presence_db:-2,sibilance_vs_presence_db:-1}]};

test("elevated measured sibilance enables bounded rendered de-esser",()=>{const session={revision:1,bpm:120,time_signature:"4/4",tracks:[baseTrack()],automation_lanes:[]};const plan=analyzeMusicMixEngineer(session,evidence,arrangement);const vocal=plan.track_decisions[0];assert.ok(vocal.deesser);assert.ok(vocal.deesser.max_reduction_db<=6);assert.ok(vocal.deesser.max_reduction_db>=3);assert.match(vocal.decisions.join(" "),/sibilance control/);const applied=applyMusicMixEngineerPlan(session,plan);const insert=applied.tracks[0].inserts.find(x=>x.type==="deesser");assert.ok(insert);assert.equal(insert.enabled,true);assert.match(insert.id,/^mix-deesser-/);});

test("manual de-esser is preserved instead of overwritten",()=>{const manual={id:"human-vocal-deesser",type:"deesser",enabled:true,bypass:false,parameters:{frequency_hz:7200,threshold_db:-30,ratio:3,max_reduction_db:4,attack_ms:1,release_ms:90}};const session={revision:1,bpm:120,time_signature:"4/4",tracks:[baseTrack({inserts:[manual]})],automation_lanes:[]};const plan=analyzeMusicMixEngineer(session,evidence,arrangement);const vocal=plan.track_decisions[0];assert.equal(vocal.deesser,null);assert.match(vocal.decisions.join(" "),/manual de-esser preserved/);const applied=applyMusicMixEngineerPlan(session,plan);assert.deepEqual(applied.tracks[0].inserts[0],manual);});

test("non-elevated sibilance does not add de-essing",()=>{const clean={...evidence,tracks:[{...evidence.tracks[0],sibilance_vs_presence_db:-5}]};const session={revision:1,bpm:120,time_signature:"4/4",tracks:[baseTrack()],automation_lanes:[]};const plan=analyzeMusicMixEngineer(session,clean,arrangement);assert.equal(plan.track_decisions[0].deesser,null);});
