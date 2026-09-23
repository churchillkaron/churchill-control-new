import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import crypto from "node:crypto";

import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_IMAGE_ASSET_DERIVATIVE_RECONCILIATION_CONTRACT = "CREATIVE_IMAGE_ASSET_DERIVATIVE_RECONCILIATION_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function stableParentVersion(parent={}){
  return crypto.createHash("sha256").update(JSON.stringify({
    id:parent.id||null,
    checksum:parent.technical?.checksum||null,
    selection_seal:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
    localized_repair_review_task_id:parent.metadata?.localized_repair_review_task_id||null,
    image_asset_review_task_id:parent.metadata?.image_asset_review_task_id||null,
    perceptual_qc_sealed:parent.metadata?.image_asset_perceptual_qc_sealed===true,
  })).digest("hex");
}

export async function reconcileImageAssetDerivatives({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_DERIVATIVE_RECONCILIATION_SCOPE_REQUIRED");
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_derivative_task===true&&text(t.status)==="COMPLETED")){
    const type=text(task.metadata?.derivative_type).toUpperCase();
    const parentId=text(task.metadata?.parent_image_asset_node_id);
    if(!type||!parentId) continue;
    const parent=nodes.find(node=>text(node.id)===parentId)||null;
    const currentParentVersion=parent?stableParentVersion(parent):null;
    if(
      !parent ||
      !currentParentVersion ||
      text(task.metadata?.parent_version_fingerprint)!==text(currentParentVersion)
    ){
      blocked.push({
        task_id:task.id,
        reason:"IMAGE_DERIVATIVE_PARENT_STALE_BEFORE_RECONCILIATION",
        parent_asset_node_id:parentId,
      });
      await ProductionTaskRuntime.update(task.id,{
        status:"FAILED",
        error:"IMAGE_DERIVATIVE_PARENT_STALE",
        metadata:{
          ...object(task.metadata),
          image_derivative_parent_stale:true,
          image_derivative_parent_stale_at:"RECONCILIATION",
        },
      });
      continue;
    }
    const localIds=[
      task.output?.asset_node_id,
      task.output?.output?.segmentation?.node?.id,
      task.output?.output?.alpha?.node?.id,
      task.output?.output?.foreground?.node?.id,
      task.output?.output?.background?.node?.id,
    ].filter(Boolean);
    if(localIds.length){
      for(const id of localIds){
        const node=await AssetGraphRepository.getById(id);
        if(!node) continue;
        await AssetGraphRepository.update(id,{
          metadata:{
            ...object(node.metadata),
            image_asset_derivative_reconciliation_contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_RECONCILIATION_CONTRACT,
            parent_image_asset_node_id:parentId,
            continuity_group_id:task.metadata?.continuity_group_id||null,
            parent_image_asset_pack_qc_seal_hash:task.metadata?.parent_image_asset_pack_qc_seal_hash||null,
            parent_image_asset_exploration_selection_seal_hash:task.metadata?.parent_image_asset_exploration_selection_seal_hash||null,
            parent_version_fingerprint:task.metadata?.parent_version_fingerprint||null,
            parent_source_checksum:task.metadata?.parent_source_checksum||null,
          },
        });
      }
      existing.push(task);
      continue;
    }
    let node=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(task.id))||null;
    if(!node){
      try{
        node=await CreativeAssetGraphRuntime.createFromProductionTask({task,output:task.output||{}});
        created.push(node);
      }catch(error){
        blocked.push({task_id:task.id,reason:"IMAGE_DERIVATIVE_PERSIST_FAILED",detail:error?.message||String(error)});
        continue;
      }
    }else existing.push(node);
    await AssetGraphRepository.update(node.id,{
      status:"DERIVED",
      review:{...object(node.review),approved:false,ai_reviewed:false,notes:"Image derivative requires derivative QC before downstream release."},
      reuse:{...object(node.reuse),approved_for_reuse:false},
      metadata:{
        ...object(node.metadata),
        contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_RECONCILIATION_CONTRACT,
        derivative_type:type,
        parent_image_asset_node_id:parentId,
        continuity_group_id:task.metadata?.continuity_group_id||null,
        parent_image_asset_pack_qc_seal_hash:task.metadata?.parent_image_asset_pack_qc_seal_hash||null,
        parent_image_asset_exploration_selection_seal_hash:task.metadata?.parent_image_asset_exploration_selection_seal_hash||null,
        parent_version_fingerprint:task.metadata?.parent_version_fingerprint||null,
        parent_source_checksum:task.metadata?.parent_source_checksum||null,
        image_asset_derivative_qc_sealed:false,
        release_approved:false,
      },
    });
  }
  return {contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_RECONCILIATION_CONTRACT,created,existing,blocked};
}

export const CreativeImageAssetDerivativeReconciliationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_RECONCILIATION_CONTRACT,
  reconcile:reconcileImageAssetDerivatives,
});
