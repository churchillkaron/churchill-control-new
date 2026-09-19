import crypto from "node:crypto";

import crypto from "node:crypto";

import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeImageAssetAuthorityRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetAuthorityRuntime";

export const CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT = "CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_V1";
export const CREATIVE_IMAGE_MATERIAL_TRUTH_QC_CONTRACT = "CREATIVE_IMAGE_MATERIAL_TRUTH_QC_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function parse(value){
  if(!value)return null;
  if(typeof value==="object"&&!Array.isArray(value)){
    for(const c of [value.material_truth_qc,value.result,value.review,value.validation,value.output,value]){
      if(c&&typeof c==="object"&&!Array.isArray(c)&&("passed" in c||"material_truth_score" in c)) return c;
      if(typeof c==="string"){const p=parse(c);if(p)return p;}
    }
    return null;
  }
  const s=text(value),a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch{return null;}
}
function sourceText(tasks=[]){
  return tasks.map(task=>[
    task.input?.requirements?.subject,
    task.input?.requirements?.action,
    task.input?.requirements?.purpose,
    JSON.stringify(object(task.input?.requirements?.production_design)),
    JSON.stringify(object(task.input?.requirements?.environmental_continuity_state)),
    JSON.stringify(object(task.input?.requirements?.lighting)),
    JSON.stringify(object(task.input?.requirements?.pursuit_spatial_choreography)),
  ].map(text).join(" ")).join(" ").toLowerCase();
}
function materialKeys(tasks=[]){
  const source=sourceText(tasks);
  const keys=[];
  const wet=/rain|wet|storm|mist|fog|water|soak|drench/.test(source);
  const human=/man|woman|person|human|runner|performer|actor|face|skin|hand/.test(source);
  const threat=/drone|threat|machine|vehicle|metal|hardware/.test(source);
  if(human&&wet) keys.push("WET_SKIN","WET_FABRIC");
  if(/forest|tree|bark|wood|branch|foliage/.test(source)) keys.push(wet?"WET_BARK":"BARK");
  if(/mud|muddy|ground|soil|dirt|footprint|splash/.test(source)) keys.push(wet?"WET_MUD_GROUND":"GROUND");
  if(threat) keys.push(wet?"WET_METAL":"METAL");
  if(/glass|window|lens|headlamp|visor/.test(source)) keys.push(wet?"WET_GLASS":"GLASS");
  if(/search.?light|beam|spotlight/.test(source)&&/rain|mist|fog|haze/.test(source)) keys.push("SEARCHLIGHT_ATMOSPHERE_INTERACTION");
  return [...new Set(keys)];
}
function subjectIdentityKey(node={}){
  return text(node.metadata?.subject_identity_key||node.metadata?.identity_profile_id)||null;
}
function threatIdentityKey(node={}){
  return text(node.metadata?.threat_identity_key)||null;
}
function materialScopeKind(key=""){
  const value=text(key).toUpperCase();
  if(["WET_SKIN","WET_FABRIC"].includes(value)) return "SUBJECT";
  if(["WET_METAL","METAL","WET_GLASS","GLASS","SEARCHLIGHT_ATMOSPHERE_INTERACTION"].includes(value)) return "THREAT";
  return "GLOBAL";
}
function materialScopeVariants(key="",sourceNodes=[]){
  const kind=materialScopeKind(key);
  if(kind==="SUBJECT"){
    const ids=[...new Set(list(sourceNodes).map(subjectIdentityKey).filter(Boolean))];
    if(!ids.length)return [{kind:"GLOBAL",identity_key:null,source_nodes:sourceNodes}];
    return ids.map(identity=>({
      kind:"SUBJECT",
      identity_key:identity,
      source_nodes:list(sourceNodes).filter(node=>{
        const nodeIdentity=subjectIdentityKey(node);
        const cls=text(node.metadata?.image_asset_class).toUpperCase();
        return nodeIdentity===identity || !nodeIdentity || cls==="ENVIRONMENT_LOOKFRAME";
      }),
    }));
  }
  if(kind==="THREAT"){
    const ids=[...new Set(list(sourceNodes).map(threatIdentityKey).filter(Boolean))];
    if(!ids.length)return [{kind:"GLOBAL",identity_key:null,source_nodes:sourceNodes}];
    return ids.map(identity=>({
      kind:"THREAT",
      identity_key:identity,
      source_nodes:list(sourceNodes).filter(node=>{
        const nodeIdentity=threatIdentityKey(node);
        const cls=text(node.metadata?.image_asset_class).toUpperCase();
        return nodeIdentity===identity || !nodeIdentity || cls==="ENVIRONMENT_LOOKFRAME";
      }),
    }));
  }
  return [{kind:"GLOBAL",identity_key:null,source_nodes:sourceNodes}];
}
function materialInstruction(key){
  const map={
    WET_SKIN:"Macro production reference for realistic rain-wet human skin: pores remain visible, water beads and thin films obey gravity and surface tension, highlights are broken and anisotropic rather than plastic, red/blue channels remain natural, no beauty smoothing.",
    WET_FABRIC:"Macro production reference for soaked dark fabric: fibers, weave, cling, folds, capillary darkening, water loading and specular response remain distinct. Avoid rubbery cloth, painted-on wetness or uniform gloss.",
    WET_BARK:"Macro production reference for rain-wet bark and forest wood: porous roughness, water in crevices, irregular reflectance, moss/lichen separation, no plastic varnish or procedural repeating bark.",
    BARK:"Macro production reference for dry/naturally humid bark: irregular grain, scale variation, moss/lichen and micro-shadowing with no repeating procedural texture.",
    WET_MUD_GROUND:"Macro production reference for wet mud/forest ground: mixed soil, leaves, shallow water, deformation, footprints/splash edges, viscosity and rough/specular breakup. Avoid smooth chocolate-like mud.",
    GROUND:"Macro production reference for natural forest ground/soil with heterogeneous scale, leaf litter, compression and believable roughness.",
    WET_METAL:"Macro production reference for rain-wet painted/coated metal on a premium drone/hero object: stable panel material, micro-scratches, water beading, runoff, roughness separation and physically plausible reflections.",
    METAL:"Macro production reference for premium coated/brushed metal: microstructure, edge wear, stable panel material, no generic chrome or plastic CGI sheen.",
    WET_GLASS:"Macro production reference for rain-wet optical glass: droplets, thin-film runoff, refraction, partial reflections, edge thickness and realistic dirt/micro-scratches. Avoid floating droplets and opaque fake glass.",
    GLASS:"Macro production reference for optical glass with true refraction/reflection balance, edge thickness, controlled micro-scratches and no milky CGI surface.",
    SEARCHLIGHT_ATMOSPHERE_INTERACTION:"Physical reference for a searchlight crossing rain/mist: distance-dependent scattering, occlusion, density falloff, rain streak illumination only inside the beam volume, no detached decorative light cone.",
  };
  return map[key]||"Create a physically credible material-detail production reference with tactile microstructure and realistic light response.";
}
function generationPrompt({key,group,tasks}){
  return [
    "Avantiqo Image Studio material/detail truth reference.",
    "This image is not key art. It is physical surface authority for downstream Image, Video, VFX and finishing.",
    `Material truth key: ${key}. Continuity group: ${group}.`,
    materialInstruction(key),
    "Frame as a clean professional material/lookdev reference with enough surrounding context to understand scale and light interaction.",
    "Preserve physically plausible roughness, microstructure, absorption, reflection, refraction, wetness and contact behavior.",
    "Reject generic AI texture, perfectly repeated patterns, plastic highlights, smeared microdetail, over-sharpening, beauty retouching, fake volumetric decoration and impossible water behavior.",
    `Scene context: ${sourceText(tasks).slice(0,4000)}`,
  ].join("\n");
}

export async function ensureMaterialTruthReferences({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("MATERIAL_TRUTH_SCOPE_REQUIRED");
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const candidates=list(tasks).filter(task=>{
    const authority=object(task.input?.requirements?.image_asset_authority);
    return text(authority.contract)===CreativeImageAssetAuthorityRuntime.contract &&
      text(authority.asset_class)!=="MATERIAL_DETAIL_REFERENCE";
  });
  const groups=new Map();
  for(const task of candidates){
    const authority=object(task.input?.requirements?.image_asset_authority);
    const group=text(authority.continuity_group_id);if(!group)continue;
    const bucket=groups.get(group)||[];bucket.push(task);groups.set(group,bucket);
  }
  const created=[];const existing=[];const blocked=[];
  for(const [group,groupTasks] of groups){
    const sourceNodes=list(nodes).filter(node=>
      text(node.metadata?.continuity_group_id||node.metadata?.image_asset_authority?.continuity_group_id)===group &&
      text(node.metadata?.image_asset_class)!=="MATERIAL_DETAIL_REFERENCE" &&
      node.status==="APPROVED" &&
      node.review?.approved===true &&
      node.metadata?.image_asset_pack_qc_sealed===true &&
      (!node.metadata?.image_asset_exploration_group_id||node.metadata?.image_asset_exploration_selected===true) &&
      node.metadata?.localized_repair_superseded!==true &&
      Boolean(node.url)
    ).sort((a,b)=>{
      const order=["HERO_FRAME","CHARACTER_SHEET","THREAT_DESIGN","ENVIRONMENT_LOOKFRAME","PERFORMANCE_REFERENCE","CONTACT_DETAIL_REFERENCE","CONTINUITY_REFERENCE","COMPOSITING_SOURCE"];
      return order.indexOf(text(a.metadata?.image_asset_class))-order.indexOf(text(b.metadata?.image_asset_class));
    }).slice(0,8);
    if(!sourceNodes.length){
      blocked.push({continuity_group_id:group,reason:"MATERIAL_TRUTH_SELECTED_SOURCE_PACK_REQUIRED"});
      continue;
    }
    const representative=groupTasks[0];
    const repAuthority=object(representative.input?.requirements?.image_asset_authority);
    for(const key of materialKeys(groupTasks)){
      for(const scope of materialScopeVariants(key,sourceNodes)){
        const scopedNodes=list(scope.source_nodes).slice(0,8);
        if(!scopedNodes.length){
          blocked.push({
            continuity_group_id:group,
            material_truth_key:key,
            material_scope_kind:scope.kind,
            material_scope_identity_key:scope.identity_key,
            reason:"MATERIAL_TRUTH_SCOPED_SOURCE_PACK_REQUIRED",
          });
          continue;
        }
        const scopeToken=scope.identity_key||"global";
        const identity=`material-truth:${group}:${key.toLowerCase()}:${scope.kind.toLowerCase()}:${scopeToken}`;
        const prior=tasks.find(t=>text(t.metadata?.material_truth_task_identity)===identity);
        if(prior){existing.push(prior);continue;}
        const authority=CreativeImageAssetAuthorityRuntime.build({
          asset_class:"MATERIAL_DETAIL_REFERENCE",
          scene_id:repAuthority.scene_id||representative.scene_id||null,
          shot_id:null,continuity_group_id:group,
          downstream_roles:["VIDEO","VFX","COMPOSITING"],
          approved_for_video_source:true,
          approved_for_vfx_source:true,
          approved_for_compositing_source:true,
        });
        const prompt=[
          generationPrompt({key,group,tasks:groupTasks}),
          `Material scope kind: ${scope.kind}.`,
          scope.identity_key?`Material scope identity key: ${scope.identity_key}.`:"",
          scope.kind==="SUBJECT"
            ?"Do not borrow skin/fabric texture, wetness pattern, wardrobe weave or body-surface detail from any other governed character."
            :scope.kind==="THREAT"
              ?"Do not borrow metal/glass/coating/searchlight material language, markings or microstructure from any other governed threat/hero object."
              :"This is shared world material authority and must not encode a character- or threat-specific redesign.",
        ].filter(Boolean).join("\n");
        const task=await ProductionTaskRuntime.create({
          organization_id,creative_project_id,production_graph_id:null,
          scene_id:authority.scene_id||null,shot_id:null,
          type:"GENERATE_IMAGE",status:"WAITING",
          title:`Material Truth · ${key.replaceAll("_"," ")} · ${scopeToken}`,
          description:"Generate a governed Image Studio physical material/detail reference for downstream cinematic consistency.",
          service_id:"ai.image.generate",service_code:"ai.image.generate",capability:"ai.image.generate",provider_id:null,priority:24,
          input:{
            media_kind:"IMAGE",prompt,provider_prompt:prompt,
            requirements:{
              image_asset_authority:authority,
              asset_class:"MATERIAL_DETAIL_REFERENCE",
              continuity_group_id:group,
              material_scope_kind:scope.kind,
              material_subject_identity_key:scope.kind==="SUBJECT"?scope.identity_key:null,
              material_threat_identity_key:scope.kind==="THREAT"?scope.identity_key:null,
              material_truth_reference:{
                contract:CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT,
                material_truth_key:key,continuity_group_id:group,
                material_scope_kind:scope.kind,
                material_scope_identity_key:scope.identity_key,
                physical_surface_authority:true,
                downstream_material_reinvention_forbidden:true,
                source_asset_node_ids:scopedNodes.map(node=>node.id),
                derive_from_selected_visual_authority:true,
              },
              output_spec:{width:1536,height:1536,aspect_ratio:"1:1"},
            },
            reference_images:scopedNodes.map(node=>({
              url:node.url,
              role:`MATERIAL_TRUTH_SOURCE_${text(node.metadata?.image_asset_class)}`,
              asset_node_id:node.id,
            })),
            source_assets:scopedNodes.map(node=>({
              url:node.url,
              role:`MATERIAL_TRUTH_SOURCE_${text(node.metadata?.image_asset_class)}`,
              asset_node_id:node.id,
            })),
            provider_parameters:{
              input_fidelity:"high",production_asset_generation:true,
              material_truth_reference:true,material_truth_key:key,
              continuity_group_id:group,physical_surface_authority:true,
              material_scope_kind:scope.kind,
              material_scope_identity_key:scope.identity_key,
              reference_images:scopedNodes.map(node=>node.url),
              source_asset_node_ids:scopedNodes.map(node=>node.id),
              derive_from_selected_visual_authority:true,
            },
          },
          cost:{estimated:0,actual:0,currency:null,approved:false},
          timing:{estimated_seconds:0},review:{required:false,approved:false},
          metadata:{
            contract:CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT,
            material_truth_reference:true,material_truth_key:key,
            material_truth_task_identity:identity,continuity_group_id:group,
            material_scope_kind:scope.kind,
            material_scope_identity_key:scope.identity_key,
            material_subject_identity_key:scope.kind==="SUBJECT"?scope.identity_key:null,
            material_threat_identity_key:scope.kind==="THREAT"?scope.identity_key:null,
            material_truth_source_asset_node_ids:scopedNodes.map(node=>node.id),
            material_truth_derived_from_selected_visual_authority:true,
            image_asset_class:"MATERIAL_DETAIL_REFERENCE",release_candidate:false,
          },
        });
        created.push(task);
      }
    }
  }
  return {contract:CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT,created,existing,blocked};
}

function materialCandidateNode(node={}){
  return text(node.metadata?.image_asset_class)==="MATERIAL_DETAIL_REFERENCE" &&
    node.metadata?.localized_repair_superseded!==true &&
    !node.metadata?.superseded_by_localized_repair_asset_node_id &&
    Boolean(node.url);
}
function approvedMaterialNode(node={}){
  return materialCandidateNode(node) &&
    node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.material_truth_pack_qc_sealed===true &&
    node.metadata?.release_approved===true;
}
function materialQcPrompt(group,nodes){
  const rows=nodes.map(n=>({asset_node_id:n.id,material_truth_key:n.metadata?.material_truth_key||n.metadata?.task_output?.metadata?.material_truth_key||null}));
  return `You are Avantiqo Image Studio material truth supervisor.
Review all material references as one physical lookdev pack for continuity group ${group}.
Return strict JSON only:
{
  "passed": true,
  "material_truth_score": 0,
  "tactile_realism_score": 0,
  "microstructure_score": 0,
  "wetness_physics_score": 0,
  "light_material_interaction_score": 0,
  "cross_material_separation_score": 0,
  "anti_ai_texture_score": 0,
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
References: ${JSON.stringify(rows)}
Rules:
- Materials must remain physically distinct: skin cannot read like plastic, fabric cannot read like rubber, bark cannot read like varnished foam, metal cannot read like generic chrome, glass cannot read like acrylic haze, mud cannot read like smooth paste.
- Wetness must follow gravity, contact, porosity and surface tension. Rain may not produce uniform gloss across unrelated materials.
- Light must interact with each material differently through roughness, absorption, reflection/refraction, occlusion and scattering.
- Reject cloned/repeating microtexture, texture smearing, invented high-frequency detail, procedural tiling, oversharpening and generic cinematic gloss.
- Searchlight/rain references must show distance-dependent scattering and occlusion rather than a detached decorative beam.
- On FAIL, identify only the material asset nodes that require repair. For local texture/highlight/water/edge defects, provide tight normalized repair regions and surgical instructions; omit regions when the whole material reference is conceptually wrong.
Minimums: material_truth_score >= 95, tactile_realism_score >= 95, microstructure_score >= 94, wetness_physics_score >= 94, light_material_interaction_score >= 95, cross_material_separation_score >= 95, anti_ai_texture_score >= 96.`;
}

export async function reconcileMaterialTruthReferences({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];const blocked=[];
  for(const task of list(tasks).filter(t=>t.metadata?.material_truth_reference===true&&text(t.status)==="COMPLETED")){
    let node=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(task.id))||null;
    if(!node){
      try{
        node=await CreativeAssetGraphRuntime.createFromProductionTask({task,output:task.output||{}});
        created.push(node);
      }catch(error){
        blocked.push({task_id:task.id,reason:"MATERIAL_TRUTH_REFERENCE_PERSIST_FAILED",detail:error?.message||String(error)});
        continue;
      }
    }else existing.push(node);
    const authority=object(task.input?.requirements?.image_asset_authority);
    await AssetGraphRepository.update(node.id,{
      status:"DERIVED",
      review:{...object(node.review),ai_reviewed:false,approved:false,notes:"Material truth reference awaits dedicated physical-material pack QC."},
      reuse:{...object(node.reuse),reusable:false,approved_for_reuse:false},
      metadata:{
        ...object(node.metadata),
        contract:CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT,
        image_asset_authority:authority,
        image_asset_class:"MATERIAL_DETAIL_REFERENCE",
        continuity_group_id:task.metadata?.continuity_group_id||authority.continuity_group_id||null,
        material_truth_reference:true,
        material_truth_key:task.metadata?.material_truth_key||task.input?.requirements?.material_truth_reference?.material_truth_key||null,
        material_scope_kind:task.metadata?.material_scope_kind||task.input?.requirements?.material_scope_kind||"GLOBAL",
        material_scope_identity_key:task.metadata?.material_scope_identity_key||task.input?.requirements?.material_truth_reference?.material_scope_identity_key||null,
        material_subject_identity_key:task.metadata?.material_subject_identity_key||task.input?.requirements?.material_subject_identity_key||null,
        material_threat_identity_key:task.metadata?.material_threat_identity_key||task.input?.requirements?.material_threat_identity_key||null,
        material_truth_source_asset_node_ids:list(task.metadata?.material_truth_source_asset_node_ids||task.input?.requirements?.material_truth_reference?.source_asset_node_ids),
        material_truth_pack_qc_sealed:false,
        release_approved:false,
      },
    });
  }
  return {contract:CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT,created,existing,blocked};
}

export async function ensureMaterialTruthQc({organization_id,creative_project_id}={}){
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const groups=new Map();
  for(const node of list(nodes).filter(materialCandidateNode)){
    const group=text(node.metadata?.continuity_group_id||node.metadata?.image_asset_authority?.continuity_group_id);if(!group)continue;
    const scopeKind=text(node.metadata?.material_scope_kind||"GLOBAL").toUpperCase()||"GLOBAL";
    const scopeIdentity=text(node.metadata?.material_scope_identity_key||"global")||"global";
    const groupKey=[group,scopeKind,scopeIdentity].join("::");
    const bucket=groups.get(groupKey)||[];
    bucket.push(node);
    groups.set(groupKey,bucket);
  }
  const created=[];const existing=[];
  for(const [groupKey,assets] of groups){
    const group=text(assets[0]?.metadata?.continuity_group_id||assets[0]?.metadata?.image_asset_authority?.continuity_group_id);
    const scopeKind=text(assets[0]?.metadata?.material_scope_kind||"GLOBAL").toUpperCase()||"GLOBAL";
    const scopeIdentity=text(assets[0]?.metadata?.material_scope_identity_key||"global")||"global";
    const packHash=hash({
      continuity_group_id:group,
      material_scope_kind:scopeKind,
      material_scope_identity_key:scopeIdentity,
      assets:assets.map(a=>({id:a.id,checksum:a.technical?.checksum||null,key:a.metadata?.material_truth_key||null})).sort((a,b)=>a.id.localeCompare(b.id)),
    });
    const prior=tasks.find(t=>text(t.metadata?.material_truth_pack_hash)===packHash);
    if(prior){existing.push(prior);continue;}
    const signed=[];
    for(const asset of assets){
      signed.push({url:await signCreativeStorageReference({organization_id,reference:asset.url,expires_in:1800}),role:asset.metadata?.material_truth_key||"MATERIAL_REFERENCE",asset_node_id:asset.id});
    }
    const prompt=materialQcPrompt(group,assets);
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:null,
      scene_id:assets[0]?.metadata?.scene_id||null,shot_id:null,
      type:"QUALITY_REVIEW",status:"WAITING",title:`Review Material Truth Pack · ${group} · ${scopeKind} · ${scopeIdentity}`,
      description:"Cross-review Image Studio material/detail references as one physical surface authority pack.",
      service_id:"ai.image.analyze",service_code:"ai.image.analyze",capability:"ai.image.analyze",provider_id:null,priority:25,
      input:{
        media_kind:"IMAGE",images:signed.map(x=>x.url),assets:signed,reference_images:signed,
        prompt,provider_prompt:prompt,
        requirements:{material_truth_qc:true,continuity_group_id:group,material_scope_kind:scopeKind,material_scope_identity_key:scopeIdentity==="global"?null:scopeIdentity,material_asset_node_ids:assets.map(a=>a.id),material_truth_pack_hash:packHash,fail_closed:true},
        provider_parameters:{response_format:{type:"json_object"},images:signed.map(x=>x.url)},
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{
        contract:CREATIVE_IMAGE_MATERIAL_TRUTH_QC_CONTRACT,material_truth_qc:true,
        continuity_group_id:group,material_scope_kind:scopeKind,material_scope_identity_key:scopeIdentity==="global"?null:scopeIdentity,material_asset_node_ids:assets.map(a=>a.id),
        material_truth_pack_hash:packHash,quality_gate:true,
      },
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_MATERIAL_TRUTH_QC_CONTRACT,created,existing};
}

export async function reconcileMaterialTruthQc({organization_id,creative_project_id}={}){
  const tasks=await ProductionTaskRuntime.list({organization_id,creative_project_id});
  const sealed=[];const failed=[];
  for(const task of list(tasks).filter(t=>t.metadata?.material_truth_qc===true&&text(t.status)==="COMPLETED"&&t.metadata?.material_truth_qc_reconciled!==true)){
    const result=parse(task.output);
    const pass=result?.passed===true &&
      Number(result?.material_truth_score)>=95 &&
      Number(result?.tactile_realism_score)>=95 &&
      Number(result?.microstructure_score)>=94 &&
      Number(result?.wetness_physics_score)>=94 &&
      Number(result?.light_material_interaction_score)>=95 &&
      Number(result?.cross_material_separation_score)>=95 &&
      Number(result?.anti_ai_texture_score)>=96 &&
      list(result?.failures).length===0;
    const sealHash=pass?hash({contract:CREATIVE_IMAGE_MATERIAL_TRUTH_QC_CONTRACT,pack_hash:task.metadata?.material_truth_pack_hash,result}):null;
    for(const id of list(task.metadata?.material_asset_node_ids)){
      const node=await AssetGraphRepository.getById(id);if(!node)continue;
      await AssetGraphRepository.update(id,{
        status:pass?"APPROVED":"DERIVED",
        review:{
          ...object(node.review),
          ai_reviewed:true,
          approved:pass,
          notes:pass
            ?"Dedicated material truth QC passed; physical surface authority released."
            :"Dedicated material truth QC failed.",
        },
        metadata:{
          ...object(node.metadata),
          image_asset_perceptual_qc_sealed:pass,
          material_truth_pack_qc_sealed:pass,
          material_truth_pack_qc_failed:!pass,
          material_truth_pack_qc_task_id:task.id,
          material_truth_pack_qc_seal_hash:sealHash,
          material_truth_score:Number(result?.material_truth_score)||null,
          material_truth_failures:list(result?.failures),
          material_truth_repair_instructions:list(result?.repair_instructions),
          release_approved:pass,
        },
      });
    }
    await ProductionTaskRuntime.update(task.id,{
      metadata:{...object(task.metadata),material_truth_qc_reconciled:true,material_truth_qc_sealed:pass,material_truth_qc_seal_hash:sealHash},
      review:{required:false,approved:pass},
      output:{...object(task.output),material_truth_qc:result||null},
      ...(pass?{}:{status:"FAILED",error:"IMAGE_MATERIAL_TRUTH_QC_FAILED"}),
    });
    (pass?sealed:failed).push(task);
  }
  return {contract:CREATIVE_IMAGE_MATERIAL_TRUTH_QC_CONTRACT,sealed,failed};
}

export function selectMaterialTruthPack({
  asset_nodes=[],
  continuity_group_id,
  identity_key=null,
  threat_identity_key=null,
}={}){
  const group=text(continuity_group_id);
  const subjectKey=text(identity_key)||null;
  const threatKey=text(threat_identity_key)||null;
  const assets=list(asset_nodes).filter(node=>{
    if(!approvedMaterialNode(node)||node.metadata?.material_truth_pack_qc_sealed!==true) return false;
    if(text(node.metadata?.continuity_group_id||node.metadata?.image_asset_authority?.continuity_group_id)!==group) return false;
    const scopeKind=text(node.metadata?.material_scope_kind||"GLOBAL").toUpperCase()||"GLOBAL";
    const scopeIdentity=text(node.metadata?.material_scope_identity_key)||null;
    if(scopeKind==="SUBJECT") return Boolean(subjectKey)&&scopeIdentity===subjectKey;
    if(scopeKind==="THREAT") return Boolean(threatKey)&&scopeIdentity===threatKey;
    return scopeKind==="GLOBAL";
  });
  const measured=assets.filter(node=>node.metadata?.material_measurement_sealed===true&&object(node.metadata?.material_measurement).confidence>=0.85);
  const sealHashes=[...new Set(assets.map(node=>text(node.metadata?.material_truth_pack_qc_seal_hash)).filter(Boolean))].sort();
  return {
    contract:"CREATIVE_IMAGE_MATERIAL_TRUTH_HANDOFF_V1",
    continuity_group_id:group||null,
    subject_identity_key:subjectKey,
    threat_identity_key:threatKey,
    complete:assets.length>0&&measured.length===assets.length,
    asset_count:assets.length,
    measured_asset_count:measured.length,
    assets:assets.map(node=>({
      asset_node_id:node.id,url:node.url,
      material_truth_key:node.metadata?.material_truth_key||node.metadata?.task_output?.metadata?.material_truth_key||null,
      material_scope_kind:text(node.metadata?.material_scope_kind||"GLOBAL").toUpperCase()||"GLOBAL",
      material_scope_identity_key:node.metadata?.material_scope_identity_key||null,
      qc_seal_hash:node.metadata?.material_truth_pack_qc_seal_hash||null,
      material_measurement_sealed:node.metadata?.material_measurement_sealed===true,
      material_measurement:object(node.metadata?.material_measurement),
      material_measurement_contract:node.metadata?.material_measurement_contract||null,
    })),
    qc_seal_hash:sealHashes.length?hash({continuity_group_id:group,subject_identity_key:subjectKey,threat_identity_key:threatKey,seal_hashes:sealHashes}):null,
    qc_seal_hashes:sealHashes,
    material_measurements_complete:assets.length>0&&measured.length===assets.length,
  };
}

export const CreativeImageMaterialTruthPackRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_CONTRACT,
  qc_contract:CREATIVE_IMAGE_MATERIAL_TRUTH_QC_CONTRACT,
  ensure:ensureMaterialTruthReferences,
  reconcile:reconcileMaterialTruthReferences,
  ensureQc:ensureMaterialTruthQc,
  reconcileQc:reconcileMaterialTruthQc,
  select:selectMaterialTruthPack,
});
