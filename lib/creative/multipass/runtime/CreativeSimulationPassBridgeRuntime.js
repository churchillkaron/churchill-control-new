export const CREATIVE_SIMULATION_PASS_BRIDGE_CONTRACT="CREATIVE_SIMULATION_PASS_BRIDGE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}

export function reconcileSimulationPasses({graph={},asset_nodes=[]}={}){
  const assets=list(asset_nodes);
  const shotNodes=new Map(list(graph.nodes).filter(n=>text(n.type).toUpperCase()==="SHOT").map(n=>[text(n.id),n]));
  let completed=0;
  const nodes=list(graph.nodes).map((node)=>{
    if(node.metadata?.multipass_pass!==true||text(node.intent?.pass_role).toUpperCase()!=="PHYSICAL_SIMULATION") return node;
    const shotId=text(node.requirements?.shot_id||node.metadata?.shot_id||text(node.id).split(":")[1]);
    const shot=shotNodes.get(shotId);
    const expected=Math.max(1,list(shot?.requirements?.simulation_contract?.simulations).length);
    const matching=assets.filter((asset)=>
      text(asset.metadata?.shot_id)===shotId&&
      text(asset.metadata?.pass_id)==="simulation"&&
      asset.metadata?.simulation_qc_sealed===true&&
      text(asset.metadata?.simulation_qc_seal_contract)==="AVANTIQO_SIMULATION_QC_SEAL_V1"&&
      /^[a-f0-9]{64}$/i.test(text(asset.metadata?.simulation_qc_seal_hash))
    );
    if(matching.length<expected) return node;
    completed+=1;
    return {
      ...node,
      quality:{...object(node.quality),score:100,issues:[],approved:true},
      metadata:{...object(node.metadata),artifact_evidence_complete:true,execution_completed:true,simulation_qc_sealed:true,simulation_asset_node_ids:matching.map(a=>a.id),simulation_qc_seal_hashes:matching.map(a=>a.metadata.simulation_qc_seal_hash),simulation_pass_bridge_contract:CREATIVE_SIMULATION_PASS_BRIDGE_CONTRACT},
    };
  });
  return {...graph,nodes,metadata:{...object(graph.metadata),simulation_pass_bridge_contract:CREATIVE_SIMULATION_PASS_BRIDGE_CONTRACT,simulation_passes_completed:completed}};
}

export const CreativeSimulationPassBridgeRuntime=Object.freeze({contract:CREATIVE_SIMULATION_PASS_BRIDGE_CONTRACT,reconcile:reconcileSimulationPasses});
