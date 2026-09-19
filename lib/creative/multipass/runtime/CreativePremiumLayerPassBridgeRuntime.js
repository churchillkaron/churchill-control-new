export const CREATIVE_PREMIUM_LAYER_PASS_BRIDGE_CONTRACT = "CREATIVE_PREMIUM_LAYER_PASS_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}

function reconcileRole(graph={},assets=[],role,passId){
  let completed=0;
  const nodes=list(graph.nodes).map(node=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!==role) return node;
    const id=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const asset=assets.find(a=>
      text(a.metadata?.shot_id)===id&&
      text(a.metadata?.pass_id)===passId&&
      a.metadata?.vfx_qc_sealed===true&&
      text(a.metadata?.vfx_qc_seal_contract)==="AVANTIQO_VFX_QC_SEAL_V1"&&
      /^[a-f0-9]{64}$/i.test(text(a.metadata?.vfx_qc_seal_hash))
    );
    if(!asset) return node;
    completed+=1;
    return {
      ...node,
      quality:{...object(node.quality),score:Number(asset.metadata?.shot_candidate_review_score||100),issues:[],approved:true},
      metadata:{
        ...object(node.metadata),
        artifact_evidence_complete:true,
        execution_completed:true,
        premium_layer_asset_node_id:asset.id,
        premium_layer_checksum:asset.technical?.checksum||null,
        vfx_qc_sealed:true,
        vfx_qc_seal_hash:asset.metadata?.vfx_qc_seal_hash,
        premium_layer_pass_bridge_contract:CREATIVE_PREMIUM_LAYER_PASS_BRIDGE_CONTRACT,
      },
    };
  });
  return {...graph,nodes,completed};
}
export function reconcilePremiumLayerPasses({graph={},asset_nodes=[]}={}){
  const atmosphere=reconcileRole(graph,asset_nodes,"ATMOSPHERE","atmosphere");
  const threat=reconcileRole(atmosphere,asset_nodes,"THREAT_HERO_LAYER","threat-hero-layer");
  return {
    ...threat,
    metadata:{
      ...object(threat.metadata),
      premium_layer_pass_bridge_contract:CREATIVE_PREMIUM_LAYER_PASS_BRIDGE_CONTRACT,
      premium_layer_passes_completed:Number(atmosphere.completed||0)+Number(threat.completed||0),
    },
  };
}
export const CreativePremiumLayerPassBridgeRuntime=Object.freeze({
  contract:CREATIVE_PREMIUM_LAYER_PASS_BRIDGE_CONTRACT,
  reconcile:reconcilePremiumLayerPasses,
});
