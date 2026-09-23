import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import crypto from "node:crypto";

import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

export const CREATIVE_IMAGE_ASSET_DERIVATIVE_QC_CONTRACT = "CREATIVE_IMAGE_ASSET_DERIVATIVE_QC_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function derivative(node={}){return text(node.metadata?.derivative_type).toUpperCase();}
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
function parentCurrent(node={},nodes=[]){
  const parent=nodes.find(candidate=>text(candidate.id)===text(node.metadata?.parent_image_asset_node_id))||null;
  if(!parent)return false;
  return text(node.metadata?.parent_version_fingerprint)===text(stableParentVersion(parent));
}
function eligible(node={}){
  return Boolean(node.url)&&text(node.metadata?.parent_image_asset_node_id)&&
    node.metadata?.technical_control_only!==true&&
    text(node.metadata?.derivative_type).toUpperCase()!=="LOCALIZED_REPAIR_MASK"&&
    node.metadata?.image_asset_derivative_qc_sealed!==true&&
    node.metadata?.localized_repair_superseded!==true&&
    !node.metadata?.superseded_by_localized_repair_asset_node_id;
}
function prompt(type){
  return `You are Avantiqo Image Studio derivative QC. Review the actual derivative, not the source intent.
Return strict JSON only:
{
  "passed": true,
  "quality_score": 0,
  "failures": [],
  "repair_instructions": [],
  "affected_asset_node_ids": [],
  "repair_regions_by_asset": [
    {
      "asset_node_id": "",
      "regions": [
        { "label": "", "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0, "instruction": "" }
      ]
    }
  ]
}
Derivative type: ${type}
Rules:
- ALPHA_MATTE / SUBJECT_SEGMENTATION / FOREGROUND_MASK / BACKGROUND_MASK: reject halos, holes, clipped hair/fine edges, spill, chatter-like edge contamination, missing subject regions and obvious background leakage.
- DEPTH_MAP: require plausible relative depth ordering and occlusion boundaries; metric depth claims are forbidden.
- UPSCALED_MASTER: preserve exact identity, geometry, skin/material texture, edge character and world truth; reject invented detail, plastic skin, bark hallucination, halos, oversharpening or changed facial features.
- Any derivative that changes the governed subject/world identity FAILS.
- On FAIL, affected_asset_node_ids must contain the reviewed derivative asset node id.
- For spatially local defects return tight normalized repair regions. Never request a full-frame edit for a local halo, edge, hole, facial detail or texture defect.
Minimum quality_score: 94.`;
}
function parse(value){
  if(!value)return null;
  if(typeof value==="object"){
    for(const c of [value.result,value.review,value.validation,value.output,value]){if(c&&typeof c==="object"&&"passed" in c)return c;if(typeof c==="string"){const p=parse(c);if(p)return p;}}
    return null;
  }
  const s=text(value),a=s.indexOf("{"),b=s.lastIndexOf("}");if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch{return null;}
}

export async function ensureDerivativeQc({organization_id,creative_project_id}={}){
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];
  for(const node of list(nodes).filter(node=>eligible(node)&&parentCurrent(node,nodes))){
    const identity=`image-derivative-qc:${node.id}`;
    const prior=tasks.find(t=>text(t.metadata?.image_asset_derivative_qc_identity)===identity);
    if(prior){existing.push(prior);continue;}
    const url=await signCreativeStorageReference({organization_id,reference:node.url,expires_in:1800});
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:null,
      scene_id:node.metadata?.scene_id||null,shot_id:node.metadata?.shot_id||null,
      type:"QUALITY_REVIEW",status:"WAITING",title:`Review ${derivative(node)} · ${node.name||node.id}`,
      description:"Review Image Studio production derivative before downstream release.",
      service_id:"ai.image.analyze",service_code:"ai.image.analyze",capability:"ai.image.analyze",provider_id:null,priority:27,
      input:{media_kind:"IMAGE",image:url,source:url,assets:[{url,role:derivative(node)}],prompt:prompt(derivative(node)),provider_prompt:prompt(derivative(node)),requirements:{image_asset_derivative_qc:true,derivative_asset_node_id:node.id,derivative_type:derivative(node),minimum_quality_score:94,fail_closed:true},provider_parameters:{response_format:{type:"json_object"}}},
      cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_QC_CONTRACT,image_asset_derivative_qc:true,image_asset_derivative_qc_identity:identity,derivative_asset_node_id:node.id,derivative_type:derivative(node),quality_gate:true}
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_QC_CONTRACT,created,existing};
}

export async function reconcileDerivativeQc({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const sealed=[];const failed=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_derivative_qc===true&&text(t.status)==="COMPLETED"&&t.metadata?.image_asset_derivative_qc_sealed!==true)){
    const result=parse(task.output);
    const node=nodes.find(candidate=>text(candidate.id)===text(task.metadata?.derivative_asset_node_id))
      || await AssetGraphRepository.getById(task.metadata?.derivative_asset_node_id);
    if(!node) continue;
    const current=parentCurrent(node,nodes);
    const pass=current&&result?.passed===true&&Number(result?.quality_score)>=94&&list(result?.failures).length===0;
    await AssetGraphRepository.update(node.id,{
      status:pass?"APPROVED":"DERIVED",
      review:{...object(node.review),ai_reviewed:true,approved:pass,notes:pass?"Derivative QC passed.":"Derivative QC failed."},
      metadata:{...object(node.metadata),image_asset_derivative_qc_sealed:pass,image_asset_derivative_qc_failed:!pass,image_derivative_parent_stale:!current,image_asset_derivative_qc_task_id:task.id,derivative_quality_score:Number(result?.quality_score)||null,release_approved:pass,derivative_failures:list(result?.failures),derivative_repair_instructions:list(result?.repair_instructions)}
    });
    await ProductionTaskRuntime.update(task.id,{
      metadata:{...object(task.metadata),image_asset_derivative_qc_sealed:pass},
      review:{required:false,approved:pass},
      output:{...object(task.output),image_asset_derivative_qc:result||null},
      ...(pass?{}:{
        status:"FAILED",
        error:current
          ?"IMAGE_ASSET_DERIVATIVE_QC_FAILED"
          :"IMAGE_DERIVATIVE_PARENT_STALE_DURING_QC",
      })
    });
    (pass?sealed:failed).push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_QC_CONTRACT,sealed,failed};
}

export const CreativeImageAssetDerivativeQcRuntime=Object.freeze({contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_QC_CONTRACT,ensure:ensureDerivativeQc,reconcile:reconcileDerivativeQc});
