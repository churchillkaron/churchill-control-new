import crypto from "node:crypto";

import { CreativeVfxIntegrationRenderRuntime } from "@/lib/creative/vfx/runtime/CreativeVfxIntegrationRenderRuntime";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";

export const CREATIVE_THREAT_HERO_LAYER_PASS_EXECUTION_CONTRACT = "CREATIVE_THREAT_HERO_LAYER_PASS_EXECUTION_V1";

function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}

export async function executeThreatHeroLayerPass({
  organization_id,
  creative_project_id,
  creative_mission_id=null,
  project,
  shot_id,
  vfx_contract,
  base_reference,
  threat_reference,
  depth_reference,
  output_spec={},
  source_asset_node_id=null,
}={}){
  const effect=vfx_contract?.effects?.[0];
  if(!effect) throw new Error("THREAT_HERO_EFFECT_REQUIRED");
  if(!text(base_reference)||!text(threat_reference)||!text(depth_reference)) {
    throw new Error("THREAT_HERO_REFERENCES_REQUIRED");
  }
  const rendered=await CreativeVfxIntegrationRenderRuntime.render({
    organization_id,
    project,
    effect,
    base_reference,
    effect_reference:threat_reference,
    depth_reference,
    output_spec,
  });
  const contractHash=hash(vfx_contract);
  const artifact=await CreativeMultiPassArtifactRuntime.persist({
    organization_id,
    creative_project_id,
    creative_mission_id,
    shot_id,
    pass_id:"threat-hero-layer",
    artifact_kind:"THREAT_HERO_LAYER",
    buffer:rendered.buffer,
    mime_type:rendered.mime_type,
    extension:rendered.file_extension,
    provider_id:"opencv",
    capability:"creative.vfx.threat-hero-layer",
    upstream_asset_node_ids:[source_asset_node_id].filter(Boolean),
    technical:{
      width:rendered.configuration.width,
      height:rendered.configuration.height,
      frame_rate:rendered.configuration.fps,
      duration_seconds:rendered.configuration.duration_seconds,
    },
    metadata:{
      threat_hero_execution_contract:CREATIVE_THREAT_HERO_LAYER_PASS_EXECUTION_CONTRACT,
      vfx_contract:"AVANTIQO_VFX_V1",
      vfx_contract_hash:contractHash,
      source_threat_asset_node_id:source_asset_node_id,
      vfx_qc_required:true,
      transparent_alpha_required:true,
    },
  });
  return {
    contract:CREATIVE_THREAT_HERO_LAYER_PASS_EXECUTION_CONTRACT,
    shot_id,
    artifact,
    vfx_contract_hash:contractHash,
    provider_calls_performed:false,
  };
}
export const CreativeThreatHeroLayerPassExecutionRuntime=Object.freeze({
  contract:CREATIVE_THREAT_HERO_LAYER_PASS_EXECUTION_CONTRACT,
  execute:executeThreatHeroLayerPass,
});
