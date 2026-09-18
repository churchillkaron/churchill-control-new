export const CREATIVE_VFX_INTEGRATION_PASS_BRIDGE_CONTRACT="CREATIVE_VFX_INTEGRATION_PASS_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
export function reconcileVfxIntegrationPasses({graph={},asset_nodes=[]}={}){
  const assets=list(asset_nodes); let completed=0;
  const nodes=list(graph.nodes).map(node=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!=="VFX_INTEGRATION") return node;
    const shotId=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const matching=assets.filter(a=>text(a.metadata?.shot_id)===shotId&&text(a.metadata?.pass_id)==="vfx-integration"&&a.metadata?.vfx_qc_sealed===true&&text(a.metadata?.vfx_qc_seal_contract)==="AVANTIQO_VFX_QC_SEAL_V1"&&/^[a-f0-9]{64}$/i.test(text(a.metadata?.vfx_qc_seal_hash)));
    if(!matching.length) return node;
    completed+=1;
    return {...node,quality:{...object(node.quality),score:100,issues:[],approved:true},metadata:{...object(node.metadata),artifact_evidence_complete:true,execution_completed:true,vfx_qc_sealed:true,vfx_asset_node_ids:matching.map(a=>a.id),vfx_qc_seal_hashes:matching.map(a=>a.metadata.vfx_qc_seal_hash),vfx_integration_pass_bridge_contract:CREATIVE_VFX_INTEGRATION_PASS_BRIDGE_CONTRACT}};
  });
  return {...graph,nodes,metadata:{...object(graph.metadata),vfx_integration_pass_bridge_contract:CREATIVE_VFX_INTEGRATION_PASS_BRIDGE_CONTRACT,vfx_integration_passes_completed:completed}};
}
export const CreativeVfxIntegrationPassBridgeRuntime=Object.freeze({contract:CREATIVE_VFX_INTEGRATION_PASS_BRIDGE_CONTRACT,reconcile:reconcileVfxIntegrationPasses});
