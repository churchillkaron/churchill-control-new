import crypto from "node:crypto";

import crypto from "node:crypto";

import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeImageLocalizedRepairMaskRuntime } from "@/lib/creative/image/runtime/CreativeImageLocalizedRepairMaskRuntime";

export const CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT = "CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_V1";
export const CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_REVIEW_CONTRACT = "CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_REVIEW_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}

function parse(value){
  if(!value)return null;
  if(typeof value==="object"&&!Array.isArray(value)){
    for(const c of [
      value.image_asset_pack_consistency,
      value.image_multiview_consistency,
      value.image_asset_derivative_qc,
      value.material_truth_qc,
      value.result,value.review,value.validation,value.output,value,
    ]){
      if(c&&typeof c==="object"&&!Array.isArray(c)&&(
        "affected_asset_node_ids" in c || "repair_regions_by_asset" in c || "passed" in c
      )) return c;
      if(typeof c==="string"){const p=parse(c);if(p)return p;}
    }
    return null;
  }
  const s=text(value),a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch{return null;}
}

function failedImageQc(task={}){
  return text(task.status)==="FAILED" && (
    task.metadata?.image_asset_pack_review===true ||
    task.metadata?.image_asset_multiview_qc===true ||
    task.metadata?.image_asset_derivative_qc===true ||
    task.metadata?.material_truth_qc===true
  );
}
function qualityKind(task={}){
  if(task.metadata?.image_asset_pack_review===true) return "PACK";
  if(task.metadata?.image_asset_multiview_qc===true) return "MULTIVIEW";
  if(task.metadata?.image_asset_derivative_qc===true) return "DERIVATIVE";
  if(task.metadata?.material_truth_qc===true) return "MATERIAL_TRUTH";
  return null;
}
function normalizedRegion(region={}){
  const x=finite(region.x),y=finite(region.y),width=finite(region.width),height=finite(region.height);
  if([x,y,width,height].some(v=>v===null)) return null;
  if(x<0||y<0||width<=0||height<=0||x+width>1.0001||y+height>1.0001) return null;
  const area=width*height;
  if(area>0.45) return null;
  return {
    label:text(region.label)||"localized defect",
    x:Number(x.toFixed(4)),y:Number(y.toFixed(4)),
    width:Number(width.toFixed(4)),height:Number(height.toFixed(4)),
    area:Number(area.toFixed(4)),
    instruction:text(region.instruction),
  };
}
function repairRegions(result={},assetId){
  const row=list(result.repair_regions_by_asset).find(r=>text(r.asset_node_id)===text(assetId));
  return list(row?.regions).map(normalizedRegion).filter(Boolean).filter(r=>r.instruction);
}
function affectedIds(task={},result={}){
  const explicit=list(result.affected_asset_node_ids).map(text).filter(Boolean);
  if(explicit.length) return [...new Set(explicit)];
  if(task.metadata?.image_asset_derivative_qc===true){
    return [text(task.metadata?.derivative_asset_node_id)].filter(Boolean);
  }
  return [];
}
function repairIdentity(task,asset,regions){
  return hash({
    contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,
    quality_task_id:task.id,asset_node_id:asset.id,
    checksum:asset.technical?.checksum||asset.metadata?.checksum_sha256||null,
    regions,
  });
}
function editPrompt({asset,task,result,regions}){
  return [
    "Avantiqo Image Studio localized production repair.",
    "Repair ONLY the declared normalized regions. Preserve every pixel relationship outside those regions as closely as the edit engine permits.",
    "This is not a redesign and not a new creative variation.",
    `Quality context: ${qualityKind(task)}.`,
    `Source asset node: ${asset.id}.`,
    `Failures: ${JSON.stringify(list(result.failures))}.`,
    `Global repair instructions: ${JSON.stringify(list(result.repair_instructions))}.`,
    `Localized regions: ${JSON.stringify(regions)}.`,
    "Hard preservation: exact person/object identity, face geometry, age, body/object proportions, wardrobe/material construction, camera perspective, focal relationship, composition, lighting hierarchy, environment geometry, world state, threat design, approved color/material truth and all unaffected details.",
    "Do not crop, reframe, relight, beautify, restyle, change lens language, alter background structure, move the subject, change wardrobe, change object geometry or add decorative effects.",
    "If a requested local repair cannot be completed without changing unaffected regions, fail rather than broadening the edit.",
  ].join("\n");
}
function inheritedMetadata(source={}){
  const metadata={...object(source.metadata)};
  for(const key of [
    "image_asset_pack_qc_sealed","image_asset_pack_qc_failed",
    "image_multiview_qc_sealed","image_multiview_qc_failed",
    "image_asset_derivative_qc_sealed","image_asset_derivative_qc_failed",
    "release_approved","localized_repair_superseded",
    "superseded_by_localized_repair_asset_node_id",
  ]) delete metadata[key];
  return metadata;
}

export async function ensureLocalizedImageRepairs({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_LOCALIZED_REPAIR_SCOPE_REQUIRED");
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const quality of list(tasks).filter(failedImageQc)){
    const result=parse(quality.output);
    if(!result){
      blocked.push({quality_task_id:quality.id,reason:"IMAGE_LOCALIZED_REPAIR_QC_EVIDENCE_REQUIRED"});continue;
    }
    for(const assetId of affectedIds(quality,result)){
      const asset=nodes.find(n=>text(n.id)===assetId)||null;
      if(!asset?.url){
        blocked.push({quality_task_id:quality.id,asset_node_id:assetId,reason:"IMAGE_LOCALIZED_REPAIR_SOURCE_ASSET_REQUIRED"});continue;
      }
      const regions=repairRegions(result,assetId);
      if(!regions.length){
        blocked.push({quality_task_id:quality.id,asset_node_id:assetId,reason:"IMAGE_LOCALIZED_REPAIR_REGION_REQUIRED"});continue;
      }
      const totalArea=regions.reduce((sum,row)=>sum+row.area,0);
      if(totalArea>0.55){
        blocked.push({quality_task_id:quality.id,asset_node_id:assetId,reason:"IMAGE_LOCALIZED_REPAIR_AREA_TOO_LARGE",total_area:totalArea});continue;
      }
      const identity=repairIdentity(quality,asset,regions);
      const prior=tasks.find(t=>text(t.metadata?.image_localized_repair_identity)===identity);
      if(prior){existing.push(prior);continue;}
      const mask=await CreativeImageLocalizedRepairMaskRuntime.create({
        organization_id,
        creative_project_id,
        creative_mission_id:asset.metadata?.creative_mission_id||null,
        parent_asset_node_id:asset.id,
        continuity_group_id:asset.metadata?.continuity_group_id||null,
        source_reference:asset.url,
        regions,
      });
      const [signed,maskSigned]=await Promise.all([
        signCreativeStorageReference({organization_id,reference:asset.url,expires_in:1800}),
        signCreativeStorageReference({organization_id,reference:mask.storage_reference,expires_in:1800}),
      ]);
      const prompt=editPrompt({asset,task:quality,result,regions});
      const task=await ProductionTaskRuntime.create({
        organization_id,creative_project_id,production_graph_id:null,
        scene_id:asset.metadata?.scene_id||quality.scene_id||null,
        shot_id:asset.metadata?.shot_id||quality.shot_id||null,
        type:"INPAINT_IMAGE",status:"WAITING",
        title:`Localized repair · ${asset.name||asset.id}`,
        description:"Mask-conditioned Image Studio inpaint that changes only failed local regions and preserves approved visual authority elsewhere.",
        service_id:"ai.image.inpaint",service_code:"ai.image.inpaint",capability:"ai.image.inpaint",provider_id:null,priority:22,
        input:{
          media_kind:"IMAGE",image:signed,source:signed,source_image:signed,
          mask_image:maskSigned,
          source_assets:[
            {url:signed,role:"LOCALIZED_REPAIR_PIXEL_AUTHORITY",asset_node_id:asset.id},
            {url:maskSigned,role:"LOCALIZED_REPAIR_EXACT_MASK",asset_node_id:mask.asset_node_id},
          ],
          prompt,provider_prompt:prompt,
          repair_specification:{
            contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,
            quality_task_id:quality.id,source_asset_node_id:asset.id,
            quality_kind:qualityKind(quality),regions,
            failures:list(result.failures),repair_instructions:list(result.repair_instructions),
            preserve_unaffected_regions:true,preserve_identity:true,preserve_geometry:true,
            preserve_camera_authority:true,preserve_world_authority:true,
            change_only_declared_regions:true,full_frame_regeneration_forbidden:true,
          },
          requirements:{
            image_asset_localized_repair:true,source_asset_node_id:asset.id,
            quality_task_id:quality.id,repair_identity:identity,
            repair_regions:regions,maximum_total_repair_area:0.55,
            repair_mask_asset_node_id:mask.asset_node_id,
            repair_mask_reference:mask.storage_reference,
            mask_semantics:mask.mask_semantics,
            exact_unmasked_pixel_preservation_required:true,
            preserve_unaffected_regions:true,full_frame_regeneration_forbidden:true,
          },
          provider_parameters:{
            input_fidelity:"high",localized_edit:true,repair_regions:regions,
            mask_image:maskSigned,mask_asset_node_id:mask.asset_node_id,
            mask_semantics:mask.mask_semantics,
            exact_unmasked_pixel_preservation:true,
            preserve_unaffected_regions:true,preserve_identity:true,preserve_geometry:true,
            preserve_camera_perspective:true,full_frame_regeneration_forbidden:true,
          },
        },
        cost:{estimated:0,actual:0,currency:null,approved:false},
        timing:{estimated_seconds:0},review:{required:false,approved:false},
        metadata:{
          contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,
          image_asset_localized_repair:true,image_localized_repair_identity:identity,
          source_asset_node_id:asset.id,source_quality_task_id:quality.id,
          source_quality_kind:qualityKind(quality),repair_region_count:regions.length,
          repair_total_area:Number(totalArea.toFixed(4)),
          repair_mask_asset_node_id:mask.asset_node_id,
          repair_mask_reference:mask.storage_reference,
          exact_unmasked_pixel_preservation_required:true,
          release_candidate:false,
        },
      });
      created.push(task);
    }
  }
  return {contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,created,existing,blocked};
}

export async function reconcileLocalizedImageRepairs({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_localized_repair===true&&text(t.status)==="COMPLETED")){
    let node=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(task.id))||null;
    if(!node){
      try{
        node=await CreativeAssetGraphRuntime.createFromProductionTask({task,output:task.output||{}});
        created.push(node);
      }catch(error){
        blocked.push({task_id:task.id,reason:"IMAGE_LOCALIZED_REPAIR_PERSIST_FAILED",detail:error?.message||String(error)});continue;
      }
    }else existing.push(node);
    const source=await AssetGraphRepository.getById(task.metadata?.source_asset_node_id);
    if(!source){blocked.push({task_id:task.id,reason:"IMAGE_LOCALIZED_REPAIR_ORIGINAL_ASSET_REQUIRED"});continue;}
    const inherited=inheritedMetadata(source);
    await AssetGraphRepository.update(node.id,{
      status:"DERIVED",
      review:{...object(node.review),ai_reviewed:false,approved:false,notes:"Localized repair requires pair review before replacing source authority."},
      reuse:{...object(node.reuse),reusable:false,approved_for_reuse:false},
      metadata:{
        ...inherited,
        ...object(node.metadata),
        contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,
        localized_repair_of_asset_node_id:source.id,
        localized_repair_quality_task_id:task.metadata?.source_quality_task_id,
        localized_repair_identity:task.metadata?.image_localized_repair_identity,
        localized_repair_regions:list(task.input?.repair_specification?.regions),
        localized_repair_review_sealed:false,
        image_asset_pack_qc_sealed:false,
        image_multiview_qc_sealed:false,
        image_asset_derivative_qc_sealed:false,
        material_truth_pack_qc_sealed:false,
        material_truth_pack_qc_failed:false,
        material_measurement_sealed:false,
        release_approved:false,
      },
    });
  }
  return {contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,created,existing,blocked};
}

function reviewPrompt({source,repaired,repairTask}){
  return [
    "Avantiqo Image Studio localized-repair pair review.",
    "Compare ORIGINAL and REPAIRED images.",
    "The repair passes only if every declared defect is corrected AND every unaffected region preserves the original approved identity, geometry, composition, camera perspective, lighting, world state and material truth.",
    "Return strict JSON only:",
    '{"passed":true,"repair_success_score":0,"unaffected_preservation_score":0,"identity_geometry_preservation_score":0,"camera_composition_preservation_score":0,"regressions":[],"remaining_failures":[]}',
    `Repair regions: ${JSON.stringify(list(repairTask.input?.repair_specification?.regions))}.`,
    "Minimums: repair_success_score >= 94; unaffected_preservation_score >= 98; identity_geometry_preservation_score >= 98; camera_composition_preservation_score >= 98.",
    "Any visible regression outside the declared regions is an automatic FAIL.",
  ].join("\n");
}

export async function ensureLocalizedImageRepairReviews({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const repairTask of list(tasks).filter(t=>t.metadata?.image_asset_localized_repair===true&&text(t.status)==="COMPLETED")){
    const repaired=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(repairTask.id));
    const source=nodes.find(n=>text(n.id)===text(repairTask.metadata?.source_asset_node_id));
    if(!repaired?.url||!source?.url){blocked.push({repair_task_id:repairTask.id,reason:"IMAGE_LOCALIZED_REPAIR_PAIR_ASSETS_REQUIRED"});continue;}
    const identity=`localized-repair-review:${repairTask.metadata?.image_localized_repair_identity}`;
    const prior=tasks.find(t=>text(t.metadata?.image_localized_repair_review_identity)===identity);
    if(prior){existing.push(prior);continue;}
    const [sourceUrl,repairedUrl]=await Promise.all([
      signCreativeStorageReference({organization_id,reference:source.url,expires_in:1800}),
      signCreativeStorageReference({organization_id,reference:repaired.url,expires_in:1800}),
    ]);
    const prompt=reviewPrompt({source,repaired,repairTask});
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:null,
      scene_id:repairTask.scene_id||null,shot_id:repairTask.shot_id||null,
      type:"QUALITY_REVIEW",status:"WAITING",title:`Review localized repair · ${source.name||source.id}`,
      description:"Pair-review surgical Image Studio repair against original source and declared repair regions.",
      service_id:"ai.image.analyze",service_code:"ai.image.analyze",capability:"ai.image.analyze",provider_id:null,priority:23,
      input:{
        media_kind:"IMAGE",
        images:[sourceUrl,repairedUrl],
        assets:[
          {url:sourceUrl,role:"ORIGINAL_PIXEL_AUTHORITY",asset_node_id:source.id},
          {url:repairedUrl,role:"LOCALIZED_REPAIR_CANDIDATE",asset_node_id:repaired.id},
        ],
        prompt,provider_prompt:prompt,
        requirements:{
          image_asset_localized_repair_review:true,source_asset_node_id:source.id,
          repaired_asset_node_id:repaired.id,repair_task_id:repairTask.id,
          repair_regions:list(repairTask.input?.repair_specification?.regions),
          minimum_repair_success_score:94,minimum_unaffected_preservation_score:98,
          fail_closed:true,
        },
        provider_parameters:{response_format:{type:"json_object"},images:[sourceUrl,repairedUrl]},
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},
      timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{
        contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_REVIEW_CONTRACT,
        image_asset_localized_repair_review:true,image_localized_repair_review_identity:identity,
        source_asset_node_id:source.id,repaired_asset_node_id:repaired.id,
        repair_task_id:repairTask.id,quality_gate:true,
      },
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_REVIEW_CONTRACT,created,existing,blocked};
}

export async function reconcileLocalizedImageRepairReviews({organization_id,creative_project_id}={}){
  const tasks=await ProductionTaskRuntime.list({organization_id,creative_project_id});
  const sealed=[];const failed=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_localized_repair_review===true&&text(t.status)==="COMPLETED"&&t.metadata?.localized_repair_review_reconciled!==true)){
    const result=parse(task.output);
    const pass=result?.passed===true &&
      Number(result?.repair_success_score)>=94 &&
      Number(result?.unaffected_preservation_score)>=98 &&
      Number(result?.identity_geometry_preservation_score)>=98 &&
      Number(result?.camera_composition_preservation_score)>=98 &&
      list(result?.regressions).length===0 &&
      list(result?.remaining_failures).length===0;
    const source=await AssetGraphRepository.getById(task.metadata?.source_asset_node_id);
    const repaired=await AssetGraphRepository.getById(task.metadata?.repaired_asset_node_id);
    if(!source||!repaired) continue;
    if(pass){
      await AssetGraphRepository.update(source.id,{
        metadata:{...object(source.metadata),localized_repair_superseded:true,superseded_by_localized_repair_asset_node_id:repaired.id,release_approved:false},
      });
      await AssetGraphRepository.update(repaired.id,{
        status:"APPROVED",
        review:{...object(repaired.review),ai_reviewed:true,approved:true,notes:"Localized repair passed pair review; downstream pack/derivative QC must reseal as applicable."},
        metadata:{
          ...object(repaired.metadata),
          localized_repair_review_sealed:true,
          localized_repair_review_task_id:task.id,
          localized_repair_source_asset_node_id:source.id,
          image_asset_perceptual_qc_sealed:true,
          release_approved:true,
        },
      });
    }else{
      await AssetGraphRepository.update(repaired.id,{
        status:"REJECTED",
        review:{...object(repaired.review),ai_reviewed:true,approved:false,notes:"Localized repair introduced regression or failed to correct target defects."},
        metadata:{...object(repaired.metadata),localized_repair_review_sealed:false,localized_repair_review_failed:true,localized_repair_review_task_id:task.id,release_approved:false},
      });
    }
    await ProductionTaskRuntime.update(task.id,{
      metadata:{...object(task.metadata),localized_repair_review_reconciled:true,localized_repair_review_sealed:pass},
      review:{required:false,approved:pass},
      ...(pass?{}:{status:"FAILED",error:"IMAGE_LOCALIZED_REPAIR_REVIEW_FAILED"}),
    });
    (pass?sealed:failed).push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_REVIEW_CONTRACT,sealed,failed};
}

export const CreativeImageAssetLocalizedRepairRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_CONTRACT,
  review_contract:CREATIVE_IMAGE_ASSET_LOCALIZED_REPAIR_REVIEW_CONTRACT,
  ensure:ensureLocalizedImageRepairs,
  reconcile:reconcileLocalizedImageRepairs,
  ensureReview:ensureLocalizedImageRepairReviews,
  reconcileReview:reconcileLocalizedImageRepairReviews,
});
