import crypto from "node:crypto";

import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

export const CREATIVE_IMAGE_ASSET_MULTIVIEW_CONTRACT = "CREATIVE_IMAGE_ASSET_MULTIVIEW_V1";
export const CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_CONTRACT = "CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_V1";

const VIEW_SPECS = Object.freeze([
  { id:"FRONT", instruction:"Front view at neutral camera height. Preserve exact identity/geometry, body proportions, wardrobe/material construction and scale. No redesign." },
  { id:"LEFT_THREE_QUARTER", instruction:"Left three-quarter view. Reveal side geometry while preserving exact identity/geometry and all construction details." },
  { id:"RIGHT_PROFILE", instruction:"Right profile view. Preserve exact silhouette, proportions, facial/object geometry and material layout." },
  { id:"REAR", instruction:"Rear view. Preserve back-of-head/body/object geometry, wardrobe seams, hardware, lights and proportions. Do not invent a different rear design." },
  { id:"DETAIL", instruction:"Production detail view of the most identity-defining face/object/material region. Preserve exact construction and texture truth." },
]);

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function stableParentVersion(parent={}){
  return hash({
    id:parent.id||null,
    checksum:parent.technical?.checksum||null,
    selection_seal:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
    localized_repair_review_task_id:parent.metadata?.localized_repair_review_task_id||null,
    image_asset_review_task_id:parent.metadata?.image_asset_review_task_id||null,
    perceptual_qc_sealed:parent.metadata?.image_asset_perceptual_qc_sealed===true,
  });
}
function assetClass(node={}){return text(node.metadata?.image_asset_class||node.metadata?.image_asset_authority?.asset_class).toUpperCase();}
function eligibleParent(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_perceptual_qc_sealed===true &&
    node.metadata?.image_asset_pack_qc_sealed===true &&
    (!node.metadata?.image_asset_exploration_group_id || node.metadata?.image_asset_exploration_selected===true) &&
    ["CHARACTER_SHEET","THREAT_DESIGN"].includes(assetClass(node)) &&
    Boolean(node.url);
}
function viewIdentity(parentId,viewId,parentVersion){return `image-multiview:${parentId}:${parentVersion}:${viewId.toLowerCase()}`;}
function editPrompt(parent,view){
  const cls=assetClass(parent);
  const isHuman=cls==="CHARACTER_SHEET";
  return [
    "Avantiqo Image Studio governed multi-view production asset.",
    `Source class: ${cls}. Required view: ${view.id}.`,
    view.instruction,
    "Use the supplied approved source as strict identity/geometry authority, not loose inspiration.",
    "Change only viewpoint/framing needed to reveal the requested side. Do not redesign the subject.",
    isHuman
      ? "Human lock: preserve exact facial geometry, age, skin tone, body proportions, hair, wardrobe cut, seams, wetness/dirt state and distinguishing marks."
      : "Object/threat lock: preserve exact dimensions, silhouette, panel layout, lights, sensors, hardware, materials, scale language and mechanical logic.",
    "Use neutral production lighting sufficient to inspect geometry. Avoid cinematic fog, decorative beams, motion blur, beauty grading, dramatic effects or environmental clutter.",
    "Do not mirror asymmetric features unless the requested physical side requires them. Do not make a second person/object. No collage.",
    "Output one clean production view suitable for identity/geometry authority downstream.",
  ].join("\n");
}
function parseJson(value){
  if(!value)return null;
  if(typeof value==="object"&&!Array.isArray(value)){
    for(const c of [value.result,value.review,value.validation,value.output,value]){
      if(c&&typeof c==="object"&&!Array.isArray(c)&&("passed" in c||"multiview_consistency_score" in c)) return c;
      if(typeof c==="string"){const p=parseJson(c);if(p)return p;}
    }
    return null;
  }
  const s=text(value),a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch{return null;}
}

export async function ensureImageAssetMultiViews({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_MULTIVIEW_SCOPE_REQUIRED");
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];
  for(const parent of list(nodes).filter(eligibleParent)){
    const parentVersion=stableParentVersion(parent);
    for(const view of VIEW_SPECS){
      const identity=viewIdentity(parent.id,view.id,parentVersion);
      const prior=tasks.find(t=>text(t.metadata?.image_multiview_task_identity)===identity);
      if(prior){existing.push(prior);continue;}
      const authority=object(parent.metadata?.image_asset_authority);
      const prompt=editPrompt(parent,view);
      const task=await ProductionTaskRuntime.create({
        organization_id,creative_project_id,production_graph_id:null,
        scene_id:authority.scene_id||parent.metadata?.scene_id||null,
        shot_id:authority.shot_id||parent.metadata?.shot_id||null,
        type:"EDIT_IMAGE",status:"WAITING",
        title:`${view.id.replaceAll("_"," ")} · ${parent.name||parent.id}`,
        description:"Generate a locked production multi-view from the approved Image Studio authority asset.",
        service_id:"ai.image.edit",service_code:"ai.image.edit",capability:"ai.image.edit",provider_id:null,priority:25,
        input:{
          media_kind:"IMAGE",
          image:parent.url,
          source:parent.url,
          source_assets:[{url:parent.url,role:"MULTIVIEW_IDENTITY_GEOMETRY_AUTHORITY",asset_node_id:parent.id}],
          prompt,provider_prompt:prompt,
          requirements:{
            image_asset_multiview:true,
            parent_asset_node_id:parent.id,
            asset_class:assetClass(parent),
            continuity_group_id:parent.metadata?.continuity_group_id||authority.continuity_group_id||null,
            view_id:view.id,
            identity_geometry_lock_required:true,
            wardrobe_material_lock_required:true,
            world_background_authority_excluded:true,
            parent_pack_qc_seal_hash:parent.metadata?.image_asset_pack_qc_seal_hash||null,
            parent_selection_seal_hash:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
            parent_version_fingerprint:parentVersion,
            parent_source_checksum:parent.technical?.checksum||null,
          },
          provider_parameters:{
            input_fidelity:"high",
            preserve_identity:true,
            preserve_geometry:true,
            preserve_body_proportions:true,
            preserve_material_layout:true,
            viewpoint:view.id,
            transparent_background:false,
            production_multiview:true,
          },
        },
        cost:{estimated:0,actual:0,currency:null,approved:false},
        timing:{estimated_seconds:0},review:{required:false,approved:false},
        metadata:{
          contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_CONTRACT,
          image_asset_multiview_task:true,
          image_multiview_task_identity:identity,
          parent_image_asset_node_id:parent.id,
          continuity_group_id:parent.metadata?.continuity_group_id||authority.continuity_group_id||null,
          subject_identity_key:parent.metadata?.subject_identity_key||null,
          identity_profile_id:parent.metadata?.identity_profile_id||null,
          threat_identity_key:parent.metadata?.threat_identity_key||null,
          image_multiview_view_id:view.id,
          image_multiview_asset_class:assetClass(parent),
          parent_pack_qc_seal_hash:parent.metadata?.image_asset_pack_qc_seal_hash||null,
          parent_selection_seal_hash:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
          parent_version_fingerprint:parentVersion,
          parent_source_checksum:parent.technical?.checksum||null,
        },
      });
      created.push(task);
    }
  }
  return {contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_CONTRACT,created,existing};
}

export async function reconcileImageAssetMultiViews({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_multiview_task===true&&text(t.status)==="COMPLETED")){
    const parent=nodes.find(n=>text(n.id)===text(task.metadata?.parent_image_asset_node_id))||null;
    const currentParentVersion=parent?stableParentVersion(parent):null;
    if(
      !parent ||
      !currentParentVersion ||
      text(task.metadata?.parent_version_fingerprint)!==text(currentParentVersion)
    ){
      blocked.push({
        task_id:task.id,
        reason:"IMAGE_MULTIVIEW_PARENT_STALE_BEFORE_RECONCILIATION",
        parent_asset_node_id:task.metadata?.parent_image_asset_node_id||null,
      });
      await ProductionTaskRuntime.update(task.id,{
        status:"FAILED",
        error:"IMAGE_MULTIVIEW_PARENT_STALE",
        metadata:{
          ...object(task.metadata),
          image_multiview_parent_stale:true,
          image_multiview_parent_stale_at:"RECONCILIATION",
        },
      });
      continue;
    }
    let node=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(task.id))||null;
    if(!node){
      try{
        node=await CreativeAssetGraphRuntime.createFromProductionTask({task,output:task.output||{}});
        created.push(node);
      }catch(error){
        blocked.push({task_id:task.id,reason:"IMAGE_MULTIVIEW_PERSIST_FAILED",detail:error?.message||String(error)});
        continue;
      }
    }else existing.push(node);
    await AssetGraphRepository.update(node.id,{
      status:"DERIVED",
      review:{...object(node.review),approved:false,ai_reviewed:false,notes:"Multi-view requires cross-view QC before downstream authority."},
      reuse:{...object(node.reuse),approved_for_reuse:false},
      metadata:{
        ...object(node.metadata),
        contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_CONTRACT,
        image_asset_multiview:true,
        parent_image_asset_node_id:task.metadata?.parent_image_asset_node_id,
        continuity_group_id:task.metadata?.continuity_group_id||null,
        subject_identity_key:task.metadata?.subject_identity_key||null,
        identity_profile_id:task.metadata?.identity_profile_id||null,
        threat_identity_key:task.metadata?.threat_identity_key||null,
        image_multiview_view_id:task.metadata?.image_multiview_view_id,
        image_multiview_asset_class:task.metadata?.image_multiview_asset_class,
        parent_pack_qc_seal_hash:task.metadata?.parent_pack_qc_seal_hash||null,
        parent_selection_seal_hash:task.metadata?.parent_selection_seal_hash||null,
        parent_version_fingerprint:task.metadata?.parent_version_fingerprint||null,
        parent_source_checksum:task.metadata?.parent_source_checksum||null,
        image_multiview_qc_sealed:false,
        release_approved:false,
      },
    });
  }
  return {contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_CONTRACT,created,existing,blocked};
}

function qcPrompt(parentId,viewNodes){
  const rows=viewNodes.map(n=>({asset_node_id:n.id,view_id:n.metadata?.image_multiview_view_id}));
  return `You are Avantiqo Image Studio multi-view continuity supervisor.
Compare ALL requested views as one rigid identity/geometry authority pack.

Return strict JSON only:
{
  "passed": true,
  "multiview_consistency_score": 0,
  "identity_geometry_score": 0,
  "body_or_object_proportion_score": 0,
  "wardrobe_material_layout_score": 0,
  "asymmetry_preservation_score": 0,
  "rear_geometry_score": 0,
  "detail_truth_score": 0,
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

Parent asset node: ${parentId}
Views: ${JSON.stringify(rows)}

RULES:
- All views must describe the exact same person/object in one rigid geometry.
- Reject approximate likeness, face drift, age drift, body proportion changes, hairstyle drift, wardrobe redesign, panel/hardware/light relocation, mirrored asymmetry, scale drift or invented rear/detail geometry.
- FRONT, THREE-QUARTER, PROFILE and REAR must be mutually reconstructable as one subject.
- Neutral production lighting may vary only enough to reveal geometry; it may not hide discrepancies.
- DETAIL must agree with the corresponding region visible in the wider views.
- A beautiful individual view fails if it contradicts another angle.
- On FAIL, name only the view asset_node_ids that actually need repair.
- For spatially local defects, return tight normalized repair regions with surgical instructions. Preserve every unaffected region.
- If the view needs broad identity/geometry regeneration, omit repair_regions so localized repair fails closed.

MINIMUMS:
multiview_consistency_score >= 96
identity_geometry_score >= 97
body_or_object_proportion_score >= 96
wardrobe_material_layout_score >= 96
asymmetry_preservation_score >= 95
rear_geometry_score >= 95
detail_truth_score >= 95
`;
}
export async function ensureImageAssetMultiViewQc({organization_id,creative_project_id}={}){
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const groups=new Map();
  for(const node of list(nodes).filter(n=>n.metadata?.image_asset_multiview===true&&Boolean(n.url))){
    if(node.metadata?.localized_repair_superseded===true||node.metadata?.superseded_by_localized_repair_asset_node_id) continue;
    const parentId=text(node.metadata?.parent_image_asset_node_id);if(!parentId)continue;
    const parent=nodes.find(candidate=>text(candidate.id)===parentId)||null;
    const currentParentVersion=parent?stableParentVersion(parent):null;
    if(
      !parent ||
      !currentParentVersion ||
      text(node.metadata?.parent_version_fingerprint)!==text(currentParentVersion)
    ){
      if(node.status==="APPROVED"||node.metadata?.image_multiview_qc_sealed===true){
        await AssetGraphRepository.update(node.id,{
          status:"DERIVED",
          review:{
            ...object(node.review),
            approved:false,
            notes:"Multi-view parent authority changed; prior view revoked and must be regenerated.",
          },
          metadata:{
            ...object(node.metadata),
            image_multiview_parent_stale:true,
            image_multiview_qc_sealed:false,
            release_approved:false,
          },
        });
      }
      continue;
    }
    const bucket=groups.get(parentId)||[];bucket.push(node);groups.set(parentId,bucket);
  }
  const created=[];const existing=[];const blocked=[];
  for(const [parentId,views] of groups){
    const ids=new Set(views.map(v=>text(v.metadata?.image_multiview_view_id)));
    if(VIEW_SPECS.some(v=>!ids.has(v.id))){
      blocked.push({parent_asset_node_id:parentId,reason:"IMAGE_MULTIVIEW_ALL_REQUIRED_VIEWS_REQUIRED",view_count:ids.size});
      continue;
    }
    const packHash=hash(views.map(v=>({id:v.id,view:v.metadata?.image_multiview_view_id,checksum:v.technical?.checksum||null})).sort((a,b)=>a.view.localeCompare(b.view)));
    const prior=tasks.find(t=>text(t.metadata?.image_multiview_pack_hash)===packHash);
    if(prior){existing.push(prior);continue;}
    const signed=[];
    for(const view of views){
      signed.push({
        url:await signCreativeStorageReference({organization_id,reference:view.url,expires_in:1800}),
        role:view.metadata?.image_multiview_view_id,
        asset_node_id:view.id,
      });
    }
    const prompt=qcPrompt(parentId,views);
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:null,
      scene_id:views[0]?.metadata?.scene_id||null,shot_id:views[0]?.metadata?.shot_id||null,
      type:"QUALITY_REVIEW",status:"WAITING",
      title:`Review Multi-View Authority · ${parentId}`,
      description:"Verify that all generated views describe one exact governed identity/geometry.",
      service_id:"ai.image.analyze",service_code:"ai.image.analyze",capability:"ai.image.analyze",provider_id:null,priority:24,
      input:{
        media_kind:"IMAGE",images:signed.map(x=>x.url),assets:signed,reference_images:signed,
        prompt,provider_prompt:prompt,
        requirements:{
          image_asset_multiview_qc:true,parent_asset_node_id:parentId,
          multiview_asset_node_ids:views.map(v=>v.id),multiview_pack_hash:packHash,
          minimum_multiview_consistency_score:96,fail_closed:true,
        },
        provider_parameters:{response_format:{type:"json_object"},images:signed.map(x=>x.url)},
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},
      timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{
        contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_CONTRACT,image_asset_multiview_qc:true,
        parent_image_asset_node_id:parentId,multiview_asset_node_ids:views.map(v=>v.id),
        image_multiview_pack_hash:packHash,quality_gate:true,
      },
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_CONTRACT,created,existing,blocked};
}

export async function reconcileImageAssetMultiViewQc({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const sealed=[];const failed=[];
  for(const task of list(tasks).filter(t=>t.metadata?.image_asset_multiview_qc===true&&text(t.status)==="COMPLETED"&&t.metadata?.image_multiview_qc_sealed!==true)){
    const result=parseJson(task.output);
    const parent=nodes.find(node=>text(node.id)===text(task.metadata?.parent_image_asset_node_id))||null;
    const currentParentVersion=parent?stableParentVersion(parent):null;
    const reviewedNodes=list(task.metadata?.multiview_asset_node_ids)
      .map(id=>nodes.find(node=>text(node.id)===text(id)))
      .filter(Boolean);
    const parentCurrent=
      Boolean(parent&&currentParentVersion) &&
      reviewedNodes.length===list(task.metadata?.multiview_asset_node_ids).length &&
      reviewedNodes.every(node=>
        text(node.metadata?.parent_version_fingerprint)===text(currentParentVersion)
      );
    const pass=parentCurrent &&
      result?.passed===true &&
      Number(result?.multiview_consistency_score)>=96 &&
      Number(result?.identity_geometry_score)>=97 &&
      Number(result?.body_or_object_proportion_score)>=96 &&
      Number(result?.wardrobe_material_layout_score)>=96 &&
      Number(result?.asymmetry_preservation_score)>=95 &&
      Number(result?.rear_geometry_score)>=95 &&
      Number(result?.detail_truth_score)>=95 &&
      list(result?.failures).length===0;
    const sealHash=pass?hash({
      contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_CONTRACT,
      parent_asset_node_id:task.metadata?.parent_image_asset_node_id,
      pack_hash:task.metadata?.image_multiview_pack_hash,
      parent_version_fingerprint:currentParentVersion,
      result,
    }):null;
    for(const id of list(task.metadata?.multiview_asset_node_ids)){
      const node=await AssetGraphRepository.getById(id);if(!node)continue;
      await AssetGraphRepository.update(id,{
        status:pass?"APPROVED":"DERIVED",
        review:{...object(node.review),ai_reviewed:true,approved:pass,notes:pass?"Multi-view identity/geometry QC passed.":"Multi-view identity/geometry QC failed."},
        metadata:{
          ...object(node.metadata),
          image_multiview_qc_sealed:pass,
          image_multiview_qc_failed:!pass,
          image_multiview_parent_stale:!parentCurrent,
          image_multiview_qc_task_id:task.id,
          image_multiview_qc_seal_hash:sealHash,
          image_multiview_consistency_score:Number(result?.multiview_consistency_score)||null,
          multiview_failures:list(result?.failures),
          multiview_repair_instructions:list(result?.repair_instructions),
          release_approved:pass,
        },
      });
    }
    await ProductionTaskRuntime.update(task.id,{
      metadata:{...object(task.metadata),image_multiview_qc_sealed:pass,image_multiview_qc_seal_hash:sealHash},
      review:{required:false,approved:pass},
      ...(pass?{}:{
        status:"FAILED",
        error:parentCurrent
          ?"IMAGE_MULTIVIEW_CONSISTENCY_FAILED"
          :"IMAGE_MULTIVIEW_PARENT_STALE_DURING_QC",
      }),
      output:{...object(task.output),image_multiview_consistency:result||null},
    });
    (pass?sealed:failed).push(task);
  }
  return {contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_CONTRACT,sealed,failed};
}

export const CreativeImageAssetMultiViewRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_CONTRACT,
  qc_contract:CREATIVE_IMAGE_ASSET_MULTIVIEW_QC_CONTRACT,
  views:VIEW_SPECS,
  ensure:ensureImageAssetMultiViews,
  reconcile:reconcileImageAssetMultiViews,
  ensureQc:ensureImageAssetMultiViewQc,
  reconcileQc:reconcileImageAssetMultiViewQc,
});
