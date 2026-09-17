import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeMusicMixEngineer, applyMusicMixEngineerPlan, createMusicMixEngineerBaseline } from '../lib/creative/music/runtime/CreativeMusicMixEngineerRuntime.js';

function session(){return {revision:1,tracks:[{id:'vox',type:'vocal',name:'Lead Vocal',gain_db:0,pan:0,mute:false,channel_strip:{eq_bands:[{id:'manual-air',type:'highshelf',enabled:true,frequency_hz:10000,gain_db:1,q:.7,destructive_processing_allowed:false}],compressor:{}},inserts:[],sends:[],clips:[]}],automation_lanes:[]};}
function evidence(overrides={}){return {contract:'AVANTIQO_MUSIC_MIX_EVIDENCE_V6',tracks:[{track_id:'vox',measured:true,crest_proxy_db:10,sub_vs_lowmid_db:0,presence_vs_lowmid_db:0,air_vs_presence_db:0,sibilance_vs_presence_db:-5,boxiness_vs_warmth_db:0,boxiness_vs_presence_db:-10,...overrides}],relationships:[]};}

test('normal vocal does not receive automatic boxiness cut',()=>{const s=session();const plan=analyzeMusicMixEngineer(s,evidence(),{},createMusicMixEngineerBaseline(s));const d=plan.track_decisions[0];assert.equal(d.channel_strip.eq_bands.some(b=>b.id==='mix-eq-boxiness-vox'),false);});

test('measured elevated boxiness creates one bounded owned bell cut and preserves manual EQ',()=>{const s=session();const plan=analyzeMusicMixEngineer(s,evidence({boxiness_vs_warmth_db:5,boxiness_vs_presence_db:-2}),{},createMusicMixEngineerBaseline(s));const d=plan.track_decisions[0];const band=d.channel_strip.eq_bands.find(b=>b.id==='mix-eq-boxiness-vox');assert.ok(band);assert.equal(band.type,'bell');assert.equal(band.frequency_hz,380);assert.ok(band.gain_db<=-0.75&&band.gain_db>=-1.5);assert.ok(d.channel_strip.eq_bands.some(b=>b.id==='manual-air'));const applied=applyMusicMixEngineerPlan(s,plan);assert.equal(applied.tracks[0].channel_strip.eq_bands.filter(b=>b.id==='mix-eq-boxiness-vox').length,1);});

test('boxiness decision remains idempotent from durable baseline',()=>{const s=session();const base=createMusicMixEngineerBaseline(s);const e=evidence({boxiness_vs_warmth_db:5,boxiness_vs_presence_db:-2});const a=analyzeMusicMixEngineer(s,e,{},base);const applied=applyMusicMixEngineerPlan(s,a);const b=analyzeMusicMixEngineer(applied,e,{},base);assert.equal(a.track_decisions[0].channel_strip.eq_bands.find(x=>x.id==='mix-eq-boxiness-vox').gain_db,b.track_decisions[0].channel_strip.eq_bands.find(x=>x.id==='mix-eq-boxiness-vox').gain_db);});

test('parametric EQ band renders in both preview and offline graphs',()=>{const preview=fs.readFileSync('lib/creative/music/client/MusicMultitrackPreviewEngine.js','utf8');const offline=fs.readFileSync('lib/creative/music/client/MusicOfflineMixRenderRuntime.js','utf8');for(const source of [preview,offline]){assert.match(source,/channel_strip\?\.eq_bands/);assert.match(source,/type === "bell"/);assert.match(source,/createBiquadFilter/);assert.match(source,/connectParametricEq/);}});
