export const CREATIVE_PHYSICAL_INTERACTION_PASS_BRIDGE_CONTRACT="CREATIVE_PHYSICAL_INTERACTION_PASS_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}

function reconcileRole(graph={},asset_nodes=[],role,passId){
  const assets=list(asset_nodes);let completed=0;
  const nodes=list(graph.nodes).map(node=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!==role) return node;
    const shotId=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const matching=assets.filter(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.pass_id)===passId&&a.metadata?.vfx_qc_sealed===true&&text(a.metadata?.vfx_qc_seal_contract)==="AVANTIQO_VFX_QC_SEAL_V1"&&/^[a-f0-9]{64}$/i.test(text(a.metadata?.vfx_qc_seal_hash)));
    if(!matching.length) return node;
    completed+=1;
    return {...node,quality:{...object(node.quality),score:100,issues:[],approved:true},metadata:{...object(node.metadata),artifact_evidence_complete:true,execution_completed:true,vfx_qc_sealed:true,interaction_asset_node_ids:matching.map(a=>a.id),vfx_qc_seal_hashes:matching.map(a=>a.metadata.vfx_qc_seal_hash),physical_interaction_pass_bridge_contract:CREATIVE_PHYSICAL_INTERACTION_PASS_BRIDGE_CONTRACT}};
  });
  return {...graph,nodes,completed};
}

export function reconcilePhysicalInteractionPasses({graph={},asset_nodes=[]}={}){
  const lighting=reconcileRole(graph,asset_nodes,"LIGHTING_INTERACTION","lighting-interaction");
  const reflection=reconcileRole(lighting,asset_nodes,"REFLECTION_SHADOW","reflection-shadow");
  return {...reflection,metadata:{...object(reflection.metadata),physical_interaction_pass_bridge_contract:CREATIVE_PHYSICAL_INTERACTION_PASS_BRIDGE_CONTRACT,physical_interaction_passes_completed:Number(lighting.completed||0)+Number(reflection.completed||0)}};
}
export const CreativePhysicalInteractionPassBridgeRuntime=Object.freeze({contract:CREATIVE_PHYSICAL_INTERACTION_PASS_BRIDGE_CONTRACT,reconcile:reconcilePhysicalInteractionPasses});
