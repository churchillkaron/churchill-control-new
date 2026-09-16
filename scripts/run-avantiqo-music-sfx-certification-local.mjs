#!/usr/bin/env node
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { MUSIC_SFX_CERTIFICATION_FIXTURES } from "./music-sfx-certification-fixtures.mjs";

loadAvantiqoEnv();
const CONTRACT="AVANTIQO_MUSIC_SFX_CERTIFICATION_V2";
const CAPABILITY="ai.sfx.generate";
const PRODUCT_MODEL="avantiqo-sfx-v1";
const FOUNDATION_MODEL="OpenMOSS-Team/MOSS-SoundEffect-v2.0";
const APP_NAME="avantiqo-sfx-owned";
const FUNCTION_NAME="generate";
const BUCKET="creative-assets";
const MODAL_A10G_USD_PER_SECOND=0.000306;
const FX_THB_PER_USD=32.9794;
const CEILING=Number(process.env.AVANTIQO_MUSIC_SFX_CERTIFICATION_SPEND_CEILING_THB||0);
const text=(v)=>String(v??"").trim();
const required=(n)=>{const v=text(process.env[n]); if(!v) throw new Error(`${n}_REQUIRED`); return v;};
if(text(process.env.AVANTIQO_MUSIC_SFX_CERTIFICATION_SPEND_APPROVED).toUpperCase()!=="YES") throw new Error("AVANTIQO_MUSIC_SFX_CERTIFICATION_SPEND_APPROVED=YES_REQUIRED");
if(!Number.isFinite(CEILING)||CEILING<=0) throw new Error("AVANTIQO_MUSIC_SFX_CERTIFICATION_SPEND_CEILING_THB_REQUIRED");

const fixtureId=text(process.env.AVANTIQO_MUSIC_SFX_CERTIFICATION_FIXTURE_ID)||"alarm_clock";
const fixture=MUSIC_SFX_CERTIFICATION_FIXTURES.find((item)=>item.id===fixtureId);
if(!fixture) throw new Error(`AVANTIQO_MUSIC_SFX_CERTIFICATION_FIXTURE_INVALID:${fixtureId}`);
const benchmarkId=`sfx-${fixture.id}-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
const organizationId=`benchmark-${crypto.randomUUID()}`;
const outputPath=`${organizationId}/benchmark/music-sfx/${benchmarkId}/${fixture.file_name}`;
const outputReference=`storage://${BUCKET}/${outputPath}`;
const supabase=createClient(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const {data:upload,error:uploadError}=await supabase.storage.from(BUCKET).createSignedUploadUrl(outputPath,{upsert:false});
if(uploadError||!upload?.signedUrl) throw uploadError||new Error("AVANTIQO_MUSIC_SFX_CERTIFICATION_UPLOAD_REQUIRED");
const instruction=fixture.instruction;
const payload={ capability:CAPABILITY, instruction, duration_seconds:fixture.duration_seconds,
  storage_upload:{signed_url:upload.signedUrl,storage_reference:outputReference},
  structured_specification:{generation:{duration_seconds:fixture.duration_seconds},provider_parameters:{num_inference_steps:100,cfg_scale:4.0}},
  certification:{contract:CONTRACT,benchmark_only:true,max_provider_jobs:1,production_activation_allowed:false,pricing_activation_allowed:false,fixture_id:fixture.id,category:fixture.category} };
const tokenId=text(process.env.MODAL_TOKEN_ID||process.env.AVANTIQO_MODAL_TOKEN_ID);
const tokenSecret=text(process.env.MODAL_TOKEN_SECRET||process.env.AVANTIQO_MODAL_TOKEN_SECRET);
if(!tokenId||!tokenSecret) throw new Error("AVANTIQO_MUSIC_SFX_MODAL_CREDENTIALS_REQUIRED");
const {ModalClient,FunctionTimeoutError}=await import("modal");
const client=new ModalClient({tokenId,tokenSecret});
const environment=text(process.env.AVANTIQO_SFX_MODAL_ENVIRONMENT||process.env.MODAL_ENVIRONMENT);
const worker=await client.functions.fromName(APP_NAME,FUNCTION_NAME,environment?{environment}:{});
const startedAt=performance.now();
const call=await worker.spawn([payload]);
const jobId=text(call.functionCallId);
if(!jobId) throw new Error("AVANTIQO_MUSIC_SFX_MODAL_CALL_ID_REQUIRED");
let result=null;
while(!result){
  const elapsed=(performance.now()-startedAt)/1000;
  const costThb=elapsed*MODAL_A10G_USD_PER_SECOND*FX_THB_PER_USD;
  if(costThb>=CEILING*0.98){try{await call.cancel({terminateContainers:true});}catch{} throw new Error(`AVANTIQO_MUSIC_SFX_SPEND_CEILING_WATCHDOG:${costThb.toFixed(6)}THB`);}
  try{result=await call.get({timeoutMs:5000});}
  catch(error){if(!(FunctionTimeoutError && error instanceof FunctionTimeoutError)&&!text(error?.code||error?.name||error?.message).toUpperCase().includes("TIMEOUT")) throw error;}
}
const wallMs=Math.round(performance.now()-startedAt);
const supplierUsd=(wallMs/1000)*MODAL_A10G_USD_PER_SECOND;
const supplierThb=supplierUsd*FX_THB_PER_USD;
if(supplierThb>CEILING) throw new Error("AVANTIQO_MUSIC_SFX_SPEND_CEILING_EXCEEDED");
if(result?.success!==true||text(result?.capability)!==CAPABILITY||text(result?.model)!==PRODUCT_MODEL||text(result?.foundation_model)!==FOUNDATION_MODEL||text(result?.storage_reference)!==outputReference||Number(result?.output_size_bytes)<=1024) throw new Error("AVANTIQO_MUSIC_SFX_CERTIFICATION_RESULT_INVALID");
const report={success:true,contract:CONTRACT,generated_at:new Date().toISOString(),benchmark_id:benchmarkId,provider:"avantiqo-audio",capability:CAPABILITY,product_model:PRODUCT_MODEL,foundation_model:FOUNDATION_MODEL,model_license_verified:true,infrastructure_provider:"MODAL_DIRECT_A10G_ASYNC_V1",provider_jobs_submitted:1,job_id:jobId,fixture_id:fixture.id,fixture_category:fixture.category,instruction,duration_seconds:fixture.duration_seconds,output_storage_reference:outputReference,output_size_bytes:result.output_size_bytes,sample_rate:result.sample_rate,wall_ms:wallMs,spend_ceiling_thb:CEILING,conservative_supplier_cost_usd:Number(supplierUsd.toFixed(8)),conservative_supplier_cost_thb:Number(supplierThb.toFixed(6)),benchmark_certified:true,economics_measured:true,economics_certified:false,human_quality_certified:false,human_review_required:true,human_review_status:"PENDING",production_routing_allowed:false,activation_allowed:false,pricing_activation_allowed:false,production_deployment_performed:false};
const reportPath=resolve(process.env.AVANTIQO_MUSIC_SFX_CERTIFICATION_OUTPUT||`/tmp/${benchmarkId}.json`);
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({success:true,contract:CONTRACT,job_id:jobId,output_path:reportPath,conservative_supplier_cost_thb:report.conservative_supplier_cost_thb,human_review_status:"PENDING",production_activation_performed:false},null,2));
