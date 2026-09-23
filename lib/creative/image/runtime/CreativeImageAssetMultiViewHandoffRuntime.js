import crypto from "node:crypto";

export const CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_CONTRACT = "CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_V1";

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
function approved(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_multiview_qc_sealed===true &&
    node.metadata?.release_approved===true &&
    Boolean(node.url);
}

export function selectImageAssetMultiViewPack({asset_nodes=[],parent_asset_node_id,continuity_group_id=null}={}){
  const parent=list(asset_nodes).find(node=>text(node.id)===text(parent_asset_node_id))||null;
  const parentVersion=parent?stableParentVersion(parent):null;
  const allParentViews=list(asset_nodes).filter(node=>
    approved(node) &&
    text(node.metadata?.parent_image_asset_node_id)===text(parent_asset_node_id) &&
    (!continuity_group_id || text(node.metadata?.continuity_group_id)===text(continuity_group_id))
  );
  const views=allParentViews.filter(node=>
    parentVersion &&
    text(node.metadata?.parent_version_fingerprint)===text(parentVersion)
  );
  const byView=(id)=>views.find(node=>text(node.metadata?.image_multiview_view_id)===id)||null;
  const pack={
    contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_CONTRACT,
    parent_asset_node_id:text(parent_asset_node_id)||null,
    parent_version_fingerprint:parentVersion,
    parent_present:Boolean(parent),
    continuity_group_id:text(continuity_group_id)||null,
    front:byView("FRONT"),
    left_three_quarter:byView("LEFT_THREE_QUARTER"),
    right_profile:byView("RIGHT_PROFILE"),
    rear:byView("REAR"),
    detail:byView("DETAIL"),
  };
  const required=[
    pack.front,pack.left_three_quarter,pack.right_profile,pack.rear,pack.detail,
  ];
  return {
    ...pack,
    complete:Boolean(parent)&&required.every(Boolean),
    view_count:required.filter(Boolean).length,
    stale_view_count:allParentViews.length-views.length,
    stale_view_asset_node_ids:allParentViews
      .filter(node=>!views.some(current=>current.id===node.id))
      .map(node=>node.id),
    view_asset_node_ids:required.filter(Boolean).map(node=>node.id),
    view_urls:required.filter(Boolean).map(node=>node.url),
    qc_seal_hash:required.find(Boolean)?.metadata?.image_multiview_qc_seal_hash||null,
  };
}

export const CreativeImageAssetMultiViewHandoffRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_CONTRACT,
  select:selectImageAssetMultiViewPack,
});
