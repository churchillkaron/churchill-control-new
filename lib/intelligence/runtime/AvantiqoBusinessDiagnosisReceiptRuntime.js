import { createHash } from "node:crypto";

export const AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT = "AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_V1";
const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=1000)=>String(v??"").trim().slice(0,n);
function canonicalValue(value){
  if(Array.isArray(value)) return value.map(canonicalValue);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalValue(value[key])]));
  }
  return value;
}
const stable=(v)=>JSON.stringify(canonicalValue(v));
const sortedUnique=(values=[])=>[...new Set(list(values).map((v)=>text(v,160)).filter(Boolean))].sort();
const sha=(v)=>createHash("sha256").update(String(v??"")).digest("hex");

function sourceRefs(closure={}){
  return list(closure?.causal_evidence).flatMap((row)=>list(row?.source_refs).map((source)=>({
    context_id:text(row?.context_id,160)||null,
    url:text(source?.url,2000)||null,
    publisher:text(source?.publisher,240)||null,
    independence_group:text(source?.independence_group,240)||null,
    observed_at:text(source?.observed_at,120)||null,
  }))).filter((row)=>row.url).sort((a,b)=>`${a.context_id||""}\u0000${a.url||""}\u0000${a.publisher||""}\u0000${a.independence_group||""}\u0000${a.observed_at||""}`.localeCompare(`${b.context_id||""}\u0000${b.url||""}\u0000${b.publisher||""}\u0000${b.independence_group||""}\u0000${b.observed_at||""}`));
}

export function buildBusinessDiagnosisReceipt({organization_id=null,entity_id=null,metric=null,baseline_period_id=null,current_period_id=null,final_diagnosis=null,external_research_plan=null,external_evidence_assessment=null,external_diagnosis_closure=null,answer_brief=null,answer_boundary=null}={}){
  const diagnosis=final_diagnosis?.diagnosis||null;
  const payload={
    contract:AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,
    organization_id:text(organization_id,160)||null,
    entity_id:text(entity_id,160)||null,
    metric:text(metric||final_diagnosis?.metric,120)||null,
    baseline_period_id:text(baseline_period_id,120)||null,
    current_period_id:text(current_period_id,120)||null,
    final_evidence_state:text(diagnosis?.final_evidence_state,160)||null,
    target_metric_status:text(diagnosis?.target_metric?.status,160)||null,
    residual_material:diagnosis?.residual_material===true,
    residual_ratio:Number.isFinite(Number(diagnosis?.residual_ratio))?Number(diagnosis.residual_ratio):null,
    unexplained_residual:Number.isFinite(Number(diagnosis?.variance?.unexplained_residual))?Number(diagnosis.variance.unexplained_residual):null,
    internal_coverage_incomplete:diagnosis?.internal_coverage_incomplete===true,
    supported_external_context_ids:sortedUnique(diagnosis?.causal?.supported_context_ids),
    external_research_status:text(external_research_plan?.status,160)||null,
    external_assessment_status:text(external_evidence_assessment?.status,160)||null,
    validated_external_context_ids:sortedUnique(external_diagnosis_closure?.validated_context_ids),
    rejected_or_unresolved_external_contexts:list(external_diagnosis_closure?.validation_results).filter((row)=>row?.status!=="CAUSAL_EVIDENCE_READY").map((row)=>({context_id:text(row?.context_id,160)||null,status:text(row?.status,160)||null,reason:text(row?.reason,240)||null,missing_requirements:sortedUnique(row?.missing_requirements)})).sort((a,b)=>`${a.context_id||""}\u0000${a.status||""}\u0000${a.reason||""}`.localeCompare(`${b.context_id||""}\u0000${b.status||""}\u0000${b.reason||""}`)),
    source_refs:sourceRefs(external_diagnosis_closure),
    answer_brief_status:text(answer_brief?.status,160)||null,
    unresolved_answer_item_count:list(answer_brief?.unresolved).length,
    answer_boundary_status:text(answer_boundary?.status,160)||null,
    answer_overclaim_detected:answer_boundary?.overclaim_detected===true,
    answer_uncertainty_appended:answer_boundary?.required_uncertainty_appended===true,
    read_only:true,
    raw_web_content_persisted:false,
    raw_reasoning_persisted:false,
    automatic_monetary_attribution:false,
    authority_effect:"NONE",
  };
  const fingerprint=sha(stable(payload));
  return {...payload,receipt_fingerprint:fingerprint};
}

export const AvantiqoBusinessDiagnosisReceiptRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT,build:buildBusinessDiagnosisReceipt});
