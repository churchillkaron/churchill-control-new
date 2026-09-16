#!/usr/bin/env node
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES } from "./music-sfx-certification-fixtures.mjs";

const CONTRACT="AVANTIQO_MUSIC_SFX_CERTIFICATION_MATRIX_V1";
const CERT="AVANTIQO_MUSIC_SFX_CERTIFICATION_V2";
const REVIEW="AVANTIQO_MUSIC_SFX_HUMAN_REVIEW_RESULT_V1";
const text=(v)=>String(v??"").trim();
const arg=(p)=>text(process.argv.slice(2).find((e)=>e.startsWith(p))?.slice(p.length));
const paths=arg("--pairs=").split(",").map((x)=>x.trim()).filter(Boolean);
if(paths.length!==6) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_SIX_PAIRS_REQUIRED");
const categories=new Set(); const items=[]; let totalThb=0;
for(const pair of paths){
  const [certPathRaw,reviewPathRaw]=pair.split("::");
  if(!certPathRaw||!reviewPathRaw) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_PAIR_INVALID");
  const certPath=resolve(certPathRaw), reviewPath=resolve(reviewPathRaw);
  const cert=JSON.parse(await readFile(certPath,"utf8")); const review=JSON.parse(await readFile(reviewPath,"utf8"));
  if(cert?.contract!==CERT||cert?.benchmark_certified!==true||cert?.economics_measured!==true||cert?.model_license_verified!==true) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_CERT_INVALID");
  if(review?.contract!==REVIEW||review?.human_review_status!=="APPROVED"||review?.eligible_for_later_release_decision!==true||review?.technical_quality_passed!==true||Number(review?.minimum_score_0_to_100)<92||Number(review?.average_score)<92) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_REVIEW_INVALID");
  if(text(review?.benchmark_job_id)!==text(cert?.job_id)) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_JOB_BINDING_INVALID");
  const category=text(cert?.fixture_category); if(!category) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_CATEGORY_REQUIRED"); categories.add(category);
  totalThb+=Number(cert?.conservative_supplier_cost_thb||0);
  items.push({fixture_id:cert.fixture_id,category,job_id:cert.job_id,certification_path:certPath,human_review_path:reviewPath,reviewer:text(review.reviewer),cost_thb:Number(cert.conservative_supplier_cost_thb),minimum_score:Number(review.minimum_score_0_to_100),average_score:Number(review.average_score)});
}
for(const category of MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES){ if(!categories.has(category)) throw new Error(`AVANTIQO_MUSIC_SFX_MATRIX_CATEGORY_MISSING:${category}`); }
const canonical=JSON.stringify(items.map(({job_id,category,minimum_score,average_score})=>({job_id,category,minimum_score,average_score})));
const evidenceFingerprint=crypto.createHash("sha256").update(canonical).digest("hex");
const out={success:true,contract:CONTRACT,generated_at:new Date().toISOString(),capability:"ai.sfx.generate",provider:"avantiqo-audio",product_model:"avantiqo-sfx-v1",foundation_model:"OpenMOSS-Team/MOSS-SoundEffect-v2.0",required_categories:[...MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES],sample_count:items.length,items,total_supplier_cost_thb:Number(totalThb.toFixed(6)),benchmark_certified:true,economics_certified:true,human_quality_certified:true,matrix_certified:true,model_license_verified:true,human_review_status:"APPROVED",human_reviewers:[...new Set(items.map((x)=>x.reviewer).filter(Boolean))],human_review_minimum_score:Math.min(...items.map((x)=>x.minimum_score)),human_review_average_score:Number((items.reduce((s,x)=>s+x.average_score,0)/items.length).toFixed(2)),certification_evidence_sha256:evidenceFingerprint,production_routing_allowed:false,activation_allowed:false,pricing_activation_allowed:false,production_deployment_performed:false};
const output=resolve(arg("--output=")||"/tmp/avantiqo-music-sfx-certification-matrix-evidence.json"); await writeFile(output,`${JSON.stringify(out,null,2)}\n`); console.log(JSON.stringify({success:true,contract:CONTRACT,sample_count:6,total_supplier_cost_thb:out.total_supplier_cost_thb,human_review_minimum_score:out.human_review_minimum_score,output_path:output,production_activation_performed:false},null,2));
