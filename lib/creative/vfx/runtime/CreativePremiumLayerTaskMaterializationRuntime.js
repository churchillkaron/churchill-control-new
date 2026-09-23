import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { CreativeImageAssetHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetHandoffRuntime";
import { CreativeImageAssetBundleHandoffRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetBundleHandoffRuntime";
import { CreativeImageMaterialTruthPackRuntime } from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";
import { CreativeImageFoundationAuthorityRuntime } from "@/lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime";

export const CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_CONTRACT = "CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_V1";

function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function passRole(node={}){return text(node.intent?.pass_role||node.requirements?.pass_role).toUpperCase();}
function shotId(node={}){return text(node.requirements?.shot_id||node.intent?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);}
function shotNode(graph={},id){return list(graph.nodes).find(n=>text(n.id)===id&&text(n.type).toUpperCase()==="SHOT")||null;}
function approvedBaseTask(tasks=[],id){
  return tasks.find(t=>text(t.metadata?.shot_id||t.shot_id)===id&&t.metadata?.base_plate_role===true&&text(t.status)==="COMPLETED"&&t.metadata?.approved_for_downstream_after_perceptual_review===true)||null;
}
function outputUrl(task={}){const o=object(task.output?.output||task.output);return text(o.asset_url||o.image_url||o.file_url||o.url||task.output?.file_url)||null;}
function foundationForShot(nodes=[],shot={}){
  return CreativeImageFoundationAuthorityRuntime.evaluate({
    task:{
      input:{requirements:object(shot.requirements)},
      scene_id:shot.metadata?.scene_id||shot.scene_id||null,
      shot_id:shot.id||shot.metadata?.shot_id||null,
      metadata:object(shot.metadata),
    },
    asset_nodes:nodes,
    force:true,
  });
}
function depthAsset(nodes=[],id,shot={}){
  const continuityGroup=shot.requirements?.generation_strategy?.shared_state_group_id||null;
  const foundation=foundationForShot(nodes,shot);
  const hero=CreativeImageAssetHandoffRuntime.select({
    asset_nodes:nodes,
    scene_id:shot.metadata?.scene_id||shot.scene_id||null,
    shot_id:shot.id,
    continuity_group_id:continuityGroup,
    foundation_authority_digest:
      foundation.passed===true?foundation.foundation_authority_digest:null,
    asset_classes:["HERO_FRAME"],
    downstream_role:"VIDEO",
  }).selected;
  if(hero){
    const bundle=CreativeImageAssetBundleHandoffRuntime.select({
      asset_nodes:nodes,
      parent_asset_node_id:hero.id,
      continuity_group_id:continuityGroup,
    });
    if(bundle.depth_map?.url) return bundle.depth_map;
  }
  return nodes.find(a=>text(a.metadata?.shot_id)===id&&text(a.metadata?.artifact_kind).toUpperCase()==="DEPTH_MAP"&&a.metadata?.reconstruction_qc_passed===true)||null;
}
function threatIdentityKey(shot={}){
  const r=object(shot.requirements);
  const moving=object(r.environmental_continuity_state?.moving_threat_state);
  const pursuit=object(r.pursuit_spatial_choreography);
  return text(
    r.threat_identity_key||
    moving.identity_key||
    moving.threat_identity_key||
    moving.threat_id||
    moving.vehicle_id||
    moving.id||
    pursuit.threat_identity_key||
    pursuit.threat_id||
    pursuit.predator_id||
    shot.metadata?.threat_identity_key
  )||null;
}
function threatSource(nodes=[],shot={}){
  const governedThreatKey=threatIdentityKey(shot);
  const explicit=text(
    shot.requirements?.threat_hero_source_asset_id||
    shot.requirements?.generation_strategy?.threat_hero_source_asset_id||
    shot.intent?.threat_hero_source_asset_id
  );
  if(explicit){
    const explicitNode=nodes.find(n=>text(n.id)===explicit)||null;
    if(!explicitNode)return {source:null,reason:"THREAT_HERO_EXPLICIT_SOURCE_NOT_FOUND"};
    const explicitSelection=CreativeImageAssetHandoffRuntime.select({
      asset_nodes:[explicitNode],
      scene_id:shot.metadata?.scene_id||shot.scene_id||null,
      shot_id:shot.id,
      continuity_group_id:shot.requirements?.generation_strategy?.shared_state_group_id||null,
      threat_identity_key:governedThreatKey,
      asset_classes:["VFX_SOURCE","THREAT_DESIGN"],
      downstream_role:"VFX",
    });
    return explicitSelection.selected
      ?{source:explicitSelection.selected,reason:null}
      :{source:null,reason:"THREAT_HERO_EXPLICIT_SOURCE_NOT_APPROVED"};
  }
  const imageStudio=CreativeImageAssetHandoffRuntime.select({
    asset_nodes:nodes,
    scene_id:shot.metadata?.scene_id||shot.scene_id||null,
    shot_id:shot.id,
    continuity_group_id:shot.requirements?.generation_strategy?.shared_state_group_id||null,
    threat_identity_key:governedThreatKey,
    asset_classes:["VFX_SOURCE","THREAT_DESIGN"],
    downstream_role:"VFX",
  });
  if(!governedThreatKey&&imageStudio.candidate_count>1){
    return {source:null,reason:"THREAT_HERO_IDENTITY_REQUIRED"};
  }
  if(imageStudio.selected)return {source:imageStudio.selected,reason:null};
  const legacy=nodes.find(n=>{
    const role=text(n.metadata?.role||n.metadata?.asset_role||n.metadata?.artifact_kind).toUpperCase();
    return text(n.metadata?.shot_id)===text(shot.id)&&["THREAT_HERO_SOURCE","THREAT_SOURCE","HERO_OBJECT_SOURCE"].includes(role);
  })||null;
  return legacy
    ?{source:legacy,reason:"LEGACY_SHOT_LOCAL_SOURCE"}
    :{source:null,reason:"THREAT_HERO_SOURCE_ASSET_REQUIRED"};
}
function numericProfile(){
  return {
    contract:"AVANTIQO_VFX_INTEGRATION_NUMERIC_PROFILE_V1",
    seed:771919,
    depth_position_normalized:0.5,
    depth_foreground_rule:"GREATER_THAN_EFFECT_DEPTH_OCCLUDES",
    occlusion_softness_pixels:6,
    matte_erode_pixels:1,
    matte_feather_pixels:2.5,
    exposure_ev:0,
    saturation:1,
    black_level:0,
    white_level:1,
    motion_blur_pixels:3,
    motion_blur_angle_degrees:0,
    dof_blur_sigma:0.8,
    grain_strength:0.018,
    light_wrap_pixels:4,
    light_wrap_strength:0.25,
    reflection_strength:0.18,
    contact_shadow_strength:0.35,
    contact_shadow_blur_pixels:8,
    deterministic_replay_required:true,
  };
}
function vfxContract(kind,shot={}){
  const spatial=object(shot.requirements?.pursuit_spatial_choreography||shot.intent?.pursuit_spatial_choreography);
  const env=object(shot.requirements?.environmental_continuity_state||shot.intent?.environmental_continuity_state);
  const isThreat=kind==="THREAT_HERO_LAYER";
  const effect={
    effect_id:isThreat?"threat-hero-layer":"atmosphere-layer",
    effect_class:isThreat?"CREATURE_OBJECT_AUGMENT":"ATMOSPHERIC",
    vfx_intent:isThreat
      ? ("Preserve and integrate the authored threat/hero element with exact pursuit geometry: "+text(spatial.search_or_attack_vector||spatial.threat_position||"authored threat geometry"))
      : ("Render only the authored atmosphere state: "+text([env.precipitation_state,env.atmosphere_density,env.wind_direction].filter(Boolean).join("; "))),
    target_subject_or_region:isThreat?"authored threat/hero subject":"full frame atmosphere volume",
    tracking_mode:isThreat?"OBJECT":"NONE",
    tracking_target:isThreat?text(spatial.threat_position)||"authored threat object":null,
    mask_roto_strategy:isThreat?"Use source alpha/matte; preserve silhouette and identity.":"Procedural transparent atmosphere layer.",
    occlusion_depth_strategy:"Use governed base depth for foreground/background ordering.",
    temporal_entry:"Inherited from shot opening frame.",
    temporal_progression:"Evolve continuously through the full shot without reset.",
    temporal_exit:"Inherited into shot closing frame.",
    perspective_scale:"Match authored camera perspective and threat distance.",
    motion_blur:"Match authored shutter and camera/subject velocity.",
    depth_of_field:"Match base-plate focus plane and lens character.",
    lighting_interaction:"Downstream physical-interaction pass owns final light/shadow/reflection response.",
    color_exposure_match:"Match base-plate exposure and color response.",
    edge_integration:"No halo, chatter, spill or synthetic edge.",
    grain_texture_match:"Match base-plate temporal texture after integration.",
    cleanup_constraints:["No identity drift","No geometry mutation","No decorative symmetric threat placement"],
    continuity_anchors:{
      identity:text(shot.requirements?.subject_identity_key)||null,
      product:null,
      environment:text(shot.requirements?.world_identity_key)||null,
      lighting:text(env.practical_light_state)||null,
      spatial_orientation:text(spatial.line_of_action)||null,
    },
    physical_plausibility:isThreat
      ?"Threat position, scale, occlusion, motion and search vector must obey authored pursuit geometry."
      :"Rain/fog density and wind direction must preserve environmental continuity.",
    simulation_dependency:false,
    simulation_contract_present:false,
    integration_parameters:numericProfile(),
  };
  return {
    contract:"AVANTIQO_VFX_V1",
    version:1,
    provider_neutral:true,
    provider_prompt_persisted:false,
    execution_authored:false,
    effects:[effect],
    global_continuity_anchors:effect.continuity_anchors,
    identity_geometry_mutation_forbidden_without_story_authority:true,
    product_geometry_mutation_forbidden_without_story_authority:true,
    generative_transition_morphing_forbidden:true,
    simulation_heavy_effects_require_simulation_contract:true,
  };
}

export async function ensurePremiumLayerTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("PREMIUM_LAYER_TASK_SCOPE_REQUIRED");
  const [graphs,tasks,assets]=await Promise.all([
    ProductionGraphRepository.listByProject({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const graph=graphs[0]||null;
  if(!graph) return {contract:CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_CONTRACT,created:[],existing:[],blocked:[],graph_id:null};
  const created=[];const existing=[];const blocked=[];
  const passes=list(graph.nodes).filter(n=>n.metadata?.multipass_pass===true&&["ATMOSPHERE","THREAT_HERO_LAYER"].includes(passRole(n)));
  for(const pass of passes){
    const id=shotId(pass);const shot=shotNode(graph,id);
    const role=passRole(pass);
    const prior=tasks.find(t=>text(t.metadata?.premium_layer_pass_node_id)===text(pass.id));
    if(prior){existing.push(prior);continue;}
    const base=approvedBaseTask(tasks,id);
    if(!base){blocked.push({pass_node_id:pass.id,shot_id:id,reason:"APPROVED_BASE_PLATE_REQUIRED"});continue;}
    const baseRef=outputUrl(base);
    if(!baseRef){blocked.push({pass_node_id:pass.id,shot_id:id,reason:"BASE_PLATE_MEDIA_REQUIRED"});continue;}
    const vfx=vfxContract(role,shot||{});
    if(role==="ATMOSPHERE"){
      const state=object(shot?.requirements?.environmental_continuity_state||shot?.intent?.environmental_continuity_state);
      if(!text(state.precipitation_state)&&!text(state.atmosphere_density)){
        blocked.push({pass_node_id:pass.id,shot_id:id,reason:"ATMOSPHERE_STATE_REQUIRED"});continue;
      }
      const task=await ProductionTaskRuntime.create({
        organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot?.scene_id||shot?.metadata?.scene_id||null,shot_id:id,
        type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot?.title||id} · Atmosphere Layer`,
        description:"Render governed transparent rain/fog atmosphere as an owned deterministic layer.",
        service_id:"creative.vfx.atmosphere",service_code:"creative.vfx.atmosphere",capability:"creative.vfx.atmosphere",provider_id:"avantiqo-owned-vfx",priority:37,
        input:{shot_id:id,vfx_contract:vfx,environmental_continuity_state:state,base_reference:baseRef,requirements:{pass_id:"atmosphere",pass_role:"ATMOSPHERE",vfx_contract:vfx,environmental_continuity_state:state,base_plate_task_id:base.id},output_spec:object(shot?.generation?.output_spec||shot?.requirements?.output_spec)},
        cost:{estimated:0,actual:0,currency:null,approved:true},timing:{estimated_seconds:0},review:{required:false,approved:false},
        metadata:{workflow_kind:graph.metadata?.workflow_kind||null,execution_node_id:pass.id,production_step_id:"atmosphere",production_step_index:37,shot_id:id,premium_layer_pass_node_id:pass.id,premium_layer_task_materialization_contract:CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_CONTRACT,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false},
      });
      created.push(task);continue;
    }
    const threatSelection=threatSource(assets,shot||{});
    const source=threatSelection.source;
    if(!source?.url){
      blocked.push({
        pass_node_id:pass.id,
        shot_id:id,
        reason:threatSelection.reason||"THREAT_HERO_SOURCE_ASSET_REQUIRED",
      });
      continue;
    }
    const continuityGroup=shot?.requirements?.generation_strategy?.shared_state_group_id||null;
    const sourceBundle=CreativeImageAssetBundleHandoffRuntime.select({
      asset_nodes:assets,
      parent_asset_node_id:source.id,
      continuity_group_id:continuityGroup,
    });
    if(!sourceBundle.ready_for_vfx){blocked.push({pass_node_id:pass.id,shot_id:id,reason:"IMAGE_STUDIO_VFX_DERIVATIVE_BUNDLE_REQUIRED"});continue;}
    const depth=depthAsset(assets,id,shot||{});
    if(!depth?.url){blocked.push({pass_node_id:pass.id,shot_id:id,reason:"CERTIFIED_DEPTH_MAP_REQUIRED"});continue;}
    const threatReference=sourceBundle.alpha_matte?.url||sourceBundle.upscaled_master?.url||source.url;
    const materialTruthPack=CreativeImageMaterialTruthPackRuntime.select({
      asset_nodes:assets,
      continuity_group_id:continuityGroup,
      identity_key:text(shot?.requirements?.subject_identity_key||shot?.requirements?.identity_requirements?.profile_id||shot?.requirements?.identity_requirements?.identity_profile_id||shot?.requirements?.performance_contract?.identity_profile_id)||null,
      threat_identity_key:threatIdentityKey(shot||{}),
    });
    if(materialTruthPack.complete!==true){
      blocked.push({pass_node_id:pass.id,shot_id:id,reason:"IMAGE_STUDIO_MATERIAL_TRUTH_PACK_REQUIRED"});
      continue;
    }
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot?.scene_id||shot?.metadata?.scene_id||null,shot_id:id,
      type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot?.title||id} · Threat/Hero Layer`,
      description:"Integrate the approved threat/hero source into the governed base world using depth-aware owned VFX.",
      service_id:"creative.vfx.threat-hero-layer",service_code:"creative.vfx.threat-hero-layer",capability:"creative.vfx.threat-hero-layer",provider_id:"avantiqo-owned-vfx",priority:38,
      input:{shot_id:id,vfx_contract:vfx,base_reference:baseRef,threat_reference:threatReference,depth_reference:depth.url,source_asset_node_id:source.id,material_truth_assets:materialTruthPack.assets,requirements:{pass_id:"threat-hero-layer",pass_role:"THREAT_HERO_LAYER",vfx_contract:vfx,source_asset_node_id:source.id,depth_asset_node_id:depth.id,alpha_matte_asset_node_id:sourceBundle.alpha_matte?.id||null,segmentation_asset_node_id:sourceBundle.subject_segmentation?.id||null,upscaled_master_asset_node_id:sourceBundle.upscaled_master?.id||null,material_truth_pack_qc_seal_hash:materialTruthPack.qc_seal_hash||null,material_truth_asset_node_ids:materialTruthPack.assets.map(item=>item.asset_node_id),base_plate_task_id:base.id,pursuit_spatial_choreography:object(shot?.requirements?.pursuit_spatial_choreography)},output_spec:object(shot?.generation?.output_spec||shot?.requirements?.output_spec)},
      cost:{estimated:0,actual:0,currency:null,approved:true},timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{workflow_kind:graph.metadata?.workflow_kind||null,execution_node_id:pass.id,production_step_id:"threat-hero-layer",production_step_index:38,shot_id:id,premium_layer_pass_node_id:pass.id,premium_layer_task_materialization_contract:CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_CONTRACT,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false},
    });
    created.push(task);
  }
  return {contract:CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,graph_id:graph.id};
}
export const CreativePremiumLayerTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_PREMIUM_LAYER_TASK_MATERIALIZATION_CONTRACT,ensure:ensurePremiumLayerTasks});
