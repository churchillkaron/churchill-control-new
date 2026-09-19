import { buildBusinessComparisonEvidenceBundle } from "./AvantiqoBusinessComparisonEvidenceBundleRuntime.js";

export const AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT = "AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_V1";

const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=300)=>String(v??"").trim().slice(0,n);

export async function executeBusinessInternalEvidenceBatch({plan,comparison_tool=null,required_driver_ids=[]}={}){
  if(!plan?.read_pairs?.length){
    return {contract:AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT,status:"NO_SAFE_COMPARISONS",comparison_results:[],evidence_bundle:null,executed_capability_keys:[],failed_capability_keys:[],read_only:true,authority_effect:"NONE"};
  }
  if(!comparison_tool||typeof comparison_tool.execute!=="function"){
    return {contract:AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT,status:"COMPARISON_TOOL_UNAVAILABLE",comparison_results:[],evidence_bundle:null,executed_capability_keys:[],failed_capability_keys:plan.read_pairs.map(r=>r.capability_key),read_only:true,authority_effect:"NONE"};
  }
  const comparison_results=[];
  const executed=[];
  const failed=[];
  for(const pair of plan.read_pairs){
    const key=text(pair?.capability_key);
    if(!key) continue;
    try{
      const result=await comparison_tool.execute({capability_key:key,payload:{}});
      comparison_results.push(result);
      executed.push(key);
      if(result?.status!=="OBSERVATIONS_READY") failed.push(key);
    }catch(error){
      comparison_results.push({contract:AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT,status:"EVIDENCE_GAP",capability_key:key,normalized:{reason:"COMPARISON_EXECUTION_FAILED"},error_code:text(error?.code||error?.name||"ERROR",80),read_only:true,authority_effect:"NONE"});
      executed.push(key);
      failed.push(key);
    }
  }
  const evidence_bundle=buildBusinessComparisonEvidenceBundle({comparison_results,required_driver_ids:list(required_driver_ids)});
  return {
    contract:AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT,
    status:failed.length?"COMPLETED_WITH_GAPS":"COMPLETED",
    comparison_results,
    evidence_bundle,
    executed_capability_keys:executed,
    failed_capability_keys:[...new Set(failed)],
    excluded_reads:list(plan.excluded_reads),
    read_only:true,
    policy:{execute_each_safe_pair_once:true,continue_after_individual_read_failure:true,excluded_time_unsafe_reads_never_executed:true,missing_evidence_remains_gap:true,authority_effect:"NONE"},
    authority_effect:"NONE",
  };
}

export const AvantiqoBusinessInternalEvidenceBatchRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_INTERNAL_EVIDENCE_BATCH_CONTRACT,execute:executeBusinessInternalEvidenceBatch});
