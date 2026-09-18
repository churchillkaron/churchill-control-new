export const CREATIVE_OPTICAL_FINISH_PASS_BRIDGE_CONTRACT="CREATIVE_OPTICAL_FINISH_PASS_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
export function reconcileOpticalFinishPasses({graph={},asset_nodes=[]}={}){
  const assets=list(asset_nodes);let completed=0;
  const nodes=list(graph.nodes).map(node=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!=="OPTICAL_FINISH") return node;
    const shotId=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const optical=assets.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.pass_id)==="optical-finish"&&text(a.metadata?.optical_contract)==="CREATIVE_OPTICAL_FINISHING_V1"&&a.metadata?.optical_technical_qc_passed===true&&a.metadata?.shot_candidate_review_passed===true);
    if(!optical) return node;
    completed+=1;
    return {...node,quality:{...object(node.quality),score:Number(optical.metadata?.shot_candidate_review_score||100),issues:[],approved:true},metadata:{...object(node.metadata),artifact_evidence_complete:true,execution_completed:true,optical_asset_node_id:optical.id,optical_checksum:optical.technical?.checksum||null,optical_technical_qc_passed:true,optical_perceptual_review_passed:true,optical_finish_pass_bridge_contract:CREATIVE_OPTICAL_FINISH_PASS_BRIDGE_CONTRACT}};
  });
  return {...graph,nodes,metadata:{...object(graph.metadata),optical_finish_pass_bridge_contract:CREATIVE_OPTICAL_FINISH_PASS_BRIDGE_CONTRACT,optical_finish_passes_completed:completed}};
}
export const CreativeOpticalFinishPassBridgeRuntime=Object.freeze({contract:CREATIVE_OPTICAL_FINISH_PASS_BRIDGE_CONTRACT,reconcile:reconcileOpticalFinishPasses});
