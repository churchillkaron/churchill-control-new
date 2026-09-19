import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { CreativeOpticalFinishingRuntime } from "@/lib/creative/post-production/runtime/CreativeOpticalFinishingRuntime";

export const CREATIVE_OPTICAL_TASK_MATERIALIZATION_CONTRACT="CREATIVE_OPTICAL_TASK_MATERIALIZATION_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function reviewedComposite(nodes=[]){return nodes.filter(n=>text(n.metadata?.compositing_render_contract)==="AVANTIQO_LAYERED_COMPOSITING_RENDER_V1"&&n.metadata?.compositing_source_gate_passed===true&&n.metadata?.shot_candidate_review_passed===true&&n.metadata?.selected_for_master===true&&text(n.metadata?.shot_id));}
export async function ensureOpticalTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("OPTICAL_TASK_SCOPE_REQUIRED");
  const [tasks,nodes]=await Promise.all([ProductionTaskRuntime.list({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id})]);
  const created=[];const existing=[];
  for(const composite of reviewedComposite(nodes)){
    const shotId=text(composite.metadata?.shot_id);
    const prior=tasks.find(t=>text(t.capability||t.service_code)==="creative.video.optical-finish"&&text(t.shot_id||t.input?.shot_id)===shotId);
    if(prior){existing.push(prior);continue;}
    const sourceTask=tasks.find(t=>text(t.output?.asset_node_id)===text(composite.id)||text(t.shot_id||t.input?.shot_id)===shotId&&text(t.capability||t.service_code)==="creative.shot.composite")||null;
    const opticalProfile=CreativeOpticalFinishingRuntime.profile(sourceTask?.input?.optical_profile||{});
    const finishingIntelligence=sourceTask?.input?.requirements?.finishing_intelligence||{};
    const task=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:sourceTask?.production_graph_id||null,scene_id:sourceTask?.scene_id||composite.metadata?.scene_id||null,shot_id:shotId,type:"RENDER_PRODUCTION",status:"WAITING",title:`${sourceTask?.title||shotId} · Optical Finish`,description:`Apply the pre-materialized deterministic optical profile to reviewed composite ${composite.id}.`,service_id:"creative.video.optical-finish",service_code:"creative.video.optical-finish",capability:"creative.video.optical-finish",provider_id:"avantiqo-owned-optical",priority:55,depends_on:sourceTask?.id?[sourceTask.id]:[],input:{shot_id:shotId,composite_asset_node_id:composite.id,optical_profile:opticalProfile,requirements:{pass_role:"OPTICAL_FINISH",composite_asset_node_id:composite.id,optical_profile_contract:opticalProfile.contract,finishing_intelligence:finishingIntelligence,optical_gate:finishingIntelligence.optical_gate||{}},render_policy:sourceTask?.input?.render_policy||{}},cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},metadata:{workflow_kind:sourceTask?.metadata?.workflow_kind||null,shot_id:shotId,production_step_id:"optical-finish",production_step_index:55,optical_task_materialization_contract:CREATIVE_OPTICAL_TASK_MATERIALIZATION_CONTRACT,optical_profile_contract:opticalProfile.contract,finishing_intelligence_contract:finishingIntelligence.contract||null,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false}});created.push(task);
  }
  return{contract:CREATIVE_OPTICAL_TASK_MATERIALIZATION_CONTRACT,created,existing,total:created.length+existing.length};
}
export const CreativeOpticalTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_OPTICAL_TASK_MATERIALIZATION_CONTRACT,ensure:ensureOpticalTasks});
