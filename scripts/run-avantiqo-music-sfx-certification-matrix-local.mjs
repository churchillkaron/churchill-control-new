#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { MUSIC_SFX_CERTIFICATION_FIXTURES } from "./music-sfx-certification-fixtures.mjs";

const CONTRACT="AVANTIQO_MUSIC_SFX_CERTIFICATION_MATRIX_RUN_V1";
const text=(v)=>String(v??"").trim();
const ceiling=Number(process.env.AVANTIQO_MUSIC_SFX_MATRIX_SPEND_CEILING_THB||0);
const approved=text(process.env.AVANTIQO_MUSIC_SFX_MATRIX_SPEND_APPROVED).toUpperCase()==="YES";
const planOnly=text(process.env.AVANTIQO_MUSIC_SFX_MATRIX_PLAN_ONLY).toUpperCase()==="YES";
const root=path.resolve(process.env.AVANTIQO_MUSIC_SFX_MATRIX_OUTPUT_DIR||"/tmp/avantiqo-music-sfx-matrix");
const seedReport=text(process.env.AVANTIQO_MUSIC_SFX_MATRIX_SEED_REPORT);
if(!approved&&!planOnly) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_SPEND_APPROVED=YES_REQUIRED");
if(!Number.isFinite(ceiling)||ceiling<=0) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_SPEND_CEILING_THB_REQUIRED");
await mkdir(root,{recursive:true});

const reports=[];
let spent=0;
if(seedReport){
  const seed=JSON.parse(await readFile(path.resolve(seedReport),"utf8"));
  const exactLegacyAlarm=seed?.fixture_id==null&&seed?.category==null&&seed?.instruction===MUSIC_SFX_CERTIFICATION_FIXTURES[0].instruction&&seed?.product_model==="avantiqo-sfx-v1"&&seed?.foundation_model==="OpenMOSS-Team/MOSS-SoundEffect-v2.0";
  const exactCurrentAlarm=seed?.fixture_id==="alarm_clock"&&seed?.category==="mechanical_real_world";
  if(seed?.contract!=="AVANTIQO_MUSIC_SFX_CERTIFICATION_V1"||(!exactCurrentAlarm&&!exactLegacyAlarm)||seed?.economics_measured!==true) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_SEED_INVALID");
  reports.push({fixture_id:"alarm_clock",category:"mechanical_real_world",report_path:path.resolve(seedReport),cost_thb:Number(seed.conservative_supplier_cost_thb||0),seeded:true,legacy_seed:exactLegacyAlarm});
}
if(planOnly){
  const missing=MUSIC_SFX_CERTIFICATION_FIXTURES.filter((fixture)=>!reports.some((item)=>item.fixture_id===fixture.id));
  console.log(JSON.stringify({success:true,contract:CONTRACT,mode:"PLAN_ONLY",aggregate_spend_ceiling_thb:ceiling,seeded_fixture_ids:reports.map((item)=>item.fixture_id),missing_fixtures:missing.map(({id,category,duration_seconds})=>({id,category,duration_seconds})),provider_jobs_planned:missing.length,provider_jobs_submitted:0,production_activation_performed:false},null,2));
  process.exit(0);
}
for(const fixture of MUSIC_SFX_CERTIFICATION_FIXTURES){
  if(reports.some((item)=>item.fixture_id===fixture.id)) continue;
  const remaining=ceiling-spent;
  if(remaining<=0) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_AGGREGATE_SPEND_CEILING_REACHED");
  const dir=path.join(root,fixture.id); await mkdir(dir,{recursive:true});
  const reportPath=path.join(dir,"sfx-certification-report.json");
  const env={...process.env,AVANTIQO_MUSIC_SFX_CERTIFICATION_SPEND_APPROVED:"YES",AVANTIQO_MUSIC_SFX_CERTIFICATION_SPEND_CEILING_THB:String(remaining),AVANTIQO_MUSIC_SFX_CERTIFICATION_FIXTURE_ID:fixture.id,AVANTIQO_MUSIC_SFX_CERTIFICATION_OUTPUT:reportPath};
  const run=spawnSync(process.execPath,["scripts/run-avantiqo-music-sfx-certification-local.mjs"],{cwd:process.cwd(),env,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(run.status!==0) throw new Error(`AVANTIQO_MUSIC_SFX_MATRIX_FIXTURE_FAILED:${fixture.id}:${text(run.stderr||run.stdout)}`);
  const report=JSON.parse(await readFile(reportPath,"utf8"));
  const cost=Number(report.conservative_supplier_cost_thb||0); spent+=cost;
  if(spent>ceiling) throw new Error("AVANTIQO_MUSIC_SFX_MATRIX_AGGREGATE_SPEND_CEILING_EXCEEDED");
  const reviewDir=path.join(dir,"review");
  const prep=spawnSync(process.execPath,["scripts/prepare-avantiqo-music-sfx-human-review.mjs",`--report=${reportPath}`,`--dir=${reviewDir}`],{cwd:process.cwd(),env:process.env,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  if(prep.status!==0) throw new Error(`AVANTIQO_MUSIC_SFX_MATRIX_REVIEW_PREP_FAILED:${fixture.id}:${text(prep.stderr||prep.stdout)}`);
  reports.push({fixture_id:fixture.id,category:fixture.category,report_path:reportPath,review_path:path.join(reviewDir,"sfx-human-review.json"),audio_path:path.join(reviewDir,"sfx-output.wav"),cost_thb:cost,seeded:false});
}
const manifest={success:true,contract:CONTRACT,generated_at:new Date().toISOString(),aggregate_spend_ceiling_thb:ceiling,aggregate_measured_cost_thb:Number(spent.toFixed(6)),fixture_count:reports.length,reports,all_required_fixtures_present:MUSIC_SFX_CERTIFICATION_FIXTURES.every((fixture)=>reports.some((item)=>item.fixture_id===fixture.id)),human_review_status:"PENDING",production_routing_allowed:false,production_activation_performed:false,pricing_activation_performed:false};
const manifestPath=path.join(root,"sfx-certification-matrix-run.json"); await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
console.log(JSON.stringify({success:true,contract:CONTRACT,manifest_path:manifestPath,aggregate_measured_cost_thb:manifest.aggregate_measured_cost_thb,fixture_count:manifest.fixture_count,human_review_status:"PENDING",production_activation_performed:false},null,2));
