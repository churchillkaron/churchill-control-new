import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

export const CREATIVE_IMAGE_ASSET_DERIVATIVE_FACTORY_CONTRACT = "CREATIVE_IMAGE_ASSET_DERIVATIVE_FACTORY_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function eligible(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    node.metadata?.image_asset_perceptual_qc_sealed===true &&
    node.metadata?.image_asset_pack_qc_sealed===true &&
    (!node.metadata?.image_asset_exploration_group_id || node.metadata?.image_asset_exploration_selected===true) &&
    Boolean(node.url);
}
function assetClass(node={}){return text(node.metadata?.image_asset_class||node.metadata?.image_asset_authority?.asset_class).toUpperCase();}
function derivativePlan(node={}){
  const cls=assetClass(node);
  const common=[
    {
      type:"SUBJECT_SEGMENTATION",
      capability:"creative.image.segmentation.execute",
      local:true,
      produces:["SUBJECT_SEGMENTATION","ALPHA_MATTE","FOREGROUND_MASK","BACKGROUND_MASK"],
    },
    {type:"DEPTH_MAP",capability:"creative.depth.estimate",local:false},
    {type:"UPSCALED_MASTER",capability:"ai.image.upscale",local:false},
  ];
  if(["THREAT_DESIGN","VFX_SOURCE","COMPOSITING_SOURCE","HERO_FRAME","CHARACTER_SHEET"].includes(cls)){
    return common;
  }
  if(["ENVIRONMENT_LOOKFRAME","TRANSITION_LOOKFRAME","CONTINUITY_REFERENCE"].includes(cls)){
    return common.filter(item=>item.type!=="ALPHA_MATTE");
  }
  return [{type:"UPSCALED_MASTER",capability:"ai.image.upscale",local:false}];
}
function taskIdentity(parentId,type){return `image-derivative:${parentId}:${type.toLowerCase()}`;}

export async function ensureImageAssetDerivatives({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_DERIVATIVE_FACTORY_SCOPE_REQUIRED");
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];
  for(const parent of list(nodes).filter(eligible)){
    const authority=object(parent.metadata?.image_asset_authority);
    for(const spec of derivativePlan(parent)){
      const identity=taskIdentity(parent.id,spec.type);
      const prior=tasks.find(t=>text(t.metadata?.image_asset_derivative_task_identity)===identity);
      if(prior){existing.push(prior);continue;}
      const input={
        media_kind:"IMAGE",
        image:parent.url,
        source:parent.url,
        source_reference:parent.url,
        parent_asset_node_id:parent.id,
        continuity_group_id:parent.metadata?.continuity_group_id||authority.continuity_group_id||null,
        derivative_type:spec.type,
        requirements:{
          image_asset_derivative:true,
          derivative_type:spec.type,
          parent_asset_node_id:parent.id,
          continuity_group_id:parent.metadata?.continuity_group_id||authority.continuity_group_id||null,
          parent_image_asset_pack_qc_seal_hash:parent.metadata?.image_asset_pack_qc_seal_hash||null,
          parent_image_asset_exploration_selection_seal_hash:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
          identity_preservation_required:true,
          geometry_preservation_required:true,
          derivative_qc_required:true,
        },
        provider_parameters:{
          source_asset_node_id:parent.id,
          source_image:parent.url,
          derivative_type:spec.type,
          identity_preservation_required:true,
          geometry_preservation_required:true,
          ...(spec.type==="UPSCALED_MASTER"?{
            upscale_mode:"PRODUCTION_MASTER",
            preserve_identity:true,
            preserve_geometry:true,
            preserve_texture_truth:true,
            sharpening_bounded:true,
          }:{}),
          ...(spec.type==="ALPHA_MATTE"?{
            transparent_background:true,
            preserve_hair_edges:true,
            preserve_motionless_fine_detail:true,
          }:{}),
          ...(spec.type==="DEPTH_MAP"?{
            relative_depth_only:true,
            metric_depth_claim_forbidden:true,
            preserve_occlusion_order:true,
          }:{}),
        },
      };
      const task=await ProductionTaskRuntime.create({
        organization_id,creative_project_id,production_graph_id:null,
        scene_id:authority.scene_id||parent.metadata?.scene_id||null,
        shot_id:authority.shot_id||parent.metadata?.shot_id||null,
        type:spec.local?"RENDER_PRODUCTION":"EXECUTE_CAPABILITY",
        status:"WAITING",
        title:`${spec.type.replaceAll("_"," ")} · ${parent.name||parent.id}`,
        description:`Create governed Image Studio derivative ${spec.type} from approved production asset.`,
        service_id:spec.capability,service_code:spec.capability,capability:spec.capability,
        provider_id:spec.local?"avantiqo-owned-image-tools":null,
        priority:26,input,
        cost:{estimated:0,actual:0,currency:null,approved:spec.local},
        timing:{estimated_seconds:0},review:{required:false,approved:false},
        metadata:{
          contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_FACTORY_CONTRACT,
          image_asset_derivative_task:true,
          image_asset_derivative_local:spec.local,
          image_asset_derivative_task_identity:identity,
          derivative_type:spec.type,
          parent_image_asset_node_id:parent.id,
          continuity_group_id:input.continuity_group_id,
          parent_image_asset_pack_qc_seal_hash:input.requirements.parent_image_asset_pack_qc_seal_hash,
          parent_image_asset_exploration_selection_seal_hash:input.requirements.parent_image_asset_exploration_selection_seal_hash,
          quality_gate:false,release_candidate:false,
        },
      });
      created.push(task);
    }
  }
  return {contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_FACTORY_CONTRACT,created,existing};
}

export const CreativeImageAssetDerivativeFactoryRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_FACTORY_CONTRACT,
  ensure:ensureImageAssetDerivatives,
});
