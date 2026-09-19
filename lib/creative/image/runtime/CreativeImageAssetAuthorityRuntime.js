export const CREATIVE_IMAGE_ASSET_AUTHORITY_CONTRACT = "CREATIVE_IMAGE_ASSET_AUTHORITY_V1";

export const CREATIVE_IMAGE_ASSET_CLASSES = Object.freeze([
  "CHARACTER_SHEET",
  "HERO_FRAME",
  "THREAT_DESIGN",
  "ENVIRONMENT_LOOKFRAME",
  "TRANSITION_LOOKFRAME",
  "CONTINUITY_REFERENCE",
  "VFX_SOURCE",
  "COMPOSITING_SOURCE",
  "STORYBOARD_FRAME",
  "MATERIAL_DETAIL_REFERENCE",
  "PERFORMANCE_REFERENCE",
  "CONTACT_DETAIL_REFERENCE",
]);

function text(value){return String(value??"").trim();}
function list(value){return Array.isArray(value)?value.filter(Boolean):[];}

export function buildImageAssetAuthority({
  asset_class,
  scene_id=null,
  shot_id=null,
  continuity_group_id=null,
  downstream_roles=[],
  identity_lock_required=false,
  approved_for_video_source=false,
  approved_for_vfx_source=false,
  approved_for_compositing_source=false,
  premium_review_required=true,
}={}){
  const cls=text(asset_class).toUpperCase();
  if(!CREATIVE_IMAGE_ASSET_CLASSES.includes(cls)) throw new Error("CREATIVE_IMAGE_ASSET_CLASS_INVALID:"+cls);
  return Object.freeze({
    contract:CREATIVE_IMAGE_ASSET_AUTHORITY_CONTRACT,
    asset_class:cls,
    scene_id:text(scene_id)||null,
    shot_id:text(shot_id)||null,
    continuity_group_id:text(continuity_group_id)||null,
    downstream_roles:[...new Set(list(downstream_roles).map((role)=>text(role).toUpperCase()).filter(Boolean))],
    identity_lock_required:identity_lock_required===true,
    approved_for_video_source:approved_for_video_source===true,
    approved_for_vfx_source:approved_for_vfx_source===true,
    approved_for_compositing_source:approved_for_compositing_source===true,
    premium_review_required:premium_review_required!==false,
    production_authority_required:true,
    provider_selection_owner:"SERVICE_RUNTIME",
    provider_model_selection_forbidden_in_creative:true,
  });
}

export const CreativeImageAssetAuthorityRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_AUTHORITY_CONTRACT,
  classes:CREATIVE_IMAGE_ASSET_CLASSES,
  build:buildImageAssetAuthority,
});
