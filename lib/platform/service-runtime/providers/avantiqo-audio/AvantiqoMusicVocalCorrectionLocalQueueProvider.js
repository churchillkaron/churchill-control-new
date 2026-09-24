import { resolveFirstCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_PREFIX = "local-music-vocal-correction:";
const CAPABILITY="ai.audio.vocal-correct";
const ENGINE_CONTRACT="AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const MODEL="torchcrepe-full";
const INFRASTRUCTURE="AVANTIQO_LOCAL_NODE_V1";
const OUTPUT_BUCKET="creative-assets";
function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value){ return ["1","true","yes","on"].includes(text(value).toLowerCase()); }
function rawJobId(value){ const id=text(value); if(!id.startsWith(AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_ID_REQUIRED"); return id.slice(AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_PREFIX.length); }
export function isMusicVocalCorrectionLocalJob(value){ return text(value).startsWith(AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_PREFIX); }
async function onlineNodeAvailable(){
  if(!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if(text(process.env.AVANTIQO_LOCAL_MUSIC_VOCAL_CORRECTION_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_MUSIC_VOCAL_CORRECTION_ENABLED)) return false;
  const r=await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled",true).contains("capabilities",[CAPABILITY]).order("last_seen_at",{ascending:false}).limit(4);
  if(r.error) throw r.error; const now=Date.now();
  return (r.data||[]).some((node)=>{ const seen=new Date(node.last_seen_at||0).getTime(); return Number.isFinite(seen) && now-seen<=90000; });
}
async function outputUploads(organizationId,usageId){
  const storage=getServiceSupabase(); const outputs={corrected_vocal_wav:"wav",correction_report_json:"json"}; const result={};
  for(const [key,ext] of Object.entries(outputs)){
    const safe=text(usageId).replace(/[^A-Za-z0-9_-]/g,""); const path=`${organizationId}/generated/music-vocal-correction/${safe}-${key}.${ext}`;
    const r=await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path,{upsert:true});
    if(r.error||!r.data?.signedUrl) throw r.error||new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_UPLOAD_REQUIRED:${key}`);
    result[key]={signed_url:r.data.signedUrl,storage_reference:`storage://${OUTPUT_BUCKET}/${path}`};
  }
  return result;
}
export const AvantiqoMusicVocalCorrectionLocalQueueProvider={
  id:"avantiqo-audio", available:onlineNodeAvailable,
  async execute(input={}){
    if(text(input.capability)!==CAPABILITY) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    if(!enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED");
    const organizationId=text(input.context?.organization_id), serviceId=text(input.context?.organization_service_id), usageId=text(input.context?.usage_id);
    if(!organizationId||!serviceId||!usageId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    if(!(await onlineNodeAvailable())) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE");
    const sourceAudio=await resolveFirstCreativeProviderAssetUrl({organization_id:organizationId,values:[input.source_audio,input.sourceAudio,input.audio,input.source].filter(Boolean)});
    if(!sourceAudio) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_AUDIO_REQUIRED");
    const uploads=await outputUploads(organizationId,usageId); const params={...object(input.generation?.provider_parameters),...object(input.provider_parameters)};
    const payload={contract:ENGINE_CONTRACT,capability:CAPABILITY,model:MODEL,source_asset_roles:{source_audio:sourceAudio},source_assets:[sourceAudio],output_uploads:uploads,structured_specification:{generation:input.generation,requirements:input.requirements,intent:input.intent,output_spec:input.output_spec||input.generation?.output_spec||input.requirements?.output_spec,provider_parameters:params,metadata:input.metadata}};
    const inserted=await enqueueLocalComputeJob({organization_id:organizationId,usage_id:usageId,capability:CAPABILITY,lane:"gpu",workload:"music_vocal_correction",model:MODEL,payload,priority:65,max_attempts:2,input});
    return {success:true,provider:"avantiqo-audio",model:MODEL,output:{provider_job_id:`${AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_PREFIX}${inserted.id}`,status:"queued",engine_contract:ENGINE_CONTRACT,capability:CAPABILITY,infrastructure_provider:INFRASTRUCTURE,local_node:true,raw_reasoning_persisted:false}};
  },
  async cancel(input={}){
    const jobId=text(input.job_id||input.jobId||input.provider_job_id), organizationId=text(input.context?.organization_id);
    if(!organizationId) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_CANCEL_SCOPE_REQUIRED");
    const r=await supabaseAdmin.from("avantiqo_local_compute_jobs").update({status:"CANCELLED",payload:{},leased_until:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString(),error_code:"CANCELLED_BY_CALLER"}).eq("id",rawJobId(jobId)).eq("organization_id",organizationId).in("status",["QUEUED","RUNNING"]).select("id,status,node_id").maybeSingle();
    if(r.error) throw r.error; return {success:true,cancelled:Boolean(r.data),provider_job_id:jobId,node_id:r.data?.node_id||null,exact_job_only:true};
  },
  async getStatus(input={}){
    const jobId=text(input.job_id||input.jobId||input.provider_job_id); const r=await supabaseAdmin.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,model").eq("id",rawJobId(jobId)).maybeSingle();
    if(r.error) throw r.error; const row=r.data; if(!row) return {status:"failed",provider_job_id:jobId,error:"AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_JOB_NOT_FOUND"};
    const status=text(row.status).toUpperCase(); if(status==="COMPLETED") return {status:"completed",provider_job_id:jobId,output:{...object(row.result),node_id:row.node_id,metrics:object(row.metrics),raw_reasoning_persisted:false},infrastructure_provider:INFRASTRUCTURE};
    if(["FAILED","CANCELLED"].includes(status)) return {status:"failed",provider_job_id:jobId,error:text(row.error_code)||`AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_${status}`};
    return {status:status==="RUNNING"?"processing":"queued",provider_job_id:jobId,infrastructure_provider:INFRASTRUCTURE};
  }
};
