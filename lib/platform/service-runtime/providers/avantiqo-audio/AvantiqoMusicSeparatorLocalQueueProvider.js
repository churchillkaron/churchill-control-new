import { resolveCreativeProviderAssetUrl } from "../../../../creative/assets/storage/resolveCreativeProviderAssetUrl.js";
import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import { getServiceSupabase } from "../../../../shared/supabase/service.js";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_PREFIX = "local-music-separator:";
const CAPABILITY = "ai.audio.stems";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1";
const MODEL = "demucs-htdemucs-ft";
const QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const OUTPUT_BUCKET = "creative-assets";
const OUTPUTS = Object.freeze({ backing_track_wav:"wav", backing_track_mp3:"mp3", vocals:"wav", drums:"wav", bass:"wav", other:"wav" });
function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value){ return ["1","true","yes","on"].includes(text(value).toLowerCase()); }
function rawJobId(value){ const id=text(value); if(!id.startsWith(AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_PREFIX)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_ID_REQUIRED"); return id.slice(AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_PREFIX.length); }
export function isMusicSeparatorLocalJob(value){ return text(value).startsWith(AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_PREFIX); }
async function onlineNodeAvailable(){
  if(!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true")) return false;
  if(text(process.env.AVANTIQO_LOCAL_MUSIC_SEPARATOR_ENABLED) && !enabled(process.env.AVANTIQO_LOCAL_MUSIC_SEPARATOR_ENABLED)) return false;
  const r=await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities").eq("enabled",true).contains("capabilities",[CAPABILITY]).order("last_seen_at",{ascending:false}).limit(4);
  if(r.error) throw r.error; const now=Date.now();
  return (r.data||[]).some((node)=>{ const seen=new Date(node.last_seen_at||0).getTime(); return Number.isFinite(seen) && now-seen<=90000; });
}
async function outputUploads(organizationId,usageId){
  const storage=getServiceSupabase(), uploads={};
  for(const [key,ext] of Object.entries(OUTPUTS)){
    const path=`${organizationId}/generated/music-separator/${usageId}/${key}.${ext}`;
    const r=await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path,{upsert:true});
    if(r.error || !r.data?.signedUrl) throw r.error || new Error(`AVANTIQO_MUSIC_SEPARATOR_UPLOAD_URL_REQUIRED:${key}`);
    uploads[key]={signed_url:r.data.signedUrl,storage_reference:`storage://${OUTPUT_BUCKET}/${path}`};
  }
  return uploads;
}
function rightsAttestation(input={}){ const a=object(input.rights_attestation||input.requirements?.rights_attestation||input.metadata?.rights_attestation||input.provider_parameters?.rights_attestation); return { contract:text(a.contract)||"AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1", confirmed:a.confirmed===true, content_restriction_policy:text(a.content_restriction_policy)||"USER_RIGHTS_ATTESTATION_ONLY" }; }
function processing(input={}){ const p=object(input.provider_parameters); return { remove_vocals:true, preserve_arrangement:p.preserve_arrangement!==false, key_shift_semitones:Number(p.key_shift_semitones||0), tempo_ratio:Number(p.tempo_ratio||1), count_in_bars:Number(p.count_in_bars||0), bpm:Number.isFinite(Number(p.bpm))?Number(p.bpm):null, export_stems:p.export_stems!==false, vocal_cleanup_required:true }; }
export const AvantiqoMusicSeparatorLocalQueueProvider={
  id:"avantiqo-audio", available:onlineNodeAvailable,
  async execute(input={}){
    if(text(input.capability)!==CAPABILITY) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    if(!enabled(process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENGINE_NOT_CERTIFIED");
    const organizationId=text(input.context?.organization_id), serviceId=text(input.context?.organization_service_id), usageId=text(input.context?.usage_id);
    if(!organizationId||!serviceId||!usageId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_GOVERNED_SERVICE_EXECUTION_REQUIRED");
    if(!(await onlineNodeAvailable())) throw new Error("AVANTIQO_MUSIC_SEPARATOR_LOCAL_NODE_UNAVAILABLE");
    const sourceAudio=await resolveCreativeProviderAssetUrl({organization_id:organizationId,value:input.source_audio||input.sourceAudio||input.audio});
    if(!sourceAudio) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SOURCE_AUDIO_REQUIRED");
    const attestation=rightsAttestation(input); if(attestation.confirmed!==true) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
    const uploads=await outputUploads(organizationId,usageId);
    const payload={contract:ENGINE_CONTRACT,capability:CAPABILITY,model:MODEL,quality_profile:QUALITY_PROFILE,source_audio:sourceAudio,rights_attestation:attestation,output_uploads:uploads,processing:processing(input)};
    const inserted=await enqueueLocalComputeJob({organization_id:organizationId,usage_id:usageId,capability:CAPABILITY,lane:"gpu",workload:"music_separator",model:MODEL,payload,priority:65,max_attempts:2,input});
    return {success:true,provider:"avantiqo-audio",model:MODEL,output:{provider_job_id:`${AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_PREFIX}${inserted.id}`,status:"queued",engine_contract:ENGINE_CONTRACT,capability:CAPABILITY,infrastructure_provider:INFRASTRUCTURE,local_node:true,raw_reasoning_persisted:false}};
  },
  async getStatus(input={}){
    const jobId=text(input.job_id||input.jobId||input.provider_job_id); const r=await supabaseAdmin.from("avantiqo_local_compute_jobs").select("status,result,metrics,error_code,node_id,model").eq("id",rawJobId(jobId)).maybeSingle();
    if(r.error) throw r.error; const row=r.data; if(!row) return {status:"failed",provider_job_id:jobId,error:"AVANTIQO_MUSIC_SEPARATOR_LOCAL_JOB_NOT_FOUND"};
    const status=text(row.status).toUpperCase(); if(status==="COMPLETED") return {status:"completed",provider_job_id:jobId,output:{...object(row.result),node_id:row.node_id,metrics:object(row.metrics),raw_reasoning_persisted:false},infrastructure_provider:INFRASTRUCTURE};
    if(["FAILED","CANCELLED"].includes(status)) return {status:"failed",provider_job_id:jobId,error:text(row.error_code)||`AVANTIQO_MUSIC_SEPARATOR_LOCAL_${status}`};
    return {status:status==="RUNNING"?"processing":"queued",provider_job_id:jobId,infrastructure_provider:INFRASTRUCTURE};
  }
};
