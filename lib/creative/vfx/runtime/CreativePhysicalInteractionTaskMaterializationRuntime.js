import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

export const CREATIVE_PHYSICAL_INTERACTION_TASK_MATERIALIZATION_CONTRACT="CREATIVE_PHYSICAL_INTERACTION_TASK_MATERIALIZATION_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
function shotNode(graph={},shotId){return list(graph.nodes).find(n=>text(n.id)===shotId&&text(n.type).toUpperCase()==="SHOT")||null;}
function sealedVfx(nodes=[],shotId){return nodes.filter(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.pass_id)==="vfx-integration"&&a.metadata?.vfx_qc_sealed===true&&text(a.metadata?.vfx_qc_seal_contract)==="AVANTIQO_VFX_QC_SEAL_V1"&&/^[a-f0-9]{64}$/i.test(text(a.metadata?.vfx_qc_seal_hash)));}
function materialMap(nodes=[],shotId){return nodes.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.artifact_kind).toUpperCase()==="SURFACE_MATERIAL_MAP"&&a.metadata?.reconstruction_qc_passed===true)||null;}

export async function ensurePhysicalInteractionTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id) throw new Error("PHYSICAL_INTERACTION_TASK_SCOPE_REQUIRED");
  const [graphs,tasks,assets]=await Promise.all([
    ProductionGraphRepository.listByProject({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const graph=graphs[0]||null;if(!graph)return{contract:CREATIVE_PHYSICAL_INTERACTION_TASK_MATERIALIZATION_CONTRACT,created:[],existing:[],blocked:[],graph_id:null};
  const created=[];const existing=[];const blocked=[];
  const shotIds=[...new Set(list(graph.nodes).filter(n=>text(n.type).toUpperCase()==="SHOT").map(n=>text(n.id)).filter(Boolean))];
  for(const shotId of shotIds){
    const shot=shotNode(graph,shotId);const vfx=object(shot?.requirements?.vfx_contract);if(!Object.keys(vfx).length)continue;
    const map=materialMap(assets,shotId);if(!map?.url){blocked.push({shot_id:shotId,reason:"CERTIFIED_MATERIAL_MAP_REQUIRED"});continue;}
    const vfxAssets=sealedVfx(assets,shotId);if(!vfxAssets.length){blocked.push({shot_id:shotId,reason:"SEALED_VFX_ASSET_REQUIRED"});continue;}
    for(const asset of vfxAssets){
      const effectId=text(asset.metadata?.effect_id);const effect=list(vfx.effects).find(e=>text(e.effect_id)===effectId)||list(vfx.effects)[0]||null;
      if(!effect){blocked.push({shot_id:shotId,vfx_asset_node_id:asset.id,reason:"VFX_EFFECT_REQUIRED"});continue;}
      const identity=`${shotId}:${asset.id}:${effectId}`;
      const prior=tasks.find(t=>text(t.metadata?.physical_interaction_identity)===identity||text(t.input?.physical_interaction_identity)===identity);
      if(prior){existing.push(prior);continue;}
      const task=await ProductionTaskRuntime.create({
        organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot?.scene_id||shot?.metadata?.scene_id||null,shot_id:shotId,
        type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot?.title||shotId} · Physical Interaction`,description:`Render lighting interaction and reflection/shadow evidence for sealed VFX effect ${effectId}.`,
        service_id:"creative.vfx.physical-interaction",service_code:"creative.vfx.physical-interaction",capability:"creative.vfx.physical-interaction",provider_id:"avantiqo-owned-vfx",priority:42,
        input:{shot_id:shotId,physical_interaction_identity:identity,vfx_contract:vfx,effect,vfx_asset_node_id:asset.id,material_asset_node_id:map.id,requirements:{pass_role:"PHYSICAL_INTERACTION",vfx_contract:vfx,vfx_qc_seal_hash:asset.metadata?.vfx_qc_seal_hash,material_asset_node_id:map.id},output_spec:object(shot?.generation?.output_spec||shot?.requirements?.output_spec)},
        cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},
        metadata:{workflow_kind:graph.metadata?.workflow_kind||null,execution_node_id:`interaction:${identity}`,execution_step_id:`interaction:${identity}:render`,production_step_id:"physical-interaction",production_step_index:42,quality_gate:false,release_candidate:false,shot_id:shotId,physical_interaction_identity:identity,physical_interaction_task_materialization_contract:CREATIVE_PHYSICAL_INTERACTION_TASK_MATERIALIZATION_CONTRACT,provider_prompt_persisted:false,provider_prompts_persisted:false,provider_parameters_persisted:false},
      });created.push(task);
    }
  }
  return{contract:CREATIVE_PHYSICAL_INTERACTION_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,graph_id:graph.id};
}
export const CreativePhysicalInteractionTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_PHYSICAL_INTERACTION_TASK_MATERIALIZATION_CONTRACT,ensure:ensurePhysicalInteractionTasks});
