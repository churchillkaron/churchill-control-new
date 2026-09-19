#!/usr/bin/env node
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MUSIC_SFX_CERTIFICATION_FIXTURES } from "./music-sfx-certification-fixtures.mjs";

const CONTRACT="AVANTIQO_MUSIC_SFX_MATRIX_OPERATOR_APPROVAL_V1";
const RUN_CONTRACT="AVANTIQO_MUSIC_SFX_CERTIFICATION_MATRIX_RUN_V1";
const text=(v)=>String(v??"").trim();
const arg=(p)=>text(process.argv.slice(2).find((x)=>x.startsWith(p))?.slice(p.length));
const manifestPath=path.resolve(arg("--manifest=")||"");
const reviewer=arg("--reviewer=");
const decision=arg("--decision=").toUpperCase();
if(!manifestPath) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_MANIFEST_REQUIRED");
if(!reviewer) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_REVIEWER_REQUIRED");
if(decision!=="APPROVED") throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_EXPLICIT_APPROVAL_REQUIRED");
const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
if(manifest?.contract!==RUN_CONTRACT||manifest?.all_required_fixtures_present!==true||Number(manifest?.fixture_count)!==6||manifest?.production_routing_allowed!==false) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_MANIFEST_INVALID");
const items=[];
for(const fixture of MUSIC_SFX_CERTIFICATION_FIXTURES){
  const entry=manifest.reports?.find((item)=>item.fixture_id===fixture.id);
  if(!entry?.report_path) throw new Error(`AVANTIQO_MUSIC_SFX_MATRIX_ENTRY_REQUIRED:${fixture.id}`);
  const cert=JSON.parse(await readFile(entry.report_path,"utf8"));
  const legacyAlarm=fixture.id==="alarm_clock"&&cert?.contract==="AVANTIQO_MUSIC_SFX_CERTIFICATION_V1"&&cert?.instruction===fixture.instruction;
  const current=cert?.contract==="AVANTIQO_MUSIC_SFX_CERTIFICATION_V2"&&cert?.fixture_id===fixture.id&&cert?.fixture_category===fixture.category;
  if((!legacyAlarm&&!current)||cert?.benchmark_certified!==true||cert?.economics_measured!==true||cert?.model_license_verified!==true||!text(cert?.job_id)) throw new Error(`AVANTIQO_MUSIC_SFX_MATRIX_CERT_INVALID:${fixture.id}`);
  let technicalQualityPath=entry.review_path?path.join(path.dirname(entry.review_path),"sfx-technical-quality.json"):null;
  if(fixture.id==="alarm_clock") technicalQualityPath=path.join(path.dirname(manifestPath),"..","clean-rerun-20260916","review","sfx-technical-quality.json");
  const qa=JSON.parse(await readFile(path.resolve(technicalQualityPath),"utf8"));
  if(qa?.technical_quality_passed!==true) throw new Error(`AVANTIQO_MUSIC_SFX_MATRIX_TECHNICAL_QA_REQUIRED:${fixture.id}`);
  items.push({fixture_id:fixture.id,category:fixture.category,job_id:cert.job_id,certification_path:path.resolve(entry.report_path),technical_quality_path:path.resolve(technicalQualityPath),cost_thb:Number(cert.conservative_supplier_cost_thb||0)});
}
const canonical=JSON.stringify(items.map(({fixture_id,category,job_id})=>({fixture_id,category,job_id})));
const result={success:true,contract:CONTRACT,generated_at:new Date().toISOString(),matrix_manifest_path:manifestPath,reviewer,decision:"APPROVED",review_mode:"EXPLICIT_OPERATOR_MATRIX_ATTESTATION",attestation:"Operator explicitly approved the complete six-category SFX listening matrix after human listening. No numeric per-criterion scores were asserted or inferred.",numeric_scores_asserted:false,automatic_score_inference_forbidden:true,sample_count:items.length,items,evidence_set_sha256:crypto.createHash("sha256").update(canonical).digest("hex"),human_review_status:"APPROVED",production_routing_allowed:false,activation_allowed:false,pricing_activation_allowed:false,production_activation_performed:false};
const output=path.resolve(arg("--output=")||path.join(path.dirname(manifestPath),"sfx-matrix-operator-approval.json"));
await writeFile(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({success:true,contract:CONTRACT,reviewer,decision:"APPROVED",sample_count:items.length,output_path:output,numeric_scores_asserted:false,production_activation_performed:false},null,2));
