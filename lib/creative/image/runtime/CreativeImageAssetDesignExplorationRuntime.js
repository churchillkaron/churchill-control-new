import crypto from "node:crypto";

import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

export const CREATIVE_IMAGE_DESIGN_EXPLORATION_CONTRACT = "CREATIVE_IMAGE_DESIGN_EXPLORATION_V1";
export const CREATIVE_IMAGE_DESIGN_EXPLORATION_SELECTION_CONTRACT = "CREATIVE_IMAGE_DESIGN_EXPLORATION_SELECTION_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function approved(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_perceptual_qc_sealed===true &&
    Boolean(node.url);
}
function groupId(node={}){return text(node.metadata?.image_asset_exploration_group_id);}
function variationId(node={}){return text(node.metadata?.image_asset_variation_id);}
function assetClass(node={}){return text(node.metadata?.image_asset_class).toUpperCase();}
function parseJson(value){
  if(!value)return null;
  if(typeof value==="object"&&!Array.isArray(value)){
    for(const candidate of [value.result,value.review,value.validation,value.output,value]){
      if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&(
        "selected_asset_node_id" in candidate || "passed" in candidate || "selection_score" in candidate
      )) return candidate;
      if(typeof candidate==="string"){
        const parsed=parseJson(candidate);if(parsed)return parsed;
      }
    }
    return null;
  }
  const source=text(value);if(!source)return null;
  const first=source.indexOf("{");const last=source.lastIndexOf("}");
  if(first<0||last<=first)return null;
  try{return JSON.parse(source.slice(first,last+1));}catch{return null;}
}
function selectionPrompt(group,assets){
  const rows=assets.map(a=>({
    asset_node_id:a.id,
    variation_id:variationId(a),
    variation_axis:a.metadata?.image_asset_variation_axis||null,
    asset_class:assetClass(a),
  }));
  return `You are Avantiqo Image Studio's senior art director and continuity supervisor.
Select ONE production asset from a controlled design exploration. The candidates intentionally vary composition, lighting, spatial pressure or design emphasis while identity/world authority must remain unchanged.

Return strict JSON only:
{
  "passed": true,
  "selected_asset_node_id": "",
  "selection_score": 0,
  "design_distinctiveness_score": 0,
  "premium_visual_authorship_score": 0,
  "continuity_fidelity_score": 0,
  "production_usability_score": 0,
  "near_duplicate_rejected": true,
  "selection_reason": "",
  "rejected_asset_node_ids": [],
  "failures": []
}

Exploration group: ${group}
Candidates: ${JSON.stringify(rows)}

RULES:
- Select the strongest authored visual solution, not the safest average.
- Identity, body proportions, wardrobe, world geometry, threat geometry and continuity authority may NOT change between candidates.
- Variation must come from composition, lighting hierarchy, lens/spatial pressure, silhouette, negative space, reveal strategy or material emphasis.
- Reject a set if the three candidates are near-duplicates with superficial prompt variation.
- Reject a candidate if it gains drama by changing the person, object design, environment identity, wardrobe, weather continuity or governed world state.
- Prefer a frame that can serve as production authority downstream, not merely look impressive as a standalone AI image.
- The selected candidate must score at least 96 for premium visual authorship, 97 for continuity fidelity and 96 for production usability.
- If no candidate clears all floors, passed=false and selected_asset_node_id must be empty.
`;
}

export async function ensureImageAssetExplorationSelections({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_EXPLORATION_SCOPE_REQUIRED");
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const groups=new Map();
  for(const node of list(nodes).filter(approved)){
    const group=groupId(node);if(!group)continue;
    const bucket=groups.get(group)||[];bucket.push(node);groups.set(group,bucket);
  }
  const created=[];const existing=[];const blocked=[];
  for(const [group,assets] of groups){
    if(assets.length<3){
      blocked.push({exploration_group_id:group,reason:"IMAGE_EXPLORATION_THREE_APPROVED_CANDIDATES_REQUIRED",candidate_count:assets.length});
      continue;
    }
    const sorted=assets.slice().sort((a,b)=>variationId(a).localeCompare(variationId(b)));
    const candidateHash=hash(sorted.map(a=>({id:a.id,checksum:a.technical?.checksum||null,variation:variationId(a)})));
    const prior=tasks.find(t=>text(t.metadata?.image_exploration_candidate_hash)===candidateHash);
    if(prior){existing.push(prior);continue;}
    const signed=[];
    try{
      for(const asset of sorted){
        signed.push({
          url:await signCreativeStorageReference({organization_id,reference:asset.url,expires_in:1800}),
          role:`CANDIDATE_${variationId(asset)}_${asset.metadata?.image_asset_variation_axis||"DESIGN"}`,
          asset_node_id:asset.id,
        });
      }
    }catch(error){
      blocked.push({exploration_group_id:group,reason:"IMAGE_EXPLORATION_SIGNING_FAILED",detail:error?.message||String(error)});
      continue;
    }
    const prompt=selectionPrompt(group,sorted);
    const task=await ProductionTaskRuntime.create({
      organization_id,
      creative_project_id,
      production_graph_id:null,
      scene_id:sorted[0]?.metadata?.scene_id||null,
      shot_id:sorted[0]?.metadata?.shot_id||null,
      type:"EXECUTE_CAPABILITY",
      status:"WAITING",
      title:`Select Image Studio Design · ${group}`,
      description:"Select the strongest controlled Image Studio design variation while holding identity/world authority constant.",
      service_id:"ai.image.analyze",
      service_code:"ai.image.analyze",
      capability:"ai.image.analyze",
      provider_id:null,
      priority:23,
      input:{
        media_kind:"IMAGE",
        assets:signed,
        images:signed.map(item=>item.url),
        reference_images:signed,
        prompt,
        provider_prompt:prompt,
        requirements:{
          image_asset_design_exploration_selection:true,
          exploration_group_id:group,
          candidate_asset_node_ids:sorted.map(a=>a.id),
          candidate_hash:candidateHash,
          minimum_premium_visual_authorship_score:96,
          minimum_continuity_fidelity_score:97,
          minimum_production_usability_score:96,
          near_duplicate_rejection_required:true,
          fail_closed:true,
        },
        provider_parameters:{
          response_format:{type:"json_object"},
          images:signed.map(item=>item.url),
          exploration_group_id:group,
        },
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},
      timing:{estimated_seconds:0},
      review:{required:false,approved:false},
      metadata:{
        contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_SELECTION_CONTRACT,
        image_asset_design_exploration_selection:true,
        image_exploration_candidate_hash:candidateHash,
        exploration_group_id:group,
        candidate_asset_node_ids:sorted.map(a=>a.id),
        quality_gate:true,
      },
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_CONTRACT,created,existing,blocked};
}

export async function reconcileImageAssetExplorationSelections({organization_id,creative_project_id}={}){
  const tasks=await ProductionTaskRuntime.list({organization_id,creative_project_id});
  const selected=[];const failed=[];const pending=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_design_exploration_selection===true)){
    if(text(task.status)==="WAITING"||text(task.status)==="RUNNING"){pending.push(task);continue;}
    if(task.metadata?.image_asset_exploration_selection_sealed===true){selected.push(task);continue;}
    if(text(task.status)!=="COMPLETED"){failed.push(task);continue;}
    const result=parseJson(task.output);
    const allowed=new Set(list(task.metadata?.candidate_asset_node_ids).map(text));
    const selectedId=text(result?.selected_asset_node_id);
    const validSelection=
      result?.passed===true &&
      allowed.has(selectedId) &&
      Number(result?.premium_visual_authorship_score)>=96 &&
      Number(result?.continuity_fidelity_score)>=97 &&
      Number(result?.production_usability_score)>=96 &&
      result?.near_duplicate_rejected===true &&
      list(result?.failures).length===0;
    if(!validSelection){
      for(const id of allowed){
        const node=await AssetGraphRepository.getById(id);if(!node)continue;
        await AssetGraphRepository.update(id,{
          metadata:{
            ...object(node.metadata),
            image_asset_exploration_selected:false,
            image_asset_exploration_selection_failed:true,
            image_asset_exploration_selection_task_id:task.id,
          },
        });
      }
      failed.push(await ProductionTaskRuntime.update(task.id,{
        status:"FAILED",
        error:"IMAGE_ASSET_DESIGN_EXPLORATION_SELECTION_FAILED",
        review:{...object(task.review),required:false,approved:false},
        output:{...object(task.output),image_asset_design_exploration:result||null},
      }));
      continue;
    }
    const sealHash=hash({
      contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_SELECTION_CONTRACT,
      exploration_group_id:task.metadata?.exploration_group_id,
      selected_asset_node_id:selectedId,
      candidate_hash:task.metadata?.image_exploration_candidate_hash,
      result,
    });
    for(const id of allowed){
      const node=await AssetGraphRepository.getById(id);if(!node)continue;
      await AssetGraphRepository.update(id,{
        metadata:{
          ...object(node.metadata),
          image_asset_exploration_selected:id===selectedId,
          image_asset_exploration_rejected:id!==selectedId,
          image_asset_exploration_selection_task_id:task.id,
          image_asset_exploration_selection_contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_SELECTION_CONTRACT,
          image_asset_exploration_selection_seal_hash:sealHash,
          image_asset_exploration_selection_score:id===selectedId?Number(result.selection_score)||null:null,
        },
      });
    }
    selected.push(await ProductionTaskRuntime.update(task.id,{
      review:{...object(task.review),required:false,approved:true,approved_by:"AVANTIQO_IMAGE_STUDIO_ART_DIRECTION"},
      metadata:{
        ...object(task.metadata),
        image_asset_exploration_selection_sealed:true,
        image_asset_exploration_selected_asset_node_id:selectedId,
        image_asset_exploration_selection_seal_hash:sealHash,
      },
      output:{...object(task.output),image_asset_design_exploration:result},
    }));
  }
  return {contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_CONTRACT,selected,failed,pending};
}

export const CreativeImageAssetDesignExplorationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_CONTRACT,
  selection_contract:CREATIVE_IMAGE_DESIGN_EXPLORATION_SELECTION_CONTRACT,
  ensure:ensureImageAssetExplorationSelections,
  reconcile:reconcileImageAssetExplorationSelections,
});
