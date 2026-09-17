import { createHash } from "node:crypto";

export const AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_POLICY_CONTRACT = "AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_POLICY_V1";
export const MAX_AVANTIQO_EXPERIENCE_PRACTICE_CASES = 6;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function list(v){return Array.isArray(v)?v:[]}
function hash(v){return createHash("sha256").update(text(v,50000)).digest("hex")}

export const AVANTIQO_EXPERIENCE_FAILURE_DRILLS=Object.freeze({
  PREREQUISITE_FAILURE:{expected:"REPAIR_PREREQUISITE",scenario:"A requested capability is appropriate, but required configuration, credentials, identifiers, or required input are missing. Do not treat this as proof the capability is unreliable."},
  MODEL_REASONING_FAILURE:{expected:"REPLAN_WITH_CRITIQUE",scenario:"The capability exists and prerequisites are available, but the prior plan or tool selection was wrong. Re-evaluate the evidence and produce a corrected plan without increasing authority."},
  TRANSPORT_RUNTIME_FAILURE:{expected:"VERIFY_STATE_BEFORE_SAFE_RETRY",scenario:"A network/runtime failure occurred around execution. The business state may be ambiguous. Determine current state before deciding whether any retry is safe."},
  BUSINESS_OUTCOME_FAILURE:{expected:"INVESTIGATE_BUSINESS_EFFECT",scenario:"Execution completed but independent verification showed the intended business effect did not occur. Investigate the effect and cause; do not replay the mutation blindly."},
});

export function buildAvantiqoExperiencePracticeCases(summaries=[],effectivenessItems=[]){
  const feedback=new Map((Array.isArray(effectivenessItems)?effectivenessItems:[]).map(item=>[`${text(item.capability_key,300)}|${text(item.failure_class,80)}`,item]));
  const candidates=[];
  for(const summary of list(summaries)){
    const failures=[
      ["BUSINESS_OUTCOME_FAILURE",Number(summary.verified_failure_count||0)],
      ["MODEL_REASONING_FAILURE",Number(summary.model_reasoning_failure_count||0)],
      ["PREREQUISITE_FAILURE",Number(summary.prerequisite_failure_count||0)],
      ["TRANSPORT_RUNTIME_FAILURE",Number(summary.transport_runtime_failure_count||0)],
    ];
    for(const [failureClass,count] of failures){
      if(count<=0)continue;
      const drill=AVANTIQO_EXPERIENCE_FAILURE_DRILLS[failureClass];
      const experienceStrength=Math.max(0,Math.min(1,Number(summary.experience_strength||0)));
      const feedbackItem=feedback.get(`${text(summary.capability_key,300)}|${failureClass}`);
      const multiplier=Math.max(0.7,Math.min(1.5,Number(feedbackItem?.practice_priority_multiplier||1)));
      const priority=count*(1+experienceStrength)*multiplier;
      candidates.push({capability_key:text(summary.capability_key,300),capability_domain:text(summary.capability_domain,120)||null,failure_class:failureClass,failure_count:count,experience_strength:experienceStrength,priority,practice_priority_multiplier:multiplier,effectiveness_status:text(feedbackItem?.status,120)||null,expected:drill.expected,scenario:`Capability ${text(summary.capability_key,300)}. ${drill.scenario}`});
    }
  }
  return candidates.sort((a,b)=>b.priority-a.priority||b.failure_count-a.failure_count||a.capability_key.localeCompare(b.capability_key)).slice(0,MAX_AVANTIQO_EXPERIENCE_PRACTICE_CASES).map((item,index)=>({...item,case_id:`experience_${index+1}_${hash(`${item.capability_key}|${item.failure_class}`).slice(0,10)}`}));
}

export const AvantiqoBusinessPartnerExperiencePracticePolicyRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_POLICY_CONTRACT,drills:AVANTIQO_EXPERIENCE_FAILURE_DRILLS,maxCases:MAX_AVANTIQO_EXPERIENCE_PRACTICE_CASES,buildCases:buildAvantiqoExperiencePracticeCases});
