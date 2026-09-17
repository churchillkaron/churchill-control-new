export const OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT="AVANTIQO_OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_V1";
function text(v,l=4000){return String(v??"").trim().slice(0,l)}
function list(v){return Array.isArray(v)?v:[]}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function readSteps(candidate){return list(candidate?.governed_plan?.steps).filter(s=>s?.mutates!==true&&["read","evidence","research"].includes(text(s?.kind,80).toLowerCase())&&text(s?.capability_key,300))}
function mutationSet(candidate){return new Set(list(candidate?.governed_plan?.steps).filter(s=>s?.mutates===true).map(s=>text(s?.capability_key,300)).filter(Boolean))}
function sameMutationSet(a,b){const aa=mutationSet(a),bb=mutationSet(b);if(aa.size!==bb.size)return false;for(const k of aa)if(!bb.has(k))return false;return true}
export function derivePlanDiscriminatingEvidence(compiled=[]){
 const valid=list(compiled).filter(c=>c?.governed_plan?.valid===true).sort((a,b)=>b.score-a.score||a.index-b.index);if(valid.length<2)return{contract:OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT,required:false,reason:"FEWER_THAN_TWO_VALID_PLANS",candidates_considered:valid.length,authority_effect:"NONE"};
 const top=valid[0],second=valid[1],gap=Math.abs(Number(top.score||0)-Number(second.score||0));if(gap>60)return{contract:OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT,required:false,reason:"PLAN_SCORE_SEPARATION_SUFFICIENT",score_gap:gap,candidates_considered:2,authority_effect:"NONE"};
 const topReads=readSteps(top),secondReads=readSteps(second);const secondKeys=new Set(secondReads.map(s=>s.capability_key));const topKeys=new Set(topReads.map(s=>s.capability_key));
 const unique=[...topReads.filter(s=>!secondKeys.has(s.capability_key)),...secondReads.filter(s=>!topKeys.has(s.capability_key))];
 const sharedMutation=sameMutationSet(top,second);if(!unique.length&&!sharedMutation)return{contract:OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT,required:false,reason:"NO_REGISTERED_DISCRIMINATING_READ_IDENTIFIED",score_gap:gap,candidates_considered:2,authority_effect:"NONE"};
 const selected=unique.sort((a,b)=>Number(a.risk!=="low")-Number(b.risk!=="low")||a.capability_key.localeCompare(b.capability_key))[0]||topReads[0]||secondReads[0];if(!selected)return{contract:OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT,required:false,reason:"NO_SAFE_READ_AVAILABLE",score_gap:gap,candidates_considered:2,authority_effect:"NONE"};
 return{contract:OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT,required:true,reason:"MULTIPLE_PLAUSIBLE_PLANS_REQUIRE_DISCRIMINATING_EVIDENCE",score_gap:gap,candidates_considered:2,selected_read_capability_key:selected.capability_key,selected_read_step_id:selected.id||null,selected_read_expected_output:text(selected.expected_output,800)||null,top_candidate_id:top.candidate_id,alternate_candidate_id:second.candidate_id,shared_mutation_set:sharedMutation,mutation_execution_blocked_until_discrimination:true,planning_only:true,authority_effect:"NONE",external_spend_authorized:false};
}
export const OperatorPlanDiscriminatingEvidenceRuntime=Object.freeze({contract:OPERATOR_PLAN_DISCRIMINATING_EVIDENCE_CONTRACT,derive:derivePlanDiscriminatingEvidence});
