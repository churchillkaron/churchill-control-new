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
