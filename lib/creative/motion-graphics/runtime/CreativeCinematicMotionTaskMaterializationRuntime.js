import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { CreativeCinematicMotionDesignRuntime } from "./CreativeCinematicMotionDesignRuntime";

export const CREATIVE_CINEMATIC_MOTION_TASK_MATERIALIZATION_CONTRACT="CREATIVE_CINEMATIC_MOTION_TASK_MATERIALIZATION_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
function passShotId(node={}){return text(node.requirements?.shot_id||node.intent?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);}
function motionPass(node={}){return node.metadata?.multipass_pass===true&&text(node.intent?.pass_role||node.requirements?.pass_role).toUpperCase()==="CINEMATIC_MOTION_DESIGN";}
function shotNode(graph={},shotId){return list(graph.nodes).find(n=>text(n.id)===shotId&&text(n.type).toUpperCase()==="SHOT")||null;}
function reconstructionAsset(nodes=[],shotId,kinds=[]){return nodes.find(a=>text(a.metadata?.shot_id)===shotId&&kinds.includes(text(a.metadata?.artifact_kind).toUpperCase())&&a.metadata?.reconstruction_qc_passed===true)||null;}
function bindIntegratedEvents(events=[],assets=[],shotId){
  const camera=reconstructionAsset(assets,shotId,["CAMERA_SOLUTION","SINGLE_VIEW_CAMERA_PROXY"]);
  const matchmove=assets.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.artifact_kind).toUpperCase()==="MATCHMOVE_3D"&&a.metadata?.reconstruction_qc_passed===true&&a.metadata?.matchmove_world_space_cgi_allowed===true)||null;
  const depth=reconstructionAsset(assets,shotId,["DEPTH_MAP"]);
  const materials=reconstructionAsset(assets,shotId,["SURFACE_MATERIAL_MAP"]);
  return list(events).map(event=>{
    if(text(event.integration_mode||"SOURCE_FREE_CGI").toUpperCase()!=="SOURCE_WORLD_INTEGRATED")return event;
    const fidelity=text(event.integration_fidelity||"TRACKED_WORLD_3D").toUpperCase();
    return{...event,integration_fidelity:fidelity,camera_solution_asset_node_id:event.camera_solution_asset_node_id||camera?.id||null,matchmove_asset_node_id:fidelity==="TRACKED_WORLD_3D"?(event.matchmove_asset_node_id||matchmove?.id||null):(event.matchmove_asset_node_id||null),depth_asset_node_id:event.depth_asset_node_id||depth?.id||null,material_map_asset_node_id:event.material_map_asset_node_id||materials?.id||null};
  });
}
export async function ensureCinematicMotionTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("CINEMATIC_MOTION_TASK_SCOPE_REQUIRED");
  const [graphs,tasks,assets]=await Promise.all([ProductionGraphRepository.listByProject({organization_id,creative_project_id}),ProductionTaskRuntime.list({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id})]);
  const graph=graphs[0]||null;if(!graph)return{contract:CREATIVE_CINEMATIC_MOTION_TASK_MATERIALIZATION_CONTRACT,created:[],existing:[],blocked:[],graph_id:null};
  const created=[];const existing=[];const blocked=[];
  for(const pass of list(graph.nodes).filter(motionPass)){
    const shotId=passShotId(pass);const shot=shotNode(graph,shotId);const source=object(shot?.requirements?.cinematic_motion_design);const events=bindIntegratedEvents(source.events,assets,shotId);
    if(!events.length){blocked.push({shot_id:shotId,pass_node_id:pass.id,reason:"CINEMATIC_MOTION_EVENTS_REQUIRED"});continue;}
    const output=object(shot?.requirements?.output_spec||shot?.generation?.output_spec);const duration=Number(shot?.duration_seconds||output.duration_seconds||0);const fps=Number(output.frame_rate||24)||24;
    const plan=CreativeCinematicMotionDesignRuntime.plan({events,width:Number(output.width||1920)||1920,height:Number(output.height||1080)||1080,fps,frames:Math.max(1,Math.round(duration*fps)),flagship:true});
    if(plan.status!=="READY"){blocked.push({shot_id:shotId,pass_node_id:pass.id,reason:"CINEMATIC_MOTION_PLAN_BLOCKED",blockers:plan.blockers});continue;}
    const prior=tasks.find(t=>text(t.metadata?.cinematic_motion_pass_node_id)===text(pass.id)||text(t.input?.cinematic_motion_pass_node_id)===text(pass.id));if(prior){existing.push(prior);continue;}
    const task=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot?.scene_id||shot?.metadata?.scene_id||null,shot_id:shotId,type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot?.title||shotId} · Cinematic Motion Design`,description:`Render governed world-space CGI/motion design for ${shotId}.`,service_id:"creative.motion.cinematic-design",service_code:"creative.motion.cinematic-design",capability:"creative.motion.cinematic-design",provider_id:"avantiqo-owned-motion",priority:38,input:{shot_id:shotId,cinematic_motion_pass_node_id:pass.id,plan,requirements:{pass_role:"CINEMATIC_MOTION_DESIGN",cinematic_motion_contract_hash:plan.contract_hash}},cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},metadata:{workflow_kind:graph.metadata?.workflow_kind||null,execution_node_id:pass.id,production_step_id:"cinematic-motion",production_step_index:38,shot_id:shotId,cinematic_motion_pass_node_id:pass.id,cinematic_motion_task_materialization_contract:CREATIVE_CINEMATIC_MOTION_TASK_MATERIALIZATION_CONTRACT,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false}});created.push(task);
  }
  return{contract:CREATIVE_CINEMATIC_MOTION_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,graph_id:graph.id};
}
export const CreativeCinematicMotionTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_CINEMATIC_MOTION_TASK_MATERIALIZATION_CONTRACT,ensure:ensureCinematicMotionTasks});
