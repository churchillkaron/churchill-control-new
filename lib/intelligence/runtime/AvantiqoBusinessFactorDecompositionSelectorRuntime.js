import { decomposeTwoFactorProduct } from "./AvantiqoBusinessTwoFactorDecompositionRuntime.js";

export const AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT = "AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_V1";

const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=180)=>String(v??"").trim().slice(0,n);
const finite=(v)=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))?Number(v):null);
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const near=(a,b,t=.000001)=>Math.abs(Number(a)-Number(b))<=Math.max(t,Math.abs(Number(b))*t);

const MODELS=Object.freeze({
  revenue:{factor_a_id:"volume",factor_b_id:"price",unit_a:"quantity",unit_b:"currency_per_quantity"},
  labor:{factor_a_id:"hours",factor_b_id:"wage_rate",unit_a:"hours",unit_b:"currency_per_hour"},
  cogs:{factor_a_id:"recipe_usage",factor_b_id:"purchase_price",unit_a:"quantity",unit_b:"currency_per_quantity"},
});

function pick(rows,id){const matches=list(rows).filter(r=>text(r?.factor_id,120)===id&&r?.evidence_status==="EXACT_FACTOR_OBSERVATION");return matches.length===1?matches[0]:null;}
function scopeOf(row){const s=row?.scope||{};return {organization_id:s.organization_id||null,entity_id:s.entity_id||null,baseline_period_id:s.baseline_period_id||null,current_period_id:s.current_period_id||null};}

export function selectBusinessFactorDecomposition({metric="profit",factor_observations=[],target_metric=null,tolerance=0.000001}={}){
  const metricId=text(metric,120)||"profit";
  const model=MODELS[metricId];
  if(!model) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"NO_REGISTERED_FACTOR_MODEL",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  const a=pick(factor_observations,model.factor_a_id), b=pick(factor_observations,model.factor_b_id);
  if(!a||!b) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"EXACT_FACTOR_OBSERVATIONS_REQUIRED",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  if(text(a.unit,80)!==model.unit_a||text(b.unit,80)!==model.unit_b) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"FACTOR_UNIT_MISMATCH",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  if(!same(scopeOf(a),scopeOf(b))) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"FACTOR_SCOPE_MISMATCH",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  if((a.basis_key||null)!==(b.basis_key||null)) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"FACTOR_BASIS_MISMATCH",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  if(text(b.unit,80).startsWith("currency_") && !text(b.currency_code,40)) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"FACTOR_CURRENCY_REQUIRED",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  const decomposition=decomposeTwoFactorProduct({metric:metricId,factor_a_id:model.factor_a_id,factor_b_id:model.factor_b_id,baseline_a:a.baseline_value,actual_a:a.actual_value,baseline_b:b.baseline_value,actual_b:b.actual_value,source_evidence:[a.source_capability_key,b.source_capability_key].filter(Boolean)});
  if(decomposition.status!=="DECOMPOSITION_READY") return {...decomposition,selector_contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT};
  const targetBaseline=finite(target_metric?.baseline_value), targetActual=finite(target_metric?.actual_value);
  if(target_metric?.status!=="TARGET_METRIC_READY"||targetBaseline===null||targetActual===null) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"TARGET_METRIC_REQUIRED_FOR_FACTOR_RECONCILIATION",metric:metricId,driver_rows:[],authority_effect:"NONE"};
  if(!near(decomposition.baseline_value,targetBaseline,tolerance)||!near(decomposition.actual_value,targetActual,tolerance)) return {contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,status:"DECOMPOSITION_NOT_AVAILABLE",reason:"FACTOR_PRODUCT_DOES_NOT_RECONCILE_TARGET",metric:metricId,derived_baseline_value:decomposition.baseline_value,derived_actual_value:decomposition.actual_value,target_baseline_value:targetBaseline,target_actual_value:targetActual,driver_rows:[],authority_effect:"NONE"};
  return {...decomposition,selector_contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,model:`${metricId.toUpperCase()}_TWO_FACTOR_SHAPLEY`,factor_scope:scopeOf(a),basis_key:a.basis_key||null,currency_code:b.currency_code||null,policy:{...decomposition.policy,exact_factor_observations_required:true,target_reconciliation_required:true,authority_effect:"NONE"}};
}

export const AvantiqoBusinessFactorDecompositionSelectorRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_FACTOR_DECOMPOSITION_SELECTOR_CONTRACT,select:selectBusinessFactorDecomposition});
