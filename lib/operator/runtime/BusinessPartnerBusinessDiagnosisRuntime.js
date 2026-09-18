export const AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_V1";

const text=(v,n=12000)=>String(v??"").trim().slice(0,n);
const list=(v)=>Array.isArray(v)?v:[];
const object=(v)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const BUSINESS_METRIC_PATTERN=/\b(profit|margin|revenue|sales|cost|expense|cogs|food cost|labor cost|occupancy|bookings?|cash|cash flow|demand|staffing|attendance|turnover|inventory|stock|churn|retention|customer acquisition|service quality|complaints?|project delay|delivery)\b/i;
const CAUSAL_PATTERN=/\b(why|reason|cause|driver|explain|diagnose|root cause)\b/i;
const CHANGE_PATTERN=/\b(drop|dropped|dropping|down|declin(?:e|ed|ing)?|decrease|decreased|decreasing|increase|increased|increasing|up|worse|lower|higher|change|changed|slow|late|delay|shortage|stockout|churn|fall|fell|rise|rose|improve|improved|worsen|worsened)\b/i;
const COMPARISON_PATTERN=/\b(is|are|was|were|did|has|have)\b.{0,80}\b(down|up|lower|higher|better|worse|changed|change|increased|decreased|fell|rose)\b|\b(compare|comparison|versus|vs\.?|compared with|compared to|from last|since last|month over month|year over year|mom|yoy)\b/i;
const RECOMMENDATION_PATTERN=/\b(what should (?:we|i) do|what do you (?:recommend|suggest)|what would you do|how should (?:we|i) respond|what next|next step|how do (?:we|i) fix|how can (?:we|i) improve|what can (?:we|i) do)\b/i;
const CURRENT_READ_PATTERN=/^\s*(show|list|give|tell|what(?:'s| is)|how much|how many)\b.{0,120}\b(current|today|now|latest)?\b.{0,120}\b(profit|margin|revenue|sales|cost|expense|cogs|food cost|labor cost|occupancy|bookings?|cash|cash flow|demand|staffing|attendance|turnover|inventory|stock|churn|retention)\b/i;

export function classifyBusinessDiagnosisQuestion(message){
  const value=text(message);
  if(!value||!BUSINESS_METRIC_PATTERN.test(value)) return {match:false,class:null};
  const causal=CAUSAL_PATTERN.test(value);
  const changed=CHANGE_PATTERN.test(value);
  const comparative=COMPARISON_PATTERN.test(value);
  const recommendation=RECOMMENDATION_PATTERN.test(value);
  if(causal) return {match:true,class:"CAUSAL_DIAGNOSIS"};
  if(comparative) return {match:true,class:"PERIOD_COMPARISON"};
  if(recommendation&&changed) return {match:true,class:"EVIDENCE_FIRST_RECOMMENDATION"};
  if(changed&&!CURRENT_READ_PATTERN.test(value)) return {match:true,class:"CHANGE_DIAGNOSIS"};
  return {match:false,class:null};
}

export function isBusinessDiagnosisQuestion(message){return classifyBusinessDiagnosisQuestion(message).match===true;}

async function periodRows({organizationId,entityId=null}={}){
  const { supabaseAdmin } = await import("../../shared/supabase/admin.js");
  let q=supabaseAdmin.from("accounting_periods").select("id,organization_id,entity_id,start_date,end_date,status").eq("organization_id",organizationId).order("start_date",{ascending:false}).limit(36);
  if(entityId) q=q.or(`entity_id.eq.${entityId},entity_id.is.null`);
  const {data,error}=await q;if(error) throw error;return list(data);
}

function normalizedPeriodRows(rows,{organizationId,entityId=null}={}){
  const organization=text(organizationId,160);
  const entity=text(entityId,160)||null;
  return list(rows).filter((row)=>{
    if(text(row?.organization_id,160)&&text(row.organization_id,160)!==organization) return false;
    const rowEntity=text(row?.entity_id,160)||null;
    return !entity||rowEntity===entity||rowEntity===null;
  }).sort((a,b)=>{
    const dateOrder=text(b?.start_date,40).localeCompare(text(a?.start_date,40));
    if(dateOrder!==0) return dateOrder;
    if(entity){
      const aExact=(text(a?.entity_id,160)||null)===entity;
      const bExact=(text(b?.entity_id,160)||null)===entity;
      if(aExact!==bExact) return aExact?-1:1;
    }
    return text(a?.id,160).localeCompare(text(b?.id,160));
  });
}

function scopedPeriodCandidate(rows,{entityId=null,beforeStartDate=null,notAfterDate=null}={}){
  const entity=text(entityId,160)||null;
  const eligible=list(rows).filter((row)=>{
    const start=text(row?.start_date,40);
    if(!start) return false;
    if(beforeStartDate&&start>=beforeStartDate) return false;
    if(notAfterDate&&start>notAfterDate) return false;
    return true;
  });
  if(!eligible.length) return null;
  const nearestStart=text(eligible[0]?.start_date,40);
  const nearest=eligible.filter((row)=>text(row?.start_date,40)===nearestStart);
  if(entity){
    const exact=nearest.find((row)=>(text(row?.entity_id,160)||null)===entity);
    if(exact) return exact;
  }
  return nearest.find((row)=>(text(row?.entity_id,160)||null)===null)||nearest[0]||null;
}

export async function resolveBusinessDiagnosisPeriods({organizationId,entityId=null,currentPeriodId=null,now=new Date(),loadPeriods=periodRows}={}){
  const rows=normalizedPeriodRows(await loadPeriods({organizationId,entityId}),{organizationId,entityId});
  if(!rows.length) return {status:"PERIODS_UNAVAILABLE",baseline_period_id:null,current_period_id:null};
  const selectedId=text(currentPeriodId,160)||null;
  let current=selectedId?rows.find((row)=>text(row?.id,160)===selectedId):null;
  if(selectedId&&!current) return {status:"CURRENT_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:null};
  if(!current){
    const today=(now instanceof Date&&!Number.isNaN(now.getTime())?now:new Date()).toISOString().slice(0,10);
    current=scopedPeriodCandidate(rows,{entityId,notAfterDate:today});
  }
  if(!current) return {status:"CURRENT_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:null};
  const baseline=scopedPeriodCandidate(rows,{entityId,beforeStartDate:text(current.start_date,40)});
  if(!baseline) return {status:"BASELINE_PERIOD_NOT_FOUND",baseline_period_id:null,current_period_id:text(current.id,160)};
  return {status:"PERIOD_PAIR_READY",baseline_period_id:text(baseline.id,160),current_period_id:text(current.id,160),baseline_start_date:baseline.start_date||null,baseline_end_date:baseline.end_date||null,current_start_date:current.start_date||null,current_end_date:current.end_date||null,current_status:text(current.status,80)||null,baseline_status:text(baseline.status,80)||null};
}

export async function runBusinessPartnerBusinessDiagnosis(options={},dependencies={}){
  if(text(options.source,40).toLowerCase()==="event") return null;
  if(object(options.agreementState)?.pending_execution) return null;
  if(!isBusinessDiagnosisQuestion(options.message)) return null;
  const organizationId=text(options.organizationId,160);
  if(!organizationId) return null;
  const periods=await resolveBusinessDiagnosisPeriods({organizationId,entityId:text(options.entityId,160)||null,currentPeriodId:text(options.periodId,160)||null,loadPeriods:dependencies.loadPeriods||periodRows,now:dependencies.now||new Date()});
  if(periods.status!=="PERIOD_PAIR_READY") return null;
  const runDiagnosis=dependencies.runDiagnosis||(async(payload)=>{const { BusinessIntelligenceAgentRuntime } = await import("../../intelligence/runtime/BusinessIntelligenceAgentRuntime.js");return BusinessIntelligenceAgentRuntime.run(payload);});
  const diagnosisClass=classifyBusinessDiagnosisQuestion(options.message).class;
  const result=await runDiagnosis({
    organization_id:organizationId,party_id:text(options.partyId,160)||null,entity_id:text(options.entityId,160)||null,question:text(options.message),messages:list(options.conversation),
    context:{baseline_period_id:periods.baseline_period_id,current_period_id:periods.current_period_id,baseline_period_start_date:periods.baseline_start_date,baseline_period_end_date:periods.baseline_end_date,current_period_start_date:periods.current_start_date,current_period_end_date:periods.current_end_date,business_diagnosis_class:diagnosisClass},memories:list(options.longTermMemory),actor:object(options.actor),permissions:list(options.permissions),callerRequest:options.callerRequest||null,period_id:periods.current_period_id,mode:"deep",
  });
  const response=text(result?.result?.response)||"I could not produce a verified business diagnosis from the available evidence.";
  const receipt=object(result?.business_diagnosis_receipt);
  return {
    success:true,decision:{response_text:response,response_language:text(options.locale,80)||null,intent:"business_diagnosis",confidence:1,agreement_state:object(options.agreementState),project_state:object(options.projectState),clarification:{required:false,question:null,options:[]},navigation:{target_id:null},execution:{capability_key:null,payload:{},reason:null},plan:[]},
    agreement_state:object(options.agreementState),provider_evidence:null,navigation:null,execution:null,
    business_diagnosis:{contract:AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT,class:receipt.diagnosis_class||diagnosisClass,periods,receipt_fingerprint:receipt.receipt_fingerprint||null,final_evidence_state:receipt.final_evidence_state||null,residual_material:receipt.residual_material===true,answer_boundary_status:receipt.answer_boundary_status||null,answer_unsupported_recommendation_outcome_detected:receipt.answer_unsupported_recommendation_outcome_detected===true,authority_effect:"NONE"},
    intelligence_supervision:{contract:AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT,owned_brief_used:false,live_evidence_used:true,business_diagnosis_routed:true,execution_governance_bypassed:false,raw_reasoning_persisted:false,authority_effect:"NONE"},
  };
}

export const BusinessPartnerBusinessDiagnosisRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_PARTNER_BUSINESS_DIAGNOSIS_CONTRACT,isQuestion:isBusinessDiagnosisQuestion,classifyQuestion:classifyBusinessDiagnosisQuestion,resolvePeriods:resolveBusinessDiagnosisPeriods,run:runBusinessPartnerBusinessDiagnosis});
