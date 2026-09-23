import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_PREFIX = "local-music-generation:";
const CAPABILITY = "ai.music.generate";
const MODEL = "ACE-Step/Ace-Step1.5";
const PRODUCT_MODEL = "avantiqo-music-v1";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const OUTPUT_BUCKET = "creative-assets";
function text(v){ return String(v ?? "").trim(); }
function object(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function enabled(v){ return ["1","true","yes","on"].includes(text(v).toLowerCase()); }
function rawJobId(v){ const id=text(v); if(!id.startsWith(AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_ID_REQUIRED"); return id.slice(AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_PREFIX.length); }
export function isMusicGenerationLocalJob(v){ return text(v).startsWith(AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_PREFIX); }
async function onlineNodeAvailable(){
  if(!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if(text(process.env.AVANTIQO_LOCAL_MUSIC_GENERATION_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_MUSIC_GENERATION_ENABLED)) return false;
  const q=await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled",true).contains("capabilities",[CAPABILITY]).order("last_seen_at",{ascending:false}).limit(4);
  if(q.error) throw q.error; const now=Date.now();
  return (q.data||[]).some(n=>{ const seen=new Date(n.last_seen_at||0).getTime(); return Number.isFinite(seen) && now-seen<=90000; });
}
async function outputTarget(organizationId, usageId){
  const safe=text(usageId).replace(/[^A-Za-z0-9_-]/g,""); if(!organizationId||!safe) throw new Error("AVANTIQO_MUSIC_GENERATION_LOCAL_STORAGE_SCOPE_REQUIRED");
  const path=`${organizationId}/generated/avantiqo-music/${safe}.wav`; const storage=getServiceSupabase();
  const upload=await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path,{upsert:true});
  if(upload.error||!upload.data?.signedUrl) throw upload.error||new Error("AVANTIQO_MUSIC_GENERATION_LOCAL_UPLOAD_REQUIRED");
  return {signed_url:upload.data.signedUrl,storage_reference:`storage://${OUTPUT_BUCKET}/${path}`};
}
export const AvantiqoMusicGenerationLocalQueueProvider={
  id:"avantiqo-audio", async available(){ return onlineNodeAvailable(); },
  async execute(input={}){
    if(text(input.capability)!==CAPABILITY) throw new Error(`AVANTIQO_MUSIC_GENERATION_LOCAL_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    if(!(await onlineNodeAvailable())) throw new Error("AVANTIQO_MUSIC_GENERATION_LOCAL_NODE_UNAVAILABLE");
    const organizationId=text(input.context?.organization_id||input.context?.organizationId); const usageId=text(input.context?.usage_id||input.context?.usageId);
    if(!organizationId||!usageId) throw new Error("AVANTIQO_MUSIC_GENERATION_LOCAL_GOVERNED_CONTEXT_REQUIRED");
    const target=await outputTarget(organizationId,usageId); const payload={...input,output_uploads:{...object(input.output_uploads),audio_wav:target}};
    const inserted=await enqueueLocalComputeJob({organization_id:organizationId,usage_id:usageId,capability:CAPABILITY,lane:"cpu",workload:"music_generation",model:MODEL,payload,priority:42,max_attempts:2,input});
    return {success:true,provider:"avantiqo-audio",model:PRODUCT_MODEL,output:{provider_job_id:`${AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_PREFIX}${inserted.id}`,status:"queued",capability:CAPABILITY,engine_contract:"AVANTIQO_AUDIO_ENGINE_V1",foundation_model:MODEL,storage_reference:target.storage_reference,infrastructure_provider:INFRASTRUCTURE,local_node:true,execution_resource:"LOCAL_CPU_FLOAT32",ace_step_lm_used:false,raw_reasoning_persisted:false}};
  },
  async getStatus(input={}){
    const jobId=text(input.job_id||input.jobId||input.provider_job_id); const id=rawJobId(jobId);
    const q=await supabaseAdmin.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,model,organization_id").eq("id",id).maybeSingle(); if(q.error) throw q.error; const row=q.data;
    if(!row) return {status:"failed",provider_job_id:jobId,error:"AVANTIQO_MUSIC_GENERATION_LOCAL_JOB_NOT_FOUND"}; const status=text(row.status).toUpperCase();
    if(status==="COMPLETED"){ const out=object(row.result); const ref=text(out.storage_reference); const org=text(input.context?.organization_id||row.organization_id); const assetUrl=org&&ref?await resolveCreativeProviderAssetUrl({organization_id:org,value:ref}):null; return {status:"completed",provider_job_id:jobId,output:{...out,...(assetUrl?{asset_url:assetUrl}:{}),node_id:row.node_id,runtime_model:text(row.model)||MODEL,metrics:object(row.metrics),local_node:true,raw_reasoning_persisted:false},infrastructure_provider:INFRASTRUCTURE}; }
    if(["FAILED","CANCELLED"].includes(status)) return {status:"failed",provider_job_id:jobId,error:text(row.error_code)||`AVANTIQO_MUSIC_GENERATION_LOCAL_${status}`};
    return {status:status==="RUNNING"?"processing":"queued",provider_job_id:jobId,infrastructure_provider:INFRASTRUCTURE,local_node:true};
  }
};
