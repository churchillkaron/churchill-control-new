export const AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT = "AVANTIQO_BUSINESS_ANSWER_BRIEF_V1";

const list=(v)=>Array.isArray(v)?v:[];
const num=(v)=>Number.isFinite(Number(v))?Number(v):null;

export function buildBusinessAnswerBrief({final_diagnosis=null}={}){
  const root=final_diagnosis?.diagnosis||null;
  if(!root) return {contract:AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT,status:"DIAGNOSIS_UNAVAILABLE",facts:[],supported_external_context:[],unresolved:[],recommendation_policy:{recommendations_must_follow_evidence:true,no_execution_authority:true},authority_effect:"NONE"};
  const variance=root.variance||null;
  const facts=[];
  if(root.target_metric?.status==="TARGET_METRIC_READY") facts.push({kind:"TARGET_METRIC",metric:root.target_metric.metric,baseline_value:num(root.target_metric.baseline_value),actual_value:num(root.target_metric.actual_value),evidence_status:root.target_metric.evidence_status||null});
  for(const row of list(variance?.contributions)) facts.push({kind:"INTERNAL_DRIVER",driver_id:row.driver_id,contribution_amount:num(row.contribution_amount),direction:row.direction||null,causal_state:row.causal_state||"OBSERVED_DRIVER"});
  const supported=list(root.causal?.assessments).filter(x=>x?.causal_state==="SUPPORTED_EXTERNAL_CONTRIBUTOR").map(x=>({context_id:x.context_id,support_score:num(x.support_score),evidence_strength:num(x.evidence_strength),attributed_amount:null,causal_state:x.causal_state}));
  const unresolved=[];
  if(root.target_metric?.status!=="TARGET_METRIC_READY") unresolved.push({kind:"TARGET_METRIC_GAP",status:root.target_metric?.status||"UNKNOWN"});
  if(root.internal_coverage_incomplete===true) unresolved.push({kind:"INTERNAL_COVERAGE_GAP",driver_ids:list(root.evidence_bundle?.missing_driver_ids)});
  if(root.residual_material===true) unresolved.push({kind:"MATERIAL_UNEXPLAINED_RESIDUAL",amount:num(variance?.unexplained_residual),ratio:num(root.residual_ratio)});
  for(const row of list(root.causal?.assessments).filter(x=>x?.causal_state!=="SUPPORTED_EXTERNAL_CONTRIBUTOR")) unresolved.push({kind:"EXTERNAL_CONTEXT_UNRESOLVED",context_id:row.context_id,causal_state:row.causal_state,missing_support_requirements:list(row.missing_support_requirements)});
  return {contract:AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT,status:root.final_evidence_state||"DIAGNOSIS_INCOMPLETE",metric:root.metric||final_diagnosis?.metric||null,facts,supported_external_context:supported,unresolved,explanation_complete:root.final_evidence_state==="INTERNAL_SUFFICIENT"||root.final_evidence_state==="INTERNAL_AND_SUPPORTED_EXTERNAL",recommendation_policy:{recommendations_must_follow_evidence:true,recommendations_are_not_causal_proof:true,recommendations_do_not_authorize_execution:true,monetary_attribution_requires_separate_supported_model:true,unresolved_items_must_not_be_presented_as_fact:true},response_rules:["Lead with the verified business change.","State observed internal drivers as observed contributions, not full causal proof.","State external context as supported only when causal_state is SUPPORTED_EXTERNAL_CONTRIBUTOR.","Keep unresolved residuals and evidence gaps explicit.","Separate recommendations from facts and do not imply execution occurred."],authority_effect:"NONE"};
}

export const AvantiqoBusinessAnswerBriefRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT,build:buildBusinessAnswerBrief});
