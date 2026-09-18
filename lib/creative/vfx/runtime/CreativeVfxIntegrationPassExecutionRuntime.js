import crypto from "node:crypto";
import { CreativeVfxRuntime } from "./CreativeVfxRuntime.js";
import { CreativeVfxIntegrationRenderRuntime } from "./CreativeVfxIntegrationRenderRuntime.js";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";

export const CREATIVE_VFX_INTEGRATION_PASS_EXECUTION_CONTRACT="CREATIVE_VFX_INTEGRATION_PASS_EXECUTION_V1";
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}

export async function executeVfxIntegrationPass({organization_id,creative_project_id,creative_mission_id=null,project,shot_id,vfx_contract,base_reference,depth_reference,simulation_assets=[],output_spec={}}={}){
  const verified=CreativeVfxRuntime.assertReady({vfx_contract});
  const contract=verified.vfx_contract;
  const contractHash=hash(contract);
  const sealedSimulation=list(simulation_assets).filter(a=>a?.metadata?.simulation_qc_sealed===true&&a?.metadata?.simulation_qc_seal_contract==="AVANTIQO_SIMULATION_QC_SEAL_V1");
  const outputs=[];
  for(const effect of list(contract.effects)){
    if(effect.simulation_dependency===true){
      const source=sealedSimulation.find(a=>a.metadata?.simulation_id===effect.source_vfx_effect_id||a.metadata?.simulation_id===effect.effect_id)||sealedSimulation[0];
      if(!source?.url) throw new Error(`VFX_SIMULATION_SEALED_SOURCE_REQUIRED:${effect.effect_id}`);
      const rendered=await CreativeVfxIntegrationRenderRuntime.render({organization_id,project,effect,base_reference,effect_reference:source.url,depth_reference,output_spec});
      const artifact=await CreativeMultiPassArtifactRuntime.persist({
        organization_id,creative_project_id,creative_mission_id,shot_id,pass_id:"vfx-integration",
        artifact_kind:`VFX_INTEGRATED_${effect.effect_id}`,
        buffer:rendered.buffer,mime_type:rendered.mime_type,extension:rendered.file_extension,
        provider_id:"opencv",capability:"creative.vfx.integrate",
        upstream_asset_node_ids:[source.id],
        technical:{width:rendered.configuration.width,height:rendered.configuration.height,frame_rate:rendered.configuration.fps,duration_seconds:rendered.configuration.duration_seconds},
        metadata:{vfx_contract:contract.contract,vfx_contract_hash:contractHash,effect_id:effect.effect_id,effect_class:effect.effect_class,integration_parameters:effect.integration_parameters,source_simulation_asset_node_id:source.id,source_simulation_qc_seal_hash:source.metadata?.simulation_qc_seal_hash,vfx_qc_required:true,transparent_alpha_required:true},
      });
      outputs.push({effect_id:effect.effect_id,artifact,rendered:{contract:rendered.contract,bytes:rendered.bytes}});
    }
  }
  return {contract:CREATIVE_VFX_INTEGRATION_PASS_EXECUTION_CONTRACT,shot_id,vfx_contract_hash:contractHash,outputs,vfx_qc_required:true,vfx_qc_seal_required_before_compositing:true,provider_calls_performed:false};
}

export const CreativeVfxIntegrationPassExecutionRuntime=Object.freeze({contract:CREATIVE_VFX_INTEGRATION_PASS_EXECUTION_CONTRACT,execute:executeVfxIntegrationPass});
