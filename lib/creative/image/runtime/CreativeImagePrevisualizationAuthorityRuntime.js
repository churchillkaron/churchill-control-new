import crypto from "node:crypto";

import { CreativeImageAssetHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetHandoffRuntime";
import { CreativeImageAssetMultiViewHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetMultiViewHandoffRuntime";
import { CreativeImageAssetBundleHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetBundleHandoffRuntime";
import { CreativeImageMaterialTruthPackRuntime } from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";
import { CreativeImageCameraAuthorityRuntime } from "@/lib/creative/image/runtime/CreativeImageCameraAuthorityRuntime";

export const CREATIVE_IMAGE_PREVIS_AUTHORITY_CONTRACT = "CREATIVE_IMAGE_PREVIS_AUTHORITY_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function humanExpected(task={}){
  const r=object(task.input?.requirements);
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.actors||[])].map(text).join(" ").toLowerCase();
  return list(r.actors).length>0||/\b(man|woman|person|human|runner|performer|actor|face|hand|feet)\b/.test(s);
}
function threatExpected(task={}){
  const r=object(task.input?.requirements);
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.pursuit_spatial_choreography||{})].map(text).join(" ").toLowerCase();
  return /\b(drone|threat|pursu|hunt|predator|search beam)\b/.test(s);
}
function materialExpected(task={}){
  const r=object(task.input?.requirements);
  const s=[r.subject,r.action,r.purpose,JSON.stringify(r.production_design||{}),JSON.stringify(r.environmental_continuity_state||{}),JSON.stringify(r.lighting||{})].map(text).join(" ").toLowerCase();
  return /rain|wet|storm|mist|fog|water|skin|fabric|bark|forest|tree|wood|mud|ground|soil|drone|threat|metal|glass|window|search.?light|beam|spotlight/.test(s);
}
export function evaluateImagePrevisualizationAuthority({task={},asset_nodes=[]}={}){
  const r=object(task.input?.requirements);
  const blueprint=object(r.previsualization_blueprint);
  const strategy=object(r.generation_strategy||task.metadata?.generation_strategy);
  const continuityGroup=text(
    strategy.shared_state_group_id ||
    r.continuity_group_id ||
    task.scene_id ||
    task.metadata?.scene_id
  );
  const failures=[];
  if(blueprint.contract!=="CREATIVE_SHOT_PREVISUALIZATION_BLUEPRINT_V1"||blueprint.passed!==true||!text(blueprint.blueprint_digest)) failures.push("PREVIS_BLUEPRINT_PASS_REQUIRED");
  if(!continuityGroup) failures.push("PREVIS_CONTINUITY_GROUP_REQUIRED");
  const sceneId=task.scene_id||task.metadata?.scene_id||null;
  const shotId=task.shot_id||task.metadata?.shot_id||null;
  const hero=CreativeImageAssetHandoffRuntime.select({asset_nodes,scene_id:sceneId,shot_id:shotId,continuity_group_id:continuityGroup,asset_classes:["HERO_FRAME"],downstream_role:"VIDEO"}).selected;
  const continuitySelection=CreativeImageAssetHandoffRuntime.selectContinuity({asset_nodes,scene_id:sceneId,shot_id:shotId,continuity_group_id:continuityGroup,downstream_role:"VIDEO"});
  const continuity=continuitySelection.selected;
  if(!hero) failures.push("PREVIS_HERO_FRAME_REQUIRED");
  if(!continuity) failures.push("PREVIS_CONTINUITY_REFERENCE_REQUIRED");
  let cameraComparison=null;
  if(hero){
    const cameraAuthority=object(hero.metadata?.image_camera_authority);
    if(text(cameraAuthority.contract)!==CreativeImageCameraAuthorityRuntime.contract) failures.push("PREVIS_CAMERA_AUTHORITY_REQUIRED");
    else{
      const expected=CreativeImageCameraAuthorityRuntime.build({
        shot:{
          id:shotId,
          ...r,
          camera:object(r.camera),
          lighting:object(r.lighting),
          virtual_camera_state:object(r.virtual_camera_state),
        },
        task,
      });
      cameraComparison=CreativeImageCameraAuthorityRuntime.compare({
        authority:cameraAuthority,
        cinematography_acquisition:{camera:{
          rig_type:expected.rig_type,sensor_format:expected.sensor_format,
          focal_length_mm:expected.focal_length_mm,aperture_t_stop:expected.aperture_t_stop,
          shutter_angle:expected.shutter_angle_degrees,
        }},
        virtual_camera_state:{start:expected.start,end:expected.end,zoom_or_lens_change_declared:expected.zoom_or_lens_change_declared},
      });
      if(cameraComparison.passed!==true) failures.push(...cameraComparison.failures.map(x=>"PREVIS_"+x));
    }
  }
  let character=null;
  if(humanExpected(task)){
    const identityKey=text(
      r.subject_identity_key ||
      r.identity_requirements?.profile_id ||
      r.identity_requirements?.identity_profile_id ||
      r.performance_contract?.identity_profile_id
    );
    const authority=CreativeImageAssetHandoffRuntime.select({asset_nodes,scene_id:sceneId,shot_id:null,continuity_group_id:continuityGroup,identity_key:identityKey||null,asset_classes:["CHARACTER_SHEET"],downstream_role:"VIDEO"}).selected;
    character=authority?CreativeImageAssetMultiViewHandoffRuntime.select({asset_nodes,parent_asset_node_id:authority.id,continuity_group_id:continuityGroup}):null;
    if(character?.complete!==true) failures.push("PREVIS_CHARACTER_MULTIVIEW_REQUIRED");
  }
  let threat=null;
  if(threatExpected(task)){
    const authority=CreativeImageAssetHandoffRuntime.select({asset_nodes,scene_id:sceneId,shot_id:null,continuity_group_id:continuityGroup,asset_classes:["THREAT_DESIGN"],downstream_role:"VIDEO"}).selected;
    threat=authority?CreativeImageAssetMultiViewHandoffRuntime.select({asset_nodes,parent_asset_node_id:authority.id,continuity_group_id:continuityGroup}):null;
    if(threat?.complete!==true) failures.push("PREVIS_THREAT_MULTIVIEW_REQUIRED");
  }
  const heroBundle=hero?CreativeImageAssetBundleHandoffRuntime.select({asset_nodes,parent_asset_node_id:hero.id,continuity_group_id:continuityGroup}):null;
  if(hero&&!heroBundle?.ready_for_video) failures.push("PREVIS_HERO_DERIVATIVE_BUNDLE_REQUIRED");
  const materials=materialExpected(task)?CreativeImageMaterialTruthPackRuntime.select({asset_nodes,continuity_group_id:continuityGroup}):null;
  if(materialExpected(task)&&materials?.complete!==true) failures.push("PREVIS_MATERIAL_TRUTH_PACK_REQUIRED");
  const pursuit=object(r.pursuit_spatial_choreography);
  if(threatExpected(task)&&!Object.keys(pursuit).length) failures.push("PREVIS_PURSUIT_SPATIAL_CHOREOGRAPHY_REQUIRED");
  const payload={
    contract:CREATIVE_IMAGE_PREVIS_AUTHORITY_CONTRACT,
    blueprint_digest:blueprint.blueprint_digest||null,
    continuity_group_id:continuityGroup||null,
    hero_asset_node_id:hero?.id||null,
    continuity_asset_node_id:continuity?.id||null,
    continuity_source:continuitySelection?.continuity_source||null,
    continuity_reuses_hero:continuitySelection?.continuity_reuses_hero===true,
    hero_derivative_asset_node_ids:heroBundle?[
      heroBundle.subject_segmentation?.id,heroBundle.alpha_matte?.id,heroBundle.depth_map?.id,heroBundle.upscaled_master?.id
    ].filter(Boolean):[],
    character_multiview_asset_node_ids:character?.view_asset_node_ids||[],
    threat_multiview_asset_node_ids:threat?.view_asset_node_ids||[],
    material_truth_asset_node_ids:materials?.assets?.map(a=>a.asset_node_id)||[],
    camera_authority_hash:hero?.metadata?.image_camera_authority_hash||hero?.metadata?.image_camera_authority?.authority_hash||null,
    character_multiview_qc_seal_hash:character?.qc_seal_hash||null,
    threat_multiview_qc_seal_hash:threat?.qc_seal_hash||null,
    material_truth_qc_seal_hash:materials?.qc_seal_hash||null,
    pursuit_spatial_choreography_hash:Object.keys(pursuit).length?hash(pursuit):null,
  };
  return Object.freeze({
    ...payload,
    passed:failures.length===0,
    failures:[...new Set(failures)],
    previsualization_authority_digest:hash(payload),
    zero_provider_calls:true,
    zero_media_generation:true,
  });
}
export const CreativeImagePrevisualizationAuthorityRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_PREVIS_AUTHORITY_CONTRACT,
  evaluate:evaluateImagePrevisualizationAuthority,
});
