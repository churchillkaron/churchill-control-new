import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { bootstrapCinematicImpactFromPlan } from "../lib/creative/director/runtime/CreativeCinematicImpactBootstrapRuntime.js";
import { CreativeCinematicImpactRuntime } from "../lib/creative/director/runtime/CreativeCinematicImpactRuntime.js";

function shot(id, action, framing, movement, lens, stabilization) {
  return {
    id, duration_seconds: 0.833, subject: `subject ${id}`,
    purpose: `Reveal a new physical proof beat for ${id} while advancing the story state.`,
    action, negative_constraints:["No human elements and no text or logos in generated pixels."],
    frame_plan:{ opening_frame:`${id} opens on an unresolved physical state.`, progression:`${action} visibly changes scale, position and information across the frame.`, closing_frame:`${id} closes with a newly revealed physical state and clearer proof.` },
    camera:{ framing, movement_path:movement, movement_motivation:`The ${movement} follows the physical action and changes the audience question.`, lens_intent:lens, camera_distance:`${id} authored distance`, stabilization, focus_target:`proof detail ${id}`, focus_transition:`Focus stays on the changing proof detail throughout ${id}.` },
    lighting:{contrast:`contrast ${id}`,colour:`colour ${id}`}, production_design:{environment:`distinct environment ${id}`,props:`physical proof ${id}`}, audio:{source_sound:`physical sound ${id}`},
  };
}
test("bootstraps structural cinematic impact from an already-authored temporal plan without inference", () => {
  const plans = [
    ["s1","Sea approach","A distant machine enters the empty horizon.","The subject becomes legible and begins the approach.","Curiosity"],
    ["s2","Industrial reveal","The approach points toward an unresolved structure.","The structure resolves into a precise operational environment.","Awe"],
    ["s3","Precision payoff","The operational environment is understood but the final action is unresolved.","The final physical action lands with controlled precision.","Confidence"],
  ];
  const movements=["slow pan right","locked off static","dolly track left","tilt up on fluid head","locked tripod","crane rise"];
  const framings=["extreme wide","wide","medium wide","medium","close detail","hero wide"];
  const lenses=["18mm","24mm","35mm","50mm","85mm","28mm"];
  let cursor=0;
  const scenes=plans.map(([id,title,before,after,emotion],sceneIndex)=>({
    id,title,objective:`Advance ${title} through visible causality and new information.`,emotion,story_state_before:before,state_change:after,story_state_after:after,transition_logic:`The prior state causes ${title.toLowerCase()} to become the next visual question.`,
    location:{name:`Location ${id}`,atmosphere:`Atmosphere ${id} changes with light, scale and physical action.`,scale:`Scale ${id}`,reference_asset_id:`ref-${id}`},products:[{name:`Product ${id}`}],reference_asset_ids:[`ref-${id}`],tension:{pressure_before:sceneIndex*20+10,pressure_after:sceneIndex*20+30,payoff:sceneIndex===2?"The final precision action visibly resolves the sequence.":"NOT_YET"},
    shots:[0,1].map(()=>{const i=cursor++; return shot(`x${i+1}`,`The visible subject executes unique physical action ${i+1}, changing position, scale and proof state before the cut.`,framings[i],movements[i],lenses[i],i%2?"locked tripod":"fluid head tripod");}),
  }));
  const plan={workflow_kind:"TEMPORAL",concept:{hook:"A precise physical event appears where the audience expects only an empty environment.",creative_thesis:"Physical precision becomes visible proof rather than a claim.",emotional_promise:"Earned confidence through observed precision.",call_to_action:"Trust the demonstrated operational truth.",target_audience:{description:"Decision-makers evaluating whether this operation deserves confidence."},refused_devices:["Generic montage","Decorative VFX","Unmotivated camera movement"]},story:{audience_tension:"The audience is skeptical of generic claims and needs visible operational proof before believing the proposition.",observable_proof:"Each scene reveals a new physical state with specific machinery, geography and controlled action.",turn:"The environment resolves from distant ambiguity into precise operational proof.",escalation:"Every scene increases proximity, information and consequence until the final physical payoff.",resolution:"The final action resolves the visual question with controlled precision.",emotional_arc:"Curiosity → Awe → Confidence"},creative_review:{craft_risks:["Generic imagery","Repeated camera language","Weak physical causality"]},asset_manifest:[{asset_id:"ref-s1",reason:"Grounded source reference"}],scenes};
  const boot=bootstrapCinematicImpactFromPlan({plan});
  const understanding=CreativeCinematicImpactRuntime.validateUnderstanding(boot.understanding,3);
  const candidate={...boot.plan,cinematic_understanding:understanding,cinematic_impact_contract:{...boot.plan.cinematic_impact_contract,understanding_hash:understanding.understanding_hash}};
  const evaluation=CreativeCinematicImpactRuntime.evaluate(candidate);
  assert.equal(evaluation.passed,true,JSON.stringify(evaluation.failures));
  assert.equal(boot.inference_executed,false);
  assert.ok(new Set(candidate.scenes.flatMap(s=>s.shots).map(s=>s.camera.platform)).size>=2);
});

test("director loop keeps the independent semantic critique after deterministic bootstrap",()=>{
  const source=fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js","utf8");
  assert.match(source,/bootstrapCinematicImpactFromPlan/);
  assert.match(source,/if \(!deterministicBootstrapUsed\)/);
  assert.match(source,/const critiqueRun = await critiquePlan/);
  assert.match(source,/deterministic_bootstrap_used: deterministicBootstrapUsed/);
});


test("canonical project direction installs cinematic impact and reuses rich temporal coverage before inference", () => {
  const project = fs.readFileSync("lib/creative/director/runtime/CreativeProjectDirectionRuntime.js", "utf8");
  const coverage = fs.readFileSync("lib/creative/director/runtime/CreativeCinematicCoverageAuthoringRuntime.js", "utf8");
  assert.match(project, /CreativeCinematicImpactRuntime/);
  assert.match(coverage, /sourcePlanCanAuthorCoverage/);
  assert.match(coverage, /derived_from_validated_temporal_direction: true/);
  assert.match(coverage, /if \(validation\.passed\)/);
});

test("short-form hero impact quality allows coherent camera support without gaming platform diversity", () => {
  const source = fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js", "utf8");
  assert.match(source, /const shortFormHero = duration <= 6/);
  assert.match(source, /const distinctPlatformMinimum = shortFormHero[\s\S]*?\? 1/);
  assert.match(source, /if \(!shortFormHero && shots\.length >= 6 && new Set\(lensIntents\)\.size < 3\)/);
  assert.match(source, /if \(!shortFormHero && cameraSignatures\[index\] === cameraSignatures\[index - 1\]\)/);
});


test("short-form semantic critique uses a compact evidence packet and bounded output budget",()=>{
  const source=fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js","utf8");
  assert.match(source,/function critiqueEvidencePacket/);
  assert.match(source,/if \(duration <= 10\) return 1800/);
  assert.match(source,/COMPACT REVIEW EVIDENCE/);
  assert.doesNotMatch(source,/PLAN TO REVIEW\n\$\{JSON\.stringify\(plan\)\}/);
  assert.doesNotMatch(source,/maxOutputTokens: 9000/);
});

test("cinematic impact reasoning unwraps owned provider JSON text envelopes",()=>{
  const source=fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js","utf8");
  assert.match(source,/\["output", "result", "data", "response", "raw", "provider_result"\]/);
  assert.match(source,/current\.text \|\| current\.content/);
  assert.match(source,/parseReasoningJson\(candidate\)/);
});


test("one-shot cinematic understanding requires one substantial action instead of three artificial actions",()=>{
  const source=fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js","utf8");
  assert.match(source,/minimumHighValueActions = 3/);
  assert.match(source,/Math\.max\(1, Math\.min\(3, bootstrapShotCount \|\| 1\)\)/);
});
