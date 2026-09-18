import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

export const CREATIVE_VFX_TASK_MATERIALIZATION_CONTRACT="CREATIVE_VFX_TASK_MATERIALIZATION_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
function passShotId(node={}){return text(node.requirements?.shot_id||node.intent?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);}
function vfxPass(node={}){return node.metadata?.multipass_pass===true&&text(node.intent?.pass_role||node.requirements?.pass_role).toUpperCase()==="VFX_INTEGRATION";}
function shotNode(graph={},shotId){return list(graph.nodes).find(n=>text(n.id)===shotId&&text(n.type).toUpperCase()==="SHOT")||null;}
function approvedBaseTask(tasks=[],shotId){
  return tasks.find(t=>text(t.metadata?.shot_id||t.shot_id)===shotId&&t.metadata?.base_plate_role===true&&text(t.status)==="COMPLETED"&&t.metadata?.approved_for_downstream_after_perceptual_review===true)||null;
}
function outputUrl(task={}){const o=object(task.output?.output||task.output);return text(o.asset_url||o.image_url||o.file_url||o.url||task.output?.file_url)||null;}
function depthAsset(nodes=[],shotId){return nodes.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.artifact_kind).toUpperCase()==="DEPTH_MAP"&&a.metadata?.reconstruction_qc_passed===true)||null;}
function sealedSimulation(nodes=[],shotId){return nodes.filter(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.pass_id)==="simulation"&&a.metadata?.simulation_qc_sealed===true&&text(a.metadata?.simulation_qc_seal_contract)==="AVANTIQO_SIMULATION_QC_SEAL_V1"&&/^[a-f0-9]{64}$/i.test(text(a.metadata?.simulation_qc_seal_hash)));}

export async function ensureVfxTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("VFX_TASK_SCOPE_REQUIRED");
  const [graphs,tasks,assets]=await Promise.all([
    ProductionGraphRepository.listByProject({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const graph=graphs[0]||null;if(!graph)return{contract:CREATIVE_VFX_TASK_MATERIALIZATION_CONTRACT,created:[],existing:[],blocked:[],graph_id:null};
  const created=[];const existing=[];const blocked=[];
  for(const pass of list(graph.nodes).filter(vfxPass)){
    const shotId=passShotId(pass);const shot=shotNode(graph,shotId);const vfx=object(shot?.requirements?.vfx_contract);
    if(!Object.keys(vfx).length){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"VFX_CONTRACT_REQUIRED"});continue;}
    const base=approvedBaseTask(tasks,shotId);if(!base){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"APPROVED_BASE_PLATE_REQUIRED"});continue;}
    const baseRef=outputUrl(base);if(!baseRef){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"BASE_PLATE_MEDIA_REQUIRED"});continue;}
    const depth=depthAsset(assets,shotId);if(!depth?.url){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"CERTIFIED_DEPTH_MAP_REQUIRED"});continue;}
    const simulations=sealedSimulation(assets,shotId);if(vfx.effects?.some(e=>e.simulation_dependency===true)&&!simulations.length){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"SEALED_SIMULATION_ASSET_REQUIRED"});continue;}
    const prior=tasks.find(t=>text(t.metadata?.vfx_pass_node_id)===text(pass.id)||text(t.input?.vfx_pass_node_id)===text(pass.id));if(prior){existing.push(prior);continue;}
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot?.scene_id||shot?.metadata?.scene_id||null,shot_id:shotId,
      type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot?.title||shotId} · VFX Integration`,description:`Integrate approved physical effects into the certified source world for ${shotId}.`,
      service_id:"creative.vfx.integrate",service_code:"creative.vfx.integrate",capability:"creative.vfx.integrate",provider_id:"avantiqo-owned-vfx",priority:40,
      input:{shot_id:shotId,vfx_pass_node_id:pass.id,vfx_contract:vfx,base_reference:baseRef,depth_reference:depth.url,simulation_asset_node_ids:simulations.map(a=>a.id),requirements:{vfx_contract:vfx,pass_id:"vfx-integration",pass_role:"VFX_INTEGRATION",simulation_qc_seals:simulations.map(a=>a.metadata?.simulation_qc_seal_hash),depth_asset_node_id:depth.id,base_plate_task_id:base.id},output_spec:object(shot?.generation?.output_spec||shot?.requirements?.output_spec)},
      cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{workflow_kind:graph.metadata?.workflow_kind||null,execution_node_id:pass.id,execution_step_id:`${pass.id}:owned-vfx`,production_step_id:"vfx-integration",production_step_index:40,quality_gate:false,release_candidate:false,shot_id:shotId,vfx_pass_node_id:pass.id,vfx_task_materialization_contract:CREATIVE_VFX_TASK_MATERIALIZATION_CONTRACT,vfx_backend_selection_authority:"AUTHORED_VFX_CONTRACT",provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false},
    });
    created.push(task);
  }
  return{contract:CREATIVE_VFX_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,graph_id:graph.id};
}
export const CreativeVfxTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_VFX_TASK_MATERIALIZATION_CONTRACT,ensure:ensureVfxTasks});
