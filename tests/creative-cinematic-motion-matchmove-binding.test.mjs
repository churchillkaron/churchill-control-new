import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeCinematicMotionDesignRuntime } from '../lib/creative/motion-graphics/runtime/CreativeCinematicMotionDesignRuntime.js';

function common(extra={}){return{type:'MATERIAL_TRANSFORMATION',governing_idea:'Tracked CG material state change.',physical_medium:'metal',camera_relationship:'locked to photographed camera',material_behavior:'surface changes physically',transition_causality:'mechanical state creates next image',story_function:'physical consequence',primary_mechanic:'MATERIAL_PHASE_CHANGE',sound_events:[{frame:10,role:'IMPACT',physical_source:'metal'}],integration_mode:'SOURCE_WORLD_INTEGRATED',...extra};}

test('tracked world CGI requires matchmove plus depth',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[common({integration_fidelity:'TRACKED_WORLD_3D',depth_asset_node_id:'depth'})]});
  assert.equal(plan.status,'BLOCKED');
  assert.ok(plan.blockers.some(x=>x.includes('CINEMATIC_MOTION_3D_MATCHMOVE_BINDING_REQUIRED')));
});

test('tracked world CGI passes with governed matchmove plus depth',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[common({integration_fidelity:'TRACKED_WORLD_3D',matchmove_asset_node_id:'mm',depth_asset_node_id:'depth'})]});
  assert.equal(plan.status,'READY');
});

test('single-view constrained CGI uses camera proxy plus depth without authorizing tracked 3D',()=>{
  const plan=CreativeCinematicMotionDesignRuntime.plan({events:[common({integration_fidelity:'SINGLE_VIEW_CONSTRAINED',camera_solution_asset_node_id:'cam',depth_asset_node_id:'depth'})]});
  assert.equal(plan.status,'READY');
  assert.equal(plan.events[0].integration_fidelity,'SINGLE_VIEW_CONSTRAINED');
});

test('materializer binds only world-space-authorized matchmove artifacts for tracked CGI',()=>{
  const source=fs.readFileSync('lib/creative/motion-graphics/runtime/CreativeCinematicMotionTaskMaterializationRuntime.js','utf8');
  assert.match(source,/artifact_kind\)\.toUpperCase\(\)==="MATCHMOVE_3D"/);
  assert.match(source,/matchmove_world_space_cgi_allowed===true/);
  assert.match(source,/matchmove_asset_node_id/);
});

test('matchmove artifact persists explicit world-space authority',()=>{
  const source=fs.readFileSync('lib/creative/tracking/runtime/CreativeMatchmoveArtifactRuntime.js','utf8');
  assert.match(source,/artifact_kind:"MATCHMOVE_3D"/);
  assert.match(source,/matchmove_world_space_cgi_allowed/);
  assert.match(source,/CreativeReconstructionArtifactRuntime\.persistJson/);
});
