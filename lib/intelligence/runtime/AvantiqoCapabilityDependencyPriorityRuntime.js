export const AVANTIQO_CAPABILITY_DEPENDENCY_PRIORITY_CONTRACT="AVANTIQO_CAPABILITY_DEPENDENCY_PRIORITY_V1";
function text(v,l=12000){return String(v??"").trim().slice(0,l)}function list(v){return Array.isArray(v)?v:[]}function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
export function deriveAvantiqoCapabilityDependencyPriority({capabilities=[],experienceRows=[]}={}){
  const keys=new Set(list(capabilities).map(item=>text(item?.key,300)).filter(Boolean));
  const stats=new Map([...keys].map(key=>[key,{capability_key:key,verification_dependent_count:0,mission_upstream_count:0,mission_downstream_count:0,observed_dependency_occurrence_count:0,unique_upstream_capabilities:new Set(),unique_downstream_capabilities:new Set()}]));
  const seenVerification=new Set();
  for(const capability of list(capabilities)){
    const source=text(capability?.key,300),target=text(capability?.operator_verification?.capability_key,300);if(!source||!target||source===target||!stats.has(target))continue;
    const edge=`${source}|${target}`;if(seenVerification.has(edge))continue;seenVerification.add(edge);stats.get(target).verification_dependent_count+=1;stats.get(target).unique_upstream_capabilities.add(source);if(stats.has(source))stats.get(source).unique_downstream_capabilities.add(target);
  }
  for(const row of list(experienceRows)){
    const metadata=object(row?.metadata);if(metadata.structural_only!==true)continue;
    for(const edge of list(metadata.capability_dependency_edges)){
      const upstream=text(list(edge)[0],300),downstream=text(list(edge)[1],300);if(!upstream||!downstream||upstream===downstream)continue;
      if(stats.has(upstream)){const item=stats.get(upstream);item.mission_upstream_count+=1;item.observed_dependency_occurrence_count+=1;item.unique_downstream_capabilities.add(downstream)}
      if(stats.has(downstream)){const item=stats.get(downstream);item.mission_downstream_count+=1;item.observed_dependency_occurrence_count+=1;item.unique_upstream_capabilities.add(upstream)}
    }
  }
  return [...stats.values()].map(item=>{
    const uniqueDependents=item.verification_dependent_count+item.unique_downstream_capabilities.size;
    const occurrence=item.observed_dependency_occurrence_count;
    const centrality=Math.min(1,(Math.log1p(uniqueDependents)*0.65+Math.log1p(occurrence)*0.35)/Math.log(12));
    return {capability_key:item.capability_key,dependency_centrality_score:Number(centrality.toFixed(4)),verification_dependent_count:item.verification_dependent_count,mission_upstream_count:item.mission_upstream_count,mission_downstream_count:item.mission_downstream_count,observed_dependency_occurrence_count:occurrence,unique_upstream_count:item.unique_upstream_capabilities.size,unique_downstream_count:item.unique_downstream_capabilities.size,structural_only:true,authority_effect:"NONE"};
  }).sort((a,b)=>b.dependency_centrality_score-a.dependency_centrality_score||a.capability_key.localeCompare(b.capability_key));
}
export const AvantiqoCapabilityDependencyPriorityRuntime=Object.freeze({contract:AVANTIQO_CAPABILITY_DEPENDENCY_PRIORITY_CONTRACT,derive:deriveAvantiqoCapabilityDependencyPriority});
