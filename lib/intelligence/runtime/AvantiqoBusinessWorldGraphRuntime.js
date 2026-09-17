export const AVANTIQO_BUSINESS_WORLD_GRAPH_CONTRACT = "AVANTIQO_BUSINESS_WORLD_GRAPH_V1";

const CHAINS = Object.freeze([
  ["customer","customer_invoice","accounts_receivable","revenue","payment","bank","reconciliation","vat"],
  ["supplier_invoice","inventory","recipe","dish_cost","menu_margin"],
  ["booking","guest","room","housekeeping","payment","checkout"],
  ["employee","roster","attendance","payroll","labor_cost"],
  ["creative_asset","campaign","channel","lead","customer","revenue_attribution"],
  ["project","task","dependency","resource","project_cost","customer_invoice","payment"],
]);

const CONCEPT_DOMAIN = Object.freeze({
  customer:"commercial",customer_invoice:"finance",accounts_receivable:"finance",revenue:"finance",payment:"finance",bank:"finance",reconciliation:"finance",vat:"finance",
  supplier_invoice:"finance",inventory:"supply-chain",recipe:"supply-chain",dish_cost:"supply-chain",menu_margin:"commercial",
  booking:"operations",guest:"commercial",room:"operations",housekeeping:"operations",checkout:"operations",
  employee:"people",roster:"people",attendance:"people",payroll:"people",labor_cost:"finance",
  creative_asset:"creative",campaign:"commercial",channel:"commercial",lead:"commercial",revenue_attribution:"analytics",
  project:"projects",task:"projects",dependency:"projects",resource:"projects",project_cost:"finance",
});

function text(v,l=500){return String(v??"").trim().toLowerCase().slice(0,l)}
function uniqueEdges(edges){const seen=new Set();return edges.filter(e=>{const k=`${e.from}|${e.relation}|${e.to}`;if(seen.has(k))return false;seen.add(k);return true})}
function conceptNode(id){return `concept:${id}`}
function capabilityMatchesConcept(capability,concept){const hay=`${text(capability?.key,400)} ${text(capability?.description,1200)} ${text(capability?.capability,200)} ${text(capability?.action,200)}`;const tokens=concept.replaceAll("_"," ").split(/\s+/).filter(Boolean);return tokens.every(t=>hay.includes(t)) || hay.includes(concept.replaceAll("_","-"))}

export function buildAvantiqoBusinessWorldGraph({capabilities=[]}={}){
  const edges=[];
  for(const c of Array.isArray(capabilities)?capabilities:[]){
    const key=text(c?.key,400); if(!key) continue;
    if(c.mode==="read") edges.push({from:`domain:${c.domain}`,relation:"OBSERVED_BY",to:`capability:${key}`,source:"CAPABILITY_CATALOG"});
    const verifier=text(c?.operator_verification?.capability_key,400);
    if(verifier) edges.push({from:`capability:${key}`,relation:"VERIFIED_BY",to:`capability:${verifier}`,source:"CAPABILITY_CATALOG"});
    if(["write","draft","approve"].includes(c.mode)) edges.push({from:`capability:${key}`,relation:"MAY_CHANGE",to:`domain:${c.domain}`,source:"CAPABILITY_CATALOG"});
    for(const concept of Object.keys(CONCEPT_DOMAIN)){
      if(!capabilityMatchesConcept(c,concept)) continue;
      edges.push({from:`capability:${key}`,relation:c.mode==="read"?"READS":"RELATES_TO",to:conceptNode(concept),source:"SEMANTIC_BINDING"});
    }
  }
  for(const [concept,domain] of Object.entries(CONCEPT_DOMAIN)) edges.push({from:conceptNode(concept),relation:"RELATES_TO",to:`domain:${domain}`,source:"BUSINESS_MODEL"});
  for(const chain of CHAINS){
    for(let i=0;i<chain.length-1;i++){
      const relation=i===0?"CAN_FOLLOW":"PRODUCES";
      edges.push({from:conceptNode(chain[i]),relation,to:conceptNode(chain[i+1]),source:"BUSINESS_MODEL"});
    }
  }
  const dedup=uniqueEdges(edges);
  const nodes=[...new Set(dedup.flatMap(e=>[e.from,e.to]))].sort();
  return {contract:AVANTIQO_BUSINESS_WORLD_GRAPH_CONTRACT,node_count:nodes.length,edge_count:dedup.length,nodes,edges:dedup,chains:CHAINS.map(x=>[...x]),relations:["OBSERVED_BY","VERIFIED_BY","MAY_CHANGE","READS","RELATES_TO","PRODUCES","CAN_FOLLOW"],graph_edges_never_grant_authority:true,business_relations_are_navigation_and_reasoning_structure_not_causal_proof:true,authority_effect:"NONE"};
}

export function businessConceptPath({from,to,capabilities=[]}={}){
  const graph=buildAvantiqoBusinessWorldGraph({capabilities});
  const start=conceptNode(text(from,200)),goal=conceptNode(text(to,200));
  const q=[[start]],seen=new Set([start]);
  while(q.length){const path=q.shift(),last=path.at(-1);if(last===goal)return {found:true,path,authority_effect:"NONE"};for(const e of graph.edges){if(e.from!==last||seen.has(e.to))continue;seen.add(e.to);q.push([...path,e.to])}}
  return {found:false,path:[],authority_effect:"NONE"};
}

export const AvantiqoBusinessWorldGraphRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_WORLD_GRAPH_CONTRACT,build:buildAvantiqoBusinessWorldGraph,path:businessConceptPath});
