import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_SIMULATION_REVIEW_TASK_CONTRACT=
  "CREATIVE_SIMULATION_REVIEW_TASK_V1";

function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}

function simulationTask(task={}){
  return text(task.capability||task.service_code)==="creative.simulation.execute" &&
    text(task.status).toUpperCase()==="COMPLETED" &&
    Boolean(task.output?.asset_node_id||task.output?.file_url);
}

export async function ensureSimulationReviewTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("SIMULATION_REVIEW_SCOPE_REQUIRED");
  const tasks=await ProductionTaskRuntime.list({organization_id,creative_project_id});
  const created=[];const existing=[];
  for(const source of tasks.filter(simulationTask)){
    const prior=tasks.find(task=>
      text(task.metadata?.contract)==="GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" &&
      text(task.metadata?.source_generation_task_id)===text(source.id)
    );
    if(prior){existing.push(prior);continue;}
    const review=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,
      production_graph_id:source.production_graph_id||null,
      scene_id:source.scene_id||null,shot_id:source.shot_id||null,
      type:"EXECUTE_CAPABILITY",status:"WAITING",
      title:`Review ${source.title||"physical simulation"}`,
      description:"Review actual rendered simulation frames for elite visual quality and governed physical plausibility before downstream VFX integration.",
      service_id:"ai.image.analyze",service_code:"ai.image.analyze",capability:"ai.image.analyze",
      provider_id:null,priority:36,depends_on:[source.id],
      input:{
        media_kind:"VIDEO",
        requirements:{
          source_generation_task_id:source.id,
          simulation_qc_required:true,
          generated_output_required:true,
          deterministic_media_inspection_required:true,
          reject_before_editing:true,
        },
        provider_parameters:{
          response_format:{type:"json_object"},
          source_generation_task_id:source.id,
          media_kind:"VIDEO",
        },
      },
      cost:{estimated:0,actual:0,currency:source.cost?.currency||null,approved:false},
      timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{
        contract:"GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
        workflow_kind:source.metadata?.workflow_kind||null,
        source_generation_task_id:source.id,
        source_generation_node_id:source.metadata?.execution_node_id||null,
        source_node_type:"PHYSICAL_SIMULATION",
        shot_id:source.shot_id||null,
        media_kind:"VIDEO",
        automated_validation_required:true,
        reject_before_editing:true,
        quality_gate:true,
        release_candidate:false,
        production_step_id:"simulation-quality",
        production_step_index:36,
        simulation_review_task_contract:CREATIVE_SIMULATION_REVIEW_TASK_CONTRACT,
      },
    });
    created.push(review);
  }
  return {contract:CREATIVE_SIMULATION_REVIEW_TASK_CONTRACT,created,existing,total:created.length+existing.length};
}

export const CreativeSimulationReviewTaskRuntime=Object.freeze({
  contract:CREATIVE_SIMULATION_REVIEW_TASK_CONTRACT,
  ensure:ensureSimulationReviewTasks,
});
