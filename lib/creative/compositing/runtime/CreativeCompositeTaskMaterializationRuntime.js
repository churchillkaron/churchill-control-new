import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { CreativeCompositingRuntime } from "@/lib/creative/compositing/runtime/CreativeCompositingRuntime";

export const CREATIVE_COMPOSITE_TASK_MATERIALIZATION_CONTRACT="CREATIVE_COMPOSITE_TASK_MATERIALIZATION_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
function contractFromTask(task={}){const c=object(task.input?.compositing_contract||task.input?.requirements?.compositing_contract||task.metadata?.compositing_contract_data);return text(c.contract)===CreativeCompositingRuntime.contract?c:null;}
function selectedBase(nodes=[],shotId){return nodes.find(n=>text(n.metadata?.shot_id)===text(shotId)&&text(n.type).toUpperCase()==="VIDEO"&&n.metadata?.shot_candidate_selected===true&&n.metadata?.shot_candidate_review_passed===true&&n.metadata?.blocked!==true)||null;}
function byTask(nodes=[],taskId){return nodes.find(n=>text(n.production_task_id||n.metadata?.production_task_id)===text(taskId)&&n.metadata?.blocked!==true)||null;}
function assetForLayer(layer={},nodes=[],shotId){if(layer.layer_role==="BASE_PLATE"||layer.auto_resolved_selected_candidate===true)return layer.asset_node_id?nodes.find(n=>n.id===layer.asset_node_id)||null:layer.production_task_id?byTask(nodes,layer.production_task_id):selectedBase(nodes,shotId);if(layer.asset_node_id)return nodes.find(n=>n.id===layer.asset_node_id)||null;if(layer.production_task_id)return byTask(nodes,layer.production_task_id);return null;}
function layerReady(layer,node){if(!node)return false;if(layer.layer_role==="BASE_PLATE")return node.metadata?.shot_candidate_review_passed===true&&(node.metadata?.selected_for_master===true||node.metadata?.shot_candidate_selected===true);if(layer.layer_role==="SIMULATION_PASS")return node.metadata?.simulation_qc_sealed===true||node.metadata?.shot_candidate_simulation_qc_passed===true;if(["VFX_ELEMENT","SET_EXTENSION","SCREEN_INSERT","ATMOSPHERE","LIGHTING_PASS","REFLECTION_SHADOW","BEAUTY_CLEANUP"].includes(layer.layer_role)){const applicable=node.metadata?.vfx_contract==="AVANTIQO_VFX_V1"||node.metadata?.shot_candidate_vfx_applicable===true||node.metadata?.vfx_qc_seal_contract==="AVANTIQO_VFX_QC_SEAL_V1";return !applicable||node.metadata?.vfx_qc_sealed===true||node.metadata?.shot_candidate_vfx_qc_passed===true;}return true;}

export async function ensureCompositeTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("COMPOSITE_TASK_SCOPE_REQUIRED");
  const [shots,tasks,nodes]=await Promise.all([ShotRuntime.list({organization_id,creative_project_id}),ProductionTaskRuntime.list({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id})]);
  const created=[];const existing=[];const blocked=[];
  for(const shot of list(shots)){
    const sourceTask=tasks.find(t=>text(t.shot_id||t.input?.shot_id||t.metadata?.shot_id)===text(shot.id)&&contractFromTask(t));
    if(!sourceTask){
      if(text(shot.compositing_contract?.contract)===CreativeCompositingRuntime.contract) blocked.push({shot_id:shot.id,reason:'COMPOSITING_LINEAGE_TASK_REQUIRED'});
      continue;
    }
    const contract=contractFromTask(sourceTask);
    if(text(contract.contract)!==CreativeCompositingRuntime.contract)continue;
    const verified=CreativeCompositingRuntime.verify({...shot,compositing_contract:contract});
    if(verified.status!=="READY"){blocked.push({shot_id:shot.id,reason:"COMPOSITING_CONTRACT_NOT_READY"});continue;}
    const unresolved=[];
    for(const layer of list(contract.layers)){const node=assetForLayer(layer,nodes,shot.id);if(!layerReady(layer,node))unresolved.push(layer.layer_id);}
    if(unresolved.length){blocked.push({shot_id:shot.id,reason:"COMPOSITING_LAYER_EVIDENCE_REQUIRED",layers:unresolved});continue;}
    const prior=tasks.find(t=>text(t.capability||t.service_code)==="creative.shot.composite"&&text(t.shot_id||t.input?.shot_id)===text(shot.id));
    if(prior){existing.push(prior);continue;}
    const task=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:sourceTask?.production_graph_id||null,scene_id:shot.scene_id||null,shot_id:shot.id,type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot.title||shot.id} · Final Composite`,description:`Assemble the pre-authored governed compositing layers for ${shot.id} after all required source QC gates pass.`,service_id:"creative.shot.composite",service_code:"creative.shot.composite",capability:"creative.shot.composite",provider_id:"avantiqo-owned-compositor",priority:50,input:{shot_id:shot.id,compositing_contract:contract,requirements:{compositing_contract:contract,pass_role:"FINAL_COMPOSITE"}},cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},metadata:{workflow_kind:sourceTask?.metadata?.workflow_kind||null,production_step_id:"composite",production_step_index:50,shot_id:shot.id,composite_task_materialization_contract:CREATIVE_COMPOSITE_TASK_MATERIALIZATION_CONTRACT,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false}});created.push(task);
  }
  return{contract:CREATIVE_COMPOSITE_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,total:created.length+existing.length};
}
export const CreativeCompositeTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_COMPOSITE_TASK_MATERIALIZATION_CONTRACT,ensure:ensureCompositeTasks});
