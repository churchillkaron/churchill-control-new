#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT="AVANTIQO_MUSIC_SFX_HUMAN_REVIEW_RESULT_V1";
const PREP="AVANTIQO_MUSIC_SFX_HUMAN_REVIEW_PREP_V1";
const text=(v)=>String(v??"").trim();
const arg=(p)=>text(process.argv.slice(2).find((e)=>e.startsWith(p))?.slice(p.length));
const req=(p,c)=>{const v=arg(p);if(!v)throw new Error(c);return v;};
const reviewPath=resolve(req("--review=","AVANTIQO_MUSIC_SFX_REVIEW_PATH_REQUIRED"));
const verdict=req("--verdict=","AVANTIQO_MUSIC_SFX_VERDICT_REQUIRED").toUpperCase();
if(!["APPROVED","REJECTED"].includes(verdict))throw new Error("AVANTIQO_MUSIC_SFX_VERDICT_INVALID");
const reviewer=req("--reviewer=","AVANTIQO_MUSIC_SFX_REVIEWER_REQUIRED");
const notes=arg("--notes=")||null;
const review=JSON.parse(await readFile(reviewPath,"utf8"));
if(review?.success!==true||review?.contract!==PREP||review?.human_review_status!=="PENDING"||review?.automatic_human_approval_forbidden!==true||Number(review?.minimum_average_score)!==92||review?.production_routing_allowed!==false||review?.activation_allowed!==false||review?.pricing_activation_allowed!==false)throw new Error("AVANTIQO_MUSIC_SFX_REVIEW_PACKET_INVALID");
const criteria=Array.isArray(review.criteria)?review.criteria:[];
if(criteria.length!==6)throw new Error("AVANTIQO_MUSIC_SFX_REVIEW_CRITERIA_INVALID");
const scored=criteria.map((criterion)=>{const id=text(criterion?.criterion);const raw=req(`--score-${id}=`,`AVANTIQO_MUSIC_SFX_SCORE_REQUIRED:${id}`);const score=Number(raw);if(!Number.isFinite(score)||score<0||score>100)throw new Error(`AVANTIQO_MUSIC_SFX_SCORE_INVALID:${id}`);return{id,score_0_to_100:score};});
const minimum=Math.min(...scored.map((x)=>x.score_0_to_100));
const average=scored.reduce((sum,x)=>sum+x.score_0_to_100,0)/scored.length;
if(verdict==="APPROVED"&&minimum<92)throw new Error(`AVANTIQO_MUSIC_SFX_REVIEW_SCORE_BELOW_POLICY:${minimum}`);
const result={success:true,contract:CONTRACT,generated_at:new Date().toISOString(),review_packet_path:reviewPath,benchmark_report_path:review.benchmark_report_path,benchmark_job_id:review.benchmark_job_id,capability:"ai.sfx.generate",reviewer,notes,human_review_required:true,human_review_status:verdict,criteria:scored,minimum_score_0_to_100:minimum,average_score:Number(average.toFixed(2)),minimum_average_score:92,automatic_human_approval_forbidden:true,all_criteria_minimum_92_required:true,eligible_for_later_release_decision:verdict==="APPROVED",production_routing_allowed:false,production_activation_allowed:false,pricing_activation_allowed:false,provider_jobs_submitted:0,production_activation_performed:false,pricing_activation_performed:false};
const output=resolve(arg("--output=")||`/tmp/music-sfx-human-review-${text(review.benchmark_job_id)||Date.now()}.json`);
await writeFile(output,`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify({success:true,contract:CONTRACT,human_review_status:verdict,minimum_score_0_to_100:minimum,average_score:result.average_score,eligible_for_later_release_decision:result.eligible_for_later_release_decision,output_path:output,production_activation_performed:false},null,2));
