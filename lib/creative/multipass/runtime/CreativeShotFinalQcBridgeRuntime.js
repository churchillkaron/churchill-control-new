export const CREATIVE_SHOT_FINAL_QC_BRIDGE_CONTRACT="CREATIVE_SHOT_FINAL_QC_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
export function reconcileShotFinalQc({graph={},asset_nodes=[]}={}){
  const assets=list(asset_nodes);let completed=0;
  const nodes=list(graph.nodes).map(node=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!=="PERCEPTUAL_AND_TECHNICAL_QC") return node;
    const shotId=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const optical=assets.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.pass_id)==="optical-finish"&&a.metadata?.optical_technical_qc_passed===true&&a.metadata?.shot_candidate_review_passed===true);
    if(!optical) return node;
    completed+=1;
    return {...node,quality:{...object(node.quality),score:Number(optical.metadata?.shot_candidate_review_score||100),issues:[],approved:true},metadata:{...object(node.metadata),artifact_evidence_complete:true,execution_completed:true,final_shot_asset_node_id:optical.id,shot_technical_qc_passed:true,shot_perceptual_qc_passed:true,shot_release_ready_for_edit:true,final_color_di_pending_after_edit:true,shot_final_qc_bridge_contract:CREATIVE_SHOT_FINAL_QC_BRIDGE_CONTRACT}};
  });
  return {...graph,nodes,metadata:{...object(graph.metadata),shot_final_qc_bridge_contract:CREATIVE_SHOT_FINAL_QC_BRIDGE_CONTRACT,shot_final_qc_passes_completed:completed,final_color_di_stage:"PROJECT_LEVEL_AFTER_EDIT"}};
}
export const CreativeShotFinalQcBridgeRuntime=Object.freeze({contract:CREATIVE_SHOT_FINAL_QC_BRIDGE_CONTRACT,reconcile:reconcileShotFinalQc});
