import { CreativePhysicalInteractionRenderRuntime } from "./CreativePhysicalInteractionRenderRuntime.js";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";

export const CREATIVE_PHYSICAL_INTERACTION_PASS_EXECUTION_CONTRACT="CREATIVE_PHYSICAL_INTERACTION_PASS_EXECUTION_V1";

export async function executePhysicalInteractionPass({organization_id,creative_project_id,creative_mission_id=null,project,shot_id,effect,vfx_asset,material_map,output_spec={}}={}){
  if(!vfx_asset?.url) throw new Error("PHYSICAL_INTERACTION_VFX_ASSET_REQUIRED");
  if(vfx_asset.metadata?.vfx_qc_sealed!==true||vfx_asset.metadata?.vfx_qc_seal_contract!=="AVANTIQO_VFX_QC_SEAL_V1") throw new Error("PHYSICAL_INTERACTION_VFX_QC_SEAL_REQUIRED");
  const rendered=await CreativePhysicalInteractionRenderRuntime.render({organization_id,project,effect,vfx_reference:vfx_asset.url,material_map,output_spec});
  const common={organization_id,creative_project_id,creative_mission_id,shot_id,provider_id:"opencv",upstream_asset_node_ids:[vfx_asset.id],technical:{width:rendered.configuration.width,height:rendered.configuration.height,frame_rate:rendered.configuration.fps,duration_seconds:rendered.configuration.duration_seconds},metadata:{effect_id:effect.effect_id,vfx_qc_required:true,source_vfx_asset_node_id:vfx_asset.id,source_vfx_qc_seal_hash:vfx_asset.metadata?.vfx_qc_seal_hash,physical_interaction_contract:rendered.contract}};
  const lighting=await CreativeMultiPassArtifactRuntime.persist({...common,pass_id:"lighting-interaction",artifact_kind:`LIGHTING_INTERACTION_${effect.effect_id}`,buffer:rendered.lighting.buffer,mime_type:rendered.lighting.mime_type,extension:rendered.lighting.extension,capability:"creative.vfx.lighting-interaction"});
  const reflectionShadow=await CreativeMultiPassArtifactRuntime.persist({...common,pass_id:"reflection-shadow",artifact_kind:`REFLECTION_SHADOW_${effect.effect_id}`,buffer:rendered.reflection_shadow.buffer,mime_type:rendered.reflection_shadow.mime_type,extension:rendered.reflection_shadow.extension,capability:"creative.vfx.reflection-shadow"});
  return {contract:CREATIVE_PHYSICAL_INTERACTION_PASS_EXECUTION_CONTRACT,shot_id,effect_id:effect.effect_id,lighting,reflection_shadow:reflectionShadow,vfx_qc_required:true,provider_calls_performed:false};
}

export const CreativePhysicalInteractionPassExecutionRuntime=Object.freeze({contract:CREATIVE_PHYSICAL_INTERACTION_PASS_EXECUTION_CONTRACT,execute:executePhysicalInteractionPass});
