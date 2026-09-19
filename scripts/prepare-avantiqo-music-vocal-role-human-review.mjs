#!/usr/bin/env node
import {readFile,writeFile} from "node:fs/promises";import {resolve} from "node:path";
const B="AVANTIQO_MUSIC_VOCAL_ROLE_BENCHMARK_V1",R="AVANTIQO_MUSIC_VOCAL_ROLE_HUMAN_REVIEW_V1",text=v=>String(v??"").trim();
const input=resolve(process.env.AVANTIQO_MUSIC_VOCAL_ROLE_BENCHMARK_OUTPUT||"/tmp/avantiqo-music-vocal-role-benchmark.json"),b=JSON.parse(await readFile(input,"utf8"));if(b.contract!==B||b.success!==true||b.benchmark_execution_passed!==true||b.production_certified!==false)throw new Error("AVANTIQO_MUSIC_VOCAL_ROLE_PASSED_BENCHMARK_REQUIRED");
const criteria=[
["lead_vocal_isolation","Lead vocal isolation",92,"Lead is intelligible and focused without material backing/harmony contamination."],
["supporting_vocal_preservation","Backing / harmony preservation",92,"Backing, harmony, choir and ad-lib material is retained in the supporting-vocal output."],
["lead_bleed_control","Lead bleed control",92,"Supporting-vocal output does not contain distracting lead-vocal residue."],
["instrumental_bleed_control","Instrumental bleed control",90,"Lead and supporting vocal outputs remain useful without destructive instrumental leakage."],
["timing_preservation","Timing preservation",95,"Lead, supporting vocals and instrumental remain sample/timeline aligned to the original performance."],
["artifact_control","Artifact control",92,"No unacceptable metallic smearing, pumping, phasing or transient destruction."],
["emotional_and_phrase_integrity","Emotional / phrase integrity",92,"Vocal phrasing, vibrato and expressive shape remain musically intact."],
["commercial_readiness","Commercial Studio readiness",92,"The split is strong enough for professional lead-only removal, remixing and vocal production."],
];
const review={contract:R,generated_at:new Date().toISOString(),benchmark_id:b.benchmark_id,benchmark_path:input,storage_references:b.storage_references,pipeline:b.pipeline,technical_timing_check_passed:b.technical_timing_check_passed===true,model_license_verified:b.model_license_verified===true,model_license_status:b.model_license_status||"UNRESOLVED_RESEARCH_GATE",reviewer:"",reviewed_at:null,human_review_status:"PENDING",minimum_average_score:92,minimum_score_per_criterion:criteria.map(([id,,min])=>({id,minimum_score:min})),automatic_score_generation_forbidden:true,automatic_human_approval_forbidden:true,criteria:criteria.map(([id,label,minimum_score,guidance])=>({id,label,minimum_score,guidance,score_0_to_100:null,evidence_note:""})),production_certified:false,production_routing_allowed:false,activation_allowed:false};
const out=resolve(process.env.AVANTIQO_MUSIC_VOCAL_ROLE_HUMAN_REVIEW_OUTPUT||"/tmp/avantiqo-music-vocal-role-human-review.json");await writeFile(out,`${JSON.stringify(review,null,2)}\n`);console.log(JSON.stringify({success:true,contract:R,output_path:out,review_status:"PENDING",model_license_status:review.model_license_status,production_certified:false},null,2));
