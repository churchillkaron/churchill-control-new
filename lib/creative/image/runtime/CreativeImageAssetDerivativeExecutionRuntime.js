import sharp from "sharp";
import { CreativeOpenCVRuntime } from "@/lib/creative/tools/runtime/CreativeOpenCVRuntime";
import { CreativeImageAssetDerivativeArtifactRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeArtifactRuntime";

export const CREATIVE_IMAGE_ASSET_DERIVATIVE_EXECUTION_CONTRACT = "CREATIVE_IMAGE_ASSET_DERIVATIVE_EXECUTION_V1";

function text(v){return String(v??"").trim();}

export async function executeImageAssetSegmentationDerivatives({
  organization_id,creative_project_id,creative_mission_id=null,project,
  parent_asset_node_id,continuity_group_id=null,source_reference,bbox=null
}={}){
  if(!project?.id||text(project.id)!==text(creative_project_id)) throw new Error("IMAGE_DERIVATIVE_PROJECT_REQUIRED");
  if(!text(source_reference).startsWith("storage://")) throw new Error("IMAGE_DERIVATIVE_SOURCE_STORAGE_REQUIRED");
  const result=await CreativeOpenCVRuntime.execute({
    organization_id,project,operation:"IMAGE_SEGMENTATION",source_reference,bbox
  });
  if(!result.mask?.buffer) throw new Error("IMAGE_DERIVATIVE_SEGMENTATION_MASK_REQUIRED");
  const segmentation=await CreativeImageAssetDerivativeArtifactRuntime.persist({
    organization_id,creative_project_id,creative_mission_id,parent_asset_node_id,continuity_group_id,
    derivative_type:"SUBJECT_SEGMENTATION",buffer:result.mask.buffer,mime_type:"image/png",extension:"png",
    capability:"creative.image.segmentation.execute",provider_id:"opencv",
    technical:result.result?.source||{},
    metadata:{opencv_contract:result.contract,segmentation_result:result.result,derived_locally:true}
  });
  const alpha=await CreativeImageAssetDerivativeArtifactRuntime.persist({
    organization_id,creative_project_id,creative_mission_id,parent_asset_node_id,continuity_group_id,
    derivative_type:"ALPHA_MATTE",buffer:result.mask.buffer,mime_type:"image/png",extension:"png",
    capability:"creative.image.segmentation.execute",provider_id:"opencv",
    technical:result.result?.source||{},
    metadata:{source_segmentation_asset_node_id:segmentation.node.id,derived_locally:true,alpha_semantics:"WHITE_FOREGROUND_BLACK_BACKGROUND"}
  });
  const foreground=await CreativeImageAssetDerivativeArtifactRuntime.persist({
    organization_id,creative_project_id,creative_mission_id,parent_asset_node_id,continuity_group_id,
    derivative_type:"FOREGROUND_MASK",buffer:result.mask.buffer,mime_type:"image/png",extension:"png",
    capability:"creative.image.segmentation.execute",provider_id:"opencv",
    technical:result.result?.source||{},
    metadata:{source_segmentation_asset_node_id:segmentation.node.id,derived_locally:true}
  });
  const inverted=await sharp(result.mask.buffer).negate({alpha:false}).png().toBuffer();
  const background=await CreativeImageAssetDerivativeArtifactRuntime.persist({
    organization_id,creative_project_id,creative_mission_id,parent_asset_node_id,continuity_group_id,
    derivative_type:"BACKGROUND_MASK",buffer:inverted,mime_type:"image/png",extension:"png",
    capability:"creative.image.segmentation.execute",provider_id:"sharp",
    technical:result.result?.source||{},
    metadata:{source_segmentation_asset_node_id:segmentation.node.id,derived_locally:true}
  });
  return {
    contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_EXECUTION_CONTRACT,
    provider_calls_performed:false,
    segmentation,alpha,foreground,background
  };
}

export const CreativeImageAssetDerivativeExecutionRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_EXECUTION_CONTRACT,
  executeSegmentation:executeImageAssetSegmentationDerivatives
});
