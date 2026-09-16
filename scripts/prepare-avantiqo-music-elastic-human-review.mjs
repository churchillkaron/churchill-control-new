#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
loadAvantiqoEnv();
const TECH="AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CERTIFICATION_V2", REVIEW="AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_PREP_V2", BUCKET="creative-assets";
const text=(v)=>String(v??"").trim(), required=(n)=>{const v=text(process.env[n]);if(!v)throw new Error(`${n}_REQUIRED`);return v;};
function parse(ref){const m=/^storage:\/\/([^/]+)\/(.+)$/.exec(text(ref));if(!m)throw new Error("AVANTIQO_MUSIC_ELASTIC_STORAGE_REFERENCE_INVALID");return{bucket:m[1],path:m[2]};}
const certPath=path.resolve(process.env.AVANTIQO_MUSIC_ELASTIC_CERTIFICATION_OUTPUT||"/tmp/avantiqo-music-elastic-certification-v2.json");const cert=JSON.parse(await readFile(certPath,"utf8"));
if(cert?.success!==true||text(cert?.contract)!==TECH||cert?.technical_render_certification_passed!==true||cert?.provider_jobs_submitted!==1||cert?.human_listening_review_required!==true||text(cert?.human_review_status)!=="PENDING"||cert?.automatic_human_approval_forbidden!==true||cert?.production_certified!==false||cert?.production_activation_allowed!==false)throw new Error("AVANTIQO_MUSIC_ELASTIC_HUMAN_REVIEW_TECHNICAL_EVIDENCE_REQUIRED");
const supabase=createClient(required("NEXT_PUBLIC_SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const dir=path.join(os.homedir(),"Downloads","Avantiqo-Elastic-Certification",text(cert.job_id)||"latest");await mkdir(dir,{recursive:true});
async function download(ref,name){const x=parse(ref);if(x.bucket!==BUCKET)throw new Error("AVANTIQO_MUSIC_ELASTIC_BUCKET_INVALID");const {data,error}=await supabase.storage.from(x.bucket).download(x.path);if(error)throw error;const b=Buffer.from(await data.arrayBuffer());if(b.length<10000)throw new Error(`AVANTIQO_MUSIC_ELASTIC_REVIEW_AUDIO_TOO_SMALL:${name}`);const p=path.join(dir,name);await writeFile(p,b);return p;}
const sourcePath=await download(cert.source_fixture?.storage_reference,"source.wav"), outputPath=await download(cert.output?.storage_reference,"elastic-output.wav");
const packet={success:true,contract:REVIEW,generated_at:new Date().toISOString(),technical_contract:TECH,technical_result_path:certPath,certification_job_id:cert.job_id,source_path:sourcePath,output_path:outputPath,approved_warp_plan:cert.approved_warp_plan,minimum_average_score:92,automatic_human_approval_forbidden:true,human_review_status:"PENDING",criteria:["pitch_stability","transient_integrity","seam_cleanliness","timing_musicality","source_character_preservation","commercial_music_studio_readiness"].map(id=>({id,score_0_100:null,notes:null})),production_certified:false,production_activation_allowed:false,pricing_activation_allowed:false,provider_selection_change_allowed:false};
const packetPath=path.join(dir,"elastic-human-review.json");await writeFile(packetPath,`${JSON.stringify(packet,null,2)}\n`);console.log(JSON.stringify({success:true,contract:REVIEW,source_path:sourcePath,output_path:outputPath,review_packet_path:packetPath,human_review_status:"PENDING",minimum_average_score:92,production_activation_performed:false},null,2));
