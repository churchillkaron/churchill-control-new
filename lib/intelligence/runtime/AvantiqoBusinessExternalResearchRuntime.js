export const AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT = "AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_V1";

const list=(v)=>Array.isArray(v)?v:[];
const text=(v,n=4000)=>String(v??"").trim().slice(0,n);
const bounded=(v)=>Math.max(0,Math.min(1,Number(v)||0));

export function buildBusinessExternalResearchPlan({completed_diagnosis=null,evidence_plan=null,location=null,baseline_period_id=null,current_period_id=null}={}){
  const allowed=completed_diagnosis?.external_research_allowed===true;
  const planned=list(evidence_plan?.external_evidence_plan).map((item,index)=>({
    order:index+1,
    context_id:text(item?.context_id,160),
    query:[text(item?.query,1200),text(location,300),baseline_period_id?`baseline period ${text(baseline_period_id,120)}`:"",current_period_id?`current period ${text(current_period_id,120)}`:""].filter(Boolean).join("; "),
    freshness:text(item?.freshness,120)||"CURRENT_OR_PERIOD_MATCHED",
    minimum_independent_source_groups:2,
    official_primary_can_satisfy_minimum_alone:true,
    require_published_or_observed_date:true,
    require_period_match:true,
    require_direction_test:true,
    require_confounder_check:true,
    require_alternative_explanations:true,
    authority_effect:"NONE",
  })).filter(x=>x.context_id);
  return {
    contract:AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT,
    status:allowed?(planned.length?"RESEARCH_ALLOWED":"NO_EXTERNAL_CONTEXTS_PLANNED"):"RESEARCH_BLOCKED_INTERNAL_GATE",
    research_allowed:allowed,
    unresolved_residual:completed_diagnosis?.variance?.unexplained_residual??null,
    requests:allowed?planned:[],
    blocked_requests:allowed?[]:planned,
    policy:{material_internal_residual_required:true,external_evidence_is_context_not_internal_truth:true,no_automatic_monetary_attribution:true,no_authority_effect:true},
    authority_effect:"NONE",
  };
}

function validSource(source={}){
  const url=text(source.url||source.source_url,2000);
  const group=text(source.independence_group||source.publisher||source.host,240);
  return Boolean(url&&group&&text(source.observed_at||source.published_at||source.retrieved_at,120));
}

export function validateBusinessExternalEvidence({request=null,evidence=null}={}){
  if(!request?.context_id) return {contract:AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT,status:"EVIDENCE_REJECTED",reason:"RESEARCH_REQUEST_REQUIRED",causal_evidence:null,authority_effect:"NONE"};
  const sources=list(evidence?.sources).filter(validSource);
  const groups=new Set(sources.map(s=>text(s.independence_group||s.publisher||s.host,240)).filter(Boolean));
  const officialPrimary=sources.some(s=>s.official===true&&s.primary===true);
  const sourceSufficient=officialPrimary||groups.size>=Math.max(1,Number(request.minimum_independent_source_groups)||2);
  const freshnessChecked=evidence?.freshness_checked===true;
  const periodMatched=evidence?.period_matched===true;
  const timing=evidence?.timing_consistent===true;
  const direction=evidence?.direction_consistent===true;
  const magnitude=evidence?.magnitude_plausible===true;
  const confounders=evidence?.confounders_checked===true;
  const alternatives=evidence?.alternative_explanations_checked===true;
  const missing=[];
  if(!sourceSufficient) missing.push("SOURCE_INDEPENDENCE");
  if(!freshnessChecked) missing.push("FRESHNESS_CHECK");
  if(!periodMatched) missing.push("PERIOD_MATCH");
  if(!timing) missing.push("TIMING_CONSISTENCY");
  if(!direction) missing.push("DIRECTION_CONSISTENCY");
  if(!magnitude) missing.push("MAGNITUDE_PLAUSIBILITY");
  if(!confounders) missing.push("CONFOUNDER_CHECK");
  if(!alternatives) missing.push("ALTERNATIVE_EXPLANATIONS");
  const contradicted=evidence?.contradicted===true||evidence?.timing_consistent===false||evidence?.direction_consistent===false;
  const strength=sourceSufficient&&freshnessChecked&&periodMatched?bounded(evidence?.evidence_strength):0;
  const accepted=missing.length===0&&!contradicted&&strength>=.7;
  return {
    contract:AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT,
    status:accepted?"CAUSAL_EVIDENCE_READY":contradicted?"EVIDENCE_CONTRADICTED":"EVIDENCE_INCOMPLETE",
    reason:accepted?null:(contradicted?"CONTRADICTED_BY_TIMING_OR_DIRECTION":"MISSING_REQUIRED_SUPPORT"),
    context_id:request.context_id,
    source_count:sources.length,
    independent_source_group_count:groups.size,
    official_primary_source_present:officialPrimary,
    missing_requirements:accepted?[]:missing,
    causal_evidence:{context_id:request.context_id,evidence_strength:strength,timing_consistent:timing,direction_consistent:direction,magnitude_plausible:magnitude,confounders_checked:confounders,alternative_explanations_checked:alternatives,contradicted,source_refs:sources.map(s=>({url:text(s.url||s.source_url,2000),publisher:text(s.publisher,240)||null,independence_group:text(s.independence_group||s.publisher||s.host,240),observed_at:text(s.observed_at||s.published_at||s.retrieved_at,120)})),authority_effect:"NONE"},
    authority_effect:"NONE",
  };
}

export const AvantiqoBusinessExternalResearchRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT,buildPlan:buildBusinessExternalResearchPlan,validate:validateBusinessExternalEvidence});
