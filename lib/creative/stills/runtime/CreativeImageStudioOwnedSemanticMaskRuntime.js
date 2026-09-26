import { CreativeImageAssetDerivativeExecutionRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeExecutionRuntime";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

export const CREATIVE_IMAGE_STUDIO_OWNED_SEMANTIC_MASK_CONTRACT = "CREATIVE_IMAGE_STUDIO_OWNED_SEMANTIC_MASK_V1";
const MODES=Object.freeze(["SUBJECT","BACKGROUND"]);

function text(v){return String(v??"").trim();}
function mode(v){const next=text(v).toUpperCase();if(!MODES.includes(next))throw new Error("IMAGE_STUDIO_OWNED_SEMANTIC_MASK_MODE_UNSUPPORTED");return next;}
function derivativeFor(result,resolved){return resolved==="BACKGROUND"?result?.background:(result?.alpha||result?.foreground);}

export async function executeOwnedImageStudioSemanticMask({
  organization_id,creative_project_id,project,target_layer_id,source_asset_id,parent_asset_node_id=null,
  source_reference,source_checksum=null,mask_mode="SUBJECT",bbox=null,
}={}){
  if(!organization_id||!creative_project_id||!project?.id||!target_layer_id||!source_asset_id)throw new Error("IMAGE_STUDIO_OWNED_SEMANTIC_MASK_SCOPE_REQUIRED");
  if(!text(source_reference).startsWith("storage://"))throw new Error("IMAGE_STUDIO_OWNED_SEMANTIC_MASK_GOVERNED_SOURCE_REQUIRED");
  const resolved=mode(mask_mode);
  const execution=await CreativeImageAssetDerivativeExecutionRuntime.executeSegmentation({
    organization_id,creative_project_id,project,parent_asset_node_id:parent_asset_node_id||source_asset_id,
    source_reference,bbox,
  });
  const derivative=derivativeFor(execution,resolved);
  if(!derivative?.node?.id||!text(derivative.storage_reference).startsWith("storage://"))throw new Error("IMAGE_STUDIO_OWNED_SEMANTIC_MASK_DERIVATIVE_REQUIRED");
  const preview_url=await signCreativeStorageReference({organization_id,reference:derivative.storage_reference,expires_in:900});
  return Object.freeze({
    contract:CREATIVE_IMAGE_STUDIO_OWNED_SEMANTIC_MASK_CONTRACT,
    mask_mode:resolved,
    evidence:{
      mask_asset_id:derivative.node.id,
      mask_storage_reference:derivative.storage_reference,
      mask_preview_url:preview_url,
      mask_checksum:derivative.checksum_sha256||derivative.node?.technical?.checksum||null,
      source_asset_id,
      source_checksum,
      provider:"opencv",
      capability:"creative.image.segmentation.execute",
      model:"grabcut-7-iter",
      derivative_type:derivative.node?.metadata?.derivative_type||null,
      derivative_contract:derivative.contract||null,
      review_required:true,
      review_approved:false,
    },
  });
}

export const CreativeImageStudioOwnedSemanticMaskRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_OWNED_SEMANTIC_MASK_CONTRACT,
  modes:MODES,
  execute:executeOwnedImageStudioSemanticMask,
});
export default CreativeImageStudioOwnedSemanticMaskRuntime;
