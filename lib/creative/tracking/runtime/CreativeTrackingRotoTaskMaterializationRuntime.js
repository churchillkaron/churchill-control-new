import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

export const CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_CONTRACT="CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function shotNodes(graph={}){return list(graph.nodes).filter(n=>text(n.type).toUpperCase()==="SHOT");}
function sameShotArtifact(a,shotId,kind){return text(a.metadata?.shot_id)===text(shotId)&&text(a.metadata?.artifact_kind).toUpperCase()===kind&&a.metadata?.reconstruction_qc_passed===true;}
function sourceAsset(assets=[],shot={}){const id=text(shot.requirements?.primary_source_asset_id||shot.generation?.primary_source_asset_id||shot.metadata?.primary_source_asset_id);return assets.find(a=>text(a.id)===id)||null;}
function motionEvents(shot={}){return list(object(shot.requirements?.cinematic_motion_design).events);}
function needsTracked3d(shot={}){return motionEvents(shot).some(e=>text(e.integration_mode||"SOURCE_FREE_CGI").toUpperCase()==="SOURCE_WORLD_INTEGRATED"&&text(e.integration_fidelity||"TRACKED_WORLD_3D").toUpperCase()==="TRACKED_WORLD_3D");}
function needsRoto(shot={}){return motionEvents(shot).some(e=>e.foreground_holdout_required===true||e.occlusion_matte_required===true);}
export async function ensureTrackingRotoTasks({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("TRACKING_ROTO_TASK_SCOPE_REQUIRED");
  const [graphs,tasks,assets]=await Promise.all([ProductionGraphRepository.listByProject({organization_id,creative_project_id}),ProductionTaskRuntime.list({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id})]);
  const graph=graphs[0]||null;if(!graph)return{contract:CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_CONTRACT,created:[],existing:[],blocked:[],graph_id:null};
  const created=[];const existing=[];const blocked=[];
  for(const shot of shotNodes(graph)){
    const shotId=text(shot.id);const source=sourceAsset(assets,shot);const recon=object(shot.requirements?.scene_reconstruction_contract);const sourceKind=text(recon.source_media_kind||shot.requirements?.source_media_kind).toUpperCase();
    if(needsTracked3d(shot)){
      const artifact=assets.find(a=>sameShotArtifact(a,shotId,"MATCHMOVE_3D")&&a.metadata?.matchmove_world_space_cgi_allowed===true)||null;
      if(!artifact){
        const prior=tasks.find(t=>text(t.capability||t.service_code)==="creative.matchmove.solve"&&text(t.shot_id||t.input?.shot_id)===shotId)||null;
        if(prior)existing.push(prior);
        else if(sourceKind!=="VIDEO")blocked.push({shot_id:shotId,reason:"TRACKED_3D_MATCHMOVE_VIDEO_SOURCE_REQUIRED"});
        else if(!source?.url||!text(source.url).startsWith("storage://"))blocked.push({shot_id:shotId,reason:"TRACKED_3D_MATCHMOVE_STORAGE_SOURCE_REQUIRED"});
        else{
          const task=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot.scene_id||shot.metadata?.scene_id||null,shot_id:shotId,type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot.title||shotId} · 3D Matchmove`,description:"Solve governed 3D camera motion, lens and parallax evidence before source-world CGI.",service_id:"creative.matchmove.solve",service_code:"creative.matchmove.solve",capability:"creative.matchmove.solve",provider_id:"avantiqo-owned-tracking",priority:31,input:{shot_id:shotId,source_asset_node_id:source.id,source_reference:source.url,reconstruction_contract_hash:recon.contract_hash||null,requirements:{pass_role:"MATCHMOVE_3D",world_space_cgi_authority_required:true,reconstruction_contract_hash:recon.contract_hash||null}},cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},metadata:{workflow_kind:graph.metadata?.workflow_kind||null,production_step_id:"matchmove-3d",production_step_index:31,shot_id:shotId,tracking_roto_materialization_contract:CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_CONTRACT,provider_calls_performed:false}});created.push(task);
        }
      }
    }
    if(needsRoto(shot)){
      const rotoArtifact=assets.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.artifact_kind).toUpperCase()==="ROTO_MATTE"&&a.metadata?.roto_qc_sealed===true)||null;
      if(!rotoArtifact){
        const prior=tasks.find(t=>text(t.capability||t.service_code)==="creative.roto.propagate"&&text(t.shot_id||t.input?.shot_id)===shotId)||null;
        if(prior)existing.push(prior);
        else{
          const seed=assets.find(a=>sameShotArtifact(a,shotId,"OCCLUSION_MASK_BASE"))||assets.find(a=>sameShotArtifact(a,shotId,"OCCLUSION_MAP"))||null;
          const matchmove=assets.find(a=>sameShotArtifact(a,shotId,"MATCHMOVE_3D"))||null;
          if(!source?.url||!text(source.url).startsWith("storage://"))blocked.push({shot_id:shotId,reason:"ROTO_STORAGE_SOURCE_REQUIRED"});
          else if(!seed?.url||!text(seed.url).startsWith("storage://"))blocked.push({shot_id:shotId,reason:"ROTO_SEED_MATTE_REQUIRED"});
          else{
            const task=await ProductionTaskRuntime.create({organization_id,creative_project_id,production_graph_id:graph.id,scene_id:shot.scene_id||shot.metadata?.scene_id||null,shot_id:shotId,type:"RENDER_PRODUCTION",status:"WAITING",title:`${shot.title||shotId} · Temporal Roto`,description:"Propagate and refine the governed foreground/occlusion matte across the full shot.",service_id:"creative.roto.propagate",service_code:"creative.roto.propagate",capability:"creative.roto.propagate",provider_id:"avantiqo-owned-roto",priority:33,depends_on:matchmove?.production_task_id?[matchmove.production_task_id]:[],input:{shot_id:shotId,source_asset_node_id:source.id,source_reference:source.url,seed_matte_asset_node_id:seed.id,seed_matte_reference:seed.url,tracking_asset_node_id:matchmove?.id||null,requirements:{pass_role:"ROTO_MATTE",temporal_propagation_required:true,edge_refinement_required:true,motion_blur_matte_required:true}},cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},metadata:{workflow_kind:graph.metadata?.workflow_kind||null,production_step_id:"roto-matte",production_step_index:33,shot_id:shotId,tracking_roto_materialization_contract:CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_CONTRACT,provider_calls_performed:false}});created.push(task);
          }
        }
      }
    }
  }
  return{contract:CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_CONTRACT,created,existing,blocked,graph_id:graph.id,total:created.length+existing.length};
}
export const CreativeTrackingRotoTaskMaterializationRuntime=Object.freeze({contract:CREATIVE_TRACKING_ROTO_TASK_MATERIALIZATION_CONTRACT,ensure:ensureTrackingRotoTasks});
