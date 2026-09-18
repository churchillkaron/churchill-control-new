import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";

export const CREATIVE_ROTO_ARTIFACT_CONTRACT="CREATIVE_ROTO_ARTIFACT_V1";
function text(v){return String(v??"").trim();}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
export async function persistRotoArtifact({organization_id,creative_project_id,creative_mission_id=null,shot_id,execution,upstream_asset_node_ids=[]}={}){
  if(execution?.contract!=="CREATIVE_OPENCV_ROTO_EXECUTION_V1")throw new Error("ROTO_EXECUTION_CONTRACT_REQUIRED");
  const result=object(execution.result);const authority=object(execution.authority);
  const frameCount=Number(result.source?.frame_count||0),framesWritten=Number(result.frames_written||0);
  const passed=authority.status==="READY"&&frameCount>0&&framesWritten===frameCount&&Number(result.max_temporal_mask_delta||0)<=0.35;
  const artifact=await CreativeMultiPassArtifactRuntime.persist({organization_id,creative_project_id,creative_mission_id,shot_id,pass_id:"roto-matte",artifact_kind:"ROTO_MATTE",buffer:execution.buffer,mime_type:execution.mime_type||"video/x-matroska",extension:execution.extension||"mkv",provider_id:"opencv",capability:"creative.roto.propagate",upstream_asset_node_ids,technical:{frame_count:framesWritten,fps:Number(result.source?.fps||0),width:Number(result.source?.width||0),height:Number(result.source?.height||0)},metadata:{roto_artifact_contract:CREATIVE_ROTO_ARTIFACT_CONTRACT,roto_authority_contract:authority.contract||null,roto_temporal_propagation:result.temporal_propagation===true,roto_edge_refinement:result.edge_refinement===true,roto_motion_blur_matte:result.motion_blur_matte===true,roto_mean_temporal_mask_delta:Number(result.mean_temporal_mask_delta||0),roto_max_temporal_mask_delta:Number(result.max_temporal_mask_delta||0),roto_qc_sealed:passed,release_approved:passed}});
  let node=artifact.node;if(passed){node=await AssetGraphRepository.update(node.id,{status:"APPROVED",review:{...object(node.review),ai_reviewed:true,approved:true,notes:"Temporal roto propagation and edge/QC checks passed."},metadata:{...object(node.metadata),roto_qc_sealed:true,roto_qc_seal_contract:"AVANTIQO_ROTO_MATTE_QC_SEAL_V1",release_approved:true}});}return{contract:CREATIVE_ROTO_ARTIFACT_CONTRACT,...artifact,node,passed,blockers:passed?[]:["ROTO_TEMPORAL_QC_FAILED"]};
}
export const CreativeRotoArtifactRuntime=Object.freeze({contract:CREATIVE_ROTO_ARTIFACT_CONTRACT,persist:persistRotoArtifact});
