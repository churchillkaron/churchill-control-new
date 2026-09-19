export const AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_EFFECTIVENESS_POLICY_CONTRACT="AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_EFFECTIVENESS_POLICY_V1";
const DAY_MS=24*60*60*1000;
function text(v,l=12000){return String(v??"").trim().slice(0,l)}
function list(v){return Array.isArray(v)?v:[]}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function observedAt(row){const m=object(row?.metadata);return text(m.observed_at||row?.created_at||row?.updated_at,120)}
function matchesCapability(row,key){const m=object(row?.metadata);return text(m.capability_key||row?.subject,300)===key}
function failureClass(row){return text(object(row?.metadata).failure_class,80)}
function smoothedFailureRate(failures,turns){return turns>=0?(failures+1)/(turns+2):null}
export function evaluateAvantiqoExperiencePracticeEffectiveness({practice={},experienceRows=[],windowDays=45,minTurns=2}={}){
 const createdAt=text(practice.created_at||practice.updated_at||object(practice.metadata).created_at,120);const pivot=Date.parse(createdAt);if(!Number.isFinite(pivot))return [];
 const start=pivot-Math.max(7,Number(windowDays)||45)*DAY_MS,end=pivot+Math.max(7,Number(windowDays)||45)*DAY_MS;
 const results=list(object(practice.metadata).results);const out=[];
 for(const result of results){
  const capabilityKey=text(result.capability_key,300),klass=text(result.failure_class,80);if(!capabilityKey||!klass)continue;
  const relevant=list(experienceRows).filter(row=>matchesCapability(row,capabilityKey)).map(row=>({row,time:Date.parse(observedAt(row))})).filter(item=>Number.isFinite(item.time)&&item.time>=start&&item.time<=end);
  const before=relevant.filter(item=>item.time<pivot),after=relevant.filter(item=>item.time>pivot);
  const beforeFailures=before.filter(item=>failureClass(item.row)===klass).length,afterFailures=after.filter(item=>failureClass(item.row)===klass).length;
  const beforeRate=smoothedFailureRate(beforeFailures,before.length),afterRate=smoothedFailureRate(afterFailures,after.length);
  const delta=beforeRate-afterRate;const evidenceStrength=Math.min(1,Math.min(before.length,after.length)/5);
  let status="NO_CLEAR_CHANGE",priorityMultiplier=1.15;
  if(result.passed!==true){status="PRACTICE_NOT_MASTERED";priorityMultiplier=1.35}
  else if(before.length<minTurns||after.length<minTurns){status="INSUFFICIENT_POST_PRACTICE_EXPERIENCE";priorityMultiplier=1}
  else if(delta>=0.12){status="OBSERVED_FAILURE_RATE_IMPROVED";priorityMultiplier=0.75}
  else if(delta<=-0.12){status="OBSERVED_FAILURE_RATE_WORSENED";priorityMultiplier=1.4}
  out.push({capability_key:capabilityKey,failure_class:klass,practice_case_passed:result.passed===true,before_turn_count:before.length,after_turn_count:after.length,before_failure_count:beforeFailures,after_failure_count:afterFailures,before_smoothed_failure_rate:Number(beforeRate.toFixed(4)),after_smoothed_failure_rate:Number(afterRate.toFixed(4)),observed_failure_rate_delta:Number(delta.toFixed(4)),evidence_strength:Number(evidenceStrength.toFixed(4)),status,practice_priority_multiplier:priorityMultiplier,observational_only:true,causal_attribution:false,authority_effect:"NONE"});
 }
 return out;
}
export function buildAvantiqoExperiencePracticeFeedback(effectivenessItems=[]){const map=new Map();for(const item of list(effectivenessItems)){const key=`${text(item.capability_key,300)}|${text(item.failure_class,80)}`;const current=map.get(key);if(!current||Number(item.evidence_strength||0)>Number(current.evidence_strength||0))map.set(key,item)}return map}
export const AvantiqoBusinessPartnerExperiencePracticeEffectivenessPolicyRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_PRACTICE_EFFECTIVENESS_POLICY_CONTRACT,evaluate:evaluateAvantiqoExperiencePracticeEffectiveness,feedback:buildAvantiqoExperiencePracticeFeedback});
