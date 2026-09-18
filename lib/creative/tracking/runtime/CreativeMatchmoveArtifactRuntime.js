import { CreativeReconstructionArtifactRuntime } from "@/lib/creative/reconstruction/runtime/CreativeReconstructionArtifactRuntime";

export const CREATIVE_MATCHMOVE_ARTIFACT_CONTRACT="CREATIVE_MATCHMOVE_ARTIFACT_V1";
function text(v){return String(v??"").trim();}
export async function persistMatchmoveArtifact({organization_id,creative_project_id,creative_mission_id=null,shot_id,reconstruction_contract_hash,execution}={}){
  if(execution?.contract!=="CREATIVE_OPENCV_MATCHMOVE_EXECUTION_V1")throw new Error("MATCHMOVE_EXECUTION_CONTRACT_REQUIRED");
  const authority=execution.authority||{};const value={contract:CREATIVE_MATCHMOVE_ARTIFACT_CONTRACT,execution_contract:execution.contract,result:execution.result,authority};
  const persisted=await CreativeReconstructionArtifactRuntime.persistJson({organization_id,creative_project_id,creative_mission_id,shot_id,reconstruction_contract_hash,artifact_kind:"MATCHMOVE_3D",value,provider_id:"opencv",capability:"creative.matchmove.solve",technical:{sample_count:Number(execution.result?.samples?.length||0)},metadata:{matchmove_contract:CREATIVE_MATCHMOVE_ARTIFACT_CONTRACT,matchmove_authority_contract:authority.contract||null,matchmove_mode:authority.mode||null,matchmove_world_space_cgi_allowed:authority.authority?.world_space_cgi_allowed===true,matchmove_planar_graphics_allowed:authority.authority?.planar_graphics_allowed===true,matchmove_authority_hash:text(authority.authority_hash)||null,reconstruction_qc_passed:authority.status==="READY",release_approved:authority.status==="READY"}});
  return{contract:CREATIVE_MATCHMOVE_ARTIFACT_CONTRACT,...persisted,world_space_cgi_allowed:authority.authority?.world_space_cgi_allowed===true};
}
export const CreativeMatchmoveArtifactRuntime=Object.freeze({contract:CREATIVE_MATCHMOVE_ARTIFACT_CONTRACT,persist:persistMatchmoveArtifact});
