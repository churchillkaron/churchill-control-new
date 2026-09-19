import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CREATIVE_IMAGE_ASSET_AUTHORITY_CONTRACT } from "@/lib/creative/image/runtime/CreativeImageAssetAuthorityRuntime";

export const CREATIVE_IMAGE_ASSET_RECONCILIATION_CONTRACT = "CREATIVE_IMAGE_ASSET_RECONCILIATION_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}

export async function reconcileImageAssets({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_ASSET_RECONCILIATION_SCOPE_REQUIRED");
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const task of list(tasks)){
    const authority=object(task.input?.requirements?.image_asset_authority);
    if(text(authority.contract)!==CREATIVE_IMAGE_ASSET_AUTHORITY_CONTRACT) continue;
    if(text(authority.asset_class)==="MATERIAL_DETAIL_REFERENCE") continue;
    if(text(task.status)!=="COMPLETED") continue;
    if(task.metadata?.approved_for_downstream_after_perceptual_review!==true){
      blocked.push({task_id:task.id,reason:"IMAGE_ASSET_PERCEPTUAL_APPROVAL_REQUIRED"});continue;
    }
    let node=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(task.id))||null;
    if(!node){
      try{
        node=await CreativeAssetGraphRuntime.createFromProductionTask({task,output:task.output||{}});
        created.push(node);
      }catch(error){
        blocked.push({task_id:task.id,reason:"IMAGE_ASSET_PERSIST_FAILED",detail:error?.message||String(error)});
        continue;
      }
    }else{
      existing.push(node);
    }
    const approved=await AssetGraphRepository.update(node.id,{
      status:"APPROVED",
      review:{
        ...object(node.review),
        ai_reviewed:true,
        approved:true,
        notes:"Image Studio asset passed governed perceptual review and is approved for declared downstream roles.",
      },
      reuse:{
        ...object(node.reuse),
        reusable:false,
        approved_for_reuse:false,
      },
      metadata:{
        ...object(node.metadata),
        contract:CREATIVE_IMAGE_ASSET_RECONCILIATION_CONTRACT,
        image_asset_authority:authority,
        image_asset_class:authority.asset_class,
        continuity_group_id:authority.continuity_group_id||null,
        material_truth_reference:
          task.metadata?.material_truth_reference===true ||
          task.input?.requirements?.material_truth_reference?.physical_surface_authority===true,
        material_truth_key:
          task.metadata?.material_truth_key ||
          task.input?.requirements?.material_truth_reference?.material_truth_key ||
          null,
        approved_for_video_source:authority.approved_for_video_source===true,
        approved_for_vfx_source:authority.approved_for_vfx_source===true,
        approved_for_compositing_source:authority.approved_for_compositing_source===true,
        image_asset_perceptual_qc_sealed:true,
        image_asset_source_task_id:task.id,
        image_asset_review_task_id:task.metadata?.perceptual_review_task_id||null,
        image_camera_authority:
          task.input?.requirements?.image_camera_authority ||
          task.input?.generation?.provider_parameters?.image_camera_authority ||
          null,
        image_camera_authority_contract:
          task.input?.requirements?.image_camera_authority?.contract ||
          task.metadata?.image_camera_authority_contract ||
          null,
        image_camera_authority_hash:
          task.input?.requirements?.image_camera_authority?.authority_hash ||
          task.metadata?.image_camera_authority_hash ||
          null,
        image_asset_exploration_group_id:
          task.metadata?.image_asset_exploration_group_id ||
          task.input?.requirements?.image_asset_exploration?.exploration_group_id ||
          null,
        image_asset_variation_id:
          task.metadata?.image_asset_variation_id ||
          task.input?.requirements?.image_asset_exploration?.variation_id ||
          null,
        image_asset_variation_axis:
          task.metadata?.image_asset_variation_axis ||
          task.input?.requirements?.image_asset_exploration?.variation_axis ||
          null,
        subject_identity_key:
          task.metadata?.subject_identity_key ||
          task.input?.requirements?.subject_identity_key ||
          task.input?.requirements?.identity_requirements?.profile_id ||
          task.input?.requirements?.identity_requirements?.identity_profile_id ||
          task.input?.requirements?.performance_contract?.identity_profile_id ||
          null,
        threat_identity_key:
          task.metadata?.threat_identity_key ||
          task.input?.requirements?.threat_identity_key ||
          task.input?.requirements?.environmental_continuity_state?.moving_threat_state?.identity_key ||
          task.input?.requirements?.environmental_continuity_state?.moving_threat_state?.threat_identity_key ||
          task.input?.requirements?.environmental_continuity_state?.moving_threat_state?.threat_id ||
          task.input?.requirements?.pursuit_spatial_choreography?.threat_identity_key ||
          task.input?.requirements?.pursuit_spatial_choreography?.threat_id ||
          task.input?.requirements?.pursuit_spatial_choreography?.predator_id ||
          null,
        identity_profile_id:
          task.metadata?.identity_profile_id ||
          task.input?.requirements?.identity_profile_id ||
          task.input?.requirements?.identity_requirements?.profile_id ||
          task.input?.requirements?.identity_requirements?.identity_profile_id ||
          task.input?.requirements?.performance_contract?.identity_profile_id ||
          null,
        image_foundation_authority_contract:
          task.metadata?.image_foundation_authority_contract ||
          task.input?.requirements?.image_foundation_authority?.contract ||
          null,
        image_foundation_authority_digest:
          task.metadata?.image_foundation_authority_digest ||
          task.input?.requirements?.image_foundation_authority_digest ||
          task.input?.requirements?.image_foundation_authority?.foundation_authority_digest ||
          null,
        image_asset_exploration_selected:
          task.input?.requirements?.image_asset_exploration ? false : true,
        release_approved:true,
      },
    });
    const idx=nodes.findIndex(n=>n.id===node.id);
    if(idx>=0) nodes[idx]=approved; else nodes.push(approved);
  }
  return {
    contract:CREATIVE_IMAGE_ASSET_RECONCILIATION_CONTRACT,
    created,
    existing,
    blocked,
    approved_count:created.length+existing.length,
  };
}

export const CreativeImageAssetReconciliationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_RECONCILIATION_CONTRACT,
  reconcile:reconcileImageAssets,
});
