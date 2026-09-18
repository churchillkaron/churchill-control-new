export const CREATIVE_COMPOSITE_PASS_BRIDGE_CONTRACT="CREATIVE_COMPOSITE_PASS_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
export function reconcileCompositePasses({graph={},asset_nodes=[]}={}){
  const assets=list(asset_nodes);let completed=0;
  const nodes=list(graph.nodes).map(node=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!=="FINAL_COMPOSITE") return node;
    const shotId=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const composite=assets.find(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.compositing_render_contract)==="AVANTIQO_LAYERED_COMPOSITING_RENDER_V1"&&a.metadata?.compositing_source_gate_passed===true&&a.metadata?.shot_candidate_review_passed===true&&(a.metadata?.selected_for_master===true||a.metadata?.shot_candidate_selected===true));
    if(!composite) return node;
    completed+=1;
    return {...node,quality:{...object(node.quality),score:Number(composite.metadata?.shot_candidate_review_score||100),issues:[],approved:true},metadata:{...object(node.metadata),artifact_evidence_complete:true,execution_completed:true,composite_asset_node_id:composite.id,composite_checksum:composite.technical?.checksum||null,composite_pass_bridge_contract:CREATIVE_COMPOSITE_PASS_BRIDGE_CONTRACT}};
  });
  return {...graph,nodes,metadata:{...object(graph.metadata),composite_pass_bridge_contract:CREATIVE_COMPOSITE_PASS_BRIDGE_CONTRACT,composite_passes_completed:completed}};
}
export const CreativeCompositePassBridgeRuntime=Object.freeze({contract:CREATIVE_COMPOSITE_PASS_BRIDGE_CONTRACT,reconcile:reconcileCompositePasses});
