import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { proposeMusicPictureFoleyCues } from "../lib/creative/music/runtime/CreativeMusicPictureFoleyCueRuntime.js";

const lock={picture_lock_digest:"pic-1",duration_seconds:10,frame_rate:24};

test("tracked foot contacts become surface-aware Foley proposals at exact picture time",()=>{const r=proposeMusicPictureFoleyCues({picture_lock:lock,tracked_events:[{id:"step-1",event_type:"FOOT_CONTACT",time_seconds:1.25,confidence:.97,subject_id:"actor-1",surface_material:"GRAVEL",intensity:.6}]});assert.equal(r.accepted_evidence_count,1);assert.equal(r.foley_plan.events[0].category,"FOOTSTEP");assert.equal(r.foley_plan.events[0].start_seconds,1.25);assert.equal(r.foley_plan.events[0].surface_material,"GRAVEL");assert.match(r.foley_plan.events[0].description,/gravel/);assert.equal(r.foley_plan.events[0].human_approval_required,true);assert.equal(r.automatic_sound_selection,false);assert.equal(r.automatic_generation,false);});

test("low-confidence picture events are rejected instead of becoming fabricated Foley",()=>{const r=proposeMusicPictureFoleyCues({picture_lock:lock,tracked_events:[{id:"weak",event_type:"PROP_CONTACT",time_seconds:2,confidence:.5,object_id:"glass"}]});assert.equal(r.foley_plan.event_count,0);assert.equal(r.rejected_low_confidence_count,1);assert.equal(r.automatic_picture_inference_performed,false);});

test("explicit tracked door vehicle cloth body and impact events map onto existing Foley categories",()=>{const events=[["DOOR_MOVEMENT","PROP"],["VEHICLE_INTERACTION","VEHICLE"],["CLOTH_MOVEMENT","CLOTH"],["BODY_CONTACT","BODY"],["IMPACT","IMPACT"]].map(([event_type],i)=>({id:"e"+i,event_type,time_seconds:i+1,confidence:.9}));const r=proposeMusicPictureFoleyCues({picture_lock:lock,tracked_events:events});assert.deepEqual(r.foley_plan.events.map(x=>x.category),["PROP","VEHICLE","CLOTH","BODY","IMPACT"]);});

test("world-class capability registry exposes picture-aware Foley as existing deterministic capability",()=>{const src=fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime.js","utf8");assert.match(src,/picture_aware_foley_cues/);assert.match(src,/creative\.audio\.foley-picture-cues/);});
