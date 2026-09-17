export const AVANTIQO_BUSINESS_ACCOUNTING_DECOMPOSITION_CONTRACT = "AVANTIQO_BUSINESS_ACCOUNTING_DECOMPOSITION_V1";

const finite=(v)=>Number.isFinite(Number(v))?Number(v):null;
const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=160)=>String(v??"").trim().slice(0,n);

function exactObservation(comparisonResults, measureId){
  const rows=[];
  for(const result of list(comparisonResults)){
    for(const row of list(result?.normalized?.observations)){
      if(row?.source_capability_key!=="finance.profit_loss.read" || row?.measure_id!==measureId) continue;
      const baseline=finite(row.baseline_value), actual=finite(row.actual_value);
      if(baseline===null||actual===null) continue;
      rows.push(row);
    }
  }
  return rows.length===1?rows[0]:null;
}

export function buildAccountingDecomposition({metric="profit",comparison_results=[]}={}){
  const metricId=text(metric,120)||"profit";
  const revenue=exactObservation(comparison_results,"recognized_revenue");
  const totalCost=exactObservation(comparison_results,"total_cost");
  const cogs=exactObservation(comparison_results,"cogs_amount");
  const opex=exactObservation(comparison_results,"operating_expenses");
  const rows=[];
  let model=null;
  if(metricId==="profit" && revenue && totalCost){
    model="PROFIT_EQUALS_REVENUE_MINUS_TOTAL_COST";
    rows.push({driver_id:"revenue",direct_contribution:finite(revenue.actual_value)-finite(revenue.baseline_value),evidence_status:"ACCOUNTING_IDENTITY",source_capability_key:"finance.profit_loss.read",decomposition_sign:1});
    rows.push({driver_id:"cost_total",direct_contribution:-(finite(totalCost.actual_value)-finite(totalCost.baseline_value)),evidence_status:"ACCOUNTING_IDENTITY",source_capability_key:"finance.profit_loss.read",decomposition_sign:-1});
  } else if(metricId==="cost_total" && cogs && opex){
    model="TOTAL_COST_EQUALS_COGS_PLUS_OPERATING_EXPENSES";
    rows.push({driver_id:"cogs",direct_contribution:finite(cogs.actual_value)-finite(cogs.baseline_value),evidence_status:"ACCOUNTING_IDENTITY",source_capability_key:"finance.profit_loss.read",decomposition_sign:1});
    rows.push({driver_id:"operating_expenses",direct_contribution:finite(opex.actual_value)-finite(opex.baseline_value),evidence_status:"ACCOUNTING_IDENTITY",source_capability_key:"finance.profit_loss.read",decomposition_sign:1});
  } else if(metricId==="revenue" && revenue){
    model="REVENUE_DIRECT_ACCOUNTING_MEASURE";
  }
  return {contract:AVANTIQO_BUSINESS_ACCOUNTING_DECOMPOSITION_CONTRACT,metric:metricId,status:model?"DECOMPOSITION_READY":"DECOMPOSITION_NOT_AVAILABLE",model,driver_rows:rows,policy:{nested_accounting_measures_not_double_counted:true,target_measure_never_reused_as_driver_contribution:true,signs_follow_accounting_identity:true,authority_effect:"NONE"},authority_effect:"NONE"};
}

export const AvantiqoBusinessAccountingDecompositionRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_ACCOUNTING_DECOMPOSITION_CONTRACT,build:buildAccountingDecomposition});
