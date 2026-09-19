#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const BENCHMARK_CONTRACT='AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3';
const CONFIG=Object.freeze({
  'ai.audio.edit':{technical:'edit_technical_proven',review:'AVANTIQO_MUSIC_EDIT_HUMAN_REVIEW_RESULT_V1'},
  'ai.audio.remix':{technical:'remix_variation_technical_proven',review:'AVANTIQO_MUSIC_REMIX_VARIATION_HUMAN_REVIEW_RESULT_V1'},
  'ai.audio.extend':{technical:'temporal_extension_technical_proven',review:'AVANTIQO_MUSIC_TRANSFORM_HUMAN_REVIEW_RESULT_V1'},
});
const text=(v)=>String(v??'').trim();
const capability=text(process.env.AVANTIQO_MUSIC_TRANSFORM_PROMOTION_CAPABILITY);
if(!CONFIG[capability]) throw new Error('AVANTIQO_MUSIC_TRANSFORM_PROMOTION_CAPABILITY_REQUIRED');
const benchmarkPath=resolve(text(process.env.AVANTIQO_MUSIC_TRANSFORM_PROMOTION_BENCHMARK_REPORT)||'');
const reviewPath=resolve(text(process.env.AVANTIQO_MUSIC_TRANSFORM_PROMOTION_HUMAN_REVIEW_RESULT)||'');
if(!text(process.env.AVANTIQO_MUSIC_TRANSFORM_PROMOTION_BENCHMARK_REPORT)) throw new Error('AVANTIQO_MUSIC_TRANSFORM_PROMOTION_BENCHMARK_REPORT_REQUIRED');
if(!text(process.env.AVANTIQO_MUSIC_TRANSFORM_PROMOTION_HUMAN_REVIEW_RESULT)) throw new Error('AVANTIQO_MUSIC_TRANSFORM_PROMOTION_HUMAN_REVIEW_RESULT_REQUIRED');
let benchmark; let review;
try {
  [benchmark,review]=await Promise.all([readFile(benchmarkPath,'utf8').then(JSON.parse),readFile(reviewPath,'utf8').then(JSON.parse)]);
} catch (error) {
  console.error(JSON.stringify({success:false,contract:'AVANTIQO_MUSIC_TRANSFORM_PROMOTION_PLAN_V1',mode:'PLAN_ONLY',capability,failures:[error?.code==='ENOENT'?'PROMOTION_EVIDENCE_FILE_MISSING':'PROMOTION_EVIDENCE_READ_FAILED'],provider_certification_mutation_performed:false,production_routing_mutation_performed:false,pricing_activation_performed:false,production_deploy_performed:false},null,2));
  process.exit(1);
}
const cfg=CONFIG[capability];
const failures=[];
const check=(ok,code)=>{if(!ok) failures.push(code);};
check(text(benchmark?.contract)===BENCHMARK_CONTRACT,'BENCHMARK_CONTRACT_INVALID');
check(benchmark?.passed===true,'BENCHMARK_PASS_REQUIRED');
check(text(benchmark?.capability)===capability,'BENCHMARK_CAPABILITY_MISMATCH');
check(benchmark?.provider_jobs_submitted===1,'SINGLE_PROVIDER_JOB_EVIDENCE_REQUIRED');
check(benchmark?.[cfg.technical]===true,'CAPABILITY_TECHNICAL_PROOF_REQUIRED');
check(benchmark?.eligible_for_human_release_review===true,'HUMAN_REVIEW_ELIGIBILITY_REQUIRED');
check(benchmark?.production_activation_allowed===false,'BENCHMARK_MUST_BE_PREPRODUCTION');
check(benchmark?.output?.certification_candidate===true,'CERTIFICATION_CANDIDATE_REQUIRED');
check(benchmark?.output?.production_certified===false,'BENCHMARK_OUTPUT_MUST_NOT_BE_PRODUCTION_CERTIFIED');
check(text(review?.contract)===cfg.review,'HUMAN_REVIEW_CONTRACT_INVALID');
check(review?.success===true,'HUMAN_REVIEW_SUCCESS_REQUIRED');
check(text(review?.capability)===capability,'HUMAN_REVIEW_CAPABILITY_MISMATCH');
check(text(review?.benchmark_job_id)===text(benchmark?.job_id),'BENCHMARK_JOB_BINDING_REQUIRED');
check(text(review?.human_review_status).toUpperCase()==='APPROVED','HUMAN_REVIEW_APPROVAL_REQUIRED');
check(Boolean(text(review?.reviewer)),'HUMAN_REVIEWER_REQUIRED');
check(review?.eligible_for_later_release_decision===true,'LATER_RELEASE_ELIGIBILITY_REQUIRED');
check(review?.automatic_human_approval_forbidden===true,'AUTOMATIC_HUMAN_APPROVAL_MUST_BE_FORBIDDEN');
check(Array.isArray(review?.criterion_scores)&&review.criterion_scores.length===6,'SCORED_HUMAN_REVIEW_REQUIRED');
check(Number(review?.average_score)>=92,'HUMAN_REVIEW_AVERAGE_92_REQUIRED');
check(Number(review?.minimum_average_score)===92,'HUMAN_REVIEW_THRESHOLD_BINDING_REQUIRED');
check(review?.production_activation_allowed===false,'HUMAN_REVIEW_MUST_BE_PREPRODUCTION');
if(failures.length){console.error(JSON.stringify({success:false,contract:'AVANTIQO_MUSIC_TRANSFORM_PROMOTION_PLAN_V1',mode:'PLAN_ONLY',capability,failures,provider_certification_mutation_performed:false,production_routing_mutation_performed:false,pricing_activation_performed:false,production_deploy_performed:false},null,2));process.exit(1);}
const current=text(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES).split(',').map((x)=>x.trim()).filter(Boolean);
const proposed=[...new Set(['ai.music.generate',...current,capability])];
console.log(JSON.stringify({success:true,contract:'AVANTIQO_MUSIC_TRANSFORM_PROMOTION_PLAN_V1',mode:'PLAN_ONLY',capability,benchmark_job_id:benchmark.job_id,human_reviewer:review.reviewer,human_review_average_score:review.average_score,proposed_changes:{provider_certification:{environment_variable:'AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES',current:current.length?current:['ai.music.generate'],proposed,apply_requires_explicit_operator_approval:true},production_routing:{capability,proposed:true,apply_requires_explicit_operator_approval:true},pricing:{capability,proposed_status:'KEEP_INACTIVE_UNTIL_SEPARATE_PRICING_APPROVAL',apply_requires_explicit_operator_approval:true}},provider_certification_mutation_performed:false,production_routing_mutation_performed:false,pricing_activation_performed:false,production_deploy_performed:false,activation_allowed_without_explicit_operator_approval:false,next_action:'EXPLICIT_OPERATOR_PROMOTION_APPROVAL_REQUIRED'},null,2));
