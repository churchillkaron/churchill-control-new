export const AVANTIQO_BUSINESS_VARIANCE_DECOMPOSITION_CONTRACT = "AVANTIQO_BUSINESS_VARIANCE_DECOMPOSITION_V1";

const round=(v,d=4)=>{const n=Number(v);return Number.isFinite(n)?Number(n.toFixed(d)):null};
const bounded=(v)=>Math.max(-1,Math.min(1,Number(v)||0));
const safe=(v)=>Number.isFinite(Number(v))?Number(v):null;

function normalizeRows(rows=[]){
  return (Array.isArray(rows)?rows:[]).map((row,index)=>{
    const baseline=safe(row?.baseline_value),actual=safe(row?.actual_value),direct=safe(row?.direct_contribution);
    const delta=direct!==null?direct:(baseline!==null&&actual!==null?actual-baseline:null);
    return {driver_id:String(row?.driver_id||`driver_${index+1}`),baseline_value:baseline,actual_value:actual,contribution_amount:delta,evidence_status:String(row?.evidence_status||"OBSERVED_INTERNAL"),source_capability_key:row?.source_capability_key||null};
  }).filter(row=>row.contribution_amount!==null);
}

export function decomposeBusinessVariance({metric="profit",baseline_value,actual_value,driver_rows=[],external_evidence=[]}={}){
  const baseline=safe(baseline_value),actual=safe(actual_value);
  if(baseline===null||actual===null) throw new Error("AVANTIQO_BUSINESS_VARIANCE_BASELINE_AND_ACTUAL_REQUIRED");
  const metricDelta=actual-baseline;
  const rows=normalizeRows(driver_rows);
  const totalExplained=rows.reduce((sum,row)=>sum+row.contribution_amount,0);
  const residual=metricDelta-totalExplained;
  const denominator=Math.max(Math.abs(metricDelta),1e-9);
  const contributions=rows.map(row=>({...row,share_of_metric_change:round(row.contribution_amount/denominator),direction:row.contribution_amount>0?"POSITIVE":row.contribution_amount<0?"NEGATIVE":"NEUTRAL",causal_state:"OBSERVED_DRIVER"})).sort((a,b)=>Math.abs(b.contribution_amount)-Math.abs(a.contribution_amount)||a.driver_id.localeCompare(b.driver_id));
  const externals=(Array.isArray(external_evidence)?external_evidence:[]).map(item=>({context_id:String(item?.context_id||"external"),evidence_strength:round(Math.max(0,Math.min(1,Number(item?.evidence_strength)||0))),timing_consistent:item?.timing_consistent===true,direction_consistent:item?.direction_consistent===true,confounders_checked:item?.confounders_checked===true,causal_state:item?.supported===true&&item?.timing_consistent===true&&item?.direction_consistent===true&&item?.confounders_checked===true?"SUPPORTED_EXTERNAL_CONTRIBUTOR":item?.contradicted===true?"CONTRADICTED":"PLAUSIBLE_HYPOTHESIS",attributed_amount:null,internal_truth_effect:"NONE"}));
  return {contract:AVANTIQO_BUSINESS_VARIANCE_DECOMPOSITION_CONTRACT,metric,baseline_value:round(baseline),actual_value:round(actual),metric_change:round(metricDelta),metric_change_percent:baseline===0?null:round(metricDelta/Math.abs(baseline)),explained_amount:round(totalExplained),explained_ratio:round(Math.min(1,Math.abs(totalExplained)/denominator)),unexplained_residual:round(residual),unexplained_ratio:round(Math.min(1,Math.abs(residual)/denominator)),contributions,external_assessments:externals,causal_policy:{observed_internal_variance_is_not_full_causal_proof:true,external_context_cannot_receive_amount_attribution_without_supported_model:true,residual_must_remain_visible:true,confounders_required_for_supported_external_contributor:true},authority_effect:"NONE"};
}

export const AvantiqoBusinessVarianceDecompositionRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_VARIANCE_DECOMPOSITION_CONTRACT,decompose:decomposeBusinessVariance});
