export const CODE_AI_MULTI_REPOSITORY_MISSION_CONTRACT = "AVANTIQO_CODE_AI_MULTI_REPOSITORY_MISSION_V1";
function text(v,n=1000){return String(v??"").trim().slice(0,n)}
function list(v){return Array.isArray(v)?v:[]}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}

export function coordinateCodeAIMultiRepositoryMission({ repositories = [], dependencies = [] } = {}) {
  const repos=list(repositories).map((entry,index)=>{
    const src=object(entry); const id=text(src.id||src.repository_url||`repo-${index+1}`,500);
    return {id,repository_url:text(src.repository_url,1000),base_commit:text(src.base_commit,160),verified:src.verified===true,status:text(src.status,80)||"PENDING"};
  });
  if(repos.length<2) throw new Error("CODE_AI_MULTI_REPO_REQUIRES_MULTIPLE_REPOSITORIES");
  if(repos.some(r=>!r.repository_url||!r.base_commit)) throw new Error("CODE_AI_MULTI_REPO_HEAD_EVIDENCE_REQUIRED");
  if(new Set(repos.map(r=>r.repository_url.toLowerCase())).size!==repos.length) throw new Error("CODE_AI_MULTI_REPO_DUPLICATE_REPOSITORY");
  const ids=new Set(repos.map(r=>r.id)); const edges=list(dependencies).map(e=>({from:text(e?.from,500),to:text(e?.to,500)}));
  if(edges.some(e=>!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)) throw new Error("CODE_AI_MULTI_REPO_DEPENDENCY_INVALID");
  const incoming=new Map(repos.map(r=>[r.id,0])); const outgoing=new Map(repos.map(r=>[r.id,[]]));
  for(const e of edges){incoming.set(e.to,incoming.get(e.to)+1);outgoing.get(e.from).push(e.to)}
  const queue=[...repos.map(r=>r.id).filter(id=>incoming.get(id)===0)].sort(); const order=[];
  while(queue.length){const id=queue.shift();order.push(id);for(const next of outgoing.get(id)){incoming.set(next,incoming.get(next)-1);if(incoming.get(next)===0){queue.push(next);queue.sort()}}}
  if(order.length!==repos.length) throw new Error("CODE_AI_MULTI_REPO_DEPENDENCY_CYCLE");
  return {contract:CODE_AI_MULTI_REPOSITORY_MISSION_CONTRACT,repositories:repos,dependency_order:order,independent_heads_required:true,independent_verification_required:true,all_verified:repos.every(r=>r.verified),commit_authority:false,merge_authority:false,deploy_authority:false};
}
export default Object.freeze({contract:CODE_AI_MULTI_REPOSITORY_MISSION_CONTRACT,coordinate:coordinateCodeAIMultiRepositoryMission});
