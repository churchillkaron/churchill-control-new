import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { CreativeTemporal4KMasteringRuntime } from "./CreativeTemporal4KMasteringRuntime";

export const CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT="CREATIVE_TEMPORAL_4K_DELIVERY_TASK_V1";
function text(v){return String(v??"").trim();}
function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function frameRate(node={}){return finite(node.technical?.frame_rate??node.technical?.fps,24);}
function frameCount(node={}){const explicit=finite(node.technical?.frame_count,null);if(explicit)return Math.round(explicit);const d=finite(node.technical?.duration_seconds,null),fps=frameRate(node);return d&&fps?Math.max(1,Math.round(d*fps)):null;}
function is4k(node={}){return finite(node.technical?.width,0)>=3840&&finite(node.technical?.height,0)>=2160;}
function completedUpscaleTask(task={}){return text(task.capability||task.service_code)==="ai.video.upscale"&&text(task.status).toUpperCase()==="COMPLETED";}
export async function ensureTemporal4KDelivery({organization_id,creative_project_id,source_render}={}){
  if(!organization_id||!creative_project_id||!source_render?.id)throw new Error("TEMPORAL_4K_DELIVERY_SCOPE_REQUIRED");
  if(is4k(source_render))return{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"READY_4K",source_render,delivery_render:source_render,task:null,created:false,native_or_existing_4k:true};
  const width=finite(source_render.technical?.width),height=finite(source_render.technical?.height),fps=frameRate(source_render),frames=frameCount(source_render);
  const plan=CreativeTemporal4KMasteringRuntime.plan({source_width:width,source_height:height,fps,frame_count:frames,source_asset_node_id:source_render.id,source_checksum:source_render.technical?.checksum||null,audio_asset_node_id:source_render.metadata?.master_audio_asset_node_id||null,target_width:3840,target_height:2160});
  if(plan.status!=="READY")return{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"BLOCKED",source_render,delivery_render:null,task:null,created:false,blockers:plan.blockers,plan};
  const [tasks,nodes]=await Promise.all([ProductionTaskRuntime.list({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id})]);
  const prior=tasks.find(t=>text(t.metadata?.temporal_4k_source_asset_node_id)===text(source_render.id)&&text(t.capability||t.service_code)==="ai.video.upscale")||null;
  if(prior){
    if(completedUpscaleTask(prior)){
      const asset=nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(prior.id)&&n.status!=="REJECTED"&&n.status!=="ARCHIVED")||null;
      if(asset&&is4k(asset)&&prior.metadata?.automated_perceptual_validation_passed===true)return{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"READY_4K",source_render,delivery_render:asset,task:prior,created:false,native_or_existing_4k:false,plan};
      return{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"AWAITING_4K_QC",source_render,delivery_render:asset,task:prior,created:false,plan};
    }
    return{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"AWAITING_TEMPORAL_4K_MASTER",source_render,delivery_render:null,task:prior,created:false,plan};
  }
  const task=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:null,scene_id:null,shot_id:null,type:"EXECUTE_CAPABILITY",status:"WAITING",title:"Temporal 4K Master",description:"Create the final 3840x2160 delivery master from the locked, color-finished source using governed temporal FlashVSR super-resolution.",service_id:"ai.video.upscale",service_code:"ai.video.upscale",capability:"ai.video.upscale",provider_id:null,priority:90,depends_on:[],input:{source_video:source_render.url,source_asset_node_id:source_render.id,temporal_4k_plan:plan,requirements:{temporal_4k_plan:plan,source_asset_node_id:source_render.id,source_checksum:source_render.technical?.checksum||null,delivery_width:3840,delivery_height:2160,per_frame_independent_sr_forbidden:true},provider_parameters:{temporal_4k_plan:plan,resolution:"4k",quality_profile:"TEMPORAL_4K_MASTER"}},cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:true,approved:false},metadata:{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,production_step_id:"temporal-4k-master",production_step_index:90,temporal_4k_source_asset_node_id:source_render.id,temporal_4k_plan_hash:plan.plan_hash,final_delivery_task:true,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:true}});
  return{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"AWAITING_TEMPORAL_4K_MASTER",source_render,delivery_render:null,task,created:true,plan};
}
export const CreativeTemporal4KDeliveryTaskRuntime=Object.freeze({contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,ensure:ensureTemporal4KDelivery});
