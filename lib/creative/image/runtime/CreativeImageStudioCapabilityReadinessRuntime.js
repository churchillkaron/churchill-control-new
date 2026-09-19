import "@/lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration";
import { getProvider } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

export const CREATIVE_IMAGE_STUDIO_CAPABILITY_READINESS_CONTRACT = "CREATIVE_IMAGE_STUDIO_CAPABILITY_READINESS_V1";
const PROVIDER_ID="avantiqo-image";
const OWNED_CAPABILITIES=new Set([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
  "creative.depth.estimate",
  "creative.materials.estimate",
]);

function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function imageStudioTask(task={}){
  const contract=text(task.metadata?.contract);
  const req=task.input?.requirements||{};
  return contract.startsWith("CREATIVE_IMAGE_") ||
    Boolean(req.image_asset_authority) ||
    task.metadata?.image_asset_multiview_task===true ||
    task.metadata?.image_asset_derivative_task===true ||
    task.metadata?.image_asset_localized_repair===true ||
    task.metadata?.material_truth_reference===true ||
    task.metadata?.material_truth_qc===true ||
    task.metadata?.material_measurement===true;
}
export function evaluateImageStudioCapabilityReadiness({task=null,capability=null}={}){
  const cap=text(capability||task?.capability||task?.service_code||task?.service_id).toLowerCase();
  const required=Boolean(task?imageStudioTask(task):OWNED_CAPABILITIES.has(cap))&&OWNED_CAPABILITIES.has(cap);
  if(!required){
    return {contract:CREATIVE_IMAGE_STUDIO_CAPABILITY_READINESS_CONTRACT,required:false,ready:true,capability:cap||null,provider_id:null,blockers:[]};
  }
  const provider=getProvider(PROVIDER_ID)||{};
  const certified=new Set(list(provider.metadata?.certified_capabilities||provider.capabilities).map(v=>text(v).toLowerCase()));
  const blockers=[];
  if(provider.active===false) blockers.push("IMAGE_PROVIDER_INACTIVE");
  if(provider.runtimeAvailable!==true) blockers.push("IMAGE_PROVIDER_RUNTIME_UNAVAILABLE");
  if(!text(provider.runtime)) blockers.push("IMAGE_PROVIDER_RUNTIME_REQUIRED");
  if(!list(provider.capabilities).map(v=>text(v).toLowerCase()).includes(cap)) blockers.push("IMAGE_CAPABILITY_NOT_REGISTERED:"+cap);
  if(!certified.has(cap)) blockers.push("IMAGE_CAPABILITY_NOT_CERTIFIED:"+cap);
  if(provider.metadata?.owned_by!=="AVANTIQO") blockers.push("IMAGE_OWNED_PROVIDER_REQUIRED");
  if(provider.metadata?.external_provider_fallback_allowed!==false) blockers.push("IMAGE_EXTERNAL_FALLBACK_MUST_BE_DISABLED");
  return {
    contract:CREATIVE_IMAGE_STUDIO_CAPABILITY_READINESS_CONTRACT,
    required:true,
    ready:blockers.length===0,
    capability:cap,
    provider_id:PROVIDER_ID,
    blockers,
    certified_capabilities:[...certified],
    runtime_available:provider.runtimeAvailable===true,
    owned_only:true,
    external_fallback_allowed:false,
    provider_calls_performed:false,
  };
}
export const CreativeImageStudioCapabilityReadinessRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_CAPABILITY_READINESS_CONTRACT,
  provider_id:PROVIDER_ID,
  capabilities:[...OWNED_CAPABILITIES],
  evaluate:evaluateImageStudioCapabilityReadiness,
});
