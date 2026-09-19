export const CREATIVE_IMAGE_ASSET_HANDOFF_CONTRACT = "CREATIVE_IMAGE_ASSET_HANDOFF_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function authority(node={}){return node.metadata?.image_asset_authority||{};}
function approved(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_perceptual_qc_sealed===true &&
    node.metadata?.release_approved===true &&
    node.metadata?.localized_repair_superseded!==true &&
    !node.metadata?.superseded_by_localized_repair_asset_node_id &&
    Boolean(node.url);
}
function classOf(node={}){return text(node.metadata?.image_asset_class||authority(node).asset_class).toUpperCase();}

export function selectImageAsset({
  asset_nodes=[],
  scene_id=null,
  shot_id=null,
  continuity_group_id=null,
  identity_key=null,
  asset_classes=[],
  downstream_role=null,
}={}){
  const classes=new Set(list(asset_classes).map(v=>text(v).toUpperCase()).filter(Boolean));
  const role=text(downstream_role).toUpperCase();
  const candidates=list(asset_nodes).filter(node=>{
    if(!approved(node)) return false;
    if(classes.size&&!classes.has(classOf(node))) return false;
    const a=authority(node);
    if(scene_id&&text(a.scene_id)!==text(scene_id)&&text(node.metadata?.scene_id)!==text(scene_id)) return false;
    if(shot_id&&text(a.shot_id)&&text(a.shot_id)!==text(shot_id)) return false;
    if(continuity_group_id&&text(a.continuity_group_id)!==text(continuity_group_id)) return false;
    if(identity_key&&text(node.metadata?.subject_identity_key)!==text(identity_key)) return false;
    if(continuity_group_id&&node.metadata?.image_asset_pack_qc_sealed!==true) return false;
    if(node.metadata?.image_asset_exploration_group_id&&node.metadata?.image_asset_exploration_selected!==true) return false;
    if(role==="VIDEO"&&node.metadata?.approved_for_video_source!==true) return false;
    if(role==="VFX"&&node.metadata?.approved_for_vfx_source!==true) return false;
    if(role==="COMPOSITING"&&node.metadata?.approved_for_compositing_source!==true) return false;
    return true;
  });
  const priority=["VFX_SOURCE","THREAT_DESIGN","HERO_FRAME","CONTINUITY_REFERENCE","COMPOSITING_SOURCE","ENVIRONMENT_LOOKFRAME","TRANSITION_LOOKFRAME","CHARACTER_SHEET","STORYBOARD_FRAME"];
  candidates.sort((a,b)=>{
    const ai=priority.indexOf(classOf(a));const bi=priority.indexOf(classOf(b));
    return (ai<0?999:ai)-(bi<0?999:bi);
  });
  const selected=candidates[0]||null;
  return {
    contract:CREATIVE_IMAGE_ASSET_HANDOFF_CONTRACT,
    selected,
    candidate_count:candidates.length,
    asset_class:selected?classOf(selected):null,
    downstream_role:role||null,
  };
}

export function selectContinuityAuthority(options={}){
  const dedicated=selectImageAsset({
    ...options,
    asset_classes:["CONTINUITY_REFERENCE"],
  });
  if(dedicated.selected){
    return {
      ...dedicated,
      continuity_source:"DEDICATED_CONTINUITY_REFERENCE",
      continuity_reuses_hero:false,
    };
  }
  const hero=selectImageAsset({
    ...options,
    asset_classes:["HERO_FRAME"],
  });
  return {
    ...hero,
    asset_class:hero.selected?"CONTINUITY_REFERENCE":null,
    continuity_source:hero.selected?"SELECTED_HERO_FRAME_ALIAS":null,
    continuity_reuses_hero:Boolean(hero.selected),
  };
}

export const CreativeImageAssetHandoffRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_HANDOFF_CONTRACT,
  select:selectImageAsset,
  selectContinuity:selectContinuityAuthority,
});
