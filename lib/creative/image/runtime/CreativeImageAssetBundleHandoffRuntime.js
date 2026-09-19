export const CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_CONTRACT = "CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function approvedDerivative(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_derivative_qc_sealed===true &&
    node.metadata?.release_approved===true &&
    Boolean(node.url);
}
export function selectImageAssetBundle({asset_nodes=[],parent_asset_node_id,continuity_group_id=null}={}){
  const derivatives=list(asset_nodes).filter(n=>
    approvedDerivative(n) &&
    text(n.metadata?.parent_image_asset_node_id)===text(parent_asset_node_id) &&
    (!continuity_group_id||text(n.metadata?.continuity_group_id)===text(continuity_group_id))
  );
  const byType=(type)=>derivatives.find(n=>text(n.metadata?.derivative_type).toUpperCase()===type)||null;
  const bundle={
    contract:CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_CONTRACT,
    parent_asset_node_id:text(parent_asset_node_id)||null,
    continuity_group_id:text(continuity_group_id)||null,
    subject_segmentation:byType("SUBJECT_SEGMENTATION"),
    alpha_matte:byType("ALPHA_MATTE"),
    foreground_mask:byType("FOREGROUND_MASK"),
    background_mask:byType("BACKGROUND_MASK"),
    depth_map:byType("DEPTH_MAP"),
    upscaled_master:byType("UPSCALED_MASTER"),
  };
  return {
    ...bundle,
    ready_for_video:Boolean(bundle.upscaled_master||bundle.subject_segmentation),
    ready_for_vfx:Boolean(bundle.depth_map&&(bundle.alpha_matte||bundle.subject_segmentation)),
    ready_for_compositing:Boolean(bundle.alpha_matte||bundle.subject_segmentation),
  };
}
export const CreativeImageAssetBundleHandoffRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_CONTRACT,
  select:selectImageAssetBundle,
});
