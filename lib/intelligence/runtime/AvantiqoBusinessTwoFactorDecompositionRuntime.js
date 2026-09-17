export const AVANTIQO_BUSINESS_TWO_FACTOR_DECOMPOSITION_CONTRACT = "AVANTIQO_BUSINESS_TWO_FACTOR_DECOMPOSITION_V1";

const finite=(v)=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))?Number(v):null);
const text=(v,n=160)=>String(v??"").trim().slice(0,n);
const round=(v,d=6)=>Number.isFinite(Number(v))?Number(Number(v).toFixed(d)):null;

export function decomposeTwoFactorProduct({
  metric,
  factor_a_id,
  factor_b_id,
  baseline_a,
  actual_a,
  baseline_b,
  actual_b,
  source_evidence = [],
}={}){
  const metricId=text(metric,120), aId=text(factor_a_id,120), bId=text(factor_b_id,120);
  const a0=finite(baseline_a), a1=finite(actual_a), b0=finite(baseline_b), b1=finite(actual_b);
  if(!metricId||!aId||!bId||a0===null||a1===null||b0===null||b1===null){
    return {contract:AVANTIQO_BUSINESS_TWO_FACTOR_DECOMPOSITION_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"EXACT_TWO_FACTOR_INPUTS_REQUIRED",metric:metricId||null,driver_rows:[],authority_effect:"NONE"};
  }
  const target0=a0*b0, target1=a1*b1;
  const aContribution=((a1-a0)*(b0+b1))/2;
  const bContribution=((b1-b0)*(a0+a1))/2;
  const explained=aContribution+bContribution;
  const delta=target1-target0;
  return {
    contract:AVANTIQO_BUSINESS_TWO_FACTOR_DECOMPOSITION_CONTRACT,
    status:"DECOMPOSITION_READY",
    model:"TWO_FACTOR_SHAPLEY_PRODUCT",
    metric:metricId,
    baseline_value:round(target0),
    actual_value:round(target1),
    metric_change:round(delta),
    explained_amount:round(explained),
    residual:round(delta-explained),
    driver_rows:[
      {driver_id:aId,direct_contribution:round(aContribution),evidence_status:"TWO_FACTOR_SHAPLEY",source_evidence:[...source_evidence],authority_effect:"NONE"},
      {driver_id:bId,direct_contribution:round(bContribution),evidence_status:"TWO_FACTOR_SHAPLEY",source_evidence:[...source_evidence],authority_effect:"NONE"},
    ],
    policy:{interaction_shared_symmetrically:true,order_independent:true,exact_factor_units_required:true,scope_alignment_required:true,authority_effect:"NONE"},
    authority_effect:"NONE",
  };
}

export const AvantiqoBusinessTwoFactorDecompositionRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_TWO_FACTOR_DECOMPOSITION_CONTRACT,decompose:decomposeTwoFactorProduct});
