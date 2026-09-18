import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_SIMULATION_TASK_MATERIALIZATION_CONTRACT =
  "CREATIVE_SIMULATION_TASK_MATERIALIZATION_V1";

function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}

function passShotId(node={}){
  return text(node.requirements?.shot_id || node.intent?.shot_id || node.metadata?.shot_id || text(node.id).split(":")[1]);
}
function physicalSimulationPass(node={}){
  return node.metadata?.multipass_pass===true && text(node.intent?.pass_role || node.requirements?.pass_role).toUpperCase()==="PHYSICAL_SIMULATION";
}
function basePlateNode(graph={},shotId){
  return list(graph.nodes).find(n=>text(n.id)===`pass:${shotId}:base-plate`)||null;
}
function shotNode(graph={},shotId){
  return list(graph.nodes).find(n=>text(n.id)===shotId && text(n.type).toUpperCase()==="SHOT")||null;
}
function passReady(graph={},pass={}){
  const shotId=passShotId(pass); const base=basePlateNode(graph,shotId);
  return Boolean(base?.metadata?.execution_completed===true && base?.quality?.approved===true);
}

export async function ensureSimulationTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("SIMULATION_TASK_SCOPE_REQUIRED");
  const [graphs,tasks]=await Promise.all([
    ProductionGraphRepository.listByProject({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const graph=graphs[0]||null;
  if(!graph) return {contract:CREATIVE_SIMULATION_TASK_MATERIALIZATION_CONTRACT,created:[],existing:[],blocked:[],graph_id:null};
  const created=[]; const existing=[]; const blocked=[];
  for(const pass of list(graph.nodes).filter(physicalSimulationPass)){
    const shotId=passShotId(pass); const shot=shotNode(graph,shotId); const sim=object(shot?.requirements?.simulation_contract);
    if(!Object.keys(sim).length){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"SIMULATION_CONTRACT_REQUIRED"});continue;}
    if(!passReady(graph,pass)){blocked.push({pass_node_id:pass.id,shot_id:shotId,reason:"BASE_PLATE_CERTIFICATION_REQUIRED"});continue;}
    const prior=tasks.find(t=>text(t.metadata?.simulation_pass_node_id)===text(pass.id) || text(t.input?.simulation_pass_node_id)===text(pass.id));
    if(prior){existing.push(prior);continue;}
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:graph.id,
      scene_id:shot?.scene_id||shot?.metadata?.scene_id||null,shot_id:shotId,
      type:"RENDER_PRODUCTION",status:"WAITING",
      title:`${shot?.title||shotId} · Physical Simulation`,
      description:`Execute approved physical simulation contract for ${shotId} using the owned solver selected from simulation class.`,
      service_id:"creative.simulation.execute",service_code:"creative.simulation.execute",capability:"creative.simulation.execute",
      provider_id:"avantiqo-owned-simulation",priority:35,
      input:{
        shot_id:shotId,simulation_pass_node_id:pass.id,simulation_contract:sim,
        requirements:{simulation_contract:sim,pass_id:"simulation",pass_role:"PHYSICAL_SIMULATION",multipass_contract_hash:pass.requirements?.multipass_contract_hash||null},
        output_spec:object(shot?.generation?.output_spec||shot?.requirements?.output_spec),
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},
      timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{
        workflow_kind:graph.metadata?.workflow_kind||null,
        execution_node_id:pass.id,execution_step_id:`${pass.id}:owned-solver`,production_step_id:"simulation",production_step_index:35,
        quality_gate:false,release_candidate:false,shot_id:shotId,
        simulation_pass_node_id:pass.id,
        simulation_task_materialization_contract:CREATIVE_SIMULATION_TASK_MATERIALIZATION_CONTRACT,
        simulation_backend_selection_authority:"SIMULATION_CLASS",
        provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false,
      },
    });
    created.push(task);
  }
  return {contract:CREATIVE_SIMULATION_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,graph_id:graph.id};
}

export const CreativeSimulationTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_SIMULATION_TASK_MATERIALIZATION_CONTRACT,ensure:ensureSimulationTasks});
