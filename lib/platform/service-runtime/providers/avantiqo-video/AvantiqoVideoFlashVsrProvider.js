import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const PROVIDER_ID="avantiqo-video";
const CAPABILITY="ai.video.upscale";
const ENGINE_CONTRACT="AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_GPU_MASTER_V1";
const PRODUCT_MODEL="avantiqo-flashdreams-flashvsr-v1.1";
const FOUNDATION_MODEL="JunhaoZhuang/FlashVSR-v1.1";
const OUTPUT_BUCKET="creative-assets";
const DEFAULT_TIMEOUT_MS=30*60*1000;
function text(v){return String(v??"").trim();}
function enabled(v){return ["1","true","yes","on"].includes(text(v).toLowerCase());}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function endpointConfig(){if(!enabled(process.env.AVANTIQO_FLASHVSR_ENGINE_ENABLED))throw new Error("AVANTIQO_FLASHVSR_ENGINE_DISABLED");if(!enabled(process.env.AVANTIQO_FLASHVSR_ENGINE_CERTIFIED))throw new Error("AVANTIQO_FLASHVSR_ENGINE_NOT_CERTIFIED");const endpoint=text(process.env.AVANTIQO_FLASHVSR_ENDPOINT_URL);if(!endpoint)throw new Error("AVANTIQO_FLASHVSR_ENDPOINT_URL_REQUIRED");const u=new URL(endpoint);if(u.protocol!=="https:")throw new Error("AVANTIQO_FLASHVSR_ENDPOINT_HTTPS_REQUIRED");return{endpoint:u.toString(),timeoutMs:Math.max(1000,Number(process.env.AVANTIQO_FLASHVSR_TIMEOUT_MS||DEFAULT_TIMEOUT_MS))};}
async function uploadTarget({organizationId,usageId}){const safe=text(usageId).replace(/[^A-Za-z0-9_-]/g,"");if(!organizationId||!safe)throw new Error("AVANTIQO_FLASHVSR_STORAGE_SCOPE_REQUIRED");const path=`${organizationId}/generated/avantiqo-flashvsr/${safe}.mp4`;const supabase=getServiceSupabase();const {data,error}=await supabase.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path,{upsert:false});if(error)throw error;if(!data?.signedUrl)throw new Error("AVANTIQO_FLASHVSR_SIGNED_UPLOAD_URL_REQUIRED");return{signed_url:data.signedUrl,storage_reference:`storage://${OUTPUT_BUCKET}/${path}`};}
async function fetchJson(url,options,timeoutMs){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{const response=await fetch(url,{...options,signal:c.signal});const raw=await response.text();let body={};try{body=raw?JSON.parse(raw):{};}catch{body={error_detail:raw};}if(!response.ok)throw new Error(`AVANTIQO_FLASHVSR_REQUEST_FAILED:${response.status}:${text(body.error_detail||body.error)}`);return body;}finally{clearTimeout(t);}}
function sourceUrl(input={}){return text(input.source_video||input.source_url||input.input_url||input.source_assets?.[0]||input.generation?.source_video||input.provider_parameters?.source_video);}
export const AvantiqoVideoFlashVsrProvider=Object.freeze({
  id:PROVIDER_ID,
  async execute(input={}){
    if(text(input.capability)!==CAPABILITY)throw new Error(`AVANTIQO_FLASHVSR_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    const organizationId=text(input.context?.organization_id),usageId=text(input.context?.usage_id),organizationServiceId=text(input.context?.organization_service_id);
    if(!organizationId||!usageId||!organizationServiceId)throw new Error("AVANTIQO_FLASHVSR_GOVERNED_EXECUTION_REQUIRED");
    const source=sourceUrl(input);if(!source)throw new Error("AVANTIQO_FLASHVSR_SOURCE_VIDEO_REQUIRED");
    const plan=object(input.temporal_4k_plan||input.requirements?.temporal_4k_plan||input.provider_parameters?.temporal_4k_plan);if(text(plan.contract)!=="AVANTIQO_TEMPORAL_4K_MASTERING_V1")throw new Error("AVANTIQO_FLASHVSR_TEMPORAL_4K_PLAN_REQUIRED");
    if(plan.status&&plan.status!=="READY")throw new Error("AVANTIQO_FLASHVSR_TEMPORAL_4K_PLAN_BLOCKED");
    const {endpoint,timeoutMs}=endpointConfig();const storage=await uploadTarget({organizationId,usageId});
    const body=await fetchJson(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({contract:ENGINE_CONTRACT,capability:CAPABILITY,model:PRODUCT_MODEL,foundation_model:FOUNDATION_MODEL,organization_id:organizationId,usage_id:usageId,source_video:source,source:plan.source,flashvsr:plan.flashvsr,delivery:plan.delivery,qc:plan.qc,storage_upload:storage})},timeoutMs);
    if(body?.success!==true||text(body.status).toLowerCase()!=="completed")throw new Error(`AVANTIQO_FLASHVSR_EXECUTION_FAILED:${text(body.error_code||body.error_detail||"UNKNOWN")}`);
    if(text(body.storage_reference)!==storage.storage_reference)throw new Error("AVANTIQO_FLASHVSR_STORAGE_REFERENCE_MISMATCH");
    const assetUrl=await resolveCreativeProviderAssetUrl({organization_id:organizationId,value:storage.storage_reference});if(!assetUrl)throw new Error("AVANTIQO_FLASHVSR_PRIVATE_ASSET_URL_REQUIRED");
    return{success:true,provider:PROVIDER_ID,model:PRODUCT_MODEL,output:{...body,status:"completed",asset_url:assetUrl,url:assetUrl,storage_reference:storage.storage_reference,foundation_model:FOUNDATION_MODEL,engine_contract:ENGINE_CONTRACT,temporal_super_resolution:true,per_frame_independent_sr:false,raw_reasoning_persisted:false}};
  },
  async getStatus(){throw new Error("AVANTIQO_FLASHVSR_SYNCHRONOUS_STATUS_ONLY");},
});
