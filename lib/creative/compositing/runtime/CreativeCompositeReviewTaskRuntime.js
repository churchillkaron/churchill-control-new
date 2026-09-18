import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_COMPOSITE_REVIEW_TASK_CONTRACT="CREATIVE_COMPOSITE_REVIEW_TASK_V1";
function text(v){return String(v??"").trim();}
function compositeTask(task={}){return text(task.capability||task.service_code)==="creative.shot.composite"&&text(task.status).toUpperCase()==="COMPLETED"&&Boolean(task.output?.asset_node_id||task.output?.file_url);}
export async function ensureCompositeReviewTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("COMPOSITE_REVIEW_SCOPE_REQUIRED");
  const tasks=await ProductionTaskRuntime.list({organization_id,creative_project_id});const created=[];const existing=[];
  for(const source of tasks.filter(compositeTask)){
    const prior=tasks.find(task=>text(task.metadata?.contract)==="GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1"&&text(task.metadata?.source_generation_task_id)===text(source.id));
    if(prior){existing.push(prior);continue;}
    const review=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:source.production_graph_id||null,scene_id:source.scene_id||null,shot_id:source.shot_id||null,type:"EXECUTE_CAPABILITY",status:"WAITING",title:`Review ${source.title||"final composite"}`,description:"Review the actual governed layered composite for elite perceptual quality before optical finishing.",service_id:"ai.image.analyze",service_code:"ai.image.analyze",capability:"ai.image.analyze",provider_id:null,priority:51,depends_on:[source.id],input:{media_kind:"VIDEO",requirements:{source_generation_task_id:source.id,generated_output_required:true,deterministic_media_inspection_required:true,reject_before_editing:true},provider_parameters:{response_format:{type:"json_object"},source_generation_task_id:source.id,media_kind:"VIDEO"}},cost:{estimated:0,actual:0,currency:source.cost?.currency||null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},metadata:{contract:"GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",workflow_kind:source.metadata?.workflow_kind||null,source_generation_task_id:source.id,source_generation_node_id:source.metadata?.execution_node_id||null,source_node_type:"FINAL_COMPOSITE",shot_id:source.shot_id||null,media_kind:"VIDEO",automated_validation_required:true,reject_before_editing:true,quality_gate:true,release_candidate:false,production_step_id:"composite-quality",production_step_index:51,composite_review_task_contract:CREATIVE_COMPOSITE_REVIEW_TASK_CONTRACT}});created.push(review);
  }
  return{contract:CREATIVE_COMPOSITE_REVIEW_TASK_CONTRACT,created,existing,total:created.length+existing.length};
}
export const CreativeCompositeReviewTaskRuntime=Object.freeze({contract:CREATIVE_COMPOSITE_REVIEW_TASK_CONTRACT,ensure:ensureCompositeReviewTasks});
