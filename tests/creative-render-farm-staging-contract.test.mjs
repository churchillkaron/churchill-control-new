import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CreativeRenderFarmRuntime } from '../lib/creative/render-farm/runtime/CreativeRenderFarmRuntime.js';
import { CreativeProductionStagingRuntime } from '../lib/creative/storage/runtime/CreativeProductionStagingRuntime.js';

test('render farm chunks frames and prefers warm cache-affine capable worker',()=>{
  const plan=CreativeRenderFarmRuntime.plan({job:{job_id:'j1',engine:'CYCLES',frame_start:1,frame_end:24,chunk_size:8,scene_hash:'scene',material_library_hash:'mat',gpu_required:true},workers:[{worker_id:'cold',engines:['CYCLES'],gpu:true,warm:false,cost_weight:3,performance_weight:20},{worker_id:'warm',engines:['CYCLES'],gpu:true,warm:true,cost_weight:5,performance_weight:15}]});
  assert.equal(plan.status,'READY');
  assert.equal(plan.assignments.length,3);
  assert.ok(plan.assignments.every(x=>x.worker_id==='warm'));
});

test('verified completed chunk is reused and not rendered again',()=>{
  const base={job_id:'j2',engine:'CYCLES',frame_start:1,frame_end:16,chunk_size:8,scene_hash:'scene',material_library_hash:'mat'};
  const plan=CreativeRenderFarmRuntime.plan({job:base,workers:[{worker_id:'w',engines:['CYCLES'],gpu:true,warm:true}],completed_chunks:[{frame_start:1,frame_end:8,checksum:'abc'}]});
  assert.equal(plan.assignments[0].status,'REUSED');
  assert.equal(plan.assignments[1].status,'READY');
});

test('render verification requires checksum and exact frame count',()=>{
  const plan=CreativeRenderFarmRuntime.plan({job:{job_id:'j3',engine:'CYCLES',frame_start:1,frame_end:8,chunk_size:8,scene_hash:'scene',material_library_hash:'mat'},workers:[{worker_id:'w',engines:['CYCLES'],gpu:true}]});
  const bad=CreativeRenderFarmRuntime.verify({plan,results:[{chunk_id:plan.assignments[0].chunk_id,frame_count:7,checksum:'abc'}]});
  assert.equal(bad.passed,false);
  const ok=CreativeRenderFarmRuntime.verify({plan,results:[{chunk_id:plan.assignments[0].chunk_id,frame_count:8,checksum:'abc',bytes:100}]});
  assert.equal(ok.passed,true);
});

test('production staging uses immutable content-addressed project path',()=>{
  const manifest=CreativeProductionStagingRuntime.manifest({organization_id:'org',creative_project_id:'project',job_id:'render-1',items:[{item_id:'f1',role:'FRAME',frame:1,file_name:'frame0001.exr',mime_type:'image/x-exr',checksum:'abc'}]});
  assert.match(manifest.base_path,/org\/project\/production-cache\/render-1/);
  assert.equal(manifest.policy.content_addressable_reuse,true);
  assert.equal(manifest.policy.immutable_frame_cache,true);
});

test('render-farm executor dispatches assigned chunks to remote workers without local fallback',()=>{
  const source=fs.readFileSync('lib/creative/render-farm/runtime/CreativeRenderFarmExecutionRuntime.js','utf8');
  assert.match(source,/CreativeDistributedRenderWorkerRuntime\.dispatch/);
  assert.match(source,/workers,fetch_impl/);
  assert.match(source,/Promise\.all/);
  assert.match(source,/distributed_worker_execution:true/);
  assert.match(source,/local_render_fallback_used:false/);
  assert.match(source,/whole_job_retry_performed:false/);
  assert.doesNotMatch(source,/CreativeCyclesProductionRenderRuntime/);
});
