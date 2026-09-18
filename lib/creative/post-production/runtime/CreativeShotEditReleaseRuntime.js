import * as ProductionGraphRepository from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { CreativeOpticalFinishPassBridgeRuntime } from "@/lib/creative/multipass/runtime/CreativeOpticalFinishPassBridgeRuntime";
import { CreativeShotFinalQcBridgeRuntime } from "@/lib/creative/multipass/runtime/CreativeShotFinalQcBridgeRuntime";

export const CREATIVE_SHOT_EDIT_RELEASE_CONTRACT="CREATIVE_SHOT_EDIT_RELEASE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(!v||typeof v!=="object") return v;
  return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
}
function same(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function releasedOptical(nodes=[]){return nodes.filter(n=>text(n.metadata?.pass_id)==="optical-finish"&&n.metadata?.optical_technical_qc_passed===true&&n.metadata?.shot_candidate_review_passed===true&&text(n.metadata?.shot_id));}
export async function ensureShotEditRelease({organization_id,creative_project_id}={}){
  if(!organization_id||!creative_project_id)throw new Error("SHOT_EDIT_RELEASE_SCOPE_REQUIRED");
  const [graphs,nodes,shots]=await Promise.all([ProductionGraphRepository.listByProject({organization_id,creative_project_id}),CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),ShotRuntime.list({organization_id,creative_project_id})]);
  const optical=releasedOptical(nodes);const released=[];const existing=[];const updated_asset_node_ids=[];
  let graph=graphs[0]||null;
  let graph_changed=false;
  if(graph&&optical.length){
    const before={nodes:graph.nodes,edges:graph.edges,metadata:graph.metadata};
    let reconciled=CreativeOpticalFinishPassBridgeRuntime.reconcile({graph,asset_nodes:nodes});
    reconciled=CreativeShotFinalQcBridgeRuntime.reconcile({graph:reconciled,asset_nodes:nodes});
    const after={nodes:reconciled.nodes,edges:reconciled.edges,metadata:reconciled.metadata};
    graph_changed=!same(before,after);
    graph=reconciled;
    if(graph_changed){
      await ProductionGraphRepository.update(graph.id,{nodes:graph.nodes,edges:graph.edges,metadata:graph.metadata});
    }
  }
  for(const asset of optical){
    const shot=shots.find(s=>text(s.id)===text(asset.metadata?.shot_id));if(!shot)continue;
    const sameShotVideos=nodes.filter((node)=>
      text(node.metadata?.shot_id)===text(shot.id) &&
      text(node.type).toUpperCase()==="VIDEO"
    );
    for(const candidate of sameShotVideos){
      const canonical=candidate.id===asset.id;
      const desired={
        final_edit_source:canonical,
        include_in_master:canonical,
        selected_for_master:canonical,
        superseded_by_final_edit_asset_node_id:canonical?null:asset.id,
        shot_release_contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,
      };
      const current={
        final_edit_source:candidate.metadata?.final_edit_source===true,
        include_in_master:candidate.metadata?.include_in_master===true,
        selected_for_master:candidate.metadata?.selected_for_master===true,
        superseded_by_final_edit_asset_node_id:candidate.metadata?.superseded_by_final_edit_asset_node_id??null,
        shot_release_contract:candidate.metadata?.shot_release_contract??null,
      };
      if(!same(current,desired)){
        await AssetGraphRepository.update(candidate.id,{
          metadata:{...(candidate.metadata||{}),...desired},
        });
        updated_asset_node_ids.push(candidate.id);
      }
    }
    const shotAlreadyReleased=
      shot.metadata?.shot_release_ready_for_edit===true&&
      shot.metadata?.shot_technical_qc_passed===true&&
      shot.metadata?.shot_perceptual_qc_passed===true&&
      text(shot.metadata?.final_shot_asset_node_id)===text(asset.id)&&
      text(shot.metadata?.final_shot_checksum)===text(asset.technical?.checksum||"")&&
      shot.metadata?.final_color_di_pending_after_edit===true&&
      text(shot.metadata?.final_color_di_stage)==="PROJECT_LEVEL_AFTER_EDIT"&&
      text(shot.metadata?.shot_release_contract)===CREATIVE_SHOT_EDIT_RELEASE_CONTRACT;
    if(shotAlreadyReleased){existing.push(shot);continue;}
    const updated=await ShotRuntime.update(shot.id,{metadata:{...(shot.metadata||{}),shot_release_contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,shot_release_ready_for_edit:true,shot_technical_qc_passed:true,shot_perceptual_qc_passed:true,final_shot_asset_node_id:asset.id,final_shot_checksum:asset.technical?.checksum||null,final_color_di_pending_after_edit:true,final_color_di_stage:"PROJECT_LEVEL_AFTER_EDIT",released_to_edit_at:new Date().toISOString()}});released.push(updated);
  }
  return{contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,released,existing,release_count:released.length,existing_count:existing.length,updated_asset_node_ids,asset_update_count:updated_asset_node_ids.length,graph_id:graph?.id||null,graph_changed,changed:released.length>0||updated_asset_node_ids.length>0||graph_changed,final_color_di_stage:"PROJECT_LEVEL_AFTER_EDIT"};
}
export const CreativeShotEditReleaseRuntime=Object.freeze({contract:CREATIVE_SHOT_EDIT_RELEASE_CONTRACT,ensure:ensureShotEditRelease});
