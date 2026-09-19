export const AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_CONTRACT = "AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_V1";

const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=180)=>String(v??"").trim().slice(0,n);
const finite=(v)=>Number.isFinite(Number(v))?Number(v):null;

const EXACT_TARGETS=Object.freeze({
  profit:[{measure_id:"net_profit",source_capability_key:"finance.profit_loss.read"}],
  revenue:[{measure_id:"recognized_revenue",source_capability_key:"finance.profit_loss.read"}],
  cost_total:[{measure_id:"total_cost",source_capability_key:"finance.profit_loss.read"}],
  cogs:[{measure_id:"cogs_amount",source_capability_key:"finance.profit_loss.read"}],
  cash:[{measure_id:"cash_position",source_capability_key:"finance.cash_management.read"}],
  volume:[{measure_id:"booking_count",source_capability_key:"solutions.hotel_bookings.read"}],
});

export function resolveBusinessTargetMetric({metric="profit",comparison_results=[],dimension_key=null}={}){
  const metricId=text(metric,120)||"profit";
  const allowed=list(EXACT_TARGETS[metricId]);
  if(!allowed.length){
    return {contract:AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_CONTRACT,metric:metricId,status:"TARGET_METRIC_EVIDENCE_GAP",reason:"NO_EXACT_TARGET_MEASURE_MODEL",baseline_value:null,actual_value:null,authority_effect:"NONE"};
  }
  const candidates=[];
  for(const result of list(comparison_results)){
    for(const row of list(result?.normalized?.observations)){
      const exact=allowed.some(rule=>rule.measure_id===row?.measure_id&&rule.source_capability_key===row?.source_capability_key);
      if(!exact) continue;
      if(dimension_key!==null&&text(row?.dimension_key,160)!==text(dimension_key,160)) continue;
      const baseline=finite(row?.baseline_value), actual=finite(row?.actual_value);
      if(baseline===null||actual===null) continue;
      candidates.push(row);
    }
  }
  if(!candidates.length){
    return {contract:AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_CONTRACT,metric:metricId,status:"TARGET_METRIC_EVIDENCE_GAP",reason:"EXACT_TARGET_MEASURE_NOT_OBSERVED",baseline_value:null,actual_value:null,authority_effect:"NONE"};
  }
  if(candidates.length!==1){
    return {contract:AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_CONTRACT,metric:metricId,status:"TARGET_METRIC_EVIDENCE_GAP",reason:"TARGET_METRIC_DIMENSION_AMBIGUOUS",candidate_dimensions:candidates.map(r=>r.dimension_key||null),baseline_value:null,actual_value:null,authority_effect:"NONE"};
  }
  const row=candidates[0];
  return {contract:AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_CONTRACT,metric:metricId,status:"TARGET_METRIC_READY",measure_id:row.measure_id,dimension_key:row.dimension_key||null,source_capability_key:row.source_capability_key||null,baseline_value:finite(row.baseline_value),actual_value:finite(row.actual_value),delta:finite(row.actual_value)-finite(row.baseline_value),evidence_status:"OBSERVED_COMPARABLE",policy:{exact_measure_mapping_only:true,derived_metrics_require_explicit_model:true,cross_dimension_aggregation_forbidden:true,authority_effect:"NONE"},authority_effect:"NONE"};
}

export const AvantiqoBusinessTargetMetricResolverRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_TARGET_METRIC_RESOLVER_CONTRACT,resolve:resolveBusinessTargetMetric});
