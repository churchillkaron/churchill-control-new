import test from "node:test";
import assert from "node:assert/strict";
import { derivePictureContactEvidence } from "../lib/creative/music/runtime/CreativePictureContactEvidenceRuntime.js";
import { proposeMusicPictureFoleyCues } from "../lib/creative/music/runtime/CreativeMusicPictureFoleyCueRuntime.js";

function track(id,role,samples,extra={}){return{id,role,samples,...extra};}
const foot=track("foot","FOOT",[
 {time_seconds:0,bbox:[100,50,20,20],dx:0,dy:8,tracked_points:50,mean_lk_error:2},
 {time_seconds:.1,bbox:[100,90,20,20],dx:0,dy:4,tracked_points:48,mean_lk_error:2},
 {time_seconds:.2,bbox:[100,118,20,20],dx:0,dy:1,tracked_points:46,mean_lk_error:2},
],{subject_id:"actor-1"});
const ground=track("ground","SURFACE",[
 {time_seconds:0,bbox:[0,140,400,40],dx:0,dy:0,tracked_points:60,mean_lk_error:1},
 {time_seconds:.1,bbox:[0,140,400,40],dx:0,dy:0,tracked_points:60,mean_lk_error:1},
 {time_seconds:.2,bbox:[0,140,400,40],dx:0,dy:0,tracked_points:60,mean_lk_error:1},
],{surface_material:"GRAVEL"});

test("explicit foot and surface tracks produce evidence-backed foot contact",()=>{const r=derivePictureContactEvidence({tracks:[foot,ground],frame_width:400,frame_height:200,min_confidence:.75});assert.equal(r.event_count,1);const e=r.events[0];assert.equal(e.event_type,"FOOT_CONTACT");assert.equal(e.subject_id,"actor-1");assert.equal(e.surface_material,"GRAVEL");assert.equal(e.evidence.explicit_roi_roles,true);assert.equal(e.evidence.semantic_model_used,false);assert.ok(e.confidence>=.75);});

test("low-quality tracks do not become contact events",()=>{const bad={...foot,samples:foot.samples.map(s=>({...s,tracked_points:3,mean_lk_error:40}))};const r=derivePictureContactEvidence({tracks:[bad,ground],frame_width:400,frame_height:200,min_confidence:.8});assert.equal(r.event_count,0);});

test("hand to prop and hand to door map to distinct Foley event types",()=>{const hand=track("hand","HAND",[{time_seconds:1,bbox:[20,20,20,20],dx:3,dy:0,tracked_points:50,mean_lk_error:1}]),prop=track("prop","PROP",[{time_seconds:1,bbox:[38,20,20,20],dx:0,dy:0,tracked_points:50,mean_lk_error:1}],{object_id:"cup"}),door=track("door","DOOR",[{time_seconds:1,bbox:[38,20,20,20],dx:0,dy:0,tracked_points:50,mean_lk_error:1}],{object_id:"door-1"});assert.equal(derivePictureContactEvidence({tracks:[hand,prop],frame_width:200,frame_height:100,min_confidence:.7}).events[0].event_type,"PROP_CONTACT");assert.equal(derivePictureContactEvidence({tracks:[hand,door],frame_width:200,frame_height:100,min_confidence:.7}).events[0].event_type,"DOOR_MOVEMENT");});

test("contact evidence feeds existing Foley proposal engine without semantic guessing",()=>{const contact=derivePictureContactEvidence({tracks:[foot,ground],frame_width:400,frame_height:200,min_confidence:.75}),foley=proposeMusicPictureFoleyCues({picture_lock:{picture_lock_digest:"pic",duration_seconds:2,frame_rate:24},tracked_events:contact.events});assert.equal(foley.foley_plan.event_count,1);assert.equal(foley.foley_plan.events[0].category,"FOOTSTEP");assert.equal(foley.foley_plan.events[0].surface_material,"GRAVEL");assert.equal(foley.automatic_picture_inference_performed,false);});
