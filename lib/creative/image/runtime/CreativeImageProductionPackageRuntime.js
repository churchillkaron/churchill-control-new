import crypto from "node:crypto";

import crypto from "node:crypto";

import { CreativeImageAssetHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetHandoffRuntime";
import { CreativeImageAssetMultiViewHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetMultiViewHandoffRuntime";
import { CreativeImageAssetBundleHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetBundleHandoffRuntime";
import { CreativeImageMaterialTruthPackRuntime } from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";
import { CreativeImageFoundationAuthorityRuntime } from "@/lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime";

export const CREATIVE_IMAGE_PRODUCTION_PACKAGE_CONTRACT = "CREATIVE_IMAGE_PRODUCTION_PACKAGE_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function find(nodes,opts){return CreativeImageAssetHandoffRuntime.select({asset_nodes:nodes,...opts}).selected;}
function materialHeavy(r={}){
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.production_design||{}),JSON.stringify(r.environmental_continuity_state||{}),JSON.stringify(r.lighting||{})].map(text).join(" ").toLowerCase();
  return /rain|wet|storm|mist|fog|water|skin|fabric|bark|forest|tree|wood|mud|ground|soil|drone|threat|metal|glass|window|search.?light|beam|spotlight/.test(s);
}
function human(r={}){
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.actors||[])].map(text).join(" ").toLowerCase();
  return list(r.actors).length>0||/\b(man|woman|person|human|runner|performer|actor|face|hand|feet)\b/.test(s);
}
function threat(r={}){
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.pursuit_spatial_choreography||{})].map(text).join(" ").toLowerCase();
  return /\b(drone|threat|pursu|hunt|predator|search beam)\b/.test(s);
}
function contact(r={}){
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.pursuit_performance_choreography||{}),JSON.stringify(r.environmental_continuity_state||{})].map(text).join(" ").toLowerCase();
  return /hand|feet|foot|boot|mud|ground|branch|grab|slip|stumble|impact|contact|collision|fall|duck|jump|land|water|debris|cloth|fabric/.test(s);
}

export function buildImageProductionPackage({task={},asset_nodes=[],previsualization_authority=null}={}){
  const r=object(task.input?.requirements);
  const strategy=object(r.generation_strategy||task.metadata?.generation_strategy);
  const sceneId=task.scene_id||task.metadata?.scene_id||null;
  const group=text(strategy.shared_state_group_id||r.continuity_group_id||sceneId);
  const shotId=task.shot_id||task.metadata?.shot_id||null;
  const governedIdentityKey=text(
    r.subject_identity_key ||
    r.identity_requirements?.profile_id ||
    r.identity_requirements?.identity_profile_id ||
    r.performance_contract?.identity_profile_id
  )||null;
  const movingThreat=object(r.environmental_continuity_state?.moving_threat_state);
  const pursuitThreat=object(r.pursuit_spatial_choreography);
  const requestedThreatKey=text(
    r.threat_identity_key ||
    movingThreat.identity_key ||
    movingThreat.threat_identity_key ||
    movingThreat.threat_id ||
    movingThreat.vehicle_id ||
    movingThreat.id ||
    pursuitThreat.threat_identity_key ||
    pursuitThreat.threat_id ||
    pursuitThreat.predator_id
  )||null;
  const failures=[];
  const foundationAuthority=CreativeImageFoundationAuthorityRuntime.evaluate({
    task,
    asset_nodes,
    force:true,
  });
  if(foundationAuthority.passed!==true){
    failures.push(...foundationAuthority.failures.map(reason=>"PRODUCTION_PACKAGE_"+reason));
  }
  const hero=find(asset_nodes,{scene_id:sceneId,shot_id:shotId,continuity_group_id:group,asset_classes:["HERO_FRAME"],downstream_role:"VIDEO"});
  const continuitySelection=CreativeImageAssetHandoffRuntime.selectContinuity({
    asset_nodes,scene_id:sceneId,shot_id:shotId,continuity_group_id:group,downstream_role:"VIDEO",
  });
  const continuity=continuitySelection.selected;
  if(!hero) failures.push("PRODUCTION_PACKAGE_HERO_REQUIRED");
  if(!continuity) failures.push("PRODUCTION_PACKAGE_CONTINUITY_REQUIRED");
  if(
    hero &&
    foundationAuthority.passed===true &&
    text(hero.metadata?.image_foundation_authority_digest)!==
      text(foundationAuthority.foundation_authority_digest)
  ){
    failures.push("PRODUCTION_PACKAGE_HERO_FOUNDATION_STALE");
  }
  const heroBundle=hero?CreativeImageAssetBundleHandoffRuntime.select({asset_nodes,parent_asset_node_id:hero.id,continuity_group_id:group}):null;
  if(hero&&!heroBundle?.ready_for_video) failures.push("PRODUCTION_PACKAGE_HERO_DERIVATIVES_REQUIRED");
  let character=null;
  let performanceReference=null;
  let contactReference=null;
  if(human(r)){
    const base=find(asset_nodes,{scene_id:sceneId,shot_id:null,continuity_group_id:group,identity_key:governedIdentityKey,asset_classes:["CHARACTER_SHEET"],downstream_role:"VIDEO"});
    character=base?CreativeImageAssetMultiViewHandoffRuntime.select({asset_nodes,parent_asset_node_id:base.id,continuity_group_id:group}):null;
    if(character?.complete!==true) failures.push("PRODUCTION_PACKAGE_CHARACTER_MULTIVIEW_REQUIRED");
    performanceReference=find(asset_nodes,{scene_id:sceneId,shot_id:shotId,continuity_group_id:group,asset_classes:["PERFORMANCE_REFERENCE"],downstream_role:"VIDEO"});
    if(!performanceReference) failures.push("PRODUCTION_PACKAGE_PERFORMANCE_REFERENCE_REQUIRED");
    else if(
      foundationAuthority.passed===true &&
      text(performanceReference.metadata?.image_foundation_authority_digest)!==
        text(foundationAuthority.foundation_authority_digest)
    ) failures.push("PRODUCTION_PACKAGE_PERFORMANCE_FOUNDATION_STALE");
    if(contact(r)){
      contactReference=find(asset_nodes,{scene_id:sceneId,shot_id:shotId,continuity_group_id:group,asset_classes:["CONTACT_DETAIL_REFERENCE"],downstream_role:"VIDEO"});
      if(!contactReference) failures.push("PRODUCTION_PACKAGE_CONTACT_REFERENCE_REQUIRED");
      else if(
        foundationAuthority.passed===true &&
        text(contactReference.metadata?.image_foundation_authority_digest)!==
          text(foundationAuthority.foundation_authority_digest)
      ) failures.push("PRODUCTION_PACKAGE_CONTACT_FOUNDATION_STALE");
    }
  }
  let threatPack=null;
  let threatAuthority=null;
  if(threat(r)){
    const governedThreatKey=text(
      foundationAuthority.threat_identity_key ||
      requestedThreatKey
    )||null;
    const threatSelection=CreativeImageAssetHandoffRuntime.select({
      asset_nodes,
      scene_id:sceneId,
      shot_id:null,
      continuity_group_id:group,
      threat_identity_key:governedThreatKey||null,
      asset_classes:["THREAT_DESIGN"],
      downstream_role:"VIDEO",
    });
    if(!governedThreatKey&&threatSelection.candidate_count>1){
      failures.push("PRODUCTION_PACKAGE_THREAT_IDENTITY_REQUIRED");
    }
    threatAuthority=threatSelection.selected;
    threatPack=threatAuthority?CreativeImageAssetMultiViewHandoffRuntime.select({asset_nodes,parent_asset_node_id:threatAuthority.id,continuity_group_id:group}):null;
    if(threatPack?.complete!==true) failures.push("PRODUCTION_PACKAGE_THREAT_MULTIVIEW_REQUIRED");
  }
  const materials=materialHeavy(r)?CreativeImageMaterialTruthPackRuntime.select({
    asset_nodes,
    continuity_group_id:group,
    identity_key:governedIdentityKey,
    threat_identity_key:foundationAuthority.threat_identity_key||requestedThreatKey,
  }):null;
  if(materialHeavy(r)&&materials?.complete!==true) failures.push("PRODUCTION_PACKAGE_MATERIAL_TRUTH_REQUIRED");
  const camera=object(hero?.metadata?.image_camera_authority);
  if(!camera.contract) failures.push("PRODUCTION_PACKAGE_CAMERA_AUTHORITY_REQUIRED");
  const payload={
    contract:CREATIVE_IMAGE_PRODUCTION_PACKAGE_CONTRACT,
    continuity_group_id:group||null,
    shot_id:shotId||null,
    scene_id:sceneId||null,
    previsualization_authority_digest:previsualization_authority?.previsualization_authority_digest||task.metadata?.image_previsualization_authority_digest||null,
    foundation_authority_contract:foundationAuthority.contract,
    foundation_authority_digest:foundationAuthority.foundation_authority_digest||null,
    foundation_authority_asset_node_ids:[
      foundationAuthority.character_asset_node_id,
      foundationAuthority.threat_asset_node_id,
      foundationAuthority.environment_asset_node_id,
    ].filter(Boolean),
    hero:{asset_node_id:hero?.id||null,url:hero?.url||null},
    continuity:{
      asset_node_id:continuity?.id||null,
      url:continuity?.url||null,
      source:continuitySelection?.continuity_source||null,
      reuses_hero:continuitySelection?.continuity_reuses_hero===true,
    },
    camera_authority:camera,
    hero_derivatives:{
      subject_segmentation_asset_node_id:heroBundle?.subject_segmentation?.id||null,
      alpha_matte_asset_node_id:heroBundle?.alpha_matte?.id||null,
      foreground_mask_asset_node_id:heroBundle?.foreground_mask?.id||null,
      background_mask_asset_node_id:heroBundle?.background_mask?.id||null,
      depth_map_asset_node_id:heroBundle?.depth_map?.id||null,
      upscaled_master_asset_node_id:heroBundle?.upscaled_master?.id||null,
    },
    character_multiview_asset_node_ids:character?.view_asset_node_ids||[],
    character_multiview_assets:character?[
      character.front,character.left_three_quarter,character.right_profile,character.rear,character.detail,
    ].filter(Boolean).map(node=>({
      asset_node_id:node.id,
      url:node.url,
      view_id:node.metadata?.image_multiview_view_id||null,
    })):[],
    performance_reference:performanceReference?{asset_node_id:performanceReference.id,url:performanceReference.url}:null,
    contact_detail_reference:contactReference?{asset_node_id:contactReference.id,url:contactReference.url}:null,
    threat_identity_key:foundationAuthority.threat_identity_key||null,
    threat_authority_asset_node_id:threatAuthority?.id||null,
    threat_multiview_asset_node_ids:threatPack?.view_asset_node_ids||[],
    threat_multiview_assets:threatPack?[
      threatPack.front,threatPack.left_three_quarter,threatPack.right_profile,threatPack.rear,threatPack.detail,
    ].filter(Boolean).map(node=>({
      asset_node_id:node.id,
      url:node.url,
      view_id:node.metadata?.image_multiview_view_id||null,
    })):[],
    material_truth_assets:materials?.assets||[],
    seals:{
      hero_pack_qc:hero?.metadata?.image_asset_pack_qc_seal_hash||null,
      camera_authority:camera.authority_hash||hero?.metadata?.image_camera_authority_hash||null,
      character_multiview:character?.qc_seal_hash||null,
      threat_multiview:threatPack?.qc_seal_hash||null,
      material_truth:materials?.qc_seal_hash||null,
    },
  };
  return Object.freeze({
    ...payload,
    passed:failures.length===0,
    failures,
    production_package_digest:hash(payload),
    provider_neutral:true,
    zero_provider_calls:true,
  });
}

export const CreativeImageProductionPackageRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_PRODUCTION_PACKAGE_CONTRACT,
  build:buildImageProductionPackage,
});
