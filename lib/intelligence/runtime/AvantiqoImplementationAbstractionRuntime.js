export const AVANTIQO_IMPLEMENTATION_ABSTRACTION_CONTRACT = "AVANTIQO_IMPLEMENTATION_ABSTRACTION_V1";
const text=(v,l=800)=>String(v??"").trim().slice(0,l);
const list=v=>Array.isArray(v)?v:[];
const unique=v=>[...new Set(list(v).map(x=>text(x,500)).filter(Boolean))];
function tierFor(kind){return kind==="business_concept"?"A":kind==="capability"||kind==="workspace"?"B":"C"}
export function buildImplementationAbstractionRecord({source_path=null,symbols=[],runtime=null,capability_key=null,workspace_key=null,domain=null,business_concepts=[]}={}){
 const path=text(source_path,1200); const symbolList=unique(symbols).slice(0,200); const concepts=unique(business_concepts).slice(0,40);
 const levels=[];
 if(path||symbolList.length) levels.push({kind:"implementation_detail",tier:"C",source_path:path||null,symbol_count:symbolList.length,retrieval_only:true});
 if(runtime) levels.push({kind:"runtime",tier:"C",id:text(runtime,400),retrieval_only:true});
 if(capability_key) levels.push({kind:"capability",tier:"B",id:text(capability_key,400),retrieval_only:false});
 if(workspace_key) levels.push({kind:"workspace",tier:"B",id:text(workspace_key,400),retrieval_only:false});
 if(domain) levels.push({kind:"domain",tier:"B",id:text(domain,200),retrieval_only:false});
 for(const concept of concepts) levels.push({kind:"business_concept",tier:"A",id:concept,retrieval_only:false});
 return {contract:AVANTIQO_IMPLEMENTATION_ABSTRACTION_CONTRACT,source_path:path||null,symbols:symbolList,levels,deep_learning_target_kinds:["business_concept","capability","workspace","domain"],retrieval_only_kinds:["implementation_detail","runtime"],lowest_required_tier:levels.reduce((best,x)=>tierFor(x.kind)<best?tierFor(x.kind):best,"C"),policy:{raw_code_is_not_business_knowledge:true,implementation_details_are_retrieval_first:true,product_truth_requires_canonical_registry_or_capability_evidence:true,code_relationship_never_grants_execution_authority:true,repair_requires_existing_governance:true,authority_effect:"NONE"},authority_effect:"NONE"};
}
export function summarizeImplementationAbstraction(records=[]){const rows=list(records);const counts={A:0,B:0,C:0};let symbols=0;for(const r of rows){symbols+=list(r?.symbols).length;for(const l of list(r?.levels))counts[l.tier]=(counts[l.tier]||0)+1;}return{contract:AVANTIQO_IMPLEMENTATION_ABSTRACTION_CONTRACT,record_count:rows.length,symbol_count:symbols,level_counts:counts,raw_symbol_mastery_required:false,retrieval_first_implementation:true,authority_effect:"NONE"};}
export const AvantiqoImplementationAbstractionRuntime=Object.freeze({contract:AVANTIQO_IMPLEMENTATION_ABSTRACTION_CONTRACT,build:buildImplementationAbstractionRecord,summarize:summarizeImplementationAbstraction});
