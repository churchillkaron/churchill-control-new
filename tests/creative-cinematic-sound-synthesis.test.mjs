import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCinematicSoundSynthesisPlan, bindCinematicSoundSynthesisToObject } from "../lib/creative/music/runtime/CreativeCinematicSoundSynthesisRuntime.js";
import { renderCinematicSoundSynthesisPreview } from "../lib/creative/music/client/MusicCinematicSoundSynthesisRenderRuntime.js";

function source(n=4800){const a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=Math.sin(2*Math.PI*110*i/48000)*.35+(i%800<8?.7:0);return a;}

test("cinematic synthesis plan supports transient body sub granular resonant and morph layers",()=>{const p=buildCinematicSoundSynthesisPlan({name:"Impact design",layers:[{mode:"SOURCE",source_asset_id:"a"},{mode:"TRANSIENT"},{mode:"BODY"},{mode:"SUB"},{mode:"GRANULAR",source_asset_id:"a"},{mode:"RESONATOR"},{mode:"SAMPLE_MORPH",source_asset_id:"a",secondary_asset_id:"b"}]});assert.equal(p.ready_for_preview,true);assert.equal(p.layer_count,7);for(const mode of ["TRANSIENT","BODY","SUB","GRANULAR","RESONATOR","SAMPLE_MORPH"])assert.ok(p.layers.some(l=>l.mode===mode));assert.equal(p.render_to_new_asset_only,true);assert.equal(p.automatic_mix_acceptance,false);});

test("source-dependent synthesis fails closed when provenance assets are missing",()=>{const p=buildCinematicSoundSynthesisPlan({layers:[{mode:"GRANULAR"}]});assert.equal(p.ready_for_preview,false);assert.ok(p.blockers.includes("CINEMATIC_SOUND_SYNTH_SOURCE_ASSET_REQUIRED"));});

test("local preview renders finite bounded PCM without provider inference",()=>{const plan=buildCinematicSoundSynthesisPlan({layers:[{mode:"SOURCE",source_asset_id:"a",gain_db:-6},{mode:"TRANSIENT"},{mode:"BODY"},{mode:"SUB"},{mode:"GRANULAR",source_asset_id:"a"}]});const r=renderCinematicSoundSynthesisPreview({plan,primary_source:source(),sample_rate:48000});assert.equal(r.provider_job_submitted,false);assert.equal(r.release_master,false);assert.ok(r.mono.some(x=>Math.abs(x)>.001));assert.ok(r.mono.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));assert.equal(r.layer_renders.length,5);});

test("two-source morphing uses explicit secondary source and stays non-destructive",()=>{const a=new Float32Array([1,1,1]),b=new Float32Array([-1,-1,-1]),plan=buildCinematicSoundSynthesisPlan({layers:[{mode:"SAMPLE_MORPH",source_asset_id:"a",secondary_asset_id:"b",morph_percent:50}]});const r=renderCinematicSoundSynthesisPreview({plan,primary_source:a,secondary_source:b});assert.ok(r.mono.every(x=>Math.abs(x)<1e-6));assert.equal(r.source_assets_preserved,true);});

test("synthesis plan binds into existing cinematic sound object instead of creating parallel object model",()=>{const plan=buildCinematicSoundSynthesisPlan({name:"Mechanical hit",sound_object_id:"obj1",layers:[{mode:"SOURCE",source_asset_id:"a"},{mode:"RESONATOR"}]}),bound=bindCinematicSoundSynthesisToObject({id:"obj1",category:"CUSTOM",layers:[]},plan);assert.equal(bound.id,"obj1");assert.equal(bound.synthesis_lab.contract,"AVANTIQO_CINEMATIC_SOUND_SYNTHESIS_V1");assert.equal(bound.synthesis_lab.layer_count,2);});

test("world-class registry exposes cinematic sound synthesis as implemented owned capability",()=>{const src=fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js","utf8");assert.match(src,/cinematic_sound_synthesis/);assert.match(src,/creative\.audio\.sound-synthesis/);});
test("all executable cinematic synthesis layers require a provenance-bound primary source",()=>{const p=buildCinematicSoundSynthesisPlan({layers:[{mode:"TRANSIENT"},{mode:"RESONATOR"},{mode:"SUB"}]});assert.equal(p.ready_for_preview,false);assert.ok(p.blockers.includes("CINEMATIC_SOUND_SYNTH_SOURCE_ASSET_REQUIRED"));});
