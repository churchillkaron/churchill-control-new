export const AVANTIQO_BUSINESS_CAUSAL_HYPOTHESIS_CONTRACT = "AVANTIQO_BUSINESS_CAUSAL_HYPOTHESIS_V1";

const bounded=(v)=>Math.max(0,Math.min(1,Number(v)||0));
const text=(v,l=300)=>String(v??"").trim().slice(0,l);

function assessOne(item={}){
  const strength=bounded(item.evidence_strength);
  const timing=item.timing_consistent===true;
  const direction=item.direction_consistent===true;
  const magnitude=item.magnitude_plausible===true;
  const confounders=item.confounders_checked===true;
  const alternatives=item.alternative_explanations_checked===true;
  const contradicted=item.contradicted===true || item.timing_consistent===false || item.direction_consistent===false;
  const supportScore=Number((strength*.35+(timing?.15:0)+(direction?.15:0)+(magnitude?.1:0)+(confounders?.15:0)+(alternatives?.1:0)).toFixed(4));
  const supported=!contradicted && strength>=.7 && timing && direction && magnitude && confounders && alternatives;
  const state=contradicted?"CONTRADICTED":supported?"SUPPORTED_EXTERNAL_CONTRIBUTOR":strength>0?"PLAUSIBLE_HYPOTHESIS":"UNRESOLVED";
  const missing=[];
  if(strength<.7) missing.push("EVIDENCE_STRENGTH");
  if(!timing) missing.push("TIMING_CONSISTENCY");
  if(!direction) missing.push("DIRECTION_CONSISTENCY");
  if(!magnitude) missing.push("MAGNITUDE_PLAUSIBILITY");
  if(!confounders) missing.push("CONFOUNDER_CHECK");
  if(!alternatives) missing.push("ALTERNATIVE_EXPLANATIONS");
  return {context_id:text(item.context_id)||"external",causal_state:state,support_score:supportScore,evidence_strength:strength,timing_consistent:timing,direction_consistent:direction,magnitude_plausible:magnitude,confounders_checked:confounders,alternative_explanations_checked:alternatives,missing_support_requirements:supported?[]:missing,attributed_amount:null,authority_effect:"NONE"};
}

export function testBusinessCausalHypotheses({external_evidence=[],unexplained_residual=null}={}){
  const assessments=(Array.isArray(external_evidence)?external_evidence:[]).map(assessOne).sort((a,b)=>b.support_score-a.support_score||a.context_id.localeCompare(b.context_id));
  const supported=assessments.filter(x=>x.causal_state==="SUPPORTED_EXTERNAL_CONTRIBUTOR");
  return {contract:AVANTIQO_BUSINESS_CAUSAL_HYPOTHESIS_CONTRACT,unexplained_residual:Number.isFinite(Number(unexplained_residual))?Number(unexplained_residual):null,assessments,supported_context_ids:supported.map(x=>x.context_id),causal_claim_allowed:supported.length>0,policy:{external_evidence_never_overrides_internal_product_truth:true,correlation_alone_is_insufficient:true,monetary_attribution_requires_separate_supported_model:true,residual_must_remain_visible:true,missing_checks_prevent_supported_contributor:true},authority_effect:"NONE"};
}

export const AvantiqoBusinessCausalHypothesisRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_CAUSAL_HYPOTHESIS_CONTRACT,test:testBusinessCausalHypotheses});
