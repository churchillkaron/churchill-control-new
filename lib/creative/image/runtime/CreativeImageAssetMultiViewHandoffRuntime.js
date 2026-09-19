export const CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_CONTRACT = "CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function approved(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_multiview_qc_sealed===true &&
    node.metadata?.release_approved===true &&
    Boolean(node.url);
}

export function selectImageAssetMultiViewPack({asset_nodes=[],parent_asset_node_id,continuity_group_id=null}={}){
  const views=list(asset_nodes).filter(node=>
    approved(node) &&
    text(node.metadata?.parent_image_asset_node_id)===text(parent_asset_node_id) &&
    (!continuity_group_id || text(node.metadata?.continuity_group_id)===text(continuity_group_id))
  );
  const byView=(id)=>views.find(node=>text(node.metadata?.image_multiview_view_id)===id)||null;
  const pack={
    contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_CONTRACT,
    parent_asset_node_id:text(parent_asset_node_id)||null,
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
    complete:required.every(Boolean),
    view_count:required.filter(Boolean).length,
    view_asset_node_ids:required.filter(Boolean).map(node=>node.id),
    view_urls:required.filter(Boolean).map(node=>node.url),
    qc_seal_hash:required.find(Boolean)?.metadata?.image_multiview_qc_seal_hash||null,
  };
}

export const CreativeImageAssetMultiViewHandoffRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_HANDOFF_CONTRACT,
  select:selectImageAssetMultiViewPack,
});
