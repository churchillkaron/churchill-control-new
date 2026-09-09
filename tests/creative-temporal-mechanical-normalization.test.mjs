import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTemporalMechanicalContract } from "../lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime.js";

test("normalizes repaired temporal timing and rejects reference-image dimensions as master video spec", () => {
  const plan = normalizeTemporalMechanicalContract({
    temporal_contract:{duration_seconds:5},
    deliverables:[{output_spec:{duration_seconds:5,aspect_ratio:"16:9",resolution:"1100x825",frame_rate:"24"}}],
    scenes:[1,2,3].map((n)=>({id:`s${n}`,duration_seconds:1.8,camera_style:{angle:"Low angle"},location:{name:"North Sea"},actors:[],products:[{name:"helicopter"}],tension:{pressure_before:20,pressure_after:40},shots:[1,2].map((m)=>({id:`s${n}x${m}`,duration_seconds:.9,subject:"helicopter",action:"approaches platform",camera:{framing:"Low-angle wide shot",focus_target:"helicopter"},generation:{required:true,service:"ai.video.generate",capability:"ai.video.generate",output_spec:{resolution:"1100x825"}},negative_constraints:"no text",known_failure_modes:"identity drift",repair_instructions:"restore identity"}))}))
  });
  assert.equal(plan.scenes.reduce((s,x)=>s+x.duration_seconds,0),5);
  assert.equal(plan.scenes.flatMap(s=>s.shots).reduce((s,x)=>s+x.duration_seconds,0),5);
  assert.equal(plan.deliverables[0].output_spec.resolution,"1920x1080");
  assert.equal(plan.deliverables[0].output_spec.frame_rate,24);
  for(const scene of plan.scenes) for(const shot of scene.shots){
    assert.equal(shot.generation.output_spec.duration_seconds,shot.duration_seconds);
    assert.equal(shot.generation.output_spec.resolution,"1920x1080");
    assert.ok(shot.camera.angle);
    assert.ok(!/^none\b/i.test(shot.camera.focus_transition));
    assert.ok(shot.continuity.location);
    assert.ok(shot.audio.source_sound);
    assert.ok(Array.isArray(shot.negative_constraints));
  }
});

test("completes governance-only temporal roles and evidence-derived repair detail without another creative inference", () => {
  const plan = normalizeTemporalMechanicalContract({
    temporal_contract:{duration_seconds:5},
    concept:{creative_thesis:"A researched offshore helicopter approach proves industrial precision.",refused_devices:["No text or logos in generated pixels"]},
    story:{observable_proof:"Readable rotor motion, platform scale and North Sea atmosphere."},
    creative_review:{craft_risks:["Rotor motion may read static"],finishing_requirements:["Preserve rotor readability and platform scale"]},
    quality:{version:"AVANTIQO_CREATIVE_QUALITY_WORLD_CLASS_V3"},asset_manifest:[{asset_id:"ref-1"}],role_decisions:{},
    deliverables:[{output_spec:{duration_seconds:5,aspect_ratio:"16:9",resolution:"1920x1080",frame_rate:24}}],
    scenes:[{id:"s1",duration_seconds:5,actors:[],products:[{name:"helicopter"}],location:{name:"North Sea"},shots:[{id:"x1",duration_seconds:5,subject:"helicopter",action:"approaches platform",frame_plan:{opening_frame:"Helicopter starts distant on the horizon under Nordic light.",progression:"Static.",closing_frame:"Helicopter and platform resolve together with readable rotor motion."},camera:{framing:"Low-angle wide shot",focus_target:"helicopter"},generation:{service:"ai.video.generate",capability:"ai.video.generate",output_spec:{}}}]}]
  });
  for (const id of ["sound_director","motion_design_director","vfx_director","quality_director","rights_safety_director","release_director","performance_director"]) {
    assert.equal(plan.role_decisions[id].status,"ACTIVE"); assert.ok(plan.role_decisions[id].decision.length >= 20); assert.ok(plan.role_decisions[id].evidence.length);
  }
  const shot=plan.scenes[0].shots[0];
  assert.ok(shot.negative_constraints.length); assert.ok(shot.known_failure_modes.length); assert.ok(shot.repair_instructions.length); assert.ok(shot.frame_plan.progression.length >= 40);
});
