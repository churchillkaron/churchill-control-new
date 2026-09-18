import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { CreativeCinematicMotionDesignRuntime } from '../lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignRuntime.js';
import { CreativeCinematicMotionDesignQualityRuntime } from '../lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignQualityRuntime.js';

function event(extra={}){return{type:'MATERIAL_TRANSFORMATION',governing_idea:'A physical intelligence core changes state as pressure builds.',physical_medium:'machined metal and glass',camera_relationship:'camera orbits while material change reveals internal scale',material_behavior:'matte dark alloy becomes polished energized metal with physically motivated highlights',transition_causality:'heat and internal pressure cause the material transition and reveal the next image',story_function:'make intelligence feel physical and consequential',primary_mechanic:'MATERIAL_PHASE_CHANGE',sound_events:[{frame:12,role:'MECHANICAL_LOCK',physical_source:'material shell',intensity:.8}],...extra};}

test('flagship motion design accepts authored world-space material transformation',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[event()],frames:72});
  assert.equal(plan.status,'READY');
  assert.equal(plan.flagship,true);
  assert.equal(plan.events[0].world_space,true);
  assert.equal(plan.policy.consumer_ai_equivalent_rejected,true);
  assert.equal(plan.policy.canva_after_effects_template_equivalent_rejected,true);
});

test('generic template animation cannot be the primary flagship mechanic',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[event({primary_mechanic:'GLOW'})]});
  assert.equal(plan.status,'BLOCKED');
  assert.ok(plan.blockers.some(x=>x.includes('CINEMATIC_MOTION_TEMPLATE_PRIMARY_FORBIDDEN')));
});

test('world-space typography requires exact text and exact font asset',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[event({type:'WORLD_SPACE_TYPOGRAPHY',exact_text:'AVANTIQO',font_asset_node_id:null})]});
  assert.equal(plan.status,'BLOCKED');
  assert.ok(plan.blockers.some(x=>x.includes('CINEMATIC_MOTION_EXACT_FONT_ASSET_REQUIRED')));
});

test('logo transformation cannot pass without exact terminal brand lock',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[event({type:'LOGO_TRANSFORMATION',logo_asset_node_id:'logo-1',final_brand_lock:true})]});
  assert.equal(plan.status,'READY');
  const evaluation=CreativeCinematicMotionDesignQualityRuntime.evaluate({plan,render:{contract:'AVANTIQO_CINEMATIC_MOTION_DESIGN_RENDER_V1',plan_contract_hash:plan.contract_hash,render_identity:'x',world_space_rendered:true,provider_calls_performed:false,generated_logo_pixels_used:false,exact_brand_lock_required:true,brand_lock_applied:false,sound_events:[{event_id:'x'}]}});
  assert.equal(evaluation.passed,false);
  assert.ok(evaluation.blockers.includes('CINEMATIC_MOTION_EXACT_BRAND_LOCK_REQUIRED'));
});

test('Blender renderer supports material property keyframes for cinematic transformations',()=>{
  const blender=fs.readFileSync('lib/creative/tools/runtime/CreativeBlenderRuntime.js','utf8');
  assert.match(blender,/material_keyframes/);
  assert.match(blender,/bsdf\.inputs\['Metallic'\]\.keyframe_insert/);
  assert.match(blender,/bsdf\.inputs\['Roughness'\]\.keyframe_insert/);
  assert.match(blender,/Emission Strength/);
});

test('cinematic motion capability is registered to Blender and not the 2D Remotion lane',()=>{
  const registry=fs.readFileSync('lib/creative/tools/registry/CreativeToolRegistry.js','utf8');
  const exec=fs.readFileSync('lib/creative/tools/runtime/CreativeToolExecutionRuntime.js','utf8');
  assert.match(registry,/CINEMATIC_MOTION_DESIGN: "creative\.motion\.cinematic-design"/);
  assert.match(exec,/CreativeCinematicMotionDesignRenderRuntime\.render/);
  assert.match(exec,/selected_tool_id === "blender" && capability === CREATIVE_TOOL_CAPABILITIES\.CINEMATIC_MOTION_DESIGN/);
});
