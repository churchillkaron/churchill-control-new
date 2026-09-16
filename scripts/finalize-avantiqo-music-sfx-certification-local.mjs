#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const CERT="AVANTIQO_MUSIC_SFX_CERTIFICATION_V1",REVIEW="AVANTIQO_MUSIC_SFX_HUMAN_REVIEW_RESULT_V1";
const text=(v)=>String(v??"").trim();const arg=(p)=>text(process.argv.slice(2).find((e)=>e.startsWith(p))?.slice(p.length));const req=(p,c)=>{const v=arg(p);if(!v)throw new Error(c);return resolve(v);};
const certPath=req("--cert=","AVANTIQO_MUSIC_SFX_CERTIFICATION_REQUIRED"),reviewPath=req("--review=","AVANTIQO_MUSIC_SFX_HUMAN_REVIEW_REQUIRED");
const cert=JSON.parse(await readFile(certPath,"utf8")),review=JSON.parse(await readFile(reviewPath,"utf8"));
if(cert?.contract!==CERT||cert?.benchmark_certified!==true||cert?.economics_measured!==true||cert?.model_license_verified!==true)throw new Error("AVANTIQO_MUSIC_SFX_CERTIFICATION_INVALID");
if(review?.contract!==REVIEW||review?.human_review_status!=="APPROVED"||review?.eligible_for_later_release_decision!==true||review?.automatic_human_approval_forbidden!==true||Number(review?.minimum_score_0_to_100)<92||Number(review?.average_score)<92)throw new Error("AVANTIQO_MUSIC_SFX_HUMAN_REVIEW_NOT_APPROVED");
if(text(review?.benchmark_job_id)!==text(cert?.job_id))throw new Error("AVANTIQO_MUSIC_SFX_REVIEW_JOB_BINDING_INVALID");
const out={...cert,generated_at:new Date().toISOString(),source_certification_path:certPath,human_review_result_path:reviewPath,economics_certified:true,human_quality_certified:true,human_review_status:"APPROVED",human_reviewer:review.reviewer,human_review_minimum_score:review.minimum_score_0_to_100,human_review_average_score:review.average_score,production_routing_allowed:false,activation_allowed:false,pricing_activation_allowed:false,production_deployment_performed:false};
const output=resolve(arg("--output=")||"/tmp/avantiqo-music-sfx-certification-evidence.json");await writeFile(output,`${JSON.stringify(out,null,2)}\n`);console.log(JSON.stringify({success:true,contract:CERT,economics_certified:true,human_quality_certified:true,output_path:output,production_activation_performed:false},null,2));
