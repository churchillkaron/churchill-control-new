import test from 'node:test';
import assert from 'node:assert/strict';
import { CreativeGeneratedMediaPerceptualExecutionGate as gate } from '../lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js';

test('owned Vision nested envelope normalizes scores, frame count, and plural artifacts',()=>{
 const task={output:{raw:{output:{analysis_frame_count:7,result:{passed:true,scores:{overall:95,story:96,environment:97,camera:98,anatomy:99,identity:99,product_fidelity:99,music_energy:96,performance:97,continuity:98,physics:98,artifacts:99},failures:[],repair_instructions:[]}}}}};
 const e=gate.resultEvidence(task);
 assert.equal(e.score_contract.complete,true);
 assert.equal(e.analyzed_image_count,7);
 assert.equal(e.artifact_score,99);
 assert.equal(e.overall_score,95);
});

test('strict validation overrides provider passed=true when scores miss thresholds',()=>{
 const task={metadata:{media_kind:'VIDEO',thresholds:{minimum_overall_score:95,minimum_camera_score:96,minimum_artifact_score:98}},input:{requirements:{expected_contract:{media_kind:'VIDEO'}}},output:{raw:{output:{analysis_frame_count:7,result:{passed:true,scores:{overall:90,story:95,environment:95,camera:90,anatomy:95,identity:95,product_fidelity:95,music_energy:95,performance:95,continuity:95,physics:95,artifacts:90},failures:[],repair_instructions:[]}}}}};
 const v=gate.validation(task);
 assert.equal(v.passed,false);
 assert.equal(v.checks.overall,false);
 assert.equal(v.checks.camera,false);
 assert.equal(v.checks.artifacts,false);
});
