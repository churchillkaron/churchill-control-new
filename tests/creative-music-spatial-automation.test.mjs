import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMusicMixAutomationPlan } from '../lib/creative/music/runtime/CreativeMusicMixAutomationRuntime.js';
import { analyzeMusicMixEngineer, applyMusicMixEngineerPlan } from '../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js';

const arrangement={sections:[{id:'v1',type:'verse',start_beat:0,end_beat:16,intensity:.35},{id:'c1',type:'chorus',start_beat:16,end_beat:32,intensity:.85}]};
const evidence={contract:'TEST',tracks:[{track_id:'vox',measured:true,dynamics_envelope:Array.from({length:40},(_,i)=>({time_seconds:i*.5,rms_dbfs:-18}))}],relationships:[]};
const baseSession={revision:1,bpm:120,tempo_map:{initial_bpm:120,initial_time_signature:'4/4'},tracks:[{id:'vox',type:'vocal',name:'Lead Vocal',gain_db:0,pan:0,channel_strip:{},sends:[{bus_id:'bus-reverb',enabled:true,level_db:-17,pre_fader:false}],clips:[{id:'v',source_asset_id:'a',start_seconds:0,duration_seconds:16,source_offset_seconds:0}]}],automation_lanes:[]};

test('section-aware reverb automation is bounded and manual send lanes are preserved',()=>{
  const plan=buildMusicMixAutomationPlan(baseSession,arrangement,evidence);
  const lane=plan.lanes.find(l=>l.parameter==='send_db:bus-reverb');
  assert.ok(lane); assert.equal(lane.spatial_automation,true);
  assert.ok(lane.points.every(p=>p.value>=-60&&p.value<=6));
  const manual=structuredClone(baseSession); manual.automation_lanes=[{id:'manual-rvb',target_type:'track',target_id:'vox',parameter:'send_db:bus-reverb',interpolation:'linear',enabled:true,points:[{time_seconds:0,value:-12},{time_seconds:8,value:-9}]}];
  const blocked=buildMusicMixAutomationPlan(manual,arrangement,evidence).lanes.find(l=>l.parameter==='send_db:bus-reverb');
  assert.equal(blocked.blocked_by_existing_manual_lane,true);
});

test('delay throw requires measured active vocal near an eligible transition',()=>{
  const active=buildMusicMixAutomationPlan(baseSession,arrangement,evidence);
  assert.ok(active.lanes.some(l=>l.parameter==='send_db:bus-delay'&&l.measured_transition_activity===true));
  const silent={...evidence,tracks:[{track_id:'vox',measured:true,dynamics_envelope:Array.from({length:40},(_,i)=>({time_seconds:i*.5,rms_dbfs:i>14?-70:-18}))}]};
  const noThrow=buildMusicMixAutomationPlan(baseSession,arrangement,silent);
  assert.equal(noThrow.lanes.some(l=>l.parameter==='send_db:bus-delay'),false);
});

test('mix apply creates an owned delay send only when a delay automation lane is approved',()=>{
  const plan=analyzeMusicMixEngineer(baseSession,evidence,arrangement);
  const next=applyMusicMixEngineerPlan(baseSession,plan);
  const send=next.tracks[0].sends.find(s=>s.bus_id==='bus-delay');
  assert.ok(send); assert.equal(send.owned_by_mix_engineer,true); assert.equal(send.level_db,-60);
  assert.ok(next.automation_lanes.some(l=>l.parameter==='send_db:bus-delay'));
});

test('preview and offline render expose send AudioParams and scheduler converts send dB to gain',()=>{
  const preview=fs.readFileSync('lib/creative/music/client/MusicMultitrackPreviewEngine.js','utf8');
  const offline=fs.readFileSync('lib/creative/music/client/MusicOfflineMixRenderRuntime.js','utf8');
  const scheduler=fs.readFileSync('lib/creative/music/client/MusicAutomationPreviewRuntime.js','utf8');
  assert.match(preview,/sendGains\.set\(send\.bus_id, sendGain\.gain\)/);
  assert.match(offline,/sendGains\.set\(send\.bus_id, sendGain\.gain\)/);
  assert.match(scheduler,/startsWith\("send_db:"\)/);
});
