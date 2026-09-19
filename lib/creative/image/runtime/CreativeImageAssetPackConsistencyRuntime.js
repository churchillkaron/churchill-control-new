import crypto from "node:crypto";

import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

export const CREATIVE_IMAGE_ASSET_PACK_CONSISTENCY_CONTRACT = "CREATIVE_IMAGE_ASSET_PACK_CONSISTENCY_V1";
export const CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_CONTRACT = "CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function authority(node={}){return object(node.metadata?.image_asset_authority);}
function continuityGroup(node={}){return text(node.metadata?.continuity_group_id||authority(node).continuity_group_id);}
function assetClass(node={}){return text(node.metadata?.image_asset_class||authority(node).asset_class).toUpperCase();}
function approved(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_perceptual_qc_sealed===true &&
    Boolean(node.url);
}
function parseJson(value){
  if(!value) return null;
  if(typeof value==="object"&&!Array.isArray(value)){
    for(const candidate of [value.result,value.review,value.validation,value.output,value]){
      if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&(
        "passed" in candidate || "pack_consistency_score" in candidate || "identity_consistency_score" in candidate
      )) return candidate;
      if(typeof candidate==="string"){
        const parsed=parseJson(candidate);if(parsed)return parsed;
      }
    }
    return null;
  }
  const source=text(value);
  if(!source)return null;
  const first=source.indexOf("{");const last=source.lastIndexOf("}");
  if(first<0||last<=first)return null;
  try{return JSON.parse(source.slice(first,last+1));}catch{return null;}
}
function prompt(group,nodes){
  const classes=[...new Set(nodes.map(assetClass))];
  const identityMap=nodes.map(node=>({
    asset_node_id:node.id,
    asset_class:assetClass(node),
    subject_identity_key:node.metadata?.subject_identity_key||null,
    identity_profile_id:node.metadata?.identity_profile_id||null,
  }));
  const distinctIdentityKeys=[...new Set(identityMap.map(row=>text(row.subject_identity_key||row.identity_profile_id)).filter(Boolean))];
  return `You are Avantiqo Image Studio's asset-pack continuity supervisor.
Compare ALL supplied images as one governed production pack. Do not judge them independently.
Return strict JSON only:
{
  "passed": true,
  "pack_consistency_score": 0,
  "identity_consistency_score": 0,
  "identity_separation_valid": true,
  "identity_consistency_by_key": {},
  "body_proportion_score": 0,
  "wardrobe_continuity_score": 0,
  "world_consistency_score": 0,
  "lighting_continuity_score": 0,
  "material_continuity_score": 0,
  "threat_geometry_score": 0,
  "lens_language_score": 0,
  "production_usability_score": 0,
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

Continuity group: ${group}
Asset classes: ${classes.join(", ")}
Identity-aware asset map: ${JSON.stringify(identityMap)}
Distinct governed identity keys: ${JSON.stringify(distinctIdentityKeys)}

PACK RULES:
- Treat the pack as one photographed visual world, not a collection of individually attractive AI images.
- Identity keys are authoritative. Assets with different non-empty subject_identity_key / identity_profile_id values are intentionally different people and MUST NOT be forced toward one averaged face.
- For each individual identity key, require exact facial geometry, age, body proportions, hair, wardrobe construction and stable distinguishing features across every relevant frame.
- Set identity_separation_valid=false if two governed identities collapse toward the same synthetic person, swap identities, or if one identity leaks facial/body traits into another.
- identity_consistency_by_key must score every visible governed identity independently from 0..100.
- Wardrobe may become wetter, dirtier or damaged only through authored causal progression; it may not redesign itself.
- Same environment means stable tree species, density logic, path/terrain identity, architecture, props, practical-light logic, palette and atmosphere physics.
- Same threat/hero object means stable geometry, silhouette, proportions, lights, materials and scale language across threat design, VFX source and hero frames.
- Lens/camera language may vary intentionally but must remain inside one authored capture system; reject unrelated synthetic depth-of-field, inconsistent perspective or arbitrary focal-length feeling.
- Reject beauty-filter identity drift, different actors, different drone designs, wardrobe redesign, world substitution, forest geometry replacement, random lighting resets, material swaps, generic AI signatures or any image that is only approximately similar.
- A high average cannot hide one broken continuity dimension.
- When FAILING, identify only the asset_node_ids that actually need repair. Do not mark every asset affected by default.
- For a spatially local defect, return normalized repair regions (x/y/width/height in 0..1) tightly around the defect and a surgical instruction.
- If the failure requires whole-image redesign rather than localized repair, omit repair_regions for that asset so localized repair fails closed.

MINIMUMS:
pack_consistency_score >= 94
identity_consistency_score >= 96 when a person is present
body_proportion_score >= 95 when a person is present
wardrobe_continuity_score >= 95 when wardrobe is visible
world_consistency_score >= 95
lighting_continuity_score >= 94
material_continuity_score >= 94
threat_geometry_score >= 96 when a threat/hero object is present
lens_language_score >= 92
production_usability_score >= 94
`;
}
function passed(result={}){
  const scores=[
    ["pack_consistency_score",94],
    ["world_consistency_score",95],
    ["lighting_continuity_score",94],
    ["material_continuity_score",94],
    ["lens_language_score",92],
    ["production_usability_score",94],
  ];
  for(const [key,min] of scores){
    const value=finite(result[key]);if(value===null||value<min)return false;
  }
  if(result.identity_separation_valid!==true)return false;
  if(finite(result.identity_consistency_score)!==null&&finite(result.identity_consistency_score)<96)return false;
  for(const value of Object.values(object(result.identity_consistency_by_key))){
    const score=finite(value);if(score===null||score<96)return false;
  }
  if(finite(result.body_proportion_score)!==null&&finite(result.body_proportion_score)<95)return false;
  if(finite(result.wardrobe_continuity_score)!==null&&finite(result.wardrobe_continuity_score)<95)return false;
  if(finite(result.threat_geometry_score)!==null&&finite(result.threat_geometry_score)<96)return false;
  return result.passed===true && list(result.failures).length===0;
}

export async function ensureImageAssetPackReviews({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_ASSET_PACK_SCOPE_REQUIRED");
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const groups=new Map();
  for(const node of list(nodes).filter(approved)){
    if(text(node.metadata?.image_asset_class)==="MATERIAL_DETAIL_REFERENCE") continue;
    if(node.metadata?.localized_repair_superseded===true||node.metadata?.superseded_by_localized_repair_asset_node_id) continue;
    if(node.metadata?.image_asset_exploration_group_id&&node.metadata?.image_asset_exploration_selected!==true) continue;
    const group=continuityGroup(node);if(!group)continue;
    const bucket=groups.get(group)||[];bucket.push(node);groups.set(group,bucket);
  }
  const created=[];const existing=[];const blocked=[];const singletonSealed=[];
  for(const [group,assets] of groups){
    if(assets.length===1){
      const asset=assets[0];
      const singletonHash=hash({
        contract:CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_CONTRACT,
        continuity_group_id:group,
        singleton_asset_node_id:asset.id,
        checksum:asset.technical?.checksum||null,
        perceptual_qc_sealed:asset.metadata?.image_asset_perceptual_qc_sealed===true,
      });
      if(asset.metadata?.image_asset_pack_qc_seal_hash!==singletonHash){
        await AssetGraphRepository.update(asset.id,{
          metadata:{
            ...object(asset.metadata),
            image_asset_pack_qc_sealed:true,
            image_asset_pack_qc_failed:false,
            image_asset_pack_qc_seal_hash:singletonHash,
            image_asset_pack_singleton:true,
          },
        });
        singletonSealed.push(asset.id);
      }
      continue;
    }
    const packHash=hash(assets.map(a=>({id:a.id,checksum:a.technical?.checksum||null,class:assetClass(a)})).sort((a,b)=>a.id.localeCompare(b.id)));
    const prior=tasks.find(t=>text(t.metadata?.image_asset_pack_hash)===packHash);
    if(prior){existing.push(prior);continue;}
    const signed=[];
    try{
      for(const asset of assets){
        signed.push({
          url:await signCreativeStorageReference({organization_id,reference:asset.url,expires_in:1800}),
          role:assetClass(asset),
          asset_node_id:asset.id,
        });
      }
    }catch(error){
      blocked.push({continuity_group_id:group,reason:"IMAGE_ASSET_PACK_SIGNING_FAILED",detail:error?.message||String(error)});
      continue;
    }
    const task=await ProductionTaskRuntime.create({
      organization_id,
      creative_project_id,
      production_graph_id:null,
      scene_id:authority(assets[0]).scene_id||assets[0].metadata?.scene_id||null,
      shot_id:null,
      type:"EXECUTE_CAPABILITY",
      status:"WAITING",
      title:`Review Image Asset Pack · ${group}`,
      description:"Cross-review the entire Image Studio continuity pack before any member can become authoritative downstream source material.",
      service_id:"ai.image.analyze",
      service_code:"ai.image.analyze",
      capability:"ai.image.analyze",
      provider_id:null,
      priority:24,
      input:{
        media_kind:"IMAGE",
        assets:signed,
        images:signed.map(item=>item.url),
        reference_images:signed,
        prompt:prompt(group,assets),
        provider_prompt:prompt(group,assets),
        requirements:{
          image_asset_pack_review:true,
          continuity_group_id:group,
          image_asset_node_ids:assets.map(a=>a.id),
          pack_hash:packHash,
          minimum_pack_consistency_score:94,
          fail_closed:true,
        },
        provider_parameters:{
          response_format:{type:"json_object"},
          images:signed.map(item=>item.url),
          continuity_group_id:group,
        },
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},
      timing:{estimated_seconds:0},
      review:{required:false,approved:false},
      metadata:{
        contract:CREATIVE_IMAGE_ASSET_PACK_CONSISTENCY_CONTRACT,
        image_asset_pack_review:true,
        image_asset_pack_hash:packHash,
        continuity_group_id:group,
        image_asset_node_ids:assets.map(a=>a.id),
        quality_gate:true,
        release_candidate:false,
      },
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_PACK_CONSISTENCY_CONTRACT,created,existing,blocked,singletonSealed};
}

export async function reconcileImageAssetPackReviews({organization_id,creative_project_id}={}){
  const tasks=await ProductionTaskRuntime.list({organization_id,creative_project_id});
  const sealed=[];const failed=[];const pending=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_pack_review===true)){
    if(text(task.status)==="WAITING"||text(task.status)==="RUNNING"){pending.push(task);continue;}
    if(task.metadata?.image_asset_pack_qc_sealed===true){sealed.push(task);continue;}
    if(text(task.status)!=="COMPLETED"){failed.push(task);continue;}
    const result=parseJson(task.output);
    if(!result){failed.push(await ProductionTaskRuntime.update(task.id,{status:"FAILED",error:"IMAGE_ASSET_PACK_REVIEW_RESULT_REQUIRED"}));continue;}
    const assetIds=list(task.metadata?.image_asset_node_ids);
    if(!passed(result)){
      for(const id of assetIds){
        const node=await AssetGraphRepository.getById(id);if(!node)continue;
        await AssetGraphRepository.update(id,{
          metadata:{
            ...object(node.metadata),
            image_asset_pack_qc_sealed:false,
            image_asset_pack_qc_failed:true,
            image_asset_pack_review_task_id:task.id,
            image_asset_pack_failures:list(result.failures),
            image_asset_pack_repair_instructions:list(result.repair_instructions),
          },
        });
      }
      failed.push(await ProductionTaskRuntime.update(task.id,{
        status:"FAILED",
        error:"IMAGE_ASSET_PACK_CONSISTENCY_FAILED",
        review:{...object(task.review),approved:false,required:false},
        output:{...object(task.output),image_asset_pack_consistency:result},
      }));
      continue;
    }
    const sealHash=hash({
      contract:CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_CONTRACT,
      pack_hash:task.metadata?.image_asset_pack_hash,
      continuity_group_id:task.metadata?.continuity_group_id,
      scores:result,
    });
    for(const id of assetIds){
      const node=await AssetGraphRepository.getById(id);if(!node)continue;
      await AssetGraphRepository.update(id,{
        metadata:{
          ...object(node.metadata),
          image_asset_pack_qc_sealed:true,
          image_asset_pack_qc_failed:false,
          image_asset_pack_qc_seal_contract:CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_CONTRACT,
          image_asset_pack_qc_seal_hash:sealHash,
          image_asset_pack_review_task_id:task.id,
          image_asset_pack_consistency_score:finite(result.pack_consistency_score),
        },
      });
    }
    sealed.push(await ProductionTaskRuntime.update(task.id,{
      review:{...object(task.review),approved:true,required:false,approved_by:"AVANTIQO_IMAGE_ASSET_PACK_QC"},
      metadata:{
        ...object(task.metadata),
        image_asset_pack_qc_sealed:true,
        image_asset_pack_qc_seal_contract:CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_CONTRACT,
        image_asset_pack_qc_seal_hash:sealHash,
      },
      output:{...object(task.output),image_asset_pack_consistency:result},
    }));
  }
  return {contract:CREATIVE_IMAGE_ASSET_PACK_CONSISTENCY_CONTRACT,sealed,failed,pending};
}

export const CreativeImageAssetPackConsistencyRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_PACK_CONSISTENCY_CONTRACT,
  seal_contract:CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_CONTRACT,
  ensure:ensureImageAssetPackReviews,
  reconcile:reconcileImageAssetPackReviews,
});
