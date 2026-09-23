import crypto from "node:crypto";

export const CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_CONTRACT = "CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function stableParentVersion(parent={}){
  return hash({
    id:parent.id||null,
    checksum:parent.technical?.checksum||null,
    selection_seal:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
    localized_repair_review_task_id:parent.metadata?.localized_repair_review_task_id||null,
    image_asset_review_task_id:parent.metadata?.image_asset_review_task_id||null,
    perceptual_qc_sealed:parent.metadata?.image_asset_perceptual_qc_sealed===true,
  });
}
function approvedDerivative(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_derivative_qc_sealed===true &&
    node.metadata?.release_approved===true &&
    Boolean(node.url);
}
export function selectImageAssetBundle({asset_nodes=[],parent_asset_node_id,continuity_group_id=null}={}){
  const parent=list(asset_nodes).find(n=>text(n.id)===text(parent_asset_node_id))||null;
  const parentVersion=parent?stableParentVersion(parent):null;
  const allDerivatives=list(asset_nodes).filter(n=>
    approvedDerivative(n) &&
    text(n.metadata?.parent_image_asset_node_id)===text(parent_asset_node_id) &&
    (!continuity_group_id||text(n.metadata?.continuity_group_id)===text(continuity_group_id))
  );
  const derivatives=allDerivatives.filter(n=>
    parentVersion &&
    text(n.metadata?.parent_version_fingerprint)===text(parentVersion)
  );
  const byType=(type)=>derivatives.find(n=>text(n.metadata?.derivative_type).toUpperCase()===type)||null;
  const bundle={
    contract:CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_CONTRACT,
    parent_asset_node_id:text(parent_asset_node_id)||null,
    parent_version_fingerprint:parentVersion,
    parent_present:Boolean(parent),
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
    stale_derivative_count:allDerivatives.length-derivatives.length,
    stale_derivative_asset_node_ids:allDerivatives
      .filter(node=>!derivatives.some(current=>current.id===node.id))
      .map(node=>node.id),
    ready_for_video:Boolean(parent)&&(Boolean(bundle.upscaled_master||bundle.subject_segmentation)),
    ready_for_vfx:Boolean(parent)&&Boolean(bundle.depth_map&&(bundle.alpha_matte||bundle.subject_segmentation)),
    ready_for_compositing:Boolean(parent)&&Boolean(bundle.alpha_matte||bundle.subject_segmentation),
  };
}
export const CreativeImageAssetBundleHandoffRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_BUNDLE_HANDOFF_CONTRACT,
  select:selectImageAssetBundle,
});
