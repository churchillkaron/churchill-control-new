import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { CreativeOpticalFinishPassBridgeRuntime } from "@/lib/creative/multipass/runtime/CreativeOpticalFinishPassBridgeRuntime";
import { CreativeShotFinalQcBridgeRuntime } from "@/lib/creative/multipass/runtime/CreativeShotFinalQcBridgeRuntime";

export const CREATIVE_SHOT_EDIT_RELEASE_CONTRACT="CREATIVE_SHOT_EDIT_RELEASE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function releasedOptical(nodes=[]){return nodes.filter(n=>text(n.metadata?.pass_id)==="optical-finish"&&n.metadata?.optical_technical_qc_passed===true&&n.metadata?.shot_candidate_review_passed===true&&text(n.metadata?.shot_id));}
export async function ensureShotEditRelease({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("SHOT_EDIT_RELEASE_SCOPE_REQUIRED");
  const [graphs,nodes,shots]=await Promise.all([ProductionGraphRepository.listByProject({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),ShotRuntime.list({organization_id,creative_project_id})]);
  const optical=releasedOptical(nodes);const released=[];
  let graph=graphs[0]||null;
  if(graph&&optical.length){
    graph=CreativeOpticalFinishPassBridgeRuntime.reconcile({graph,asset_nodes:nodes});
    graph=CreativeShotFinalQcBridgeRuntime.reconcile({graph,asset_nodes:nodes});
    await ProductionGraphRepository.update(graph.id,{nodes:graph.nodes,edges:graph.edges,metadata:graph.metadata});
  }
  for(const asset of optical){
    const shot=shots.find(s=>text(s.id)===text(asset.metadata?.shot_id));if(!shot)continue;
    if(shot.metadata?.shot_release_ready_for_edit===true&&text(shot.metadata?.final_shot_asset_node_id)===text(asset.id)){released.push(shot);continue;}
    const updated=await ShotRuntime.update(shot.id,{metadata:{...(shot.metadata||{}),shot_release_contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,shot_release_ready_for_edit:true,shot_technical_qc_passed:true,shot_perceptual_qc_passed:true,final_shot_asset_node_id:asset.id,final_shot_checksum:asset.technical?.checksum||null,final_color_di_pending_after_edit:true,final_color_di_stage:"PROJECT_LEVEL_AFTER_EDIT",released_to_edit_at:new Date().toISOString()}});released.push(updated);
  }
  return{contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,released,release_count:released.length,graph_id:graph?.id||null,final_color_di_stage:"PROJECT_LEVEL_AFTER_EDIT"};
}
export const CreativeShotEditReleaseRuntime=Object.freeze({contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,ensure:ensureShotEditRelease});
